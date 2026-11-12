/**
 * Cheap "something expensive happened in this frame" flags for the ?perf=1 panel. Anyone can set a flag
 * (one OR); only the panel reads and clears them. Without the panel they are simply never read.
 */
export const PerfMark = {
  RESIZE: 1,
  RATIO: 2,
  LOAD: 4,
  DIALOG: 8,
} as const;

let flags = 0;

export function perfMark(mark: number): void {
  flags |= mark;
}

/** Read and clear the flags set since the last call. */
export function perfTakeMarks(): number {
  const f = flags;
  flags = 0;
  return f;
}
