import type { Route } from "../types/domain";

const ROUTE_KEY = "rs_route_v1";
const ROUTE_NAME_KEY = "rs_route_name_v1";
const SPOTIFY_ACCESS_KEY = "rs_spotify_access_v1";
const SPOTIFY_REFRESH_KEY = "rs_spotify_refresh_v1";
const SPOTIFY_EXPIRES_KEY = "rs_spotify_expires_v1";

// ---------------------------------------------------------------------------
// Route persistence
// ---------------------------------------------------------------------------

export function saveRoute(route: Route, name: string) {
  try {
    localStorage.setItem(ROUTE_KEY, JSON.stringify(route));
    localStorage.setItem(ROUTE_NAME_KEY, name);
  } catch {
    // Storage full or unavailable — ignore
  }
}

export function loadRoute(): { route: Route; name: string } | null {
  try {
    const raw = localStorage.getItem(ROUTE_KEY);
    const name = localStorage.getItem(ROUTE_NAME_KEY) ?? "My Route";
    if (!raw) return null;
    const route = JSON.parse(raw) as Route;
    if (!route.points || route.points.length < 2 || !route.totalDistanceMeters) return null;
    return { route, name };
  } catch {
    return null;
  }
}

export function clearRoute() {
  localStorage.removeItem(ROUTE_KEY);
  localStorage.removeItem(ROUTE_NAME_KEY);
}

// ---------------------------------------------------------------------------
// Spotify token persistence
// ---------------------------------------------------------------------------

export function saveSpotifyTokens(
  accessToken: string,
  refreshToken: string,
  expiresInSeconds: number,
) {
  try {
    localStorage.setItem(SPOTIFY_ACCESS_KEY, accessToken);
    localStorage.setItem(SPOTIFY_REFRESH_KEY, refreshToken);
    localStorage.setItem(SPOTIFY_EXPIRES_KEY, String(Date.now() + (expiresInSeconds - 60) * 1000));
  } catch { /* ignore */ }
}

export function loadSpotifyTokens(): {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
} | null {
  const accessToken = localStorage.getItem(SPOTIFY_ACCESS_KEY);
  const refreshToken = localStorage.getItem(SPOTIFY_REFRESH_KEY);
  const expiresAt = Number(localStorage.getItem(SPOTIFY_EXPIRES_KEY) ?? "0");
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken, expiresAt };
}

export function clearSpotifyTokens() {
  localStorage.removeItem(SPOTIFY_ACCESS_KEY);
  localStorage.removeItem(SPOTIFY_REFRESH_KEY);
  localStorage.removeItem(SPOTIFY_EXPIRES_KEY);
  // Also clear old session key format if present
  localStorage.removeItem("rs_spotify_session_v1");
}

