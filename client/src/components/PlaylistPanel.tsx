import { useEffect, useRef } from "react";
import type { Soundtrack } from "../types/domain";
import TrackItem from "./TrackItem";
import { formatTime } from "../lib/format";

interface PlaylistPanelProps {
  soundtrack: Soundtrack;
  selectedTrackId: string | null;
  hoveredTrackId: string | null;
  onSelectTrack: (id: string) => void;
  onHoverTrack: (id: string | null) => void;
  onChangePlaylist?: () => void;
}

export default function PlaylistPanel({
  soundtrack,
  selectedTrackId,
  hoveredTrackId,
  onSelectTrack,
  onHoverTrack,
  onChangePlaylist,
}: PlaylistPanelProps) {
  const diff = soundtrack.playlistDurationSeconds - soundtrack.runDurationSeconds;
  const isPlaylistShort = diff < 0;
  const lastSegment = soundtrack.segments[soundtrack.segments.length - 1];

  // Scroll to the selected track
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedTrackId && selectedRef.current && listRef.current) {
      selectedRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedTrackId]);

  return (
    <div className="playlist-panel">
      <div className="playlist-panel__header">
        <h3>Playlist</h3>
        <span className="muted">{soundtrack.segments.length} songs</span>
        {onChangePlaylist && (
          <button className="playlist-panel__change-btn" onClick={onChangePlaylist}>
            Change
          </button>
        )}
      </div>

      {/* Playlist shorter warning */}
      {isPlaylistShort && (
        <div className="playlist-warning">
          Playlist is {formatTime(Math.abs(diff))} shorter than your run
        </div>
      )}

      {/* Playlist longer info */}
      {!isPlaylistShort && diff > 0 && lastSegment && (
        <div className="playlist-info">
          You will finish during: <strong>{lastSegment.track.title}</strong>
          {" — "}
          {formatTime(lastSegment.endTimeSeconds - lastSegment.startTimeSeconds)}
          {" / "}
          {formatTime(lastSegment.track.durationSeconds)}
        </div>
      )}

      <div className="playlist-list" ref={listRef}>
        {soundtrack.segments.map((seg, idx) => {
          const isLast = idx === soundtrack.segments.length - 1;
          const isRunFinished = !isPlaylistShort && isLast;
          const isSelected = selectedTrackId === seg.track.id || hoveredTrackId === seg.track.id;
          return (
            <div
              key={seg.track.id}
              ref={selectedTrackId === seg.track.id ? selectedRef : undefined}
            >
              <TrackItem
                segment={seg}
                index={idx}
                isSelected={isSelected}
                isRunFinished={isRunFinished}
                onClick={() => onSelectTrack(seg.track.id)}
                onMouseEnter={() => onHoverTrack(seg.track.id)}
                onMouseLeave={() => onHoverTrack(null)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
