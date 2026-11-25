import { describe, expect, it } from "vitest";
import { developmentLine } from "./development-line.js";

describe("developmentLine (dev:grant-xp's output)", () => {
  it("lists every body part in BODY_PARTS order, to 2 decimals, untrained parts as 0", () => {
    expect(developmentLine({ chest: 0, back: 0.0004, shoulders: 0.1, arms: 0.125, core: 0, legs: 0.5612 })).toBe(
      "Development today: chest 0, back 0, shoulders 0.1, arms 0.13, core 0, legs 0.56",
    );
  });
});
