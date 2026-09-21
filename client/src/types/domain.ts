// Domain types
// Matches server/src/types/domain.ts exactly

export type RoutePoint = {
  lat: number;
  lng: number;
  elevation?: number;
  /** Cumulative distance from route start in meters */
  distanceMeters: number;
};

export type Route = {
  points: RoutePoint[];
  totalDistanceMeters: number;
  elevationGainMeters?: number;
};

export type Track = {
  id: string;
  title: string;
  artist: string;
  durationSeconds: number;
  artworkUrl?: string;
  source?: "demo" | "spotify";
  externalId?: string;
};

export type RunStrategy = "even" | "negative_split" | "positive_split";

export type RunPlan = {
  targetTimeSeconds: number;
  strategy: RunStrategy;
  startPaceSecondsPerKm: number;
  endPaceSecondsPerKm: number;
};

export type TimedRoutePoint = RoutePoint & {
  elapsedSeconds: number;
  paceSecondsPerKm: number;
};

export type TimedRoute = {
  points: TimedRoutePoint[];
  totalDistanceMeters: number;
  totalTimeSeconds: number;
};

export type Coordinate = {
  lat: number;
  lng: number;
};

export type SoundtrackSegment = {
  track: Track;
  startTimeSeconds: number;
  endTimeSeconds: number;
  startDistanceMeters: number;
  endDistanceMeters: number;
  startCoordinate: Coordinate;
  endCoordinate: Coordinate;
};

export type Soundtrack = {
  segments: SoundtrackSegment[];
  runDurationSeconds: number;
  playlistDurationSeconds: number;
  playlistCoverage: number;
};
