import { formatElapsed, plural } from "./format";

describe("formatElapsed", () => {
  it.each([
    [0, "0:00"],
    [59_999, "0:59"],
    [32 * 60_000 + 14_000, "32:14"],
    [65 * 60_000 + 9_000, "1:05:09"],
    [-5_000, "0:00"],
  ])("%i ms -> %s", (ms, expected) => {
    expect(formatElapsed(ms)).toBe(expected);
  });
});

describe("plural", () => {
  it("only adds an s when needed", () => {
    expect([plural(1, "set"), plural(0, "set"), plural(2, "set")]).toEqual(["1 set", "0 sets", "2 sets"]);
  });
});
