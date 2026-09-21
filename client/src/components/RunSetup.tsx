import { useState, useRef, useEffect } from "react";
import type { Route, RunPlan, RunStrategy } from "../types/domain";
import { formatDistance, formatPace, formatTimeHMS, parseTimeToSeconds } from "../lib/format";
import { buildRunPlan } from "../lib/engine";
import { parseGpxFile } from "../lib/api";
import { parseGpxClientSide } from "../lib/engine";

interface RunSetupProps {
  onStart: (route: Route, plan: RunPlan) => void;
  loading: boolean;
  initialRoute?: Route | null;
}

/** Suggest a target time: assume 5:30/km average as starting hint */
function suggestTargetTime(route: Route): string {
  const secs = Math.round((route.totalDistanceMeters / 1000) * 330); // 5:30/km
  return formatTimeHMS(secs);
}

export default function RunSetup({ onStart, loading, initialRoute }: RunSetupProps) {
  const [route, setRoute] = useState<Route | null>(initialRoute ?? null);
  const [filename, setFilename] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [targetTime, setTargetTime] = useState(
    initialRoute ? suggestTargetTime(initialRoute) : "00:50:00"
  );
  const [strategy, setStrategy] = useState<RunStrategy>("even");
  const [splitPercent, setSplitPercent] = useState(10);
  const fileRef = useRef<HTMLInputElement>(null);

  // Update suggested time when route changes
  useEffect(() => {
    if (route && !initialRoute) {
      setTargetTime(suggestTargetTime(route));
    }
  }, [route, initialRoute]);

  const targetSecs = parseTimeToSeconds(targetTime);
  const avgPace = targetSecs && route ? targetSecs / (route.totalDistanceMeters / 1000) : null;

  let startPace: number | null = null;
  let endPace: number | null = null;
  if (avgPace !== null && strategy !== "even") {
    const frac = splitPercent / 100;
    if (strategy === "negative_split") {
      startPace = avgPace * (1 + frac);
      endPace = avgPace * (1 - frac);
    } else {
      startPace = avgPace * (1 - frac);
      endPace = avgPace * (1 + frac);
    }
  }

  async function handleFile(file: File) {
    setRouteError(null);
    setRoute(null);
    setFilename(null);
    try {
      let parsed: Route;
      try {
        parsed = await parseGpxFile(file);
      } catch {
        // Server unreachable — parse client-side
        const text = await file.text();
        parsed = parseGpxClientSide(text);
      }
      setRoute(parsed);
      setFilename(file.name.replace(/\.gpx$/i, ""));
      setTargetTime(suggestTargetTime(parsed));
    } catch (err: unknown) {
      setRouteError(err instanceof Error ? err.message : "Failed to read GPX file.");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!route || !targetSecs) return;
    const plan = buildRunPlan(route.totalDistanceMeters, targetSecs, strategy, splitPercent / 100);
    onStart(route, plan);
  }

  return (
    <div className="setup-panel">
      <div className="setup-header">
        <h1 className="app-title">Run Soundtrack</h1>
        <p className="app-subtitle">Map your playlist to your route.</p>
      </div>

      <form onSubmit={handleSubmit} className="setup-form">
        {/* GPX Upload */}
        <section className="setup-section">
          <h2>Route</h2>
          <div
            className={`drop-zone ${route ? "drop-zone--loaded" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            {route ? (
              <div className="drop-zone__info">
                <span className="drop-zone__icon">✓</span>
                {filename && <span className="drop-zone__label">{filename}</span>}
                <span className="drop-zone__sub">
                  {formatDistance(route.totalDistanceMeters)}
                  {route.elevationGainMeters !== undefined && route.elevationGainMeters > 0
                    ? ` · +${Math.round(route.elevationGainMeters)} m`
                    : ""}
                </span>
                <span className="drop-zone__replace">Click to replace</span>
              </div>
            ) : (
              <div className="drop-zone__info">
                <span className="drop-zone__icon">↑</span>
                <span className="drop-zone__label">Upload GPX</span>
                <span className="drop-zone__sub">or drag and drop</span>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".gpx"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              // Reset value so the same file can be re-uploaded
              e.target.value = "";
            }}
          />
          {routeError && <p className="error-text">{routeError}</p>}
        </section>

        {/* Target Time */}
        <section className="setup-section">
          <h2>Target Time</h2>
          <div className="input-row">
            <input
              type="text"
              className="time-input"
              value={targetTime}
              onChange={(e) => setTargetTime(e.target.value)}
              placeholder="HH:MM:SS"
            />
            {avgPace !== null && (
              <span className="pace-badge">{formatPace(avgPace)} /km avg</span>
            )}
          </div>
        </section>

        {/* Strategy */}
        <section className="setup-section">
          <h2>Strategy</h2>
          <div className="strategy-options">
            {(["even", "negative_split", "positive_split"] as RunStrategy[]).map((s) => (
              <label key={s} className={`strategy-option ${strategy === s ? "strategy-option--active" : ""}`}>
                <input
                  type="radio"
                  name="strategy"
                  value={s}
                  checked={strategy === s}
                  onChange={() => setStrategy(s)}
                />
                <span className="strategy-label">
                  {s === "even" ? "Even pace" : s === "negative_split" ? "Negative split" : "Positive split"}
                </span>
                {s !== "even" && (
                  <span className="strategy-desc">
                    {s === "negative_split" ? "Start slow → finish fast" : "Start fast → finish slow"}
                  </span>
                )}
              </label>
            ))}
          </div>

          {strategy !== "even" && (
            <div className="split-config">
              <label className="split-label">
                Split intensity
                <div className="split-row">
                  <input
                    type="range"
                    min="5"
                    max="30"
                    step="5"
                    value={splitPercent}
                    onChange={(e) => setSplitPercent(parseInt(e.target.value))}
                    className="split-slider"
                  />
                  <span className="split-value">{splitPercent}%</span>
                </div>
              </label>
              {startPace !== null && endPace !== null && (
                <div className="split-preview">
                  <span>{formatPace(startPace)} /km</span>
                  <span className="arrow">→</span>
                  <span>{formatPace(endPace)} /km</span>
                </div>
              )}
            </div>
          )}
        </section>

        <button
          type="submit"
          className="btn-primary"
          disabled={!route || !targetSecs || loading}
        >
          {loading ? "Calculating…" : "Generate Soundtrack →"}
        </button>
      </form>
    </div>
  );
}
