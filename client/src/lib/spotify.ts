/**
 * Client-side Spotify PKCE OAuth + API helpers.
 *
 * No server involvement — the browser handles the full auth flow.
 * Only VITE_SPOTIFY_CLIENT_ID is required (no client secret).
 *
 * Redirect URI must be registered in the Spotify developer dashboard:
 *   http://localhost:5173
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

export const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
const REDIRECT_URI = window.location.origin;
const SCOPES = "playlist-read-private playlist-read-collaborative";

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
export async function startLogin(): Promise<void> {
  if (!CLIENT_ID) throw new Error("VITE_SPOTIFY_CLIENT_ID is not set.");
  const verifier = randomBase64url(32);
  const challenge = await sha256Base64url(verifier);
  sessionStorage.setItem(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

/**
 * Exchange the authorization code for tokens.
 * Call this when the app loads and `?code=` is present in the URL.
 * Returns true on success.
 */
export async function handleCallback(code: string): Promise<boolean> {
  if (!CLIENT_ID) return false;
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) return false;
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
  if (!res.ok) return false;

  const data = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  saveSpotifyTokens(data.access_token, data.refresh_token, data.expires_in);
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
}

// ---------------------------------------------------------------------------
// Spotify API calls (browser → api.spotify.com directly)
// ---------------------------------------------------------------------------

async function apiFetch(path: string): Promise<Response> {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated with Spotify.");
  return fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getProfile(): Promise<{ id: string; name: string; avatarUrl: string | null }> {
  const res = await apiFetch("/me");
  if (!res.ok) throw new Error("Failed to fetch Spotify profile.");
  const p = await res.json() as { id: string; display_name: string; images: Array<{ url: string }> };
  return { id: p.id, name: p.display_name, avatarUrl: p.images?.[0]?.url ?? null };
}

export async function getUserPlaylists(): Promise<Array<{
  id: string; name: string; trackCount: number; imageUrl: string | null;
}>> {
  const result = [];
  let url: string | null = "/me/playlists?limit=50";
  while (url) {
    const res = await apiFetch(url.startsWith("http") ? url.replace("https://api.spotify.com/v1", "") : url);
    if (!res.ok) throw new Error("Failed to load playlists.");
    const data = await res.json() as {
      next: string | null;
      items: Array<{ id: string; name: string; tracks: { total: number }; images: Array<{ url: string }> }>;
    };
    for (const pl of data.items) {
      result.push({ id: pl.id, name: pl.name, trackCount: pl.tracks.total, imageUrl: pl.images?.[0]?.url ?? null });
    }
    url = data.next ? data.next.replace("https://api.spotify.com/v1", "") : null;
  }
  return result;
}

export async function getPlaylistTracks(playlistId: string): Promise<Track[]> {
  const tracks: Track[] = [];
  let url: string | null = `/playlists/${playlistId}/tracks?limit=50&fields=next,items(track(id,name,duration_ms,artists(name),album(images)))`;
  while (url) {
    const res = await apiFetch(url.startsWith("http") ? url.replace("https://api.spotify.com/v1", "") : url);
    if (!res.ok) throw new Error("Failed to load playlist tracks.");
    const data = await res.json() as {
      next: string | null;
      items: Array<{ track: { id: string; name: string; duration_ms: number; artists: Array<{ name: string }>; album: { images: Array<{ url: string }> } } | null }>;
    };
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
    url = data.next ? data.next.replace("https://api.spotify.com/v1", "") : null;
  }
  return tracks;
}
