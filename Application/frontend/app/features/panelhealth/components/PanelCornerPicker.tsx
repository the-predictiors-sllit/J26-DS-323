"use client"

import { useMemo, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { Crop, RotateCcw, Undo2 } from "lucide-react"
import {
  EditorState,
  LABELS,
  Pt,
  initialState,
  orderCorners,
  pointerDown,
  pointerMove,
  pointerUp,
  quadProblems,
  toFlat,
  undo,
} from "../lib/panelCorners"

type Props = {
  imageUrl: string
  imageWidth: number // size of the image behind imageUrl, in pixels
  imageHeight: number
  busy?: boolean
  /** Called with 8 numbers x1,y1,...,x4,y4 (fractions of the photo), top-left first, clockwise. */
  onConfirm: (corners: number[]) => void
}

const GRAB = 0.06 // a tap within 6% of the photo width of a corner grabs it (finger-sized)
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

const secondaryButton =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium shadow-sm transition hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-50"
const primaryButton =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"

export default function PanelCornerPicker({ imageUrl, imageWidth, imageHeight, busy = false, onConfirm }: Props) {
  const [state, setState] = useState<EditorState>(initialState)
  const boxRef = useRef<HTMLDivElement>(null)
  const aspect = imageHeight / imageWidth

  const complete = state.points.length === 4
  const ordered = useMemo(() => (complete ? orderCorners(state.points) : []), [complete, state.points])
  const problems = useMemo(
    () => (complete ? quadProblems(ordered, imageWidth, imageHeight) : []),
    [complete, ordered, imageWidth, imageHeight],
  )

  const toPoint = (e: ReactPointerEvent<HTMLDivElement>): Pt | null => {
    const box = boxRef.current
    if (!box) return null
    const r = box.getBoundingClientRect()
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) }
  }

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = toPoint(e)
    if (!p) return
    e.currentTarget.setPointerCapture(e.pointerId) // keep receiving moves if the finger slides off the photo
    setState((s) => pointerDown(s, p, GRAB, aspect))
  }
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = toPoint(e)
    if (p) setState((s) => pointerMove(s, p))
  }
  const onUp = () => setState((s) => pointerUp(s))

  const labelFor = (p: Pt, tapIndex: number): string => {
    const k = complete ? ordered.indexOf(p) : tapIndex
    return k >= 0 ? String(k + 1) : ""
  }

  const hint = !complete
    ? `Tap the ${LABELS[state.points.length]} corner of the panel's glass (${state.points.length + 1} of 4).`
    : problems.length
      ? problems[0]
      : "Drag a corner to adjust it. When the outline fits the panel, preview the crop."

  return (
    <div className="grid gap-3">
      <div
        ref={boxRef}
        className="relative mx-auto w-full max-w-md cursor-crosshair touch-none select-none overflow-hidden rounded-lg border bg-muted/30"
        style={{ aspectRatio: `${imageWidth} / ${imageHeight}` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="Solar panel photo: tap its four corners" draggable={false} className="block size-full" />
        <svg viewBox={`0 0 ${imageWidth} ${imageHeight}`} className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
          {complete && (
            <polygon
              points={ordered.map((p) => `${p.x * imageWidth},${p.y * imageHeight}`).join(" ")}
              fill="rgba(16, 185, 129, 0.14)"
              stroke="#10b981"
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {state.points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x * imageWidth}
                cy={p.y * imageHeight}
                r={imageWidth * 0.018}
                fill="rgba(251, 191, 36, 0.35)"
                stroke="#fbbf24"
                strokeWidth={2.5}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={p.x * imageWidth + imageWidth * 0.025}
                y={p.y * imageHeight + imageWidth * 0.045}
                fontSize={imageWidth * 0.04}
                fontWeight={700}
                fill="#fbbf24"
                stroke="#000"
                strokeWidth={0.6}
              >
                {labelFor(p, i)}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <p className={`text-center text-sm ${problems.length ? "text-red-600" : "text-muted-foreground"}`}>{hint}</p>

      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          className={secondaryButton}
          onClick={() => setState((s) => undo(s))}
          disabled={state.points.length === 0 || busy}
        >
          <Undo2 className="size-4" />
          Undo
        </button>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => setState(initialState())}
          disabled={state.points.length === 0 || busy}
        >
          <RotateCcw className="size-4" />
          Start again
        </button>
        <button
          type="button"
          className={primaryButton}
          onClick={() => onConfirm(toFlat(ordered))}
          disabled={!complete || problems.length > 0 || busy}
        >
          <Crop className="size-4" />
          Preview crop
        </button>
      </div>
    </div>
  )
}
