import { useState, useEffect } from "react";
import type { Track } from "../types/domain";
import {
  getSpotifyStatus,
  getSpotifyProfile,
  getSpotifyPlaylists,
  getSpotifyPlaylistTracks,
  startSpotifyLogin,
  logoutSpotify,
} from "../lib/api";
import { loadSpotifySession, clearSpotifySession } from "../lib/storage";

export interface SpotifyUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface SpotifyPlaylistItem {
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
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [user, setUser] = useState<SpotifyUser | null>(null);
  const [playlists, setPlaylists] = useState<SpotifyPlaylistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPlaylistId, setLoadingPlaylistId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Check server config & restore session on mount
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { configured: c } = await getSpotifyStatus();
        setConfigured(c);
        if (!c) return;

        const session = loadSpotifySession();
        if (!session) return;

        // Try to restore session
        const profile = await getSpotifyProfile().catch(() => null);
        if (!profile) {
          clearSpotifySession();
          return;
        }
        setUser(profile);
        await loadPlaylists();
      } catch {
        // server unreachable
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function loadPlaylists() {
    setLoading(true);
    setError(null);
    try {
      const list = await getSpotifyPlaylists();
      setPlaylists(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load playlists.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectPlaylist(pl: SpotifyPlaylistItem) {
    setLoadingPlaylistId(pl.id);
    setError(null);
    try {
      const tracks = await getSpotifyPlaylistTracks(pl.id);
      onSelect(tracks, pl.name);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load tracks.");
    } finally {
      setLoadingPlaylistId(null);
    }
  }

  async function handleLogout() {
    await logoutSpotify().catch(() => {});
    clearSpotifySession();
    setUser(null);
    setPlaylists([]);
  }

  const filtered = playlists.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="spotify-modal-backdrop" onClick={onClose}>
      <div className="spotify-modal spotify-picker" onClick={(e) => e.stopPropagation()}>
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
          {/* Not configured */}
          {configured === false && (
            <div className="spotify-empty">
              <div className="spotify-empty__icon">♫</div>
              <p className="spotify-empty__title">Spotify not configured</p>
              <p className="spotify-empty__sub">
                Set <code>SPOTIFY_CLIENT_ID</code> and <code>SPOTIFY_CLIENT_SECRET</code> on the server to enable Spotify integration.
              </p>
            </div>
          )}

          {/* Configured but not logged in */}
          {configured === true && !user && !loading && (
            <div className="spotify-empty">
              <div className="spotify-empty__icon">♫</div>
              <p className="spotify-empty__title">Connect your Spotify account</p>
              <p className="spotify-empty__sub">Browse and select from your personal playlists.</p>
              <button className="btn-spotify-connect" onClick={startSpotifyLogin}>
                <span>Log in with Spotify</span>
              </button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="spotify-empty">
              <div className="loading-spinner" style={{ margin: "0 auto" }} />
            </div>
          )}

          {/* Logged in — playlists */}
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
