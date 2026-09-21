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
import { importSpotifyPlaylist } from "../lib/api";

interface PlaylistItem {
  id: string;
  name: string;
  trackCount: number;
  imageUrl: string | null;
}

interface SpotifyPickerProps {
  onSelect: (tracks: Track[], playlistName: string) => void;
  onClose: () => void;
}

export default function SpotifyPicker({ onSelect, onClose }: SpotifyPickerProps) {
  const configured = true; // CLIENT_ID is always set

  const [user, setUser] = useState<{ id: string; name: string; avatarUrl: string | null } | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPlaylistId, setLoadingPlaylistId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Public URL import
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  // On mount — try to restore session
  useEffect(() => {
    if (!configured) return;
    const tokens = loadSpotifyTokens();
    if (!tokens) return;

    setLoading(true);
    getProfile()
      .then((profile) => {
        setUser(profile);
        return getUserPlaylists();
      })
      .then(setPlaylists)
      .catch(() => {
        // Token expired or revoked
        clearSpotifyTokens();
      })
      .finally(() => setLoading(false));
  }, [configured]);

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

  async function handleImportUrl() {
    if (!urlInput.trim()) return;
    setUrlLoading(true);
    setUrlError(null);
    try {
      const { tracks, playlistId } = await importSpotifyPlaylist(urlInput.trim());
      onSelect(tracks, `Spotify playlist (${playlistId})`);
      onClose();
    } catch (err: unknown) {
      setUrlError(err instanceof Error ? err.message : "Failed to import playlist.");
    } finally {
      setUrlLoading(false);
    }
  }

  const filtered = playlists.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

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

          {/* Not configured — ask user to set env var */}
          {!configured && (
            <div className="spotify-empty">
              <div className="spotify-empty__icon">♫</div>
              <p className="spotify-empty__title">Add your Spotify Client ID</p>
              <p className="spotify-empty__sub">
                Create a free app at{" "}
                <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
                  developer.spotify.com
                </a>
                , then add <code>http://localhost:5173</code> as a Redirect URI.
              </p>
              <div className="spotify-setup-steps">
                <div className="spotify-setup-step">
                  <span className="spotify-setup-step__num">1</span>
                  <span>Go to <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">Spotify Developer Dashboard</a> → Create app</span>
                </div>
                <div className="spotify-setup-step">
                  <span className="spotify-setup-step__num">2</span>
                  <span>Add Redirect URI: <code>http://localhost:5173</code></span>
                </div>
                <div className="spotify-setup-step">
                  <span className="spotify-setup-step__num">3</span>
                  <span>Copy your Client ID and create <code>client/.env.local</code>:</span>
                </div>
              </div>
              <pre className="spotify-setup-code">VITE_SPOTIFY_CLIENT_ID=your_client_id_here</pre>
              <p className="spotify-empty__sub" style={{ marginTop: 8 }}>
                Restart the dev server after adding the variable.
              </p>
            </div>
          )}

          {/* Configured — not logged in */}
          {configured && !user && !loading && (
            <div className="spotify-empty">
              <div className="spotify-empty__icon">♫</div>
              <p className="spotify-empty__title">Connect your Spotify account</p>
              <p className="spotify-empty__sub">Browse and select from your personal playlists.</p>
              <button className="btn-spotify-connect" onClick={() => startLogin().catch((e) => setError(e.message))}>
                Log in with Spotify
              </button>
              {error && <p className="error-text" style={{ marginTop: 12 }}>{error}</p>}

              {/* Public URL import — always available when configured */}
              <div className="spotify-url-import">
                <p className="spotify-url-import__label">Or paste a public playlist URL:</p>
                <div className="spotify-url-import__row">
                  <input
                    className="spotify-modal__input"
                    type="text"
                    placeholder="https://open.spotify.com/playlist/…"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
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

          {/* Loading */}
          {loading && (
            <div className="spotify-empty">
              <div className="loading-spinner" style={{ margin: "0 auto" }} />
            </div>
          )}

          {/* Logged in — playlist grid */}
          {user && !loading && (
            <>
              <div className="spotify-picker__user">
                {user.avatarUrl && (
                  <img src={user.avatarUrl} alt="" className="spotify-picker__avatar" />
                )}
                <span className="spotify-picker__username">{user.name}</span>
              </div>

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

              {error && <p className="error-text" style={{ padding: "0 18px 8px" }}>{error}</p>}

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
                {filtered.length === 0 && (
                  <p className="muted" style={{ padding: "16px", gridColumn: "1/-1" }}>
                    No playlists match "{search}"
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
