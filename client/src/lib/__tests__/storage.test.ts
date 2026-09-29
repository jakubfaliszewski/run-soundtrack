import { describe, it, expect, beforeEach } from "vitest";
import {
  saveRoute, loadRoute, clearRoute,
  saveRunPlan, loadRunPlan,
  savePlaylist, loadPlaylist,
  saveDraftPlaylist, loadDraftPlaylist, clearDraftPlaylist,
  saveSpotifyTokens, loadSpotifyTokens, clearSpotifyTokens,
} from "../storage";
import type { Route, RunPlan, Track, DraftPlaylist } from "../../types/domain";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRoute(): Route {
  return {
    points: [
      { lat: 52.0, lng: 13.4, distanceMeters: 0 },
      { lat: 52.1, lng: 13.4, distanceMeters: 10000 },
    ],
    totalDistanceMeters: 10000,
  };
}

function makePlan(): RunPlan {
  return { targetTimeSeconds: 3000, strategy: "even", startPaceSecondsPerKm: 300, endPaceSecondsPerKm: 300 };
}

function makeTrack(id = "t1"): Track {
  return { id, title: "Track", artist: "Artist", durationSeconds: 180, spotifyUri: `spotify:track:${id}` };
}

function makeDraft(overrides?: Partial<DraftPlaylist>): DraftPlaylist {
  return { id: "draft-1", name: "My Run Playlist", tracks: [makeTrack()], ...overrides };
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

describe("route persistence", () => {
  beforeEach(() => clearRoute());

  it("returns null when nothing saved", () => {
    expect(loadRoute()).toBeNull();
  });

  it("round-trips route and name", () => {
    const route = makeRoute();
    saveRoute(route, "Cracovia HM");
    const loaded = loadRoute();
    expect(loaded?.name).toBe("Cracovia HM");
    expect(loaded?.route.totalDistanceMeters).toBe(10000);
    expect(loaded?.route.points).toHaveLength(2);
  });

  it("clearRoute removes stored data", () => {
    saveRoute(makeRoute(), "Test");
    clearRoute();
    expect(loadRoute()).toBeNull();
  });

  it("returns null for a route with fewer than 2 points", () => {
    const bad: Route = { points: [{ lat: 1, lng: 1, distanceMeters: 0 }], totalDistanceMeters: 0 };
    saveRoute(bad, "bad");
    expect(loadRoute()).toBeNull();
  });

  it("defaults name to 'My Route' when name key missing", () => {
    saveRoute(makeRoute(), "Test");
    localStorage.removeItem("rs_route_name_v1");
    expect(loadRoute()?.name).toBe("My Route");
  });
});

// ---------------------------------------------------------------------------
// RunPlan
// ---------------------------------------------------------------------------

describe("run plan persistence", () => {
  it("returns null when nothing saved", () => {
    localStorage.removeItem("rs_run_plan_v1");
    expect(loadRunPlan()).toBeNull();
  });

  it("round-trips run plan", () => {
    const plan = makePlan();
    saveRunPlan(plan);
    expect(loadRunPlan()).toEqual(plan);
  });
});

// ---------------------------------------------------------------------------
// Playlist
// ---------------------------------------------------------------------------

describe("playlist persistence", () => {
  beforeEach(() => {
    localStorage.removeItem("rs_playlist_v1");
    localStorage.removeItem("rs_playlist_name_v1");
  });

  it("returns null when nothing saved", () => {
    expect(loadPlaylist()).toBeNull();
  });

  it("round-trips tracks and name", () => {
    const tracks = [makeTrack("a"), makeTrack("b")];
    savePlaylist(tracks, "My Playlist");
    const loaded = loadPlaylist();
    expect(loaded?.name).toBe("My Playlist");
    expect(loaded?.tracks).toHaveLength(2);
    expect(loaded?.tracks[0].id).toBe("a");
  });

  it("returns null for empty track array", () => {
    savePlaylist([], "Empty");
    expect(loadPlaylist()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Draft playlist
// ---------------------------------------------------------------------------

describe("draft playlist persistence", () => {
  beforeEach(() => clearDraftPlaylist());

  it("returns null when nothing saved", () => {
    expect(loadDraftPlaylist()).toBeNull();
  });

  it("round-trips draft", () => {
    const draft = makeDraft();
    saveDraftPlaylist(draft);
    const loaded = loadDraftPlaylist();
    expect(loaded?.id).toBe("draft-1");
    expect(loaded?.name).toBe("My Run Playlist");
    expect(loaded?.tracks).toHaveLength(1);
    expect(loaded?.tracks[0].spotifyUri).toBe("spotify:track:t1");
  });

  it("overwrites previous draft on save", () => {
    saveDraftPlaylist(makeDraft({ name: "First" }));
    saveDraftPlaylist(makeDraft({ name: "Second" }));
    expect(loadDraftPlaylist()?.name).toBe("Second");
  });

  it("clearDraftPlaylist removes the draft", () => {
    saveDraftPlaylist(makeDraft());
    clearDraftPlaylist();
    expect(loadDraftPlaylist()).toBeNull();
  });

  it("preserves all track fields including spotifyUri and providerTrackId", () => {
    const track: Track = {
      id: "abc",
      title: "Song",
      artist: "Band",
      durationSeconds: 240,
      provider: "spotify",
      providerTrackId: "abc",
      spotifyUri: "spotify:track:abc",
      artworkUrl: "https://example.com/art.jpg",
    };
    saveDraftPlaylist({ id: "d", name: "N", tracks: [track] });
    const loaded = loadDraftPlaylist();
    expect(loaded?.tracks[0]).toEqual(track);
  });

  it("returns null when stored value is corrupt JSON", () => {
    localStorage.setItem("rs_draft_playlist_v1", "{bad json");
    expect(loadDraftPlaylist()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Spotify tokens
// ---------------------------------------------------------------------------

describe("spotify token persistence", () => {
  beforeEach(() => clearSpotifyTokens());

  it("returns null when nothing saved", () => {
    expect(loadSpotifyTokens()).toBeNull();
  });

  it("round-trips tokens", () => {
    saveSpotifyTokens("access123", "refresh456", 3600);
    const loaded = loadSpotifyTokens();
    expect(loaded?.accessToken).toBe("access123");
    expect(loaded?.refreshToken).toBe("refresh456");
    expect(loaded?.expiresAt).toBeGreaterThan(Date.now());
  });

  it("expiresAt is ~1 minute early (buffer subtracted)", () => {
    const before = Date.now();
    saveSpotifyTokens("a", "r", 3600);
    const loaded = loadSpotifyTokens();
    const expected = before + (3600 - 60) * 1000;
    expect(loaded!.expiresAt).toBeGreaterThanOrEqual(expected - 100);
    expect(loaded!.expiresAt).toBeLessThanOrEqual(expected + 100);
  });

  it("clearSpotifyTokens removes all keys", () => {
    saveSpotifyTokens("a", "r", 3600);
    clearSpotifyTokens();
    expect(loadSpotifyTokens()).toBeNull();
  });
});
