import { useState, useCallback, useEffect } from "react";
import type { Route, RunPlan, TimedRoute, Soundtrack, Track } from "./types/domain";
import { buildTimedRoute, buildSoundtrack } from "./lib/engine";
import { calculateSoundtrack } from "./lib/api";
import { handleCallback as spotifyHandleCallback } from "./lib/spotify";
import { saveRoute } from "./lib/storage";
import Wizard from "./components/Wizard";
import MapView from "./components/MapView";
import PlaylistPanel from "./components/PlaylistPanel";
import Timeline from "./components/Timeline";
import RunSummary from "./components/RunSummary";
import SpotifyPicker from "./components/SpotifyPicker";
import RunSetup from "./components/RunSetup";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AppState = {
  route: Route;
  routeName: string;
  runPlan: RunPlan;
  timedRoute: TimedRoute;
  soundtrack: Soundtrack;
  playlist: Track[];
  playlistName: string;
  selectedTrackId: string | null;
  hoveredTrackId: string | null;
};

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(false);

  // UI overlays
  const [showSetup, setShowSetup] = useState(false);
  const [showSpotify, setShowSpotify] = useState(false);

  // ---------------------------------------------------------------------------
  // On mount: handle Spotify PKCE callback (?code=...)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");

    if (code) {
      window.history.replaceState({}, "", window.location.pathname);
      spotifyHandleCallback(code).then((ok) => {
        if (ok) setShowSpotify(true);
      });
    } else if (error) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Wizard complete — called when user finishes onboarding
  // ---------------------------------------------------------------------------
  const handleWizardComplete = useCallback(async (
    route: Route,
    routeName: string,
    plan: RunPlan,
    tracks: Track[],
    tracksName: string = "Playlist",
  ) => {
    setLoading(true);
    saveRoute(route, routeName);
    try {
      let timedRoute: TimedRoute;
      let soundtrack: Soundtrack;
      try {
        const result = await calculateSoundtrack(route, plan, tracks);
        timedRoute = result.timedRoute;
        soundtrack = result.soundtrack;
      } catch {
        timedRoute = buildTimedRoute(route, plan);
        soundtrack = buildSoundtrack(route, timedRoute, tracks);
      }
      setAppState({
        route, routeName, runPlan: plan,
        timedRoute, soundtrack,
        playlist: tracks, playlistName: tracksName,
        selectedTrackId: null, hoveredTrackId: null,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // RunSetup submit (editing an existing run)
  // ---------------------------------------------------------------------------
  const handleSetupStart = useCallback(async (route: Route, plan: RunPlan) => {
    if (!appState) return;
    setLoading(true);
    saveRoute(route, appState.routeName);
    try {
      let timedRoute: TimedRoute;
      let soundtrack: Soundtrack;
      try {
        const result = await calculateSoundtrack(route, plan, appState.playlist);
        timedRoute = result.timedRoute;
        soundtrack = result.soundtrack;
      } catch {
        timedRoute = buildTimedRoute(route, plan);
        soundtrack = buildSoundtrack(route, timedRoute, appState.playlist);
      }
      setAppState((s) => s ? {
        ...s, route, runPlan: plan,
        timedRoute, soundtrack,
        selectedTrackId: null, hoveredTrackId: null,
      } : null);
      setShowSetup(false);
    } finally {
      setLoading(false);
    }
  }, [appState]);

  // ---------------------------------------------------------------------------
  // Playlist change — recompute soundtrack immediately
  // ---------------------------------------------------------------------------
  const handlePlaylistChange = useCallback((tracks: Track[], playlistName: string) => {
    setAppState((s) => {
      if (!s) return null;
      const soundtrack = buildSoundtrack(s.route, s.timedRoute, tracks);
      return { ...s, playlist: tracks, playlistName, soundtrack, selectedTrackId: null };
    });
    setShowSpotify(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Track selection
  // ---------------------------------------------------------------------------
  const selectTrack = useCallback((id: string) => {
    setAppState((s) => s ? { ...s, selectedTrackId: s.selectedTrackId === id ? null : id } : null);
  }, []);

  const hoverTrack = useCallback((id: string | null) => {
    setAppState((s) => s ? { ...s, hoveredTrackId: id } : null);
  }, []);

  // ---------------------------------------------------------------------------
  // Escape key
  // ---------------------------------------------------------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showSpotify) setShowSpotify(false);
        else if (showSetup) setShowSetup(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSetup, showSpotify]);

  // ---------------------------------------------------------------------------
  // Show wizard if no state yet
  // ---------------------------------------------------------------------------
  if (!appState) {
    return (
      <>
        <Wizard onComplete={(route, routeName, plan, tracks) =>
          handleWizardComplete(route, routeName, plan, tracks, "Playlist")
        } />
        {loading && (
          <div className="loading-overlay">
            <div className="loading-spinner" />
            <p>Building your soundtrack…</p>
          </div>
        )}
      </>
    );
  }

  const { route, routeName, runPlan, soundtrack, playlist, playlistName,
    selectedTrackId, hoveredTrackId } = appState;

  // ---------------------------------------------------------------------------
  // Main app view
  // ---------------------------------------------------------------------------
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__icon">♫</span>
          <span className="app-header__title">Run Soundtrack</span>
          <span className="app-header__route-name">{routeName}</span>
        </div>
        <div className="app-header__actions">
          <button className="btn-spotify" onClick={() => setShowSpotify(true)}>
            <span className="btn-spotify__icon">♫</span>
            {playlistName || "Playlist"}
          </button>
          <button className="btn-secondary" onClick={() => setShowSetup((v) => !v)}>
            {showSetup ? "← Back" : "Edit Run"}
          </button>
        </div>
      </header>

      {showSetup ? (
        <div className="setup-overlay">
          <RunSetup
            onStart={handleSetupStart}
            loading={loading}
            initialRoute={route}
          />
        </div>
      ) : (
        <div className="app-body">
          <div className="map-section">
            <MapView
              route={route}
              soundtrack={soundtrack}
              selectedTrackId={selectedTrackId}
              hoveredTrackId={hoveredTrackId}
              onSelectTrack={selectTrack}
              onHoverTrack={hoverTrack}
            />
          </div>

          <div className="bottom-panel">
            <div className="bottom-left">
              <RunSummary
                route={route}
                plan={runPlan}
                soundtrack={soundtrack}
                playlistSource={playlist[0]?.source === "spotify" ? "spotify" : "demo"}
                onImportSpotify={() => setShowSpotify(true)}
              />
            </div>
            <div className="bottom-right">
              <PlaylistPanel
                soundtrack={soundtrack}
                selectedTrackId={selectedTrackId}
                hoveredTrackId={hoveredTrackId}
                onSelectTrack={selectTrack}
                onHoverTrack={hoverTrack}
                onChangePlaylist={() => setShowSpotify(true)}
              />
            </div>
          </div>

          <div className="timeline-section">
            <Timeline
              soundtrack={soundtrack}
              totalDistanceMeters={route.totalDistanceMeters}
              selectedTrackId={selectedTrackId}
              hoveredTrackId={hoveredTrackId}
              onSelectTrack={selectTrack}
              onHoverTrack={hoverTrack}
            />
          </div>
        </div>
      )}

      {showSpotify && (
        <SpotifyPicker
          onSelect={handlePlaylistChange}
          onClose={() => setShowSpotify(false)}
        />
      )}

      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <p>Building your soundtrack…</p>
        </div>
      )}
    </div>
  );
}
