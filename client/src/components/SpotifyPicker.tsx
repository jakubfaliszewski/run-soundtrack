import { useState, useEffect } from "react";
import type { Track } from "../types/domain";
import {
  startLogin,
  logout,
  getProfile,
  getUserPlaylists,
  getPlaylistTracks,
} from "../lib/spotify";
import { loadSpotifyTokens, clearSpotifyTokens } from "../lib/storage";

interface PlaylistItem {
  id: string;
  name: string;
  trackCount: number;
  imageUrl: string | null;
  ownerId: string;
}

interface SpotifyPickerProps {
  onSelect: (tracks: Track[], playlistName: string) => void;
  onClose: () => void;
  onBeforeLogin?: () => void;
}

// Extract playlist ID from a Spotify URL or URI
function extractPlaylistId(input: string): string | null {
  const urlMatch = input.match(/playlist\/([A-Za-z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  const uriMatch = input.match(/spotify:playlist:([A-Za-z0-9]+)/);
  if (uriMatch) return uriMatch[1];
  return null;
}

export default function SpotifyPicker({ onSelect, onClose, onBeforeLogin }: SpotifyPickerProps) {
  const [user, setUser] = useState<{ id: string; name: string; avatarUrl: string | null } | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingPlaylistId, setLoadingPlaylistId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // URL import — works whether logged in or not (uses user token if available)
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  // On mount — try to restore session from stored tokens
  useEffect(() => {
    const tokens = loadSpotifyTokens();
    if (!tokens) return;

    setLoading(true);
    getProfile()
      .then(async (profile) => {
        setUser(profile);
        try {
          const list = await getUserPlaylists();
          setPlaylists(list);
        } catch {
          // playlists failed but user is still logged in
        }
      })
      .catch(() => {
        clearSpotifyTokens();
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSelectPlaylist(pl: PlaylistItem) {
    setLoadingPlaylistId(pl.id);
    setError(null);
    try {
      const tracks = await getPlaylistTracks(pl.id);
      onSelect(tracks, pl.name);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load tracks.");
    } finally {
      setLoadingPlaylistId(null);
    }
  }

  async function handleLogout() {
    logout();
    setUser(null);
    setPlaylists([]);
  }

  // URL import — extracts playlist ID and fetches tracks using the user's token.
  // Works for any public playlist the logged-in user can access.
  async function handleImportUrl() {
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    if (!loadSpotifyTokens()) {
      setUrlError("Log in with Spotify first to import a playlist by URL.");
      return;
    }

    const playlistId = extractPlaylistId(trimmed);
    if (!playlistId) {
      setUrlError("Could not find a playlist ID in that URL.");
      return;
    }
    setUrlLoading(true);
    setUrlError(null);
    try {
      const tracks = await getPlaylistTracks(playlistId);
      if (tracks.length === 0) throw new Error("Playlist is empty or not accessible.");
      onSelect(tracks, "Spotify playlist");
      onClose();
    } catch (err: unknown) {
      setUrlError(err instanceof Error ? err.message : "Failed to import playlist.");
    } finally {
      setUrlLoading(false);
    }
  }

  // In Spotify dev mode only playlists you own are accessible.
  // Others are shown separately behind a toggle.
  const ownedPlaylists = user ? playlists.filter((p) => p.ownerId === user.id) : playlists;
  const otherPlaylists = user ? playlists.filter((p) => p.ownerId !== user.id) : [];
  const visiblePlaylists = showAll ? playlists : ownedPlaylists;
  const filtered = search
    ? visiblePlaylists.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : visiblePlaylists;

  return (
    <div className="spotify-modal-backdrop" onClick={onClose}>
      <div className="spotify-modal spotify-picker" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="spotify-modal__header">
          <div className="spotify-modal__title">
            <span className="spotify-icon">♫</span>
            Spotify
          </div>
          <div className="spotify-modal__header-right">
            {user && (
              <button className="spotify-logout-btn" onClick={handleLogout}>
                Disconnect
              </button>
            )}
            <button className="spotify-modal__close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="spotify-picker__body">

          {/* Loading */}
          {loading && (
            <div className="spotify-empty">
              <div className="loading-spinner" style={{ margin: "0 auto" }} />
            </div>
          )}

          {/* Not logged in */}
          {!user && !loading && (
            <div className="spotify-empty">
              <div className="spotify-empty__icon">♫</div>
              <p className="spotify-empty__title">Connect your Spotify account</p>
              <p className="spotify-empty__sub">Browse and select from your personal playlists.</p>
              <button
                className="btn-spotify-connect"
                onClick={() => { onBeforeLogin?.(); startLogin().catch((e) => setError(e.message)); }}
              >
                Log in with Spotify
              </button>
              {error && <p className="error-text" style={{ marginTop: 12 }}>{error}</p>}

              <div className="spotify-url-import">
                <p className="spotify-url-import__label">Or paste a public playlist URL:</p>
                <div className="spotify-url-import__row">
                  <input
                    className="spotify-modal__input"
                    type="text"
                    placeholder="https://open.spotify.com/playlist/…"
                    value={urlInput}
                    onChange={(e) => { setUrlInput(e.target.value); setUrlError(null); }}
                    onKeyDown={(e) => e.key === "Enter" && handleImportUrl()}
                  />
                  <button
                    className="btn-primary"
                    onClick={handleImportUrl}
                    disabled={urlLoading || !urlInput.trim()}
                  >
                    {urlLoading ? "…" : "Import"}
                  </button>
                </div>
                {urlError && <p className="error-text">{urlError}</p>}
              </div>
            </div>
          )}

          {/* Logged in — search + grid */}
          {user && !loading && (
            <>
              <div className="spotify-picker__user">
                {user.avatarUrl && (
                  <img src={user.avatarUrl} alt="" className="spotify-picker__avatar" />
                )}
                <span className="spotify-picker__username">{user.name}</span>
              </div>

              {/* Search + URL import row */}
              <div className="spotify-picker__search-row">
                <input
                  className="spotify-modal__input"
                  type="text"
                  placeholder="Search playlists…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
              </div>

              {/* URL paste — always visible when logged in too */}
              <div className="spotify-url-import spotify-url-import--inline">
                <div className="spotify-url-import__row">
                  <input
                    className="spotify-modal__input"
                    type="text"
                    placeholder="Or paste a playlist URL to import it…"
                    value={urlInput}
                    onChange={(e) => { setUrlInput(e.target.value); setUrlError(null); }}
                    onKeyDown={(e) => e.key === "Enter" && handleImportUrl()}
                  />
                  <button
                    className="btn-primary"
                    onClick={handleImportUrl}
                    disabled={urlLoading || !urlInput.trim()}
                  >
                    {urlLoading ? "…" : "Import"}
                  </button>
                </div>
                {urlError && <p className="error-text">{urlError}</p>}
              </div>

              {error && <p className="error-text" style={{ padding: "0 18px 8px" }}>{error}</p>}

              {/* Toggle to show saved-but-not-owned playlists */}
              {otherPlaylists.length > 0 && (
                <div className="spotify-picker__filter-row">
                  <button className="btn-link" onClick={() => setShowAll((v) => !v)}>
                    {showAll
                      ? `Show only your playlists (${ownedPlaylists.length})`
                      : `Also show ${otherPlaylists.length} saved playlists (may be inaccessible)`}
                  </button>
                </div>
              )}

              <div className="spotify-picker__grid">
                {filtered.map((pl) => (
                  <button
                    key={pl.id}
                    className={`spotify-pl-card ${loadingPlaylistId === pl.id ? "spotify-pl-card--loading" : ""}`}
                    onClick={() => handleSelectPlaylist(pl)}
                    disabled={loadingPlaylistId !== null}
                  >
                    <div className="spotify-pl-card__img">
                      {pl.imageUrl ? (
                        <img src={pl.imageUrl} alt="" />
                      ) : (
                        <div className="spotify-pl-card__img-placeholder">♫</div>
                      )}
                      {loadingPlaylistId === pl.id && (
                        <div className="spotify-pl-card__loading-overlay">
                          <div className="loading-spinner loading-spinner--sm" />
                        </div>
                      )}
                    </div>
                    <div className="spotify-pl-card__name">{pl.name}</div>
                    <div className="spotify-pl-card__count muted">{pl.trackCount} tracks</div>
                  </button>
                ))}
                {search && filtered.length === 0 && (
                  <p className="muted" style={{ padding: "16px", gridColumn: "1/-1" }}>
                    No playlists match "{search}"
                  </p>
                )}
                {!search && playlists.length === 0 && (
                  <p className="muted" style={{ padding: "16px", gridColumn: "1/-1" }}>
                    No playlists found.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
