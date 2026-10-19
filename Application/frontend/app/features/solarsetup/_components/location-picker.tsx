"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";

type Point = {
  latitude: number;
  longitude: number;
};

type SearchPlace = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
};

type Props = {
  point: Point | null;
  onChange: (point: Point) => void;
};

export default function LocationPicker({ point, onChange }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const changeRef = useRef(onChange);
  const initialPoint = useRef(point);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const [query, setQuery] = useState("");
const [searching, setSearching] = useState(false);
const [places, setPlaces] = useState<SearchPlace[]>([]);
const [searchMessage, setSearchMessage] = useState("");

const searchRequest = useRef<AbortController | null>(null);
const locationAttempt = useRef(0);

useEffect(() => {
  return () => {
    searchRequest.current?.abort();
    locationAttempt.current += 1;
  };
}, []);

  useEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    let ownedMap: LeafletMap | undefined;

    async function start() {
      try {
        const L = await import("leaflet");

        if (cancelled || !container.current) return;

        const selected = initialPoint.current;

        // Initial view only. This does not select a location.
        const center: [number, number] = selected
          ? [selected.latitude, selected.longitude]
          : [6.235, 80.055];

        const map = L.map(container.current, {
          scrollWheelZoom: false,
        }).setView(center, selected ? 17 : 12);

        ownedMap = map;
        mapRef.current = map;

        const tiles = L.tileLayer(
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            maxZoom: 19,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
        ).addTo(map);

        tiles.on("tileerror", () => {
          if (!cancelled) {
            setError(
              "Some map tiles could not load. Check your connection, or enter coordinates manually.",
            );
          }
        });

        const icon = L.divIcon({
          className: "",
          html: `
            <div style="
              width:28px;
              height:28px;
              border-radius:50%;
              background:var(--primary, #c46a14);
              border:4px solid white;
              box-shadow:0 3px 14px rgba(0,0,0,.35);
            "></div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const marker = L.marker(center, {
          icon,
          draggable: true,
          keyboard: true,
          title: "Photo capture location",
          alt: "Selected photo capture location",
        });

        markerRef.current = marker;

        if (selected) marker.addTo(map);

        function choose(latitude: number, longitude: number) {
            locationAttempt.current += 1;
            setLocating(false);
            setError("");
            setSearchMessage("");
            setPlaces([]);
          const normalizedLongitude =
            ((((longitude + 180) % 360) + 360) % 360) - 180;

          const value = {
            latitude: Number(latitude.toFixed(7)),
            longitude: Number(normalizedLongitude.toFixed(7)),
          };

          marker
            .setLatLng([value.latitude, value.longitude])
            .addTo(map);

          changeRef.current(value);
        }

        map.on("click", (event) => {
          choose(event.latlng.lat, event.latlng.lng);
        });

        marker.on("dragend", () => {
          const location = marker.getLatLng();
          choose(location.lat, location.lng);
        });

        observer = new ResizeObserver(() => {
          map.invalidateSize({ pan: false });
        });

        observer.observe(container.current);
        setReady(true);
      } catch {
        if (!cancelled) {
          setError(
            "The map could not start. You can still enter coordinates manually.",
          );
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      observer?.disconnect();
      ownedMap?.remove();

      if (mapRef.current === ownedMap) {
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;

    if (!ready || !map || !marker) return;

    if (!point) {
      marker.remove();
      return;
    }

    marker
      .setLatLng([point.latitude, point.longitude])
      .addTo(map);

    map.setView(
      [point.latitude, point.longitude],
      Math.max(map.getZoom(), 16),
      { animate: false },
    );
  }, [ready, point?.latitude, point?.longitude]);

  async function searchLocation() {
  const term = query.trim();

  if (term.length < 2) {
    setSearchMessage("Enter a town or city name.");
    setPlaces([]);
    return;
  }

  searchRequest.current?.abort();

  const controller = new AbortController();
  searchRequest.current = controller;

  setSearching(true);
  setPlaces([]);
  setSearchMessage("");

  const timeout = window.setTimeout(() => controller.abort(), 15000);

  try {
    const parameters = new URLSearchParams({
      name: term,
      count: "5",
      language: "en",
      format: "json",
    });

    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?${parameters}`,
      { signal: controller.signal },
    );

    if (!response.ok) {
      throw new Error("Location search is temporarily unavailable.");
    }

    const data = (await response.json()) as {
      results?: SearchPlace[];
      error?: boolean;
      reason?: string;
    };

    if (data.error) {
      throw new Error(data.reason || "Location search failed.");
    }

    if (searchRequest.current !== controller) return;

    const matches = (data.results ?? []).filter(
      (place) =>
        Number.isFinite(place.latitude) &&
        Number.isFinite(place.longitude) &&
        Math.abs(place.latitude) <= 90 &&
        Math.abs(place.longitude) <= 180,
    );

    setPlaces(matches);

    if (matches.length === 0) {
      setSearchMessage(
        "No matching places found. Try a nearby town or choose directly on the map.",
      );
    }
  } catch (cause) {
    if (searchRequest.current !== controller) return;

    setSearchMessage(
      cause instanceof Error && cause.name !== "AbortError"
        ? cause.message
        : "Search timed out. Check your connection and try again.",
    );
  } finally {
    window.clearTimeout(timeout);

    if (searchRequest.current === controller) {
      setSearching(false);
      searchRequest.current = null;
    }
  }
}

function selectPlace(place: SearchPlace) {
  // Ignore an older device-location request after this selection.
  locationAttempt.current += 1;
  setLocating(false);
  setError("");
  setPlaces([]);

  setQuery(
    [place.name, place.admin1, place.country]
      .filter(Boolean)
      .join(", "),
  );

  changeRef.current({
    latitude: place.latitude,
    longitude: place.longitude,
  });

  setSearchMessage(
    "An approximate town location is selected. Move the pin to the exact photo location before continuing. Check the timezone if this is outside Sri Lanka.",
  );
}

function useDeviceLocation() {
  if (!navigator.geolocation) {
    setError(
      "This browser does not support device location. Search for your town or select a point on the map.",
    );
    return;
  }

  if (!window.isSecureContext) {
    setError(
      "Device location needs HTTPS or localhost. You can still search or select a point on the map.",
    );
    return;
  }

  const attempt = ++locationAttempt.current;

  setLocating(true);
  setError("");

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      if (attempt !== locationAttempt.current) return;

      changeRef.current({
        latitude: Number(coords.latitude.toFixed(7)),
        longitude: Number(coords.longitude.toFixed(7)),
      });

      setLocating(false);
      setError("");

      setSearchMessage(
        `Device location selected (reported accuracy about ${Math.round(
          coords.accuracy,
        )} m). Move the pin if the photo was taken elsewhere.`,
      );
    },
    (failure) => {
      if (attempt !== locationAttempt.current) return;

      setLocating(false);

      switch (failure.code) {
        case 1:
          setError(
            "Location permission was denied. Allow Location in this site's browser settings, or use the search/map instead.",
          );
          break;

        case 2:
          setError(
            "Your device could not determine its location. Search for your town or select a point on the map.",
          );
          break;

        case 3:
          setError(
            "Getting your location timed out. Try again, or use the search/map.",
          );
          break;

        default:
          setError(
            "Could not get device location. Use the search/map instead.",
          );
      }
    },
    {
      enableHighAccuracy: false,
      timeout: 20000,
      maximumAge: 60000,
    },
  );
}

  return (
    <div className="space-y-3">
    <div className="rounded-2xl border border-border bg-muted/20 p-4">
  <label
    htmlFor="solar-location-search"
    className="mb-2 block text-sm font-medium"
  >
    Search for a town or city
  </label>

  <div className="flex gap-2">
    <input
      id="solar-location-search"
      type="search"
      value={query}
      placeholder="e.g. Ambalangoda"
      autoComplete="off"
      className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
      onChange={(event) => {
        searchRequest.current?.abort();
        searchRequest.current = null;
        setSearching(false);

        setQuery(event.target.value);
        setPlaces([]);
        setSearchMessage("");
      }}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault();
          if (!searching) void searchLocation();
        }
      }}
    />

    <button
      type="button"
      disabled={searching || query.trim().length < 2}
      onClick={() => void searchLocation()}
      className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
    >
      {searching ? "Searching…" : "Search"}
    </button>
  </div>

  {places.length > 0 && (
    <ul
      aria-label="Matching locations"
      className="mt-3 overflow-hidden rounded-xl border border-border bg-background"
    >
      {places.map((place) => (
        <li
          key={place.id}
          className="border-b border-border last:border-b-0"
        >
          <button
            type="button"
            onClick={() => selectPlace(place)}
            className="w-full px-4 py-3 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="block text-sm font-medium">
              {place.name}
            </span>

            <span className="mt-1 block text-xs text-muted-foreground">
              {[place.admin1, place.country]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )}

  {searchMessage && (
    <p
      role="status"
      className="mt-3 text-xs leading-relaxed text-muted-foreground"
    >
      {searchMessage}
    </p>
  )}

  <p className="mt-3 text-[10px] text-muted-foreground">
    Location search:{" "}
    <a
      href="https://open-meteo.com/"
      target="_blank"
      rel="noreferrer"
      className="underline"
    >
      Open-Meteo
    </a>{" "}
    /{" "}
    <a
      href="https://www.geonames.org/"
      target="_blank"
      rel="noreferrer"
      className="underline"
    >
      GeoNames
    </a>
  </p>
</div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Click the map, then drag the pin to the photo location.
        </p>

        <button
          type="button"
          onClick={useDeviceLocation}
          disabled={locating}
          className="rounded-full border border-border bg-background px-4 py-2 text-xs font-medium transition hover:bg-muted disabled:opacity-50"
        >
          {locating ? "Locating…" : "Use my current location"}
        </button>
      </div>

      <div className="relative isolate overflow-hidden rounded-2xl border border-border">
        <div
          ref={container}
          className="h-[330px] w-full bg-muted sm:h-[390px]"
          aria-label="Select the location where the photograph was taken"
        />

        {!ready && !error && (
          <div className="pointer-events-none absolute inset-0 z-[1000] grid place-items-center bg-background/80 text-sm">
            Loading map…
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Choose where the photo was taken, which may differ from your current
        location. Coordinates can also be entered below.
      </p>
    </div>
  );
}