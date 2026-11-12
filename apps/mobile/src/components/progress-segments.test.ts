import { layoutSegments, segmentTotals } from "./progress-segments";

describe("layoutSegments", () => {
  it("sizes each segment by its sets and fills it by the sets done", () => {
    const layout = layoutSegments(
      [
        { total: 4, done: 4 },
        { total: 4, done: 2 },
        { total: 3, done: 0 },
      ],
      1,
    );

    expect(layout).toEqual([
      { grow: 4, fraction: 1, tone: "complete" },
      { grow: 4, fraction: 0.5, tone: "current" },
      { grow: 3, fraction: 0, tone: "other" },
    ]);
  });

  it("shows green over indigo once the current exercise is finished", () => {
    expect(layoutSegments([{ total: 3, done: 3 }], 0)[0]!.tone).toBe("complete");
  });

  it("keeps an exercise with no sets visible, and never complete", () => {
    expect(layoutSegments([{ total: 0, done: 0 }], 5)[0]).toEqual({ grow: 1, fraction: 0, tone: "other" });
  });

  it("never fills past 100%, even if more sets are done than planned", () => {
    expect(layoutSegments([{ total: 3, done: 5 }], 0)[0]!.fraction).toBe(1);
  });
});

describe("segmentTotals", () => {
  it("adds up done and planned sets for the screen-reader label", () => {
    expect(segmentTotals([{ total: 4, done: 2 }, { total: 3, done: 3 }, { total: 2, done: 9 }])).toEqual({ done: 7, total: 9 });
  });
});
