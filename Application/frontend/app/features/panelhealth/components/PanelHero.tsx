"use client"

import { useState } from "react"
import { Camera, Crop, Gauge, Pause, Play } from "lucide-react"
import HeroScene from "./HeroScene"

const STEPS = [
  { icon: Camera, label: "Snap a photo" },
  { icon: Crop, label: "Mark the corners" },
  { icon: Gauge, label: "See your results" },
]

export default function PanelHero() {
  const [paused, setPaused] = useState(false)

  return (
    <section aria-labelledby="panel-hero-title" className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-600 dark:text-amber-500">Panel health</p>

        <h1 id="panel-hero-title" className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Check your panel in <span className="text-amber-600 dark:text-amber-500">one photo.</span>
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Photograph one panel straight on, mark its four corners, and get a health estimate, an expected output range and a clear
          next step.
        </p>

        <ol className="mt-5 flex flex-wrap gap-2">
          {STEPS.map(({ icon: Icon, label }, index) => (
            <li key={label} className="inline-flex items-center gap-2 rounded-full border bg-card/60 py-1.5 pl-1.5 pr-3 text-xs font-medium">
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-amber-500/15 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                {index + 1}
              </span>
              <Icon className="size-3.5 text-muted-foreground" />
              {label}
            </li>
          ))}
        </ol>
      </div>

      <div>
        <div className="overflow-hidden rounded-3xl border shadow-sm">
          <HeroScene paused={paused} />
        </div>
        <div className="mt-2 flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            aria-pressed={paused}
            className="inline-flex items-center gap-1 underline underline-offset-2 transition hover:text-foreground"
          >
            {paused ? <Play className="size-3" /> : <Pause className="size-3" />}
            {paused ? "Play motion" : "Pause motion"}
          </button>
        </div>
      </div>
    </section>
  )
}
