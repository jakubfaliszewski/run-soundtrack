import type { Route, RunPlan, Track, TimedRoute, Soundtrack } from "../types/domain";

const BASE = "/api";

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
// Spotify — public playlist import (server-side client credentials)
// Requires SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET set on the server.
// Used when importing a public playlist URL without a user login.
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
