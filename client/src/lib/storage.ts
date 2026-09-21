import type { Route } from "../types/domain";

const ROUTE_KEY = "rs_route_v1";
const ROUTE_NAME_KEY = "rs_route_name_v1";
const SPOTIFY_SESSION_KEY = "rs_spotify_session_v1";

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
    // Basic validation
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
// Spotify session key persistence
// ---------------------------------------------------------------------------

export function saveSpotifySession(key: string) {
  try {
    localStorage.setItem(SPOTIFY_SESSION_KEY, key);
  } catch { /* ignore */ }
}

export function loadSpotifySession(): string | null {
  return localStorage.getItem(SPOTIFY_SESSION_KEY);
}

export function clearSpotifySession() {
  localStorage.removeItem(SPOTIFY_SESSION_KEY);
}
