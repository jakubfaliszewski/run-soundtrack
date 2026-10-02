/**
 * Client-side Spotify PKCE OAuth + API helpers.
 * No server involvement — the browser handles the full auth flow.
 */

import type { Track } from "../types/domain";
import {
  saveSpotifyTokens,
  loadSpotifyTokens,
  clearSpotifyTokens,
} from "./storage";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const CLIENT_ID = "52e7b5c8740247538201d358d4362577";

// Must exactly match a URI registered in the Spotify developer dashboard.
// Registered: http://127.0.0.1:5173
const REDIRECT_URI = window.location.origin.replace("localhost", "127.0.0.1");
const SCOPES_READ = "playlist-read-private playlist-read-collaborative";
const SCOPES_WRITE = "playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public";

const VERIFIER_KEY = "rs_spotify_pkce_verifier";

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function randomBase64url(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function sha256Base64url(str: string): Promise<string> {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// ---------------------------------------------------------------------------
// Auth flow
// ---------------------------------------------------------------------------

/** Kick off PKCE login — redirects the browser to Spotify. */
export async function startLogin(withWriteScopes = false): Promise<void> {
  if (!CLIENT_ID) throw new Error("VITE_SPOTIFY_CLIENT_ID is not set.");
  const verifier = randomBase64url(32);
  const challenge = await sha256Base64url(verifier);
  sessionStorage.setItem(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    scope: withWriteScopes ? SCOPES_WRITE : SCOPES_READ,
    redirect_uri: REDIRECT_URI,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

/**
 * Exchange the authorization code for tokens.
 * Call this when the app loads and `?code=` is present in the URL.
 * Throws on failure so the caller can surface the error.
 */
export async function handleCallback(code: string): Promise<boolean> {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("PKCE verifier missing — please try logging in again.");
  sessionStorage.removeItem(VERIFIER_KEY);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: verifier,
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string; error_description?: string };
    throw new Error(err.error_description ?? err.error ?? `Token exchange failed (${res.status})`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  };
  saveSpotifyTokens(data.access_token, data.refresh_token, data.expires_in);
  // Persist the granted scopes so hasWriteScopes() can check them without a network call
  try { localStorage.setItem("rs_spotify_scope_v1", data.scope ?? ""); } catch { /* ignore */ }
  return true;
}

/** Refresh the access token using the stored refresh token. */
async function refreshAccessToken(): Promise<string | null> {
  if (!CLIENT_ID) return null;
  const stored = loadSpotifyTokens();
  if (!stored?.refreshToken) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: stored.refreshToken,
    client_id: CLIENT_ID,
  });
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) { clearSpotifyTokens(); return null; }

  const data = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  saveSpotifyTokens(
    data.access_token,
    data.refresh_token ?? stored.refreshToken,
    data.expires_in,
  );
  return data.access_token;
}

/** Get a valid access token, refreshing if necessary. Returns null if not logged in. */
async function getToken(): Promise<string | null> {
  const stored = loadSpotifyTokens();
  if (!stored) return null;
  if (Date.now() < stored.expiresAt) return stored.accessToken;
  return refreshAccessToken();
}

export function logout(): void {
  clearSpotifyTokens();
  try { localStorage.removeItem("rs_spotify_scope_v1"); } catch { /* ignore */ }
}

/** Thrown when a Spotify API call returns 403 (insufficient scope). */
export class SpotifyForbiddenError extends Error {
  constructor(public readonly reason = "insufficient_scope") {
    super(reason);
    this.name = "SpotifyForbiddenError";
  }
}

// ---------------------------------------------------------------------------
// Spotify API calls (browser → api.spotify.com directly)
// ---------------------------------------------------------------------------

async function apiFetch(
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<Response> {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated with Spotify.");
  const isWrite = options?.method && options.method !== "GET";
  return fetch(`https://api.spotify.com/v1${path}`, {
    method: options?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(isWrite ? { "Content-Type": "application/json" } : {}),
    },
    body: isWrite && options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

/** Returns true if the stored token has the write scopes we need. */
export function hasWriteScopes(): boolean {
  // We infer write scope from the stored "scope" field (saved during token exchange).
  // As a lightweight proxy: check if the stored scope string contains the write scope.
  const raw = localStorage.getItem("rs_spotify_scope_v1");
  if (!raw) return false;
  return raw.includes("playlist-modify-private");
}

/** Search Spotify tracks. Returns up to 10 results. */
export async function searchTracks(query: string): Promise<import("../types/domain").Track[]> {
  const params = new URLSearchParams({ q: query, type: "track", limit: "10" });
  const res = await apiFetch(`/search?${params}`);
  if (!res.ok) throw new Error("Spotify search failed.");
  const data = await res.json() as {
    tracks: {
      items: Array<{
        id: string;
        name: string;
        uri: string;
        duration_ms: number;
        preview_url: string | null;
        artists: Array<{ name: string }>;
        album: { name: string; images: Array<{ url: string }> };
      }>;
    };
  };
  return data.tracks.items.map((t) => ({
    id: t.id,
    title: t.name,
    artist: t.artists[0]?.name ?? "Unknown",
    durationSeconds: Math.floor(t.duration_ms / 1000),
    artworkUrl: t.album.images[0]?.url,
    previewUrl: t.preview_url ?? undefined,
    source: "spotify" as const,
    provider: "spotify" as const,
    externalId: t.id,
    providerTrackId: t.id,
    spotifyUri: t.uri,
  }));
}

/**
 * Create a new Spotify playlist in the current user's account.
 * Returns { id, url } of the created playlist.
 */
export async function createSpotifyPlaylist(
  name: string,
  isPublic: boolean,
): Promise<{ id: string; url: string }> {
  const res = await apiFetch(`/me/playlists`, {
    method: "POST",
    body: { name, public: isPublic, description: "Created with Run Soundtrack" },
  });
  if (res.status === 403) throw new SpotifyForbiddenError();
  if (!res.ok) throw new Error("Could not create the Spotify playlist.");
  const data = await res.json() as { id: string; external_urls: { spotify: string } };
  return { id: data.id, url: data.external_urls.spotify };
}

/**
 * Add tracks to an existing Spotify playlist.
 * Sends all URIs in a single request (Spotify supports up to 100 per call).
 */
export async function addTracksToSpotifyPlaylist(
  playlistId: string,
  trackUris: string[],
): Promise<void> {
  // Use /items endpoint (current); /tracks was removed by Spotify in Feb 2026.
  // URIs are sent as a comma-separated query parameter, not a JSON body.
  const uriParam = trackUris.slice(0, 100).map(encodeURIComponent).join(",");
  const res = await apiFetch(`/playlists/${playlistId}/items?uris=${uriParam}`, {
    method: "POST",
  });
  if (res.status === 403) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
    const msg = body?.error?.message ?? "Forbidden";
    throw new SpotifyForbiddenError(msg);
  }
  if (!res.ok) throw new Error("Could not add tracks to the Spotify playlist.");
}

export async function getProfile(): Promise<{ id: string; name: string; avatarUrl: string | null }> {
  const res = await apiFetch("/me");
  if (!res.ok) throw new Error("Failed to fetch Spotify profile.");
  const p = await res.json() as { id: string; display_name: string; images: Array<{ url: string }> };
  return { id: p.id, name: p.display_name, avatarUrl: p.images?.[0]?.url ?? null };
}

export async function getUserPlaylists(): Promise<Array<{
  id: string; name: string; trackCount: number; imageUrl: string | null; ownerId: string;
}>> {
  const result = [];
  let url: string | null = "/me/playlists?limit=50";
  while (url) {
    const res = await apiFetch(url.startsWith("http") ? url.replace("https://api.spotify.com/v1", "") : url);
    if (!res.ok) throw new Error("Failed to load playlists.");
    const data = await res.json() as {
      next: string | null;
      items: Array<{ id: string; name: string; tracks: { total: number }; images: Array<{ url: string }>; owner: { id: string } }>;
    };
    for (const pl of data.items) {
      result.push({ id: pl.id, name: pl.name, trackCount: pl.tracks?.total ?? 0, imageUrl: pl.images?.[0]?.url ?? null, ownerId: pl.owner?.id ?? "" });
    }
    url = data.next ? data.next.replace("https://api.spotify.com/v1", "") : null;
  }
  return result;
}

export async function getPlaylistTracks(playlistId: string): Promise<Track[]> {
  const tracks: Track[] = [];
  let url: string | null = `/playlists/${playlistId}/items?limit=50`;
  while (url) {
    const res = await apiFetch(url.startsWith("http") ? url.replace("https://api.spotify.com/v1", "") : url);
    if (!res.ok) throw new Error("Failed to load playlist tracks.");
    const data = await res.json() as {
      next: string | null;
      items: Array<{
        // Spotify Web API returns the track object under "item" (not "track")
        item: {
          id: string; name: string; duration_ms: number; type?: string;
          uri: string;
          preview_url: string | null;
          artists: Array<{ name: string }>;
          album: { images: Array<{ url: string }> };
        } | null;
        // Older API versions used "track" — keep as fallback
        track?: {
          id: string; name: string; duration_ms: number; type?: string;
          uri: string;
          preview_url: string | null;
          artists: Array<{ name: string }>;
          album: { images: Array<{ url: string }> };
        } | null;
      }>;
    };
    for (const entry of data.items) {
      const t = entry.item ?? entry.track ?? null;
      // Skip nulls (local/deleted tracks) and explicit non-track types (episodes).
      if (!t || (t.type !== undefined && t.type !== "track")) continue;
      tracks.push({
        id: t.id, title: t.name,
        artist: t.artists[0]?.name ?? "Unknown",
        durationSeconds: Math.floor(t.duration_ms / 1000),
        artworkUrl: t.album.images[0]?.url,
        previewUrl: t.preview_url ?? undefined,
        source: "spotify", externalId: t.id,
        providerTrackId: t.id,
        spotifyUri: t.uri,
      });
    }
    url = data.next ? data.next.replace("https://api.spotify.com/v1", "") : null;
  }
  return tracks;
}
