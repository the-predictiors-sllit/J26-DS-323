"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export type LocationPickerProps = {
  latitude: number;
  longitude: number;
  disabled?: boolean;
  onChange: (location: { latitude: number; longitude: number }) => void;
};

// Only the map skips SSR. Your surrounding page keeps server rendering.
const LocationMap = dynamic<LocationPickerProps>(
  () => import("./location-map"),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[260px] w-full rounded-xl" />,
  },
);

export function LocationPicker(props: LocationPickerProps) {
  return (
    <section className="space-y-2">
      <div>
        <p className="text-sm font-medium">Choose your location</p>

        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Click the map to select a location, or enter latitude and longitude
          manually.
        </p>
      </div>

      <div
        role="region"
        aria-label="Solar site location map"
        className="relative isolate z-0 overflow-hidden rounded-xl border"
      >
        <LocationMap {...props} />
      </div>

      <p className="rounded-lg bg-secondary px-3 py-2 text-xs leading-5 text-secondary-foreground">
        This model was trained on Sri Lankan data and is intended for locations
        in Sri Lanka only.
      </p>
    </section>
  );
}
