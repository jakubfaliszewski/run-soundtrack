import type { SoundtrackSegment } from "../types/domain";
import { formatDistance, formatTime, trackColor } from "../lib/format";
import TrackArt from "./TrackArt";

interface TrackItemProps {
  segment: SoundtrackSegment;
  index: number;
  isSelected: boolean;
  isRunFinished: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export default function TrackItem({
  segment,
  index,
  isSelected,
  isRunFinished,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: TrackItemProps) {
  const color = trackColor(index);
  const playedSeconds = segment.endTimeSeconds - segment.startTimeSeconds;
  const isTruncated = isRunFinished && playedSeconds < segment.track.durationSeconds;

  return (
    <div
      className={`track-item ${isSelected ? "track-item--selected" : ""}`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ borderLeftColor: color }}
    >
      <span className="track-item__number" style={{ color }}>{index + 1}</span>

      <TrackArt
        artworkUrl={segment.track.artworkUrl}
        previewUrl={segment.track.previewUrl}
        spotifyUri={segment.track.spotifyUri}
        title={segment.track.title}
        size="md"
      />

      <div className="track-item__body">
        <div className="track-item__title">{segment.track.title}</div>
        <div className="track-item__meta">
          <span className="track-item__artist">{segment.track.artist}</span>
        </div>
        <div className="track-item__range">
          {formatDistance(segment.startDistanceMeters)} — {formatDistance(segment.endDistanceMeters)}
          {isTruncated && (
            <span className="muted"> · {formatTime(playedSeconds)} / {formatTime(segment.track.durationSeconds)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
