import { XMLParser } from "fast-xml-parser";
import { Route, RoutePoint } from "../types/domain.js";
import { haversineMeters } from "./distance.js";

interface GpxTrkpt {
  "@_lat": string | number;
  "@_lon": string | number;
  ele?: number;
}

interface GpxTrkseg {
  trkpt: GpxTrkpt | GpxTrkpt[];
}

interface GpxTrk {
  trkseg: GpxTrkseg | GpxTrkseg[];
}

interface GpxRoot {
  gpx?: {
    trk?: GpxTrk | GpxTrk[];
  };
}

export function parseGpx(xmlText: string): Route {
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xmlText) as GpxRoot;

  const gpx = parsed.gpx;
  if (!gpx) throw new Error("Not a valid GPX file.");

  const trkRaw = gpx.trk;
  if (!trkRaw) throw new Error("This GPX file does not contain a track.");

  const tracks: GpxTrk[] = Array.isArray(trkRaw) ? trkRaw : [trkRaw];

  const rawPoints: GpxTrkpt[] = [];

  for (const trk of tracks) {
    const segsRaw = trk.trkseg;
    const segs: GpxTrkseg[] = Array.isArray(segsRaw) ? segsRaw : [segsRaw];
    for (const seg of segs) {
      const trkpts = seg.trkpt;
      if (!trkpts) continue;
      const pts: GpxTrkpt[] = Array.isArray(trkpts) ? trkpts : [trkpts];
      rawPoints.push(...pts);
    }
  }

  if (rawPoints.length < 2) {
    throw new Error("This GPX file does not contain enough track points (need at least 2).");
  }

  const points: RoutePoint[] = [];
  let cumulativeDistance = 0;
  let elevationGain = 0;

  for (let i = 0; i < rawPoints.length; i++) {
    const pt = rawPoints[i];
    const lat = typeof pt["@_lat"] === "string" ? parseFloat(pt["@_lat"]) : pt["@_lat"];
    const lng = typeof pt["@_lon"] === "string" ? parseFloat(pt["@_lon"]) : pt["@_lon"];

    if (isNaN(lat) || isNaN(lng)) {
      throw new Error(`Invalid coordinates in GPX at point ${i}.`);
    }

    if (i > 0) {
      const prev = points[i - 1];
      cumulativeDistance += haversineMeters(prev.lat, prev.lng, lat, lng);

      const prevEle = rawPoints[i - 1].ele;
      const curEle = pt.ele;
      if (prevEle !== undefined && curEle !== undefined) {
        const diff = curEle - prevEle;
        if (diff > 0) elevationGain += diff;
      }
    }

    points.push({
      lat,
      lng,
      elevation: pt.ele,
      distanceMeters: cumulativeDistance,
    });
  }

  if (cumulativeDistance === 0) {
    throw new Error("This GPX file has zero-length route.");
  }

  return {
    points,
    totalDistanceMeters: cumulativeDistance,
    elevationGainMeters: elevationGain,
  };
}
