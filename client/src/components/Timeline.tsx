import { useState } from "react";
import type { Soundtrack, Route, RoutePoint } from "../types/domain";
import { formatDistance, formatElevation, trackColor } from "../lib/format";

interface TimelineProps {
  soundtrack: Soundtrack;
  totalDistanceMeters: number;
  selectedTrackId: string | null;
  hoveredTrackId: string | null;
  onSelectTrack: (id: string) => void;
  onHoverTrack: (id: string | null) => void;
  onHoverDistance?: (distanceMeters: number | null) => void;
  route?: Route;
}

// Build an SVG area path for elevation data.
// Returns null if there is no usable elevation data or the gain is too flat.
function buildElevationPath(route: Route, width: number, height: number): string | null {
  const pts = route.points.filter((p) => p.elevation != null);
  if (pts.length < 2) return null;
  const elevations = pts.map((p) => p.elevation as number);
  const minEle = Math.min(...elevations);
  const maxEle = Math.max(...elevations);
  if (maxEle - minEle < 5) return null; // flat — skip

  const total = route.totalDistanceMeters;
  const coords = pts.map((p) => {
    const x = (p.distanceMeters / total) * width;
    const y = height - ((p.elevation as number - minEle) / (maxEle - minEle)) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M0,${height} L${coords.join(" L")} L${width},${height} Z`;
}

interface ElevationTooltip {
  x: number;        // px from left of container
  distM: number;
  eleM: number;
  inclinePct: number;
}

/** Find nearest elevation point by fractional position (0–1) along the route. */
function findElevationPoint(pts: RoutePoint[], fraction: number, totalM: number): ElevationTooltip | null {
  if (pts.length < 2) return null;
  const targetDist = fraction * totalM;
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.abs(pts[i].distanceMeters - targetDist);
    if (d < bestDiff) { bestDiff = d; best = i; }
  }
  const p = pts[best];

  // Compute incline over a wider span (±10 points) for stability.
  // Data is already smoothed in parseGpxClientSide so single-point differences are fine,
  // but a wider span averages out any residual noise in the slope calculation.
  const SPAN = 10;
  const lo = Math.max(0, best - SPAN);
  const hi = Math.min(pts.length - 1, best + SPAN);
  const dDist = pts[hi].distanceMeters - pts[lo].distanceMeters;
  const dEle = (pts[hi].elevation as number) - (pts[lo].elevation as number);
  // Clamp to ±25% — real-world roads rarely exceed 20%
  const rawIncline = dDist > 0 ? (dEle / dDist) * 100 : 0;
  const incline = Math.max(-25, Math.min(25, rawIncline));

  return { x: 0, distM: p.distanceMeters, eleM: p.elevation as number, inclinePct: incline };
}

export default function Timeline({
  soundtrack,
  totalDistanceMeters,
  selectedTrackId,
  hoveredTrackId,
  onSelectTrack,
  onHoverTrack,
  onHoverDistance,
  route,
}: TimelineProps) {
  const [elevTip, setElevTip] = useState<ElevationTooltip | null>(null);
  const elevPts = route ? route.points.filter((p) => p.elevation != null) : [];
  const hasElevation = elevPts.length >= 2 &&
    (Math.max(...elevPts.map(p => p.elevation as number)) - Math.min(...elevPts.map(p => p.elevation as number))) >= 5;

  const numTicks = 6;
  const ticks = Array.from({ length: numTicks }, (_, i) =>
    (totalDistanceMeters * i) / (numTicks - 1)
  );

  return (
    <div className="timeline">
      {/* Distance axis */}
      <div className="timeline__axis">
        {ticks.map((dist) => (
          <div
            key={dist}
            className="timeline__tick"
            style={{ left: `${(dist / totalDistanceMeters) * 100}%` }}
          >
            <span className="timeline__tick-label">{formatDistance(dist)}</span>
          </div>
        ))}
      </div>

      {/* Elevation profile */}
      {route && hasElevation && (
        <div
          className="timeline__elevation-wrap"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const frac = (e.clientX - rect.left) / rect.width;
            const tip = findElevationPoint(elevPts, frac, route.totalDistanceMeters);
            if (tip) {
              setElevTip({ ...tip, x: e.clientX - rect.left });
              onHoverDistance?.(tip.distM);
            }
          }}
          onMouseLeave={() => { setElevTip(null); onHoverDistance?.(null); }}
        >
          <svg
            className="timeline__elevation"
            viewBox="0 0 1000 40"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {(() => {
              const d = buildElevationPath(route, 1000, 40);
              return d ? <path d={d} className="timeline__elevation-path" /> : null;
            })()}
          </svg>
          {elevTip && (
            <div
              className="timeline__elevation-tip"
              style={{ left: elevTip.x }}
            >
              <span className="timeline__elevation-tip__dist">{formatDistance(elevTip.distM)}</span>
              <span className="timeline__elevation-tip__ele">{formatElevation(elevTip.eleM)}</span>
              <span className={`timeline__elevation-tip__incline${elevTip.inclinePct > 0 ? " timeline__elevation-tip__incline--up" : elevTip.inclinePct < 0 ? " timeline__elevation-tip__incline--down" : ""}`}>
                {elevTip.inclinePct > 0 ? "↑" : elevTip.inclinePct < 0 ? "↓" : "—"} {Math.abs(elevTip.inclinePct).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Track segments bar */}
      <div className="timeline__bar">
        {soundtrack.segments.map((seg, idx) => {
          const left = (seg.startDistanceMeters / totalDistanceMeters) * 100;
          const width = ((seg.endDistanceMeters - seg.startDistanceMeters) / totalDistanceMeters) * 100;
          const color = trackColor(idx);
          const isActive = selectedTrackId === seg.track.id || hoveredTrackId === seg.track.id;

          return (
            <div
              key={seg.track.id}
              className={`timeline__segment ${isActive ? "timeline__segment--active" : ""}`}
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 0.5)}%`,
                backgroundColor: color,
                opacity: selectedTrackId && !isActive ? 0.35 : 0.85,
              }}
              title={`${seg.track.title} — ${seg.track.artist}`}
              onClick={() => onSelectTrack(seg.track.id)}
              onMouseEnter={(e) => {
                onHoverTrack(seg.track.id);
                const rect = e.currentTarget.parentElement!.getBoundingClientRect();
                const frac = (e.clientX - rect.left) / rect.width;
                onHoverDistance?.(frac * totalDistanceMeters);
              }}
              onMouseLeave={() => { onHoverTrack(null); onHoverDistance?.(null); }}
              onMouseMove={(e) => {
                const rect = e.currentTarget.parentElement!.getBoundingClientRect();
                const frac = (e.clientX - rect.left) / rect.width;
                onHoverDistance?.(frac * totalDistanceMeters);
              }}
            />
          );
        })}
      </div>

      {/* Labels for selected/hovered */}
      <div className="timeline__labels">
        {soundtrack.segments.map((seg, idx) => {
          const left = (seg.startDistanceMeters / totalDistanceMeters) * 100;
          const width = ((seg.endDistanceMeters - seg.startDistanceMeters) / totalDistanceMeters) * 100;
          const isActive = selectedTrackId === seg.track.id || hoveredTrackId === seg.track.id;
          if (!isActive && width < 5) return null;

          return (
            <div
              key={seg.track.id}
              className="timeline__label"
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 0.5)}%`,
                color: isActive ? trackColor(idx) : "var(--color-muted)",
                fontWeight: isActive ? 600 : 400,
                opacity: selectedTrackId && !isActive ? 0.4 : 1,
              }}
              onClick={() => onSelectTrack(seg.track.id)}
              onMouseEnter={() => onHoverTrack(seg.track.id)}
              onMouseLeave={() => onHoverTrack(null)}
            >
              <span className="timeline__label-num">{idx + 1}</span>
              <span className="timeline__label-text">{seg.track.title}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
