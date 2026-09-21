import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import type { Route, Soundtrack, SoundtrackSegment } from "../types/domain";
import { getRouteSegmentPoints } from "../lib/engine";
import { trackColor, formatDistance, formatTime } from "../lib/format";
import "leaflet/dist/leaflet.css";

interface MapViewProps {
  route: Route;
  soundtrack: Soundtrack | null;
  selectedTrackId: string | null;
  hoveredTrackId: string | null;
  onSelectTrack: (id: string) => void;
  onHoverTrack: (id: string | null) => void;
}

function FitBounds({ positions }: { positions: LatLngExpression[] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 1) {
      map.fitBounds(positions as [number, number][], { padding: [32, 32] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function FitSegment({ segment }: { segment: SoundtrackSegment | null }) {
  const map = useMap();
  const prevId = useRef<string | null>(null);
  useEffect(() => {
    if (!segment || segment.track.id === prevId.current) return;
    prevId.current = segment.track.id;
    map.fitBounds(
      [
        [segment.startCoordinate.lat, segment.startCoordinate.lng],
        [segment.endCoordinate.lat, segment.endCoordinate.lng],
      ],
      { padding: [60, 60] }
    );
  }, [map, segment]);
  return null;
}

export default function MapView({
  route,
  soundtrack,
  selectedTrackId,
  hoveredTrackId,
  onSelectTrack,
  onHoverTrack,
}: MapViewProps) {
  const positions: LatLngExpression[] = route.points.map((p) => [p.lat, p.lng]);
  const selectedSegment = soundtrack?.segments.find((s) => s.track.id === selectedTrackId) ?? null;
  const mapKey = route.totalDistanceMeters.toFixed(1);

  // Active = selected OR hovered. Dimmed = something else is active.
  const activeId = selectedTrackId ?? hoveredTrackId;

  return (
    <MapContainer
      key={mapKey}
      center={[route.points[0].lat, route.points[0].lng]}
      zoom={13}
      className="map-container"
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds positions={positions} />
      {selectedSegment && <FitSegment segment={selectedSegment} />}

      {soundtrack && soundtrack.segments.length > 0 ? (
        <>
          {/* Song polylines */}
          {soundtrack.segments.map((seg, idx) => {
            const segPoints = getRouteSegmentPoints(
              route,
              seg.startDistanceMeters,
              seg.endDistanceMeters
            ).map((p): LatLngExpression => [p.lat, p.lng]);

            const isActive = seg.track.id === activeId;
            const isDimmed = activeId !== null && !isActive;
            const color = trackColor(idx);

            return (
              <Polyline
                key={seg.track.id}
                positions={segPoints}
                pathOptions={{
                  color,
                  weight: isActive ? 7 : 4,
                  opacity: isDimmed ? 0.2 : 0.85,
                }}
                eventHandlers={{
                  click: () => onSelectTrack(seg.track.id),
                  mouseover: (e) => {
                    onHoverTrack(seg.track.id);
                    e.target.setStyle({ weight: 7 });
                  },
                  mouseout: (e) => {
                    onHoverTrack(null);
                    e.target.setStyle({ weight: isActive ? 7 : 4 });
                  },
                }}
              >
                <Tooltip sticky direction="top" offset={[0, -4]} opacity={0.95}>
                  <div className="map-tooltip">
                    <div className="map-tooltip__title">{seg.track.title}</div>
                    <div className="map-tooltip__artist">{seg.track.artist}</div>
                    <div className="map-tooltip__meta">
                      {formatDistance(seg.startDistanceMeters)} — {formatDistance(seg.endDistanceMeters)}
                      &nbsp;·&nbsp;{formatTime(seg.startTimeSeconds)}
                    </div>
                  </div>
                </Tooltip>
              </Polyline>
            );
          })}

          {/* Transition markers at each song boundary */}
          {soundtrack.segments.map((seg, idx) => {
            // Don't render a start marker for the very first segment (it's the run start)
            if (idx === 0) return null;
            const color = trackColor(idx);
            return (
              <CircleMarker
                key={`marker-${seg.track.id}`}
                center={[seg.startCoordinate.lat, seg.startCoordinate.lng]}
                radius={5}
                pathOptions={{
                  color: "#0f1117",
                  fillColor: color,
                  fillOpacity: activeId && activeId !== seg.track.id && activeId !== soundtrack.segments[idx - 1]?.track.id ? 0.2 : 1,
                  weight: 1.5,
                }}
                eventHandlers={{
                  click: () => onSelectTrack(seg.track.id),
                }}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                  <div className="map-tooltip">
                    <div className="map-tooltip__title">{seg.track.title}</div>
                    <div className="map-tooltip__artist">{seg.track.artist}</div>
                    <div className="map-tooltip__meta">{formatDistance(seg.startDistanceMeters)}</div>
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}

          {/* Start marker */}
          {soundtrack.segments.length > 0 && (() => {
            const first = soundtrack.segments[0];
            return (
              <CircleMarker
                center={[first.startCoordinate.lat, first.startCoordinate.lng]}
                radius={6}
                pathOptions={{ color: "#0f1117", fillColor: "#22c55e", fillOpacity: 1, weight: 2 }}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                  <div className="map-tooltip"><div className="map-tooltip__title">Start</div></div>
                </Tooltip>
              </CircleMarker>
            );
          })()}

          {/* Finish marker */}
          {soundtrack.segments.length > 0 && (() => {
            const last = soundtrack.segments[soundtrack.segments.length - 1];
            return (
              <CircleMarker
                center={[last.endCoordinate.lat, last.endCoordinate.lng]}
                radius={6}
                pathOptions={{ color: "#0f1117", fillColor: "#ef4444", fillOpacity: 1, weight: 2 }}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                  <div className="map-tooltip"><div className="map-tooltip__title">Finish</div></div>
                </Tooltip>
              </CircleMarker>
            );
          })()}
        </>
      ) : (
        <Polyline
          positions={positions}
          pathOptions={{ color: "#3b82f6", weight: 4, opacity: 0.8 }}
        />
      )}
    </MapContainer>
  );
}
