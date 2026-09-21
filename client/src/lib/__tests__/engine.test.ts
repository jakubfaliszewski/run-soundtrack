import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseGpxClientSide,
  getPaceAtDistance,
  buildTimedRoute,
  getDistanceAtTime,
  getCoordinateAtDistance,
  buildSoundtrack,
  buildRunPlan,
  generateDemoRoute,
} from "../engine";
import type { Route, RunPlan } from "../../types/domain";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function make10kmRoute(): Route {
  const points = [];
  const n = 11;
  for (let i = 0; i < n; i++) {
    points.push({ lat: 52 + i * 0.01, lng: 13.4, distanceMeters: i * 1000 });
  }
  return { points, totalDistanceMeters: 10000 };
}

// ---------------------------------------------------------------------------
// GPX Parsing (client-side DOMParser)
// ---------------------------------------------------------------------------

const SIMPLE_GPX = `<?xml version="1.0"?>
<gpx version="1.1">
  <trk>
    <trkseg>
      <trkpt lat="52.5" lon="13.4"><ele>35</ele></trkpt>
      <trkpt lat="52.51" lon="13.4"><ele>36</ele></trkpt>
      <trkpt lat="52.52" lon="13.4"><ele>37</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;

describe("parseGpxClientSide", () => {
  it("parses a simple GPX", () => {
    const route = parseGpxClientSide(SIMPLE_GPX);
    expect(route.points).toHaveLength(3);
    expect(route.points[0].distanceMeters).toBe(0);
    expect(route.totalDistanceMeters).toBeGreaterThan(0);
  });

  it("calculates correct approximate distance (0.02° lat ≈ 2.2 km)", () => {
    const route = parseGpxClientSide(SIMPLE_GPX);
    expect(route.totalDistanceMeters).toBeGreaterThan(2000);
    expect(route.totalDistanceMeters).toBeLessThan(2500);
  });

  it("throws on too few track points", () => {
    const gpx = `<gpx><trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk></gpx>`;
    expect(() => parseGpxClientSide(gpx)).toThrow();
  });

  it("throws on invalid XML", () => {
    // jsdom DOMParser returns a parsererror document for invalid XML
    expect(() => parseGpxClientSide("<<<not xml>>>")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Pace calculation
// ---------------------------------------------------------------------------

describe("getPaceAtDistance", () => {
  it("even pace returns start pace regardless of position", () => {
    const plan: RunPlan = {
      targetTimeSeconds: 3000,
      strategy: "even",
      startPaceSecondsPerKm: 320,
      endPaceSecondsPerKm: 320,
    };
    expect(getPaceAtDistance(0, 10000, plan)).toBe(320);
    expect(getPaceAtDistance(5000, 10000, plan)).toBe(320);
    expect(getPaceAtDistance(10000, 10000, plan)).toBe(320);
  });

  it("negative split — pace interpolates from start to end", () => {
    const plan: RunPlan = {
      targetTimeSeconds: 3000,
      strategy: "negative_split",
      startPaceSecondsPerKm: 340,
      endPaceSecondsPerKm: 300,
    };
    expect(getPaceAtDistance(0, 10000, plan)).toBeCloseTo(340, 0);
    expect(getPaceAtDistance(5000, 10000, plan)).toBeCloseTo(320, 0);
    expect(getPaceAtDistance(10000, 10000, plan)).toBeCloseTo(300, 0);
  });

  it("positive split — pace slows over distance", () => {
    const plan: RunPlan = {
      targetTimeSeconds: 3000,
      strategy: "positive_split",
      startPaceSecondsPerKm: 300,
      endPaceSecondsPerKm: 340,
    };
    expect(getPaceAtDistance(0, 10000, plan)).toBeLessThan(getPaceAtDistance(10000, 10000, plan));
  });
});

// ---------------------------------------------------------------------------
// Timed route
// ---------------------------------------------------------------------------

describe("buildTimedRoute", () => {
  it("10 km at 5:00/km → total ~3000 sec", () => {
    const route = make10kmRoute();
    const plan = buildRunPlan(10000, 3000, "even");
    const timed = buildTimedRoute(route, plan);
    expect(timed.totalTimeSeconds).toBeCloseTo(3000, 0);
  });

  it("first point has elapsed = 0", () => {
    const route = make10kmRoute();
    const plan = buildRunPlan(10000, 3000, "even");
    const timed = buildTimedRoute(route, plan);
    expect(timed.points[0].elapsedSeconds).toBe(0);
  });

  it("last point elapsed equals total time", () => {
    const route = make10kmRoute();
    const plan = buildRunPlan(10000, 3000, "even");
    const timed = buildTimedRoute(route, plan);
    const last = timed.points[timed.points.length - 1];
    expect(last.elapsedSeconds).toBeCloseTo(timed.totalTimeSeconds, 3);
  });

  it("negative split total time equals target", () => {
    const route = make10kmRoute();
    const plan = buildRunPlan(10000, 3000, "negative_split", 0.1);
    const timed = buildTimedRoute(route, plan);
    expect(timed.totalTimeSeconds).toBeCloseTo(3000, 0);
  });

  it("positive split total time equals target", () => {
    const route = make10kmRoute();
    const plan = buildRunPlan(10000, 3000, "positive_split", 0.15);
    const timed = buildTimedRoute(route, plan);
    expect(timed.totalTimeSeconds).toBeCloseTo(3000, 0);
  });
});

// ---------------------------------------------------------------------------
// getDistanceAtTime
// ---------------------------------------------------------------------------

describe("getDistanceAtTime", () => {
  function buildTimed() {
    const route = make10kmRoute();
    const plan = buildRunPlan(10000, 3000, "even");
    return { route, timed: buildTimedRoute(route, plan) };
  }

  it("0 sec → 0 m", () => {
    const { timed } = buildTimed();
    expect(getDistanceAtTime(timed, 0)).toBe(0);
  });

  it("target time → total distance", () => {
    const { timed } = buildTimed();
    expect(getDistanceAtTime(timed, timed.totalTimeSeconds)).toBeCloseTo(10000, 0);
  });

  it("halfway time → halfway distance (even pace)", () => {
    const { timed } = buildTimed();
    expect(getDistanceAtTime(timed, 1500)).toBeCloseTo(5000, 0);
  });

  it("300 sec → ~1000 m at 5:00/km", () => {
    const { timed } = buildTimed();
    expect(getDistanceAtTime(timed, 300)).toBeCloseTo(1000, 0);
  });

  it("beyond run time clamps to total distance", () => {
    const { timed } = buildTimed();
    expect(getDistanceAtTime(timed, 9999)).toBeCloseTo(10000, 0);
  });
});

// ---------------------------------------------------------------------------
// getCoordinateAtDistance
// ---------------------------------------------------------------------------

describe("getCoordinateAtDistance", () => {
  it("returns first point at 0", () => {
    const route = make10kmRoute();
    const coord = getCoordinateAtDistance(route, 0);
    expect(coord.lat).toBeCloseTo(52.0, 2);
  });

  it("returns last point at total distance", () => {
    const route = make10kmRoute();
    const coord = getCoordinateAtDistance(route, 10000);
    expect(coord.lat).toBeCloseTo(52.1, 2);
  });

  it("interpolates midpoint coordinate", () => {
    const route = make10kmRoute();
    const coord = getCoordinateAtDistance(route, 5000);
    expect(coord.lat).toBeCloseTo(52.05, 2);
  });
});

// ---------------------------------------------------------------------------
// buildSoundtrack
// ---------------------------------------------------------------------------

describe("buildSoundtrack", () => {
  function build30MinRun() {
    const route = make10kmRoute();
    const plan = buildRunPlan(10000, 1800, "even");
    const timed = buildTimedRoute(route, plan);
    return { route, timed };
  }

  it("first segment starts at time 0", () => {
    const { route, timed } = build30MinRun();
    const tracks = [
      { id: "a", title: "A", artist: "", durationSeconds: 300 },
      { id: "b", title: "B", artist: "", durationSeconds: 240 },
    ];
    const st = buildSoundtrack(route, timed, tracks);
    expect(st.segments[0].startTimeSeconds).toBe(0);
  });

  it("segment times are contiguous", () => {
    const { route, timed } = build30MinRun();
    const tracks = [
      { id: "a", title: "A", artist: "", durationSeconds: 300 },
      { id: "b", title: "B", artist: "", durationSeconds: 240 },
      { id: "c", title: "C", artist: "", durationSeconds: 360 },
    ];
    const st = buildSoundtrack(route, timed, tracks);
    expect(st.segments[1].startTimeSeconds).toBe(300);
    expect(st.segments[2].startTimeSeconds).toBe(540);
  });

  it("playlist longer than run: last segment capped at run end", () => {
    const { route, timed } = build30MinRun(); // 1800 sec
    const tracks = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      title: `Track ${i}`,
      artist: "",
      durationSeconds: 300, // 20 × 5 min = 100 min total
    }));
    const st = buildSoundtrack(route, timed, tracks);
    const last = st.segments[st.segments.length - 1];
    expect(last.endTimeSeconds).toBeCloseTo(1800, 0);
  });

  it("playlist shorter than run: coverage < 1", () => {
    const { route, timed } = build30MinRun(); // 1800 sec
    const tracks = [{ id: "a", title: "A", artist: "", durationSeconds: 300 }];
    const st = buildSoundtrack(route, timed, tracks);
    expect(st.playlistCoverage).toBeLessThan(1);
    expect(st.segments).toHaveLength(1);
  });

  it("playlistCoverage = 1 when playlist equals run duration exactly", () => {
    const { route, timed } = build30MinRun(); // 1800 sec
    const tracks = [{ id: "a", title: "A", artist: "", durationSeconds: 1800 }];
    const st = buildSoundtrack(route, timed, tracks);
    expect(st.playlistCoverage).toBeCloseTo(1, 5);
  });

  it("each segment has valid GPS coordinates", () => {
    const { route, timed } = build30MinRun();
    const tracks = [
      { id: "a", title: "A", artist: "", durationSeconds: 600 },
      { id: "b", title: "B", artist: "", durationSeconds: 600 },
    ];
    const st = buildSoundtrack(route, timed, tracks);
    for (const seg of st.segments) {
      expect(typeof seg.startCoordinate.lat).toBe("number");
      expect(typeof seg.startCoordinate.lng).toBe("number");
      expect(isNaN(seg.startCoordinate.lat)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// buildRunPlan
// ---------------------------------------------------------------------------

describe("buildRunPlan", () => {
  it("even: start === end pace", () => {
    const plan = buildRunPlan(10000, 3000, "even");
    expect(plan.startPaceSecondsPerKm).toBe(plan.endPaceSecondsPerKm);
  });

  it("even: pace = targetTime / distanceKm", () => {
    const plan = buildRunPlan(10000, 3000, "even");
    expect(plan.startPaceSecondsPerKm).toBeCloseTo(300, 0); // 5:00/km
  });

  it("negative split: start > end", () => {
    const plan = buildRunPlan(10000, 3000, "negative_split");
    expect(plan.startPaceSecondsPerKm).toBeGreaterThan(plan.endPaceSecondsPerKm);
  });

  it("positive split: end > start", () => {
    const plan = buildRunPlan(10000, 3000, "positive_split");
    expect(plan.endPaceSecondsPerKm).toBeGreaterThan(plan.startPaceSecondsPerKm);
  });

  it("negative split with 10% produces correct total time via buildTimedRoute", () => {
    const route = make10kmRoute();
    const plan = buildRunPlan(10000, 3000, "negative_split", 0.1);
    const timed = buildTimedRoute(route, plan);
    expect(timed.totalTimeSeconds).toBeCloseTo(3000, 0);
  });
});

// ---------------------------------------------------------------------------
// generateDemoRoute
// ---------------------------------------------------------------------------

// The function fetches /demo-route.gpx at runtime. In tests we mock fetch so
// we don't need a dev server running.
const MOCK_GPX = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="50.0693" lon="19.9868"><ele>200</ele></trkpt>
    <trkpt lat="50.0700" lon="19.9880"><ele>201</ele></trkpt>
    <trkpt lat="50.0710" lon="19.9895"><ele>202</ele></trkpt>
  </trkseg></trk>
</gpx>`;

describe("generateDemoRoute", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(MOCK_GPX),
    } as unknown as Response);
  });

  it("returns a route with >= 2 points", async () => {
    const { route } = await generateDemoRoute();
    expect(route.points.length).toBeGreaterThanOrEqual(2);
  });

  it("first point distance is 0", async () => {
    const { route } = await generateDemoRoute();
    expect(route.points[0].distanceMeters).toBe(0);
  });

  it("returns the correct route name", async () => {
    const { name } = await generateDemoRoute();
    expect(name).toBe("PKO Cracovia Royal Half Marathon 2025");
  });

  it("throws when fetch fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);
    await expect(generateDemoRoute()).rejects.toThrow();
  });
});
