import { useState, useEffect, useRef, useCallback } from "react";
import type { Track, DraftPlaylist } from "../types/domain";
import {
  searchTracks,
  createSpotifyPlaylist,
  addTracksToSpotifyPlaylist,
  startLogin,
  hasWriteScopes,
  SpotifyForbiddenError,
} from "../lib/spotify";
import { loadSpotifyTokens, saveDraftPlaylist } from "../lib/storage";
import { formatTime } from "../lib/format";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function totalDuration(tracks: Track[]): number {
  return tracks.reduce((sum, t) => sum + t.durationSeconds, 0);
}

/** Build a suggested playlist name from route info. */
export function buildSuggestedName(routeName: string | undefined, targetTimeSeconds: number | undefined): string {
  const timePart = targetTimeSeconds != null ? formatTime(targetTimeSeconds) : null;
  const namePart = routeName?.trim() || null;
  if (namePart && timePart) return `${namePart} — ${timePart}`;
  if (namePart) return namePart;
  if (timePart) return `Run Soundtrack — ${timePart}`;
  return "Run Soundtrack";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SaveState {
  status: "idle" | "saving" | "success" | "partial" | "error";
  url?: string;
  trackCount?: number;
  name?: string;
  errorMessage?: string;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface UndoAction {
  tracks: Track[];
  label: string;
}

interface PlaylistBuilderProps {
  /** Called when user clicks "Generate soundtrack" with at least one track. */
  onGenerate: (tracks: Track[], playlistName: string) => void;
  onClose: () => void;
  /** Optional run duration for the coverage panel. */
  runDurationSeconds?: number;
  /** Existing draft to pre-populate (from localStorage). */
  initialDraft?: DraftPlaylist | null;
  /** Route name for auto-generated playlist name suggestion. */
  routeName?: string;
}

// ---------------------------------------------------------------------------
// Search result row
// ---------------------------------------------------------------------------

function SearchResultRow({
  track,
  onAdd,
}: {
  track: Track;
  onAdd: (t: Track) => void;
}) {
  return (
    <div className="pb-search-result">
      {track.artworkUrl ? (
        <img src={track.artworkUrl} alt="" className="pb-search-result__art" />
      ) : (
        <div className="pb-search-result__art pb-search-result__art--placeholder">♫</div>
      )}
      <div className="pb-search-result__info">
        <div className="pb-search-result__title">{track.title}</div>
        <div className="pb-search-result__artist muted">{track.artist}</div>
      </div>
      <div className="pb-search-result__dur muted">{formatTime(track.durationSeconds)}</div>
      <button className="pb-search-result__add" onClick={() => onAdd(track)} title="Add to playlist">
        +
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Playlist track row (reorderable)
// ---------------------------------------------------------------------------

function PlaylistTrackRow({
  track,
  index,
  total,
  onRemove,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  track: Track;
  index: number;
  total: number;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: (i: number) => void;
  onDragOver: (e: React.DragEvent, i: number) => void;
  onDrop: (i: number) => void;
}) {
  return (
    <div
      className="pb-track-row"
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e, index); }}
      onDrop={() => onDrop(index)}
    >
      <span className="pb-track-row__handle" title="Drag to reorder">⠿</span>
      <span className="pb-track-row__num muted">{index + 1}.</span>
      {track.artworkUrl ? (
        <img src={track.artworkUrl} alt="" className="pb-track-row__art" />
      ) : (
        <div className="pb-track-row__art pb-track-row__art--placeholder">♫</div>
      )}
      <div className="pb-track-row__info">
        <div className="pb-track-row__title">{track.title}</div>
        <div className="pb-track-row__artist muted">{track.artist}</div>
      </div>
      <div className="pb-track-row__dur muted">{formatTime(track.durationSeconds)}</div>
      <div className="pb-track-row__actions">
        <button
          className="pb-track-row__btn"
          disabled={index === 0}
          onClick={onMoveUp}
          title="Move up"
        >↑</button>
        <button
          className="pb-track-row__btn"
          disabled={index === total - 1}
          onClick={onMoveDown}
          title="Move down"
        >↓</button>
        <button
          className="pb-track-row__btn pb-track-row__btn--remove"
          onClick={onRemove}
          title="Remove"
        >✕</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coverage panel (§7)
// ---------------------------------------------------------------------------

function CoveragePanel({
  playlistSeconds,
  runSeconds,
}: {
  playlistSeconds: number;
  runSeconds: number;
}) {
  const coverage = Math.min(playlistSeconds / runSeconds, 1);
  const pct = Math.round(coverage * 100);
  const diff = playlistSeconds - runSeconds;

  return (
    <div className="pb-coverage">
      <div className="pb-coverage__stats">
        <div className="pb-coverage__stat">
          <span className="pb-coverage__stat-label">Playlist</span>
          <span className="pb-coverage__stat-value">{formatTime(playlistSeconds)}</span>
        </div>
        <div className="pb-coverage__stat">
          <span className="pb-coverage__stat-label">Run</span>
          <span className="pb-coverage__stat-value">{formatTime(runSeconds)}</span>
        </div>
        <div className="pb-coverage__stat">
          <span className="pb-coverage__stat-label">Coverage</span>
          <span className="pb-coverage__stat-value">{pct}%</span>
        </div>
      </div>
      <div className="pb-coverage__bar-track">
        <div className="pb-coverage__bar-fill" style={{ width: `${pct}%` }} />
      </div>
      {diff < 0 && (
        <div className="pb-coverage__warning playlist-warning">
          ⚠ Playlist is {formatTime(Math.abs(diff))} shorter than your run
        </div>
      )}
      {diff > 0 && (
        <div className="pb-coverage__info playlist-info">
          ✓ Playlist covers the full run · {formatTime(diff)} longer
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Save to Spotify panel
// ---------------------------------------------------------------------------

function SaveToSpotify({
  tracks,
  defaultName,
  onClose,
}: {
  tracks: Track[];
  defaultName: string;
  onClose: () => void;
}) {
  const isLoggedIn = Boolean(loadSpotifyTokens());
  const hasWrite = hasWriteScopes();

  const [name, setName] = useState(defaultName);
  const [isPublic, setIsPublic] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [needsReauth, setNeedsReauth] = useState(!hasWrite);

  async function handleCreate() {
    if (!isLoggedIn) return;
    setSaveState({ status: "saving" });
    let playlistId = "";
    let playlistUrl = "";
    try {
      const created = await createSpotifyPlaylist(name.trim() || defaultName, isPublic);
      playlistId = created.id;
      playlistUrl = created.url;
    } catch (err: unknown) {
      if (err instanceof SpotifyForbiddenError) {
        setNeedsReauth(true);
        setSaveState({ status: "idle" });
        return;
      }
      setSaveState({
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Could not create the Spotify playlist. Please try again.",
      });
      return;
    }

    const uris = tracks.map((t) => t.spotifyUri).filter(Boolean) as string[];
    try {
      await addTracksToSpotifyPlaylist(playlistId, uris);
      setSaveState({
        status: "success",
        url: playlistUrl,
        trackCount: tracks.length,
        name: name.trim() || defaultName,
      });
    } catch (err: unknown) {
      if (err instanceof SpotifyForbiddenError && err.reason === "insufficient_scope") {
        setNeedsReauth(true);
        setSaveState({ status: "idle" });
        return;
      }
      setSaveState({
        status: "partial",
        url: playlistUrl,
        errorMessage: `Playlist was created but tracks could not be added: ${err instanceof Error ? err.message : "unknown error"}`,
      });
    }
  }

  if (!isLoggedIn) {
    return (
      <div className="pb-save-panel">
        <p className="pb-save-panel__info">Connect Spotify to save this playlist.</p>
        <button className="btn-spotify-connect" onClick={() => startLogin(true).catch(() => {})}>
          Connect Spotify
        </button>
      </div>
    );
  }

  if (needsReauth) {
    return (
      <div className="pb-save-panel">
        <p className="pb-save-panel__info">Spotify permission is required to create playlists.</p>
        <button className="btn-spotify-connect" onClick={() => startLogin(true).catch(() => {})}>
          Connect Spotify
        </button>
      </div>
    );
  }

  if (saveState.status === "success") {
    return (
      <div className="pb-save-panel pb-save-panel--success">
        <div className="pb-save-panel__success-icon">✓</div>
        <div className="pb-save-panel__success-title">Playlist saved to Spotify</div>
        <div className="pb-save-panel__success-name">{saveState.name}</div>
        <div className="muted" style={{ fontSize: 13 }}>{saveState.trackCount} tracks · {formatTime(totalDuration(tracks))}</div>
        <a
          href={saveState.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
          style={{ marginTop: 12, display: "inline-block", textDecoration: "none" }}
        >
          Open in Spotify
        </a>
        <button className="btn-link" style={{ marginTop: 8 }} onClick={onClose}>Done</button>
      </div>
    );
  }

  if (saveState.status === "partial") {
    return (
      <div className="pb-save-panel">
        <p className="error-text">{saveState.errorMessage}</p>
        {saveState.url && (
          <a href={saveState.url} target="_blank" rel="noopener noreferrer" className="btn-link">
            Open playlist in Spotify
          </a>
        )}
        <button className="btn-secondary" style={{ marginTop: 10 }} onClick={onClose}>Close</button>
      </div>
    );
  }

  return (
    <div className="pb-save-panel">
      <h4 className="pb-save-panel__heading">Save to Spotify</h4>
      <label className="pb-save-panel__label">
        Playlist name
        <input
          className="spotify-modal__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={saveState.status === "saving"}
        />
      </label>
      <div className="pb-save-panel__visibility">
        <label className="pb-save-panel__radio">
          <input type="radio" name="visibility" checked={!isPublic} onChange={() => setIsPublic(false)} />
          Private
        </label>
        <label className="pb-save-panel__radio">
          <input type="radio" name="visibility" checked={isPublic} onChange={() => setIsPublic(true)} />
          Public
        </label>
      </div>
      {saveState.status === "error" && <p className="error-text">{saveState.errorMessage}</p>}
      <button
        className="btn-spotify-connect"
        onClick={handleCreate}
        disabled={saveState.status === "saving" || tracks.length === 0}
      >
        {saveState.status === "saving" ? "Creating…" : "Create playlist"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PlaylistBuilder({
  onGenerate,
  onClose,
  runDurationSeconds,
  initialDraft,
  routeName,
}: PlaylistBuilderProps) {
  // §18 — auto-suggest name, track whether user has edited it
  const suggestedName = buildSuggestedName(routeName, runDurationSeconds);
  const isRestoredDraft = Boolean(initialDraft);

  const [draftId] = useState(() => initialDraft?.id ?? generateId());
  const [name, setName] = useState(initialDraft?.name ?? suggestedName);
  // "auto" = still matches what we'd generate; "user" = user has typed something else
  const [nameSource, setNameSource] = useState<"auto" | "user">(
    isRestoredDraft ? "user" : "auto"
  );
  const [tracks, setTracks] = useState<Track[]>(initialDraft?.tracks ?? []);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [showSavePanel, setShowSavePanel] = useState(false);

  // §10 — undo
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // §17 — autosave status
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(isRestoredDraft ? "saved" : "idle");

  // Drag-and-drop
  const dragIndex = useRef<number | null>(null);

  // ── §18: update suggested name when run info changes, if still auto ───────
  useEffect(() => {
    if (nameSource === "auto") {
      setName(buildSuggestedName(routeName, runDurationSeconds));
    }
  }, [routeName, runDurationSeconds, nameSource]);

  function handleNameChange(v: string) {
    setName(v);
    setNameSource("user");
  }

  // ── Debounced search ──────────────────────────────────────────────────────
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearchLoading(true);
    setSearchError(null);
    try {
      const res = await searchTracks(q);
      setResults(res);
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => runSearch(query), 300);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [query, runSearch]);

  // ── §17 Persist draft + update save status ────────────────────────────────
  useEffect(() => {
    setSaveStatus("saving");
    try {
      saveDraftPlaylist({ id: draftId, name, tracks });
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, [draftId, name, tracks]);

  // ── §10 Undo helpers ───────────────────────────────────────────────────────
  function pushUndo(label: string, prev: Track[]) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoAction({ tracks: prev, label });
    undoTimer.current = setTimeout(() => setUndoAction(null), 3000);
  }

  function handleUndo() {
    if (!undoAction) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setTracks(undoAction.tracks);   // restores; does NOT push another undo
    setUndoAction(null);
  }

  // ── Track editing helpers ─────────────────────────────────────────────────
  function addTrack(t: Track) {
    const uniqueId = tracks.some((x) => x.id === t.id)
      ? `${t.id}-${Date.now()}`
      : t.id;
    setTracks((prev) => [...prev, { ...t, id: uniqueId }]);
  }

  function removeTrack(index: number) {
    pushUndo("Track removed", tracks);
    setTracks((prev) => prev.filter((_, i) => i !== index));
  }

  function moveTrack(from: number, to: number) {
    if (to < 0 || to >= tracks.length) return;
    pushUndo("Track moved", tracks);
    setTracks((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  // ── Drag helpers ───────────────────────────────────────────────────────────
  function handleDragStart(i: number) {
    dragIndex.current = i;
  }

  function handleDragOver(e: React.DragEvent, _i: number) {
    e.preventDefault();
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex.current === null || dragIndex.current === targetIndex) return;
    moveTrack(dragIndex.current, targetIndex);
    dragIndex.current = null;
  }

  // ── Duration + coverage ───────────────────────────────────────────────────
  const total = totalDuration(tracks);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="pb-backdrop" onClick={onClose}>
      <div className="pb-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="pb-modal__header">
          <span className="pb-modal__title">Create Playlist</span>
          <button className="spotify-modal__close" onClick={onClose}>✕</button>
        </div>

        {/* Playlist name + §17 autosave status */}
        <div className="pb-name-row">
          <label className="pb-name-row__label">Name</label>
          <input
            className="spotify-modal__input pb-name-row__input"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="My Running Playlist"
          />
          <span className={`pb-save-status pb-save-status--${saveStatus}`}>
            {saveStatus === "saving" && "Saving…"}
            {saveStatus === "saved" && "✓ Saved"}
            {saveStatus === "error" && "Could not save draft locally"}
          </span>
        </div>

        <div className="pb-columns">
          {/* Left: Search */}
          <div className="pb-col pb-col--search">
            <div className="pb-section-label">Search Spotify</div>
            <input
              className="spotify-modal__input spotify-modal__input--search"
              type="text"
              placeholder="🔍 Search tracks…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />

            <div className="pb-search-results">
              {searchLoading && (
                <div className="pb-search-status">
                  <div className="loading-spinner loading-spinner--sm" style={{ margin: "0 auto" }} />
                </div>
              )}
              {!searchLoading && searchError && (
                <p className="error-text" style={{ padding: "8px 0" }}>{searchError}</p>
              )}
              {!searchLoading && !searchError && results.map((t) => (
                <SearchResultRow key={`${t.id}-result`} track={t} onAdd={addTrack} />
              ))}
              {!searchLoading && !searchError && query && results.length === 0 && (
                <p className="muted" style={{ padding: "12px 0" }}>No results for "{query}"</p>
              )}
            </div>
          </div>

          {/* Right: Draft playlist */}
          <div className="pb-col pb-col--playlist">
            <div className="pb-section-label">
              Your playlist
              {tracks.length > 0 && (
                <button className="btn-link pb-clear-btn" onClick={() => setTracks([])}>
                  Clear all
                </button>
              )}
            </div>

            <div className="pb-playlist-list">
              {tracks.length === 0 && (
                <p className="muted" style={{ padding: "16px 0" }}>
                  Add tracks from search results.
                </p>
              )}
              {tracks.map((t, i) => (
                <PlaylistTrackRow
                  key={t.id}
                  track={t}
                  index={i}
                  total={tracks.length}
                  onRemove={() => removeTrack(i)}
                  onMoveUp={() => moveTrack(i, i - 1)}
                  onMoveDown={() => moveTrack(i, i + 1)}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                />
              ))}
            </div>

            {/* §10 Undo toast */}
            {undoAction && (
              <div className="pb-undo-toast">
                <span>{undoAction.label}</span>
                <button className="pb-undo-toast__btn" onClick={handleUndo}>Undo</button>
              </div>
            )}

            {/* §7 Coverage panel (only when run duration is known) */}
            {runDurationSeconds != null && tracks.length > 0 ? (
              <CoveragePanel playlistSeconds={total} runSeconds={runDurationSeconds} />
            ) : (
              /* Minimal duration footer when no run context */
              <div className="pb-duration">
                <span className="pb-duration__label">Total</span>
                <span className="pb-duration__value">{formatTime(total)}</span>
              </div>
            )}

            {/* Save to Spotify toggle */}
            {!showSavePanel && (
              <button
                className="pb-save-spotify-btn btn-secondary"
                onClick={() => setShowSavePanel(true)}
                disabled={tracks.length === 0}
              >
                Save to Spotify
              </button>
            )}

            {showSavePanel && (
              <SaveToSpotify
                tracks={tracks}
                defaultName={name}
                onClose={() => setShowSavePanel(false)}
              />
            )}

            {/* Generate */}
            <button
              className="btn-primary pb-generate-btn"
              disabled={tracks.length === 0}
              onClick={() => onGenerate(tracks, name)}
            >
              Generate soundtrack
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
