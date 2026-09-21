import type {
  Route,
  RoutePoint,
  RunPlan,
  TimedRoute,
  TimedRoutePoint,
  Track,
  Soundtrack,
  SoundtrackSegment,
  Coordinate,
} from "../types/domain.js";

// ---------------------------------------------------------------------------
// Pace calculation
// ---------------------------------------------------------------------------

/**
 * Returns pace in seconds/km at a given distance along the route.
 */
export function getPaceAtDistance(
  distanceMeters: number,
  routeDistanceMeters: number,
  plan: RunPlan
): number {
  if (plan.strategy === "even") {
    return plan.startPaceSecondsPerKm;
  }

  const progress = routeDistanceMeters > 0
    ? distanceMeters / routeDistanceMeters
    : 0;

  return (
    plan.startPaceSecondsPerKm +
    (plan.endPaceSecondsPerKm - plan.startPaceSecondsPerKm) * progress
  );
}

// ---------------------------------------------------------------------------
// Timed route
// ---------------------------------------------------------------------------

/**
 * Builds a TimedRoute by iterating GPX points and accumulating elapsed time.
 * For each segment we use the pace at the segment midpoint.
 */
export function buildTimedRoute(route: Route, plan: RunPlan): TimedRoute {
  const points: TimedRoutePoint[] = [];
  let elapsedSeconds = 0;

  for (let i = 0; i < route.points.length; i++) {
    const pt = route.points[i];

    if (i === 0) {
      const pace = getPaceAtDistance(0, route.totalDistanceMeters, plan);
      points.push({ ...pt, elapsedSeconds: 0, paceSecondsPerKm: pace });
      continue;
    }

    const prev = route.points[i - 1];
    const segmentDistance = pt.distanceMeters - prev.distanceMeters;
    const midDistance = (pt.distanceMeters + prev.distanceMeters) / 2;

    const pace = getPaceAtDistance(midDistance, route.totalDistanceMeters, plan);
    const segmentTimeSeconds = (segmentDistance / 1000) * pace;

    elapsedSeconds += segmentTimeSeconds;
    points.push({
      ...pt,
      elapsedSeconds,
      paceSecondsPerKm: pace,
    });
  }

  return {
    points,
    totalDistanceMeters: route.totalDistanceMeters,
    totalTimeSeconds: elapsedSeconds,
  };
}

// ---------------------------------------------------------------------------
// Interpolation helpers
// ---------------------------------------------------------------------------

/**
 * Returns distance in meters at the given elapsed time by linear interpolation
 * between the two surrounding TimedRoutePoints.
 */
export function getDistanceAtTime(timedRoute: TimedRoute, timeSeconds: number): number {
  const pts = timedRoute.points;

  if (timeSeconds <= 0) return 0;
  if (timeSeconds >= timedRoute.totalTimeSeconds) return timedRoute.totalDistanceMeters;

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (timeSeconds >= a.elapsedSeconds && timeSeconds <= b.elapsedSeconds) {
      const span = b.elapsedSeconds - a.elapsedSeconds;
      if (span === 0) return a.distanceMeters;
      const t = (timeSeconds - a.elapsedSeconds) / span;
      return a.distanceMeters + t * (b.distanceMeters - a.distanceMeters);
    }
  }

  return timedRoute.totalDistanceMeters;
}

/**
 * Returns a GPS coordinate at the given cumulative distance by linear
 * interpolation between the two surrounding RoutePoints.
 */
export function getCoordinateAtDistance(
  route: Route,
  distanceMeters: number
): Coordinate {
  const pts = route.points;

  if (distanceMeters <= 0) return { lat: pts[0].lat, lng: pts[0].lng };
  if (distanceMeters >= route.totalDistanceMeters) {
    const last = pts[pts.length - 1];
    return { lat: last.lat, lng: last.lng };
  }

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (distanceMeters >= a.distanceMeters && distanceMeters <= b.distanceMeters) {
      const span = b.distanceMeters - a.distanceMeters;
      if (span === 0) return { lat: a.lat, lng: a.lng };
      const t = (distanceMeters - a.distanceMeters) / span;
      return {
        lat: a.lat + t * (b.lat - a.lat),
        lng: a.lng + t * (b.lng - a.lng),
      };
    }
  }

  const last = pts[pts.length - 1];
  return { lat: last.lat, lng: last.lng };
}

// ---------------------------------------------------------------------------
// Soundtrack engine
// ---------------------------------------------------------------------------

export interface PlaylistProvider {
  getPlaylist(): Promise<Track[]>;
}

export type SoundtrackInput = {
  route: Route;
  timedRoute: TimedRoute;
  tracks: Track[];
};

/**
 * Core soundtrack engine.
 * Maps tracks sequentially onto the timed route.
 * Does NOT know or care where the tracks came from.
 */
export function buildSoundtrack(input: SoundtrackInput): Soundtrack {
  const { route, timedRoute, tracks } = input;
  const runDurationSeconds = timedRoute.totalTimeSeconds;

  const playlistDurationSeconds = tracks.reduce(
    (sum, t) => sum + t.durationSeconds,
    0
  );

  const segments: SoundtrackSegment[] = [];
  let cursor = 0; // elapsed seconds into the run

  for (const track of tracks) {
    if (cursor >= runDurationSeconds) break;

    const startTimeSeconds = cursor;
    const endTimeSeconds = Math.min(cursor + track.durationSeconds, runDurationSeconds);

    const startDist = getDistanceAtTime(timedRoute, startTimeSeconds);
    const endDist = getDistanceAtTime(timedRoute, endTimeSeconds);

    segments.push({
      track,
      startTimeSeconds,
      endTimeSeconds,
      startDistanceMeters: startDist,
      endDistanceMeters: endDist,
      startCoordinate: getCoordinateAtDistance(route, startDist),
      endCoordinate: getCoordinateAtDistance(route, endDist),
    });

    cursor += track.durationSeconds;
  }

  const playlistCoverage = runDurationSeconds > 0
    ? Math.min(playlistDurationSeconds, runDurationSeconds) / runDurationSeconds
    : 0;

  return {
    segments,
    runDurationSeconds,
    playlistDurationSeconds,
    playlistCoverage,
  };
}

// ---------------------------------------------------------------------------
// RunPlan helpers
// ---------------------------------------------------------------------------

/**
 * Compute the average pace (sec/km) that satisfies targetTimeSeconds over
 * the given distance, then derive start/end pace based on split percentage.
 *
 * For negative_split: start = avg * (1 + split), end = avg * (1 - split)
 * For positive_split: start = avg * (1 - split), end = avg * (1 + split)
 *
 * The paces are then scaled so that the timed model integrates to exactly
 * targetTimeSeconds.
 */
export function buildRunPlan(
  totalDistanceMeters: number,
  targetTimeSeconds: number,
  strategy: RunPlan["strategy"],
  splitFraction = 0.1
): RunPlan {
  if (totalDistanceMeters <= 0) {
    throw new Error("Route distance must be > 0");
  }
  if (targetTimeSeconds <= 0) {
    throw new Error("Target time must be > 0");
  }

  const avgPace = targetTimeSeconds / (totalDistanceMeters / 1000);

  if (strategy === "even") {
    return {
      targetTimeSeconds,
      strategy,
      startPaceSecondsPerKm: avgPace,
      endPaceSecondsPerKm: avgPace,
    };
  }

  let startPace: number;
  let endPace: number;

  if (strategy === "negative_split") {
    startPace = avgPace * (1 + splitFraction);
    endPace = avgPace * (1 - splitFraction);
  } else {
    // positive_split
    startPace = avgPace * (1 - splitFraction);
    endPace = avgPace * (1 + splitFraction);
  }

  // Scale to hit target time exactly.
  // For a linear split the average pace = (start + end) / 2,
  // which equals avgPace by construction — so scaling is a no-op.
  // However for numerical precision we do it explicitly.
  const modelTime = ((startPace + endPace) / 2) * (totalDistanceMeters / 1000);
  const scale = targetTimeSeconds / modelTime;
  startPace *= scale;
  endPace *= scale;

  return {
    targetTimeSeconds,
    strategy,
    startPaceSecondsPerKm: startPace,
    endPaceSecondsPerKm: endPace,
  };
}

// ---------------------------------------------------------------------------
// Route-point extraction for segments
// ---------------------------------------------------------------------------

/**
 * Extract the subset of route points that lie within [startDist, endDist].
 * Includes interpolated boundary points for a clean polyline segment.
 */
export function getRouteSegmentPoints(
  route: Route,
  startDistanceMeters: number,
  endDistanceMeters: number
): RoutePoint[] {
  const result: RoutePoint[] = [];

  // Add the interpolated start point
  const startCoord = getCoordinateAtDistance(route, startDistanceMeters);
  result.push({ ...startCoord, distanceMeters: startDistanceMeters });

  for (const pt of route.points) {
    if (pt.distanceMeters > startDistanceMeters && pt.distanceMeters < endDistanceMeters) {
      result.push(pt);
    }
  }

  // Add the interpolated end point
  const endCoord = getCoordinateAtDistance(route, endDistanceMeters);
  result.push({ ...endCoord, distanceMeters: endDistanceMeters });

  return result;
}
