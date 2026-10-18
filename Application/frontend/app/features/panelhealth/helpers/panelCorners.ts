/**
 * panelCorners.ts - the logic behind "tap the four corners of the panel".
 * Pure functions with no React or browser code, so they are easy to test.
 *
 * Points are FRACTIONS of the photo (x / width, y / height), the same format as
 * data/panel_corners.csv in the Python project: 0,0 is the photo's top-left.
 */
export type Pt = { x: number; y: number }

export const LABELS = ["top-left", "top-right", "bottom-right", "bottom-left"] as const

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/**
 * Put four tapped points into the order top-left, top-right, bottom-right, bottom-left,
 * whatever order they were tapped in (the panel is assumed upright in the photo).
 */
export function orderCorners(pts: Pt[]): Pt[] {
  if (pts.length !== 4) throw new Error("need exactly 4 points")
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4
  // y points down on screen, so increasing angle runs clockwise
  const sorted = [...pts].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))
  let start = 0 // begin at the point nearest the photo's top-left corner
  sorted.forEach((p, i) => {
    if (p.x + p.y < sorted[start].x + sorted[start].y) start = i
  })
  return [0, 1, 2, 3].map((i) => sorted[(start + i) % 4])
}

/** Flatten to the 8 numbers the server expects: x1,y1,x2,y2,x3,y3,x4,y4. */
export function toFlat(ordered: Pt[]): number[] {
  return ordered.flatMap((p) => [p.x, p.y])
}

/** What looks wrong with these four ordered corners? An empty list means they look fine. */
export function quadProblems(ordered: Pt[], width: number, height: number): string[] {
  const p = ordered.map((q) => ({ x: q.x * width, y: q.y * height }))
  const problems: string[] = []

  const cross: number[] = []
  for (let i = 0; i < 4; i++) {
    const a = p[i],
      b = p[(i + 1) % 4],
      c = p[(i + 2) % 4]
    cross.push((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x))
  }
  if (!(cross.every((v) => v > 0) || cross.every((v) => v < 0))) {
    problems.push("The corners cross over each other. Drag them so they outline the panel.")
    return problems
  }

  let area = 0
  for (let i = 0; i < 4; i++) area += p[i].x * p[(i + 1) % 4].y - p[(i + 1) % 4].x * p[i].y
  area = Math.abs(area) / 2
  if (area < 0.15 * width * height) problems.push("The outlined area is very small. Tap the corners of the whole panel.")

  const len = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
  const across = (len(p[0], p[1]) + len(p[3], p[2])) / 2 // width of the panel in the photo
  const down = (len(p[0], p[3]) + len(p[1], p[2])) / 2 // height of the panel in the photo
  const aspect = across / Math.max(1e-6, down)
  if (aspect > 0.9) problems.push("The panel looks sideways. Turn the phone so the long side of the panel is upright.")
  else if (aspect < 0.4) problems.push("The outline is too narrow. Check that the corners are on the panel's corners.")
  return problems
}

/* ---------- tapping and dragging ---------- */

export interface EditorState {
  points: Pt[] // in the order they were tapped
  dragging: number | null // index of the corner being dragged
}

export const initialState = (): EditorState => ({ points: [], dragging: null })

/**
 * Finger or mouse goes down at p. Grab a placed corner if p is within `grab`
 * (a fraction of the photo width); otherwise place the next corner (up to four).
 * aspect = photo height / width, so distances are measured evenly in both directions.
 */
export function pointerDown(s: EditorState, p: Pt, grab: number, aspect: number): EditorState {
  let best = -1
  let bestDist = grab
  s.points.forEach((q, i) => {
    const d = Math.hypot(q.x - p.x, (q.y - p.y) * aspect)
    if (d <= bestDist) {
      best = i
      bestDist = d
    }
  })
  if (best >= 0) return { ...s, dragging: best }
  if (s.points.length < 4) return { points: [...s.points, p], dragging: s.points.length }
  return s
}

export function pointerMove(s: EditorState, p: Pt): EditorState {
  if (s.dragging === null) return s
  const points = s.points.slice()
  points[s.dragging] = { x: clamp01(p.x), y: clamp01(p.y) }
  return { ...s, points }
}

export function pointerUp(s: EditorState): EditorState {
  return s.dragging === null ? s : { ...s, dragging: null }
}

export function undo(s: EditorState): EditorState {
  return { points: s.points.slice(0, -1), dragging: null }
}
