import { describe, expect, it } from "vitest";
import { createProfileSchema } from "./index.js";

const valid = { username: "IvanLifts", bodyweightKg: 75.5 };

describe("createProfileSchema", () => {
  it("accepts the design's example character, defaulting the weight unit and time zone", () => {
    expect(createProfileSchema.parse(valid)).toEqual({ ...valid, weightUnit: "kg", timeZone: "UTC" });
    expect(createProfileSchema.parse({ ...valid, weightUnit: "lb" }).weightUnit).toBe("lb");
  });

  it("makes bodyweight optional", () => {
    const { bodyweightKg: _, ...withoutBodyweight } = valid;
    expect(createProfileSchema.safeParse(withoutBodyweight).success).toBe(true);
  });

  it("trims the username before checking its length", () => {
    expect(createProfileSchema.parse({ ...valid, username: "  Ivan  " }).username).toBe("Ivan");
    expect(createProfileSchema.safeParse({ ...valid, username: "  ab  " }).success).toBe(false);
  });

  it.each([
    ["too short", "ab"],
    ["too long", "a".repeat(21)],
    ["has a space", "Ivan Lifts"],
    ["has an emoji", "Ivan💪"],
  ])("rejects a username that is %s", (_label, username) => {
    expect(createProfileSchema.safeParse({ ...valid, username }).success).toBe(false);
  });

  it("accepts usernames at exactly 3 and 20 characters", () => {
    expect(createProfileSchema.safeParse({ ...valid, username: "abc" }).success).toBe(true);
    expect(createProfileSchema.safeParse({ ...valid, username: "a".repeat(20) }).success).toBe(true);
  });

  it("rejects an unknown time zone", () => {
    expect(createProfileSchema.safeParse({ ...valid, timeZone: "Africa/Johannesburg" }).success).toBe(true);
    expect(createProfileSchema.safeParse({ ...valid, timeZone: "Nowhere/Land" }).success).toBe(false);
  });

  it("rejects implausible bodyweights", () => {
    expect(createProfileSchema.safeParse({ ...valid, bodyweightKg: 10 }).success).toBe(false);
    expect(createProfileSchema.safeParse({ ...valid, bodyweightKg: 500 }).success).toBe(false);
  });
});
