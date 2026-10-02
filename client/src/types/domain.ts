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
  /** Canonical provider field (used by playlist builder) */
  provider?: "demo" | "spotify";
  /** Spotify track ID */
  providerTrackId?: string;
  /** Spotify URI (e.g. "spotify:track:xxx") — required for playlist creation */
  spotifyUri?: string;
  /** 30-second preview URL (may be null in some markets) */
  previewUrl?: string;
};

export type DraftPlaylist = {
  id: string;
  name: string;
  tracks: Track[];
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
