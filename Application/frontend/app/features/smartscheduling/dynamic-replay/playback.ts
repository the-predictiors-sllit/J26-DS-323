import type { Frame } from "./actions";

/** The last cursor position represents the end of the final 15-minute slot. */
export function playbackFrames(frames: Frame[], cursor: number) {
  const finished = frames.length > 0 && cursor >= frames.length;
  const history = frames.slice(0, Math.min(cursor + 1, frames.length));
  return {
    finished,
    frame: frames[Math.min(cursor, frames.length - 1)],
    history,
    completed: finished ? history : history.slice(0, -1),
  };
}
