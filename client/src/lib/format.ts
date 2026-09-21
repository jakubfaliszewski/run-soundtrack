/** Format seconds to mm:ss */
export function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Format seconds to HH:MM:SS for input/display */
export function formatTimeHMS(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Parse HH:MM:SS or MM:SS to total seconds */
export function parseTimeToSeconds(str: string): number | null {
  const parts = str.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

/** Format pace: seconds/km → M:SS/km */
export function formatPace(secsPerKm: number): string {
  const m = Math.floor(secsPerKm / 60);
  const s = Math.floor(secsPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Format distance in meters to km string */
export function formatDistance(meters: number): string {
  return (meters / 1000).toFixed(2) + " km";
}

/** Unique color per track index */
const TRACK_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#06b6d4", "#f97316", "#ec4899", "#10b981", "#6366f1",
  "#84cc16", "#14b8a6", "#f43f5e", "#a855f7", "#eab308",
  "#0ea5e9", "#d946ef", "#22d3ee", "#fb923c", "#4ade80",
  "#c084fc", "#fbbf24", "#38bdf8", "#f87171", "#34d399",
];

export function trackColor(index: number): string {
  return TRACK_COLORS[index % TRACK_COLORS.length];
}
