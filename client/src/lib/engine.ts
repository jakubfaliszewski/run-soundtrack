import type { Route, RoutePoint, RunPlan, TimedRoute, Track, Soundtrack } from "../types/domain";

// ---------------------------------------------------------------------------
// Haversine
// ---------------------------------------------------------------------------

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// GPX Parsing (client-side fallback)
// ---------------------------------------------------------------------------

export function parseGpxClientSide(xmlText: string): Route {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("Not a valid GPX file.");

  const trkpts = Array.from(doc.querySelectorAll("trkpt"));
  if (trkpts.length < 2) throw new Error("This GPX file does not contain enough track points.");

  const rawPoints: Array<{ lat: number; lng: number; ele?: number }> = trkpts.map((pt) => ({
    lat: parseFloat(pt.getAttribute("lat") ?? ""),
    lng: parseFloat(pt.getAttribute("lon") ?? ""),
    ele: pt.querySelector("ele") ? parseFloat(pt.querySelector("ele")!.textContent ?? "") : undefined,
  }));

  if (rawPoints.some((p) => isNaN(p.lat) || isNaN(p.lng))) {
    throw new Error("Invalid coordinates in GPX file.");
  }

  const points: RoutePoint[] = [];
  let cumulativeDistance = 0;
  let elevationGain = 0;

  for (let i = 0; i < rawPoints.length; i++) {
    const pt = rawPoints[i];
    if (i > 0) {
      const prev = rawPoints[i - 1];
      cumulativeDistance += haversineMeters(prev.lat, prev.lng, pt.lat, pt.lng);
      if (prev.ele !== undefined && pt.ele !== undefined) {
        const diff = pt.ele - prev.ele;
        if (diff > 0) elevationGain += diff;
      }
    }
    points.push({ lat: pt.lat, lng: pt.lng, elevation: pt.ele, distanceMeters: cumulativeDistance });
  }

  if (cumulativeDistance === 0) throw new Error("This GPX file has zero-length route.");

  return { points, totalDistanceMeters: cumulativeDistance, elevationGainMeters: elevationGain };
}

// ---------------------------------------------------------------------------
// Pace
// ---------------------------------------------------------------------------

export function getPaceAtDistance(
  distanceMeters: number,
  routeDistanceMeters: number,
  plan: RunPlan
): number {
  if (plan.strategy === "even") return plan.startPaceSecondsPerKm;
  const progress = routeDistanceMeters > 0 ? distanceMeters / routeDistanceMeters : 0;
  return plan.startPaceSecondsPerKm + (plan.endPaceSecondsPerKm - plan.startPaceSecondsPerKm) * progress;
}

// ---------------------------------------------------------------------------
// Timed route
// ---------------------------------------------------------------------------

export function buildTimedRoute(route: Route, plan: RunPlan): TimedRoute {
  const points = [];
  let elapsed = 0;
  for (let i = 0; i < route.points.length; i++) {
    const pt = route.points[i];
    if (i === 0) {
      const pace = getPaceAtDistance(0, route.totalDistanceMeters, plan);
      points.push({ ...pt, elapsedSeconds: 0, paceSecondsPerKm: pace });
      continue;
    }
    const prev = route.points[i - 1];
    const segDist = pt.distanceMeters - prev.distanceMeters;
    const midDist = (pt.distanceMeters + prev.distanceMeters) / 2;
    const pace = getPaceAtDistance(midDist, route.totalDistanceMeters, plan);
    elapsed += (segDist / 1000) * pace;
    points.push({ ...pt, elapsedSeconds: elapsed, paceSecondsPerKm: pace });
  }
  return { points, totalDistanceMeters: route.totalDistanceMeters, totalTimeSeconds: elapsed };
}

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

export function getDistanceAtTime(timedRoute: TimedRoute, timeSeconds: number): number {
  if (timeSeconds <= 0) return 0;
  if (timeSeconds >= timedRoute.totalTimeSeconds) return timedRoute.totalDistanceMeters;
  const pts = timedRoute.points;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (timeSeconds >= a.elapsedSeconds && timeSeconds <= b.elapsedSeconds) {
      const span = b.elapsedSeconds - a.elapsedSeconds;
      if (span === 0) return a.distanceMeters;
      const t = (timeSeconds - a.elapsedSeconds) / span;
      return a.distanceMeters + t * (b.distanceMeters - a.distanceMeters);
    }
  }
  return timedRoute.totalDistanceMeters;
}

export function getCoordinateAtDistance(route: Route, distanceMeters: number): { lat: number; lng: number } {
  const pts = route.points;
  if (distanceMeters <= 0) return { lat: pts[0].lat, lng: pts[0].lng };
  if (distanceMeters >= route.totalDistanceMeters) return { lat: pts[pts.length - 1].lat, lng: pts[pts.length - 1].lng };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (distanceMeters >= a.distanceMeters && distanceMeters <= b.distanceMeters) {
      const span = b.distanceMeters - a.distanceMeters;
      if (span === 0) return { lat: a.lat, lng: a.lng };
      const t = (distanceMeters - a.distanceMeters) / span;
      return { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) };
    }
  }
  return { lat: pts[pts.length - 1].lat, lng: pts[pts.length - 1].lng };
}

// ---------------------------------------------------------------------------
// Soundtrack engine
// ---------------------------------------------------------------------------

export function buildSoundtrack(
  route: Route,
  timedRoute: TimedRoute,
  tracks: Track[]
): Soundtrack {
  const runDurationSeconds = timedRoute.totalTimeSeconds;
  const playlistDurationSeconds = tracks.reduce((s, t) => s + t.durationSeconds, 0);

  const segments = [];
  let cursor = 0;

  for (const track of tracks) {
    if (cursor >= runDurationSeconds) break;
    const startTime = cursor;
    const endTime = Math.min(cursor + track.durationSeconds, runDurationSeconds);
    const startDist = getDistanceAtTime(timedRoute, startTime);
    const endDist = getDistanceAtTime(timedRoute, endTime);
    segments.push({
      track,
      startTimeSeconds: startTime,
      endTimeSeconds: endTime,
      startDistanceMeters: startDist,
      endDistanceMeters: endDist,
      startCoordinate: getCoordinateAtDistance(route, startDist),
      endCoordinate: getCoordinateAtDistance(route, endDist),
    });
    cursor += track.durationSeconds;
  }

  const playlistCoverage =
    runDurationSeconds > 0
      ? Math.min(playlistDurationSeconds, runDurationSeconds) / runDurationSeconds
      : 0;

  return { segments, runDurationSeconds, playlistDurationSeconds, playlistCoverage };
}

// ---------------------------------------------------------------------------
// RunPlan builder
// ---------------------------------------------------------------------------

export function buildRunPlan(
  totalDistanceMeters: number,
  targetTimeSeconds: number,
  strategy: RunPlan["strategy"],
  splitFraction = 0.1
): RunPlan {
  const avgPace = targetTimeSeconds / (totalDistanceMeters / 1000);
  if (strategy === "even") {
    return { targetTimeSeconds, strategy, startPaceSecondsPerKm: avgPace, endPaceSecondsPerKm: avgPace };
  }
  let startPace: number;
  let endPace: number;
  if (strategy === "negative_split") {
    startPace = avgPace * (1 + splitFraction);
    endPace = avgPace * (1 - splitFraction);
  } else {
    startPace = avgPace * (1 - splitFraction);
    endPace = avgPace * (1 + splitFraction);
  }
  const modelTime = ((startPace + endPace) / 2) * (totalDistanceMeters / 1000);
  const scale = targetTimeSeconds / modelTime;
  return {
    targetTimeSeconds,
    strategy,
    startPaceSecondsPerKm: startPace * scale,
    endPaceSecondsPerKm: endPace * scale,
  };
}

// ---------------------------------------------------------------------------
// Route segment extraction
// ---------------------------------------------------------------------------

export function getRouteSegmentPoints(route: Route, startDist: number, endDist: number): RoutePoint[] {
  const result: RoutePoint[] = [];
  const startCoord = getCoordinateAtDistance(route, startDist);
  result.push({ ...startCoord, distanceMeters: startDist });
  for (const pt of route.points) {
    if (pt.distanceMeters > startDist && pt.distanceMeters < endDist) result.push(pt);
  }
  const endCoord = getCoordinateAtDistance(route, endDist);
  result.push({ ...endCoord, distanceMeters: endDist });
  return result;
}

// ---------------------------------------------------------------------------
// Demo route generator
// ---------------------------------------------------------------------------

/**
 * Loads the real PKO Cracovia Royal Half Marathon 2025 route (21.1 km, Kraków).
 * The GPX is served as a static asset at /demo-route.gpx so no API key or
 * internet connection beyond the local dev server is required.
 */
export async function generateDemoRoute(): Promise<{ route: Route; name: string }> {
  const res = await fetch("/demo-route.gpx");
  if (!res.ok) throw new Error("Could not load demo route.");
  const text = await res.text();
  const route = parseGpxClientSide(text);
  return { route, name: "PKO Cracovia Royal Half Marathon 2025" };
}
