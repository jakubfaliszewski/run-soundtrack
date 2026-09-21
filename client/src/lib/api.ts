import type { Route, RunPlan, Track, TimedRoute, Soundtrack } from "../types/domain";
import { loadSpotifySession } from "./storage";

const BASE = "/api";

function spotifyHeaders(): HeadersInit {
  const session = loadSpotifySession();
  return session ? { "x-spotify-session": session } : {};
}

// ---------------------------------------------------------------------------
// GPX
// ---------------------------------------------------------------------------

export async function parseGpxFile(file: File): Promise<Route> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/routes/parse`, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to parse GPX file.");
  }
  const { route } = await res.json();
  return route as Route;
}

export async function calculateSoundtrack(
  route: Route,
  runPlan: RunPlan,
  tracks: Track[]
): Promise<{ timedRoute: TimedRoute; soundtrack: Soundtrack }> {
  const res = await fetch(`${BASE}/soundtrack`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ route, runPlan, tracks }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Soundtrack calculation failed.");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Spotify — public playlist import (no auth)
// ---------------------------------------------------------------------------

export async function importSpotifyPlaylist(
  url: string
): Promise<{ tracks: Track[]; playlistId: string }> {
  const res = await fetch(`${BASE}/spotify/playlist?url=${encodeURIComponent(url)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (body as { error?: string }).error ?? "Failed to import Spotify playlist."
    );
  }
  return body as { tracks: Track[]; playlistId: string };
}

// ---------------------------------------------------------------------------
// Spotify — OAuth / user auth
// ---------------------------------------------------------------------------

export async function getSpotifyStatus(): Promise<{ configured: boolean }> {
  const res = await fetch(`${BASE}/spotify/status`);
  return res.json();
}

export function startSpotifyLogin() {
  window.location.href = `${BASE}/spotify/login`;
}

export async function getSpotifyProfile(): Promise<{ id: string; name: string; avatarUrl: string | null }> {
  const res = await fetch(`${BASE}/spotify/me`, { headers: spotifyHeaders() });
  if (!res.ok) throw new Error("Not authenticated");
  return res.json();
}

export async function getSpotifyPlaylists(): Promise<Array<{
  id: string; name: string; trackCount: number; imageUrl: string | null;
}>> {
  const res = await fetch(`${BASE}/spotify/me/playlists`, { headers: spotifyHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to load playlists.");
  }
  const { playlists } = await res.json();
  return playlists;
}

export async function getSpotifyPlaylistTracks(playlistId: string): Promise<Track[]> {
  const res = await fetch(`${BASE}/spotify/me/playlists/${playlistId}/tracks`, {
    headers: spotifyHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to load tracks.");
  }
  const { tracks } = await res.json();
  return tracks as Track[];
}

export async function logoutSpotify(): Promise<void> {
  await fetch(`${BASE}/spotify/logout`, {
    method: "POST",
    headers: spotifyHeaders(),
  });
}
