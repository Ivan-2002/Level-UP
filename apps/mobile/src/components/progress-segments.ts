// The rules behind <ProgressSegments>, as plain functions so they're unit-tested
// without rendering anything.

export type Segment = { total: number; done: number };
export type SegmentTone = "complete" | "current" | "other";
export type SegmentLayout = { grow: number; fraction: number; tone: SegmentTone };

/**
 * One segment per exercise, as wide as its number of sets.
 * Green when every set is done, indigo for the exercise you're on, muted for the rest.
 * An exercise with no sets yet still gets a sliver (grow 1), so it doesn't vanish.
 */
export function layoutSegments(segments: Segment[], currentIndex: number): SegmentLayout[] {
  return segments.map(({ total, done }, index) => {
    const clampedDone = Math.min(Math.max(done, 0), total);
    const complete = total > 0 && clampedDone === total;
    return {
      grow: Math.max(total, 1),
      fraction: total > 0 ? clampedDone / total : 0,
      tone: complete ? "complete" : index === currentIndex ? "current" : "other",
    };
  });
}

export function segmentTotals(segments: Segment[]) {
  return segments.reduce(
    (sum, s) => ({ done: sum.done + Math.min(Math.max(s.done, 0), s.total), total: sum.total + s.total }),
    { done: 0, total: 0 },
  );
}
