'use client';

import { useRef } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import VariableProximity from "./react-bits/VariableProximity-TS-TW";


export const Abouttheproject = () => {
  const containerRef = useRef<HTMLElement | null>(null);

  return (
    <section
      ref={containerRef}
      aria-labelledby="about-project-title"
      className="relative isolate flex w-screen items-center overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-1/2 "
      />
      <div className="mx-auto w-full max-w-7xl  ">
        <div className="mb-10 flex items-center gap-3 sm:mb-14">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" />
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
            About the project
          </p>
          <span aria-hidden="true" className="ml-3 h-px flex-1 bg-border" />
        </div>

        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.6fr] lg:gap-">
          <div>
            <h2
              id="about-project-title"
              className="max-w-sm text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl"
            >
              Your home.
              <br />
              Your energy.
              <br />
              <span className="text-primary">Better informed.</span>
            </h2>
          </div>

          <div className="min-w-0 text-pretty tracking-tight">
            <VariableProximity
              label={"Our project brings together four tools to help households make informed decisions about solar energy. It uses image analysis, solar generation forecasts, and energy planning to support panel setup, daily electricity use, maintenance, and backup preparation."}
              className={"variable-proximity-demo"}
              fromFontVariationSettings="'wght' 400, 'opsz' 9"
              toFontVariationSettings="'wght' 1000, 'opsz' 40"
              containerRef={containerRef}
              radius={100}
              falloff="linear"
              smoothing={0.2}
              scale={1}
              lift={0}
              idleWave={false}
              fontSize="clamp(20px, 2.15vw, 32px)"
            />
          </div>
        </div>
      </div>
    </section>
  );
};