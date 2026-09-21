import { describe, it, expect } from "vitest";
import { haversineMeters } from "../distance.js";
import { parseGpx } from "../gpxParser.js";
import {
  getPaceAtDistance,
  buildTimedRoute,
  getDistanceAtTime,
  buildSoundtrack,
  buildRunPlan,
  getCoordinateAtDistance,
} from "../soundtrackEngine.js";
import type { Route, RunPlan } from "../../types/domain.js";
import { demoPlaylist } from "../../data/demoPlaylist.js";

// ---------------------------------------------------------------------------
// Haversine
// ---------------------------------------------------------------------------

describe("haversineMeters", () => {
  it("returns 0 for same point", () => {
    expect(haversineMeters(52.5, 13.4, 52.5, 13.4)).toBe(0);
  });

  it("returns ~111 km per degree of latitude", () => {
    const dist = haversineMeters(0, 0, 1, 0);
    expect(dist).toBeGreaterThan(110_000);
    expect(dist).toBeLessThan(112_000);
  });
});

// ---------------------------------------------------------------------------
// GPX Parsing
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

describe("parseGpx", () => {
  it("parses a simple GPX", () => {
    const route = parseGpx(SIMPLE_GPX);
    expect(route.points).toHaveLength(3);
    expect(route.points[0].distanceMeters).toBe(0);
    expect(route.totalDistanceMeters).toBeGreaterThan(0);
  });

  it("calculates correct approximate distance", () => {
    const route = parseGpx(SIMPLE_GPX);
    // 0.02 degrees latitude ≈ 2.2 km
    expect(route.totalDistanceMeters).toBeGreaterThan(2000);
    expect(route.totalDistanceMeters).toBeLessThan(2500);
  });

  it("throws on missing trk element", () => {
    expect(() => parseGpx("<gpx></gpx>")).toThrow();
  });

  it("throws on too few points", () => {
    const gpx = `<gpx><trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk></gpx>`;
    expect(() => parseGpx(gpx)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Pace calculation
// ---------------------------------------------------------------------------

describe("getPaceAtDistance", () => {
  it("even pace returns start pace", () => {
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

  it("negative split increases pace over distance", () => {
    const plan: RunPlan = {
      targetTimeSeconds: 3000,
      strategy: "negative_split",
      startPaceSecondsPerKm: 340,
      endPaceSecondsPerKm: 300,
    };
    const start = getPaceAtDistance(0, 10000, plan);
    const mid = getPaceAtDistance(5000, 10000, plan);
    const end = getPaceAtDistance(10000, 10000, plan);
    expect(start).toBeCloseTo(340, 0);
    expect(mid).toBeCloseTo(320, 0);
    expect(end).toBeCloseTo(300, 0);
  });

  it("positive split slows over distance", () => {
    const plan: RunPlan = {
      targetTimeSeconds: 3000,
      strategy: "positive_split",
      startPaceSecondsPerKm: 300,
      endPaceSecondsPerKm: 340,
    };
    const start = getPaceAtDistance(0, 10000, plan);
    const end = getPaceAtDistance(10000, 10000, plan);
    expect(start).toBeLessThan(end);
  });
});

// ---------------------------------------------------------------------------
// Timed route
// ---------------------------------------------------------------------------

function make10kmRoute(): Route {
  const points = [];
  const n = 11;
  for (let i = 0; i < n; i++) {
    points.push({ lat: 52 + i * 0.01, lng: 13.4, distanceMeters: i * 1000 });
  }
  return { points, totalDistanceMeters: 10000 };
}

describe("buildTimedRoute", () => {
  it("10km at 5:00/km → total ~3000 sec", () => {
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

  it("negative split total time equals target", () => {
    const route = make10kmRoute();
    const plan = buildRunPlan(10000, 3000, "negative_split", 0.1);
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

  it("interpolates midpoint", () => {
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

  it("first segment starts at 0", () => {
    const { route, timed } = build30MinRun();
    const tracks = [
      { id: "a", title: "A", artist: "", durationSeconds: 300 },
      { id: "b", title: "B", artist: "", durationSeconds: 240 },
      { id: "c", title: "C", artist: "", durationSeconds: 360 },
    ];
    const st = buildSoundtrack({ route, timedRoute: timed, tracks });
    expect(st.segments[0].startTimeSeconds).toBe(0);
  });

  it("segment times are contiguous", () => {
    const { route, timed } = build30MinRun();
    const tracks = [
      { id: "a", title: "A", artist: "", durationSeconds: 300 },
      { id: "b", title: "B", artist: "", durationSeconds: 240 },
      { id: "c", title: "C", artist: "", durationSeconds: 360 },
    ];
    const st = buildSoundtrack({ route, timedRoute: timed, tracks });
    expect(st.segments[1].startTimeSeconds).toBe(300);
    expect(st.segments[2].startTimeSeconds).toBe(540);
  });

  it("playlist longer than run: last segment capped at run end", () => {
    const { route, timed } = build30MinRun(); // 1800 sec
    const tracks = demoPlaylist; // ~90 min
    const st = buildSoundtrack({ route, timedRoute: timed, tracks });
    const last = st.segments[st.segments.length - 1];
    expect(last.endTimeSeconds).toBeCloseTo(1800, 0);
  });

  it("playlist shorter than run: coverage < 1", () => {
    const { route, timed } = build30MinRun(); // 1800 sec
    const tracks = [{ id: "a", title: "A", artist: "", durationSeconds: 300 }];
    const st = buildSoundtrack({ route, timedRoute: timed, tracks });
    expect(st.playlistCoverage).toBeLessThan(1);
    expect(st.segments).toHaveLength(1);
  });

  it("playlistCoverage = 1 when playlist equals run duration", () => {
    const { route, timed } = build30MinRun(); // 1800 sec
    const tracks = [{ id: "a", title: "A", artist: "", durationSeconds: 1800 }];
    const st = buildSoundtrack({ route, timedRoute: timed, tracks });
    expect(st.playlistCoverage).toBeCloseTo(1, 5);
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

  it("negative split: start > end", () => {
    const plan = buildRunPlan(10000, 3000, "negative_split");
    expect(plan.startPaceSecondsPerKm).toBeGreaterThan(plan.endPaceSecondsPerKm);
  });

  it("positive split: end > start", () => {
    const plan = buildRunPlan(10000, 3000, "positive_split");
    expect(plan.endPaceSecondsPerKm).toBeGreaterThan(plan.startPaceSecondsPerKm);
  });
});
