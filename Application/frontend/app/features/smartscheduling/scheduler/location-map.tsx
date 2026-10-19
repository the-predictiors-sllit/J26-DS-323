"use client";

import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

import type { LocationPickerProps } from "./location-picker";

import "leaflet/dist/leaflet.css";

function validCoordinates(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function MapInteractions({
  latitude,
  longitude,
  disabled = false,
  onChange,
}: LocationPickerProps) {
  const map = useMap();

  useMapEvents({
    click(event) {
      if (disabled) return;

      const point = event.latlng.wrap();

      onChange({
        latitude: Number(point.lat.toFixed(6)),
        longitude: Number(point.lng.toFixed(6)),
      });
    },
  });

  // Move the map when the manual coordinate inputs change.
  useEffect(() => {
    if (!validCoordinates(latitude, longitude)) return;

    // Avoid repeatedly moving the map while the user is typing.
    const timer = setTimeout(() => {
      const current = map.getCenter();

      if (
        Math.abs(current.lat - latitude) > 0.000001 ||
        Math.abs(current.lng - longitude) > 0.000001
      ) {
        map.setView(
          [latitude, longitude],
          map.getZoom(),
          { animate: false },
        );
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [map, latitude, longitude]);

  // Keep the map correctly sized when the sidebar/layout changes.
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ pan: false });
    });

    observer.observe(map.getContainer());

    return () => observer.disconnect();
  }, [map]);

  return null;
}

export default function LocationMap(props: LocationPickerProps) {
  const { latitude, longitude } = props;

  const valid = validCoordinates(latitude, longitude);

  const center: [number, number] = valid
    ? [latitude, longitude]
    : [7.8731, 80.7718];

  return (
    <MapContainer
      center={center}
      zoom={8}
      minZoom={3}
      maxZoom={18}
      scrollWheelZoom={false}
      worldCopyJump
      className="h-[260px] w-full"
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution={
          '&copy; <a href="https://www.openstreetmap.org/copyright">' +
          "OpenStreetMap</a> contributors"
        }
      />

      <MapInteractions {...props} />

      {valid && (
        <>
          <CircleMarker
            center={[latitude, longitude]}
            radius={18}
            interactive={false}
            pathOptions={{
              stroke: false,
              fillColor: "var(--primary)",
              fillOpacity: 0.18,
            }}
          />

          <CircleMarker
            center={[latitude, longitude]}
            radius={7}
            interactive={false}
            pathOptions={{
              color: "var(--primary)",
              fillColor: "var(--primary)",
              fillOpacity: 1,
              weight: 2,
            }}
          />
        </>
      )}
    </MapContainer>
  );
}