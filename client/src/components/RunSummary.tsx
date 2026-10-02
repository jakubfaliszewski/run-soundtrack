import type { Soundtrack, Route, RunPlan } from "../types/domain";
import { formatDistance, formatElevation, formatPace, formatTime, formatTimeHMS } from "../lib/format";

interface RunSummaryProps {
  route: Route;
  plan: RunPlan;
  soundtrack: Soundtrack;
  playlistSource: "demo" | "spotify";
  onImportSpotify: () => void;
  onSelectTrack?: (id: string) => void;
}

export default function RunSummary({ route, plan, soundtrack, playlistSource, onImportSpotify, onSelectTrack }: RunSummaryProps) {
  const diff = soundtrack.playlistDurationSeconds - soundtrack.runDurationSeconds;
  const absDiff = Math.abs(diff);
  const avgPace = plan.startPaceSecondsPerKm === plan.endPaceSecondsPerKm
    ? plan.startPaceSecondsPerKm
    : (plan.startPaceSecondsPerKm + plan.endPaceSecondsPerKm) / 2;

  // Compute elevation gain/loss from points if available
  const { gain, loss } = (() => {
    const pts = route.points.filter((p) => p.elevation != null);
    if (pts.length < 2) {
      return { gain: route.elevationGainMeters ?? null, loss: null };
    }
    let g = 0, l = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = (pts[i].elevation as number) - (pts[i - 1].elevation as number);
      if (d > 0) g += d; else l -= d;
    }
    return { gain: g, loss: l };
  })();

  // §15 — start/finish tracks
  const startSeg = soundtrack.segments[0] ?? null;

  // Finish segment = last segment that starts before the run ends.
  // Use the existing engine's segments directly — no new logic.
  const finishSeg = (() => {
    const runEnd = soundtrack.runDurationSeconds;
    for (let i = soundtrack.segments.length - 1; i >= 0; i--) {
      if (soundtrack.segments[i].startTimeSeconds < runEnd) {
        return soundtrack.segments[i];
      }
    }
    return soundtrack.segments[soundtrack.segments.length - 1] ?? null;
  })();

  const playlistEndsBeforeRun = soundtrack.playlistDurationSeconds < soundtrack.runDurationSeconds;

  return (
    <div className="run-summary">
      <div className="summary-grid">
        <div className="summary-item">
          <span className="summary-value">{formatDistance(route.totalDistanceMeters)}</span>
          <span className="summary-label">distance</span>
        </div>
        <div className="summary-item">
          <span className="summary-value">{formatTimeHMS(plan.targetTimeSeconds)}</span>
          <span className="summary-label">target time</span>
        </div>
        <div className="summary-item">
          <span className="summary-value">{formatPace(avgPace)}<span className="summary-value-unit"> /km</span></span>
          <span className="summary-label">avg pace</span>
        </div>
        <div className="summary-item">
          <span className="summary-value">{soundtrack.segments.length}</span>
          <span className="summary-label">songs</span>
        </div>
        {gain != null && (
          <div className="summary-item">
            <span className="summary-value summary-value--gain">↑ {formatElevation(gain)}</span>
            <span className="summary-label">gain</span>
          </div>
        )}
        {loss != null && (
          <div className="summary-item">
            <span className="summary-value summary-value--loss">↓ {formatElevation(loss)}</span>
            <span className="summary-label">loss</span>
          </div>
        )}
      </div>

      <div className="summary-strategy">
        {plan.strategy === "even" ? (
          <span className="strategy-tag">Even pace</span>
        ) : (
          <span className="strategy-tag">
            {plan.strategy === "negative_split" ? "Negative" : "Positive"} split
            <span className="strategy-tag__paces">
              {" "}{formatPace(plan.startPaceSecondsPerKm)} → {formatPace(plan.endPaceSecondsPerKm)} /km
            </span>
          </span>
        )}
      </div>

      {/* §15 — start / finish track summary */}
      {startSeg && (
        <div className="summary-track-bookmarks">
          <button
            className="summary-bookmark"
            onClick={() => onSelectTrack?.(startSeg.track.id)}
          >
            <span className="summary-bookmark__label">START</span>
            <span className="summary-bookmark__icon">🎵</span>
            <div className="summary-bookmark__info">
              <span className="summary-bookmark__title">{startSeg.track.title}</span>
              <span className="summary-bookmark__artist muted">{startSeg.track.artist}</span>
            </div>
          </button>

          <div className="summary-bookmark-divider" />

          {finishSeg && !playlistEndsBeforeRun ? (
            <button
              className="summary-bookmark"
              onClick={() => onSelectTrack?.(finishSeg.track.id)}
            >
              <span className="summary-bookmark__label">FINISH</span>
              <span className="summary-bookmark__icon">🏁</span>
              <div className="summary-bookmark__info">
                <span className="summary-bookmark__title">{finishSeg.track.title}</span>
                <span className="summary-bookmark__artist muted">{finishSeg.track.artist}</span>
              </div>
            </button>
          ) : (
            <div className="summary-bookmark summary-bookmark--empty">
              <span className="summary-bookmark__label">FINISH</span>
              <span className="summary-bookmark__icon muted">—</span>
              <div className="summary-bookmark__info">
                <span className="summary-bookmark__title muted">No track</span>
                <span className="summary-bookmark__artist muted">
                  Playlist ends {formatTime(absDiff)} before finish
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="summary-playlist">
        <div className="summary-playlist__row">
          <span className="muted">{formatTime(soundtrack.playlistDurationSeconds)}</span>
          <span className="summary-playlist__source">
            {playlistSource === "spotify" ? (
              <span className="source-spotify">♫ Spotify</span>
            ) : (
              <button className="source-demo-link" onClick={onImportSpotify}>
                Use Spotify playlist →
              </button>
            )}
          </span>
        </div>
        {diff > 0 ? (
          <span className="warning-badge">⚠ Playlist {formatTime(absDiff)} longer than run</span>
        ) : diff < 0 ? (
          <span className="warning-badge warning-badge--short">⚠ Playlist {formatTime(absDiff)} shorter than run</span>
        ) : null}
      </div>
    </div>
  );
}
