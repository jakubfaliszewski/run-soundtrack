import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  hasWriteScopes,
  SpotifyForbiddenError,
  searchTracks,
  createSpotifyPlaylist,
  addTracksToSpotifyPlaylist,
  logout,
} from "../spotify";

// ---------------------------------------------------------------------------
// localStorage stub (vitest uses jsdom which provides it, but we need control)
// ---------------------------------------------------------------------------

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

// ---------------------------------------------------------------------------
// SpotifyForbiddenError
// ---------------------------------------------------------------------------

describe("SpotifyForbiddenError", () => {
  it("has the correct name", () => {
    expect(new SpotifyForbiddenError().name).toBe("SpotifyForbiddenError");
  });

  it("defaults reason to insufficient_scope", () => {
    expect(new SpotifyForbiddenError().reason).toBe("insufficient_scope");
  });

  it("accepts a custom reason", () => {
    const err = new SpotifyForbiddenError("Forbidden");
    expect(err.reason).toBe("Forbidden");
    expect(err.message).toBe("Forbidden");
  });

  it("is an instance of Error", () => {
    expect(new SpotifyForbiddenError()).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// hasWriteScopes
// ---------------------------------------------------------------------------

describe("hasWriteScopes", () => {
  it("returns false when no scope stored", () => {
    expect(hasWriteScopes()).toBe(false);
  });

  it("returns false for read-only scope string", () => {
    localStorage.setItem("rs_spotify_scope_v1", "playlist-read-private playlist-read-collaborative");
    expect(hasWriteScopes()).toBe(false);
  });

  it("returns true when scope includes playlist-modify-private", () => {
    localStorage.setItem(
      "rs_spotify_scope_v1",
      "playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public",
    );
    expect(hasWriteScopes()).toBe(true);
  });

  it("returns false for empty string", () => {
    localStorage.setItem("rs_spotify_scope_v1", "");
    expect(hasWriteScopes()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// logout clears scope key
// ---------------------------------------------------------------------------

describe("logout", () => {
  it("clears the stored scope string", () => {
    localStorage.setItem("rs_spotify_scope_v1", "playlist-modify-private");
    logout();
    expect(localStorage.getItem("rs_spotify_scope_v1")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// searchTracks — fetch mock
// ---------------------------------------------------------------------------

function makeSpotifyTrackItem(id: string) {
  return {
    id,
    name: `Track ${id}`,
    uri: `spotify:track:${id}`,
    duration_ms: 200000,
    artists: [{ name: "Artist A" }],
    album: { name: "Album", images: [{ url: "https://example.com/art.jpg" }] },
  };
}

function mockToken() {
  localStorage.setItem("rs_spotify_access_v1", "mock-token");
  localStorage.setItem("rs_spotify_refresh_v1", "mock-refresh");
  localStorage.setItem("rs_spotify_expires_v1", String(Date.now() + 3600 * 1000));
}

describe("searchTracks", () => {
  beforeEach(() => mockToken());

  it("maps Spotify API response to Track[]", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        tracks: { items: [makeSpotifyTrackItem("abc"), makeSpotifyTrackItem("def")] },
      }),
    } as unknown as Response);

    const tracks = await searchTracks("foo fighters");

    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({
      id: "abc",
      title: "Track abc",
      artist: "Artist A",
      durationSeconds: 200,
      provider: "spotify",
      source: "spotify",
      providerTrackId: "abc",
      spotifyUri: "spotify:track:abc",
      artworkUrl: "https://example.com/art.jpg",
    });
  });

  it("sends the query as the q parameter", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ tracks: { items: [] } }),
    } as unknown as Response);

    await searchTracks("muse hysteria");

    const url = (vi.mocked(fetch).mock.calls[0][0] as string);
    expect(url).toContain("q=muse+hysteria");
    expect(url).toContain("limit=10");
    expect(url).toContain("type=track");
  });

  it("throws when the API response is not ok", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 401,
      json: () => Promise.resolve({}),
    } as unknown as Response);

    await expect(searchTracks("test")).rejects.toThrow("Spotify search failed.");
  });
});

// ---------------------------------------------------------------------------
// createSpotifyPlaylist — fetch mock
// ---------------------------------------------------------------------------

describe("createSpotifyPlaylist", () => {
  beforeEach(() => mockToken());

  it("returns id and url from the API response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        id: "pl123",
        external_urls: { spotify: "https://open.spotify.com/playlist/pl123" },
      }),
    } as unknown as Response);

    const result = await createSpotifyPlaylist("My Playlist", false);
    expect(result).toEqual({ id: "pl123", url: "https://open.spotify.com/playlist/pl123" });
  });

  it("calls POST /me/playlists", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ id: "x", external_urls: { spotify: "https://open.spotify.com/playlist/x" } }),
    } as unknown as Response);

    await createSpotifyPlaylist("Test", true);

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/me\/playlists$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ name: "Test", public: true });
  });

  it("throws SpotifyForbiddenError on 403", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 403,
      json: () => Promise.resolve({ error: { status: 403, message: "Forbidden" } }),
    } as unknown as Response);

    await expect(createSpotifyPlaylist("X", false)).rejects.toBeInstanceOf(SpotifyForbiddenError);
  });

  it("throws generic error on other non-ok status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 500,
      json: () => Promise.resolve({}),
    } as unknown as Response);

    await expect(createSpotifyPlaylist("X", false)).rejects.toThrow("Could not create the Spotify playlist.");
  });
});

// ---------------------------------------------------------------------------
// addTracksToSpotifyPlaylist — fetch mock
// ---------------------------------------------------------------------------

describe("addTracksToSpotifyPlaylist", () => {
  beforeEach(() => mockToken());

  it("sends URIs as a comma-separated query parameter", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ snapshot_id: "snap1" }),
    } as unknown as Response);

    await addTracksToSpotifyPlaylist("pl123", [
      "spotify:track:aaa",
      "spotify:track:bbb",
    ]);

    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(url).toContain("/playlists/pl123/items");
    expect(url).toContain(encodeURIComponent("spotify:track:aaa"));
    expect(url).toContain(encodeURIComponent("spotify:track:bbb"));
  });

  it("uses POST method with no body", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ snapshot_id: "snap1" }),
    } as unknown as Response);

    await addTracksToSpotifyPlaylist("pl123", ["spotify:track:aaa"]);

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });

  it("caps at 100 URIs per request", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ snapshot_id: "snap" }),
    } as unknown as Response);

    const uris = Array.from({ length: 150 }, (_, i) => `spotify:track:${i}`);
    await addTracksToSpotifyPlaylist("pl123", uris);

    const url = vi.mocked(fetch).mock.calls[0][0] as string;
    const uriParam = new URL(url).searchParams.get("uris") ?? "";
    expect(uriParam.split(",")).toHaveLength(100);
  });

  it("throws SpotifyForbiddenError on 403", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 403,
      json: () => Promise.resolve({ error: { status: 403, message: "Forbidden" } }),
    } as unknown as Response);

    await expect(addTracksToSpotifyPlaylist("pl123", ["spotify:track:x"]))
      .rejects.toBeInstanceOf(SpotifyForbiddenError);
  });

  it("SpotifyForbiddenError carries the API message as reason", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 403,
      json: () => Promise.resolve({ error: { status: 403, message: "User not registered in the Developer Dashboard" } }),
    } as unknown as Response);

    const err = await addTracksToSpotifyPlaylist("pl123", ["spotify:track:x"]).catch((e) => e);
    expect(err).toBeInstanceOf(SpotifyForbiddenError);
    expect((err as SpotifyForbiddenError).reason).toBe("User not registered in the Developer Dashboard");
  });

  it("throws generic error on 500", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 500,
      json: () => Promise.resolve({}),
    } as unknown as Response);

    await expect(addTracksToSpotifyPlaylist("pl123", ["spotify:track:x"]))
      .rejects.toThrow("Could not add tracks to the Spotify playlist.");
  });
});
