import { useState, useRef } from "react";
import type { Route, RunPlan, RunStrategy, Track } from "../types/domain";
import { formatDistance, formatPace, formatTimeHMS, parseTimeToSeconds } from "../lib/format";
import { buildRunPlan } from "../lib/engine";
import { parseGpxFile } from "../lib/api";
import { parseGpxClientSide } from "../lib/engine";
import { demoPlaylist } from "../data/demoPlaylist";
import SpotifyPicker from "./SpotifyPicker";

interface WizardProps {
  onComplete: (route: Route, routeName: string, plan: RunPlan, tracks: Track[]) => void;
}

function suggestTargetTime(route: Route): string {
  return formatTimeHMS(Math.round((route.totalDistanceMeters / 1000) * 330));
}

type Step = "gpx" | "configure" | "playlist";

export default function Wizard({ onComplete }: WizardProps) {
  const [step, setStep] = useState<Step>("gpx");

  // Step 1 — GPX
  const [route, setRoute] = useState<Route | null>(null);
  const [routeName, setRouteName] = useState("");
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 2 — Configure
  const [targetTime, setTargetTime] = useState("00:50:00");
  const [strategy, setStrategy] = useState<RunStrategy>("even");
  const [splitPercent, setSplitPercent] = useState(10);

  // Step 3 — Playlist
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlistName, setPlaylistName] = useState("");
  const [showSpotifyPicker, setShowSpotifyPicker] = useState(false);

  // ── Derived ──────────────────────────────────────────────────────────────
  const targetSecs = parseTimeToSeconds(targetTime);
  const avgPace = targetSecs && route ? targetSecs / (route.totalDistanceMeters / 1000) : null;

  let startPace: number | null = null;
  let endPace: number | null = null;
  if (avgPace !== null && strategy !== "even") {
    const frac = splitPercent / 100;
    startPace = strategy === "negative_split" ? avgPace * (1 + frac) : avgPace * (1 - frac);
    endPace   = strategy === "negative_split" ? avgPace * (1 - frac) : avgPace * (1 + frac);
  }

  // ── GPX handlers ─────────────────────────────────────────────────────────
  async function handleFile(file: File) {
    setRouteError(null);
    setRouteLoading(true);
    try {
      let parsed: Route;
      try {
        parsed = await parseGpxFile(file);
      } catch {
        const text = await file.text();
        parsed = parseGpxClientSide(text);
      }
      const name = file.name.replace(/\.gpx$/i, "");
      setRoute(parsed);
      setRouteName(name);
      setTargetTime(suggestTargetTime(parsed));
    } catch (err: unknown) {
      setRouteError(err instanceof Error ? err.message : "Failed to read GPX file.");
    } finally {
      setRouteLoading(false);
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  function handleFinish(selectedTracks: Track[], _plName: string) {
    if (!route || !targetSecs) return;
    const plan = buildRunPlan(route.totalDistanceMeters, targetSecs, strategy, splitPercent / 100);
    onComplete(route, routeName || "My Route", plan, selectedTracks.length > 0 ? selectedTracks : demoPlaylist);
  }

  // ── Step progress ─────────────────────────────────────────────────────────
  const steps: Step[] = ["gpx", "configure", "playlist"];
  const stepIndex = steps.indexOf(step);

  return (
    <div className="wizard">
      {/* Header */}
      <div className="wizard__header">
        <div className="wizard__brand">
          <span className="wizard__brand-icon">♫</span>
          Run Soundtrack
        </div>
        <div className="wizard__steps">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`wizard__step-dot ${i < stepIndex ? "wizard__step-dot--done" : ""} ${i === stepIndex ? "wizard__step-dot--active" : ""}`}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="wizard__body">

        {/* ── Step 1: Upload GPX ─────────────────────────────────────────── */}
        {step === "gpx" && (
          <div className="wizard__step">
            <div className="wizard__step-label">Step 1 of 3</div>
            <h1 className="wizard__title">Upload your route</h1>
            <p className="wizard__sub">Import a GPX file from your GPS watch, Strava, or Garmin Connect.</p>

            <div
              className={`drop-zone drop-zone--wizard ${route ? "drop-zone--loaded" : ""}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => fileRef.current?.click()}
            >
              {routeLoading ? (
                <div className="drop-zone__info">
                  <div className="loading-spinner" style={{ margin: "0 auto 8px" }} />
                  <span className="drop-zone__label">Parsing…</span>
                </div>
              ) : route ? (
                <div className="drop-zone__info">
                  <span className="drop-zone__icon">✓</span>
                  <span className="drop-zone__label">{routeName}</span>
                  <span className="drop-zone__sub">{formatDistance(route.totalDistanceMeters)}{route.elevationGainMeters && route.elevationGainMeters > 0 ? ` · +${Math.round(route.elevationGainMeters)} m` : ""}</span>
                  <span className="drop-zone__replace">Click to replace</span>
                </div>
              ) : (
                <div className="drop-zone__info">
                  <span className="drop-zone__icon">↑</span>
                  <span className="drop-zone__label">Drop GPX file here</span>
                  <span className="drop-zone__sub">or click to browse</span>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".gpx" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />

            {routeError && <p className="error-text">{routeError}</p>}

            <div className="wizard__actions">
              <button
                className="btn-primary wizard__next"
                disabled={!route}
                onClick={() => setStep("configure")}
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Configure ──────────────────────────────────────────── */}
        {step === "configure" && route && (
          <div className="wizard__step">
            <div className="wizard__step-label">Step 2 of 3</div>
            <h1 className="wizard__title">Set your pace</h1>
            <p className="wizard__sub">{routeName} · {formatDistance(route.totalDistanceMeters)}</p>

            <div className="setup-form">
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

              <section className="setup-section">
                <h2>Strategy</h2>
                <div className="strategy-options">
                  {(["even", "negative_split", "positive_split"] as RunStrategy[]).map((s) => (
                    <label key={s} className={`strategy-option ${strategy === s ? "strategy-option--active" : ""}`}>
                      <input type="radio" name="strategy" value={s} checked={strategy === s} onChange={() => setStrategy(s)} />
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
                        <input type="range" min="5" max="30" step="5" value={splitPercent}
                          onChange={(e) => setSplitPercent(parseInt(e.target.value))} className="split-slider" />
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
            </div>

            <div className="wizard__actions">
              <button className="btn-secondary" onClick={() => setStep("gpx")}>← Back</button>
              <button
                className="btn-primary wizard__next"
                disabled={!targetSecs}
                onClick={() => setStep("playlist")}
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Playlist ───────────────────────────────────────────── */}
        {step === "playlist" && (
          <div className="wizard__step">
            <div className="wizard__step-label">Step 3 of 3</div>
            <h1 className="wizard__title">Choose your playlist</h1>
            <p className="wizard__sub">Pick the soundtrack for your run, or use the demo playlist to get started.</p>

            <div className="playlist-choice">
              {tracks.length > 0 ? (
                <div className="playlist-choice__selected">
                  <div className="playlist-choice__selected-info">
                    <span className="playlist-choice__selected-icon">♫</span>
                    <div>
                      <div className="playlist-choice__selected-name">{playlistName}</div>
                      <div className="playlist-choice__selected-count muted">{tracks.length} tracks</div>
                    </div>
                  </div>
                  <button className="btn-secondary" onClick={() => setShowSpotifyPicker(true)}>Change</button>
                </div>
              ) : (
                <button
                  className="playlist-choice__spotify-btn"
                  onClick={() => setShowSpotifyPicker(true)}
                >
                  <span className="playlist-choice__spotify-icon">♫</span>
                  <div>
                    <div className="playlist-choice__spotify-label">Connect Spotify</div>
                    <div className="playlist-choice__spotify-sub">Pick from your personal playlists</div>
                  </div>
                  <span className="playlist-choice__arrow">→</span>
                </button>
              )}

              <div className="playlist-choice__divider">
                <span>{tracks.length > 0 ? "or" : "or continue with"}</span>
              </div>

              <button
                className={`playlist-choice__demo-btn ${tracks.length === 0 ? "playlist-choice__demo-btn--default" : ""}`}
                onClick={() => handleFinish([], "Demo playlist")}
              >
                Use demo playlist
                <span className="muted"> · {demoPlaylist.length} curated tracks</span>
              </button>
            </div>

            <div className="wizard__actions">
              <button className="btn-secondary" onClick={() => setStep("configure")}>← Back</button>
              {tracks.length > 0 && (
                <button
                  className="btn-primary wizard__next"
                  onClick={() => handleFinish(tracks, playlistName)}
                >
                  Generate Soundtrack →
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {showSpotifyPicker && (
        <SpotifyPicker
          onSelect={(t, name) => { setTracks(t); setPlaylistName(name); }}
          onClose={() => setShowSpotifyPicker(false)}
        />
      )}
    </div>
  );
}
