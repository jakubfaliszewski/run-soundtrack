import type { Soundtrack, Route, RunPlan } from "../types/domain";
import { formatDistance, formatPace, formatTime, formatTimeHMS } from "../lib/format";

interface RunSummaryProps {
  route: Route;
  plan: RunPlan;
  soundtrack: Soundtrack;
  playlistSource: "demo" | "spotify";
  onImportSpotify: () => void;
}

export default function RunSummary({ route, plan, soundtrack, playlistSource, onImportSpotify }: RunSummaryProps) {
  const diff = soundtrack.playlistDurationSeconds - soundtrack.runDurationSeconds;
  const absDiff = Math.abs(diff);
  const avgPace = plan.startPaceSecondsPerKm === plan.endPaceSecondsPerKm
    ? plan.startPaceSecondsPerKm
    : (plan.startPaceSecondsPerKm + plan.endPaceSecondsPerKm) / 2;

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
