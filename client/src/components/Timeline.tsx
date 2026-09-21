import type { Soundtrack } from "../types/domain";
import { formatDistance, trackColor } from "../lib/format";

interface TimelineProps {
  soundtrack: Soundtrack;
  totalDistanceMeters: number;
  selectedTrackId: string | null;
  hoveredTrackId: string | null;
  onSelectTrack: (id: string) => void;
  onHoverTrack: (id: string | null) => void;
}

export default function Timeline({
  soundtrack,
  totalDistanceMeters,
  selectedTrackId,
  hoveredTrackId,
  onSelectTrack,
  onHoverTrack,
}: TimelineProps) {
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
              onMouseEnter={() => onHoverTrack(seg.track.id)}
              onMouseLeave={() => onHoverTrack(null)}
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
