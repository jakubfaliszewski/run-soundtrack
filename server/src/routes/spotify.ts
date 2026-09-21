import { FastifyInstance } from "fastify";
import type { Track } from "../types/domain.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractPlaylistId(input: string): string | null {
  const urlMatch = input.match(/playlist\/([A-Za-z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  const uriMatch = input.match(/spotify:playlist:([A-Za-z0-9]+)/);
  if (uriMatch) return uriMatch[1];
  return null;
}

// In-memory token cache for client credentials (server-to-server, public playlists)
let ccToken: { token: string; expiresAt: number } | null = null;

async function getClientCredToken(clientId: string, clientSecret: string): Promise<string> {
  if (ccToken && Date.now() < ccToken.expiresAt) return ccToken.token;
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error("Spotify auth failed. Check SPOTIFY_CLIENT_ID/SECRET.");
  const data = await res.json() as { access_token: string; expires_in: number };
  ccToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return ccToken.token;
}

interface SpotifyTrackItem {
  track: {
    id: string; name: string; duration_ms: number;
    artists: Array<{ name: string }>;
    album: { images: Array<{ url: string }> };
  } | null;
}

async function fetchPlaylistTracks(playlistId: string, token: string): Promise<Track[]> {
  const tracks: Track[] = [];
  let url: string | null =
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50&fields=next,items(track(id,name,duration_ms,artists(name),album(images)))`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      if (res.status === 404) throw new Error("Playlist not found. Make sure it is public.");
      throw new Error(`Spotify API error: ${res.status}`);
    }
    const data = await res.json() as { next: string | null; items: SpotifyTrackItem[] };
    for (const item of data.items) {
      if (!item.track) continue;
      const t = item.track;
      tracks.push({
        id: t.id, title: t.name,
        artist: t.artists[0]?.name ?? "Unknown",
        durationSeconds: Math.floor(t.duration_ms / 1000),
        artworkUrl: t.album.images[0]?.url,
        source: "spotify", externalId: t.id,
      });
    }
    url = data.next;
  }
  return tracks;
}

// In-memory user token store: state → token (MVP: single user, good enough)
const userTokens = new Map<string, { accessToken: string; refreshToken: string; expiresAt: number }>();

// OAuth state → code_verifier (PKCE)
const oauthStates = new Map<string, { verifier: string; createdAt: number }>();

function randomBase64(bytes: number) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Buffer.from(arr).toString("base64url");
}

async function sha256Base64url(str: string) {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(hash).toString("base64url");
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function spotifyRoutes(app: FastifyInstance) {
  const clientId = () => process.env.SPOTIFY_CLIENT_ID ?? "";
  const clientSecret = () => process.env.SPOTIFY_CLIENT_SECRET ?? "";
  const redirectUri = () =>
    process.env.SPOTIFY_REDIRECT_URI ?? "http://localhost:3001/api/spotify/callback";
  const clientOrigin = () =>
    process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

  // ── Auth: check if server has Spotify configured ──────────────────────────
  app.get("/api/spotify/status", async (_req, reply) => {
    return reply.send({ configured: !!(clientId() && clientSecret()) });
  });

  // ── Auth: initiate login ──────────────────────────────────────────────────
  app.get("/api/spotify/login", async (_req, reply) => {
    if (!clientId()) {
      return reply.status(503).send({ error: "Spotify not configured." });
    }
    const state = randomBase64(16);
    const verifier = randomBase64(32);
    const challenge = await sha256Base64url(verifier);
    oauthStates.set(state, { verifier, createdAt: Date.now() });

    // Clean stale states older than 10 min
    const cutoff = Date.now() - 10 * 60_000;
    for (const [k, v] of oauthStates) {
      if (v.createdAt < cutoff) oauthStates.delete(k);
    }

    const scopes = "playlist-read-private playlist-read-collaborative";
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId(),
      scope: scopes,
      redirect_uri: redirectUri(),
      state,
      code_challenge_method: "S256",
      code_challenge: challenge,
    });
    return reply.redirect(`https://accounts.spotify.com/authorize?${params}`);
  });

  // ── Auth: OAuth callback ──────────────────────────────────────────────────
  app.get("/api/spotify/callback", async (request, reply) => {
    const { code, state, error } = request.query as {
      code?: string; state?: string; error?: string;
    };

    if (error) {
      return reply.redirect(`${clientOrigin()}?spotify_error=${encodeURIComponent(error)}`);
    }

    if (!code || !state || !oauthStates.has(state)) {
      return reply.redirect(`${clientOrigin()}?spotify_error=invalid_state`);
    }

    const { verifier } = oauthStates.get(state)!;
    oauthStates.delete(state);

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: clientId(),
      code_verifier: verifier,
    });

    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!tokenRes.ok) {
      return reply.redirect(`${clientOrigin()}?spotify_error=token_exchange_failed`);
    }

    const tokens = await tokenRes.json() as {
      access_token: string; refresh_token: string; expires_in: number;
    };

    // Use state as session key (send to client in URL fragment)
    const sessionKey = randomBase64(16);
    userTokens.set(sessionKey, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in - 60) * 1000,
    });

    // Redirect back to client with session key
    return reply.redirect(`${clientOrigin()}?spotify_session=${sessionKey}`);
  });

  // ── Get current user's profile ────────────────────────────────────────────
  app.get("/api/spotify/me", async (request, reply) => {
    const token = await resolveUserToken(request, reply);
    if (!token) return;

    const res = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return reply.status(res.status).send({ error: "Failed to fetch profile." });
    const profile = await res.json() as { id: string; display_name: string; images: Array<{ url: string }> };
    return reply.send({
      id: profile.id,
      name: profile.display_name,
      avatarUrl: profile.images?.[0]?.url ?? null,
    });
  });

  // ── Get current user's playlists ──────────────────────────────────────────
  app.get("/api/spotify/me/playlists", async (request, reply) => {
    const token = await resolveUserToken(request, reply);
    if (!token) return;

    interface SpotifyPlaylist {
      id: string; name: string; description: string;
      tracks: { total: number };
      images: Array<{ url: string }>;
    }

    const playlists: Array<{ id: string; name: string; trackCount: number; imageUrl: string | null }> = [];
    let url: string | null = "https://api.spotify.com/v1/me/playlists?limit=50";

    while (url) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return reply.status(res.status).send({ error: "Failed to fetch playlists." });
      const data = await res.json() as { next: string | null; items: SpotifyPlaylist[] };
      for (const pl of data.items) {
        playlists.push({
          id: pl.id, name: pl.name,
          trackCount: pl.tracks.total,
          imageUrl: pl.images?.[0]?.url ?? null,
        });
      }
      url = data.next;
    }
    return reply.send({ playlists });
  });

  // ── Get tracks from a specific playlist (user-authed) ─────────────────────
  app.get("/api/spotify/me/playlists/:playlistId/tracks", async (request, reply) => {
    const token = await resolveUserToken(request, reply);
    if (!token) return;
    const { playlistId } = request.params as { playlistId: string };
    try {
      const tracks = await fetchPlaylistTracks(playlistId, token);
      return reply.send({ tracks });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch tracks.";
      return reply.status(422).send({ error: message });
    }
  });

  // ── Logout ────────────────────────────────────────────────────────────────
  app.post("/api/spotify/logout", async (request, reply) => {
    const key = (request.headers["x-spotify-session"] ?? "") as string;
    if (key) userTokens.delete(key);
    return reply.send({ ok: true });
  });

  // ── Public playlist import (no user auth, client credentials) ─────────────
  app.get("/api/spotify/playlist", async (request, reply) => {
    const cid = clientId();
    const csec = clientSecret();
    if (!cid || !csec) {
      return reply.status(503).send({ error: "Spotify integration is not configured on this server." });
    }
    const { url } = request.query as { url?: string };
    if (!url) return reply.status(400).send({ error: "Missing ?url= parameter." });
    const playlistId = extractPlaylistId(url);
    if (!playlistId) return reply.status(400).send({ error: "Could not parse a playlist ID from that URL." });
    try {
      const token = await getClientCredToken(cid, csec);
      const tracks = await fetchPlaylistTracks(playlistId, token);
      if (tracks.length === 0) return reply.status(422).send({ error: "Playlist appears empty or private." });
      return reply.send({ tracks, playlistId });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch Spotify playlist.";
      return reply.status(422).send({ error: message });
    }
  });

  // ── Helper: resolve & refresh user access token ───────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function resolveUserToken(request: any, reply: any): Promise<string | null> {
    const key = (request.headers["x-spotify-session"] ?? "") as string;
    const entry = userTokens.get(key);
    if (!entry) {
      reply.status(401).send({ error: "Not authenticated with Spotify." });
      return null;
    }
    if (Date.now() < entry.expiresAt) return entry.accessToken;

    // Refresh
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: entry.refreshToken,
      client_id: clientId(),
    });
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      userTokens.delete(key);
      reply.status(401).send({ error: "Spotify session expired. Please reconnect." });
      return null;
    }
    const data = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
    userTokens.set(key, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? entry.refreshToken,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    });
    return data.access_token;
  }
}
