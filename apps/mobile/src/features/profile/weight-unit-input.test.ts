import { createProfileSchema } from "@levelup/shared";
import { bodyweightMessage, bodyweightRange, parseBodyweightInput, weightUnitForMeasurementSystem } from "./weight-unit-input";

describe("weightUnitForMeasurementSystem", () => {
  it("suggests lb only for the US measurement system", () => {
    expect(weightUnitForMeasurementSystem("us")).toBe("lb");
    expect(weightUnitForMeasurementSystem("metric")).toBe("kg");
    expect(weightUnitForMeasurementSystem("uk")).toBe("kg");
    expect(weightUnitForMeasurementSystem(null)).toBe("kg"); // web, or unknown
  });
});

describe("parseBodyweightInput", () => {
  it("returns kg, converting from lb", () => {
    expect(parseBodyweightInput("75.5", "kg")).toBe(75.5);
    expect(parseBodyweightInput("180", "lb")).toBe(81.647);
  });

  it("accepts a comma as the decimal separator", () => {
    expect(parseBodyweightInput(" 75,5 ", "kg")).toBe(75.5);
  });

  it("treats empty as not given, and junk as NaN for the schema to reject", () => {
    expect(parseBodyweightInput("  ", "lb")).toBeUndefined();
    expect(parseBodyweightInput("abc", "lb")).toBeNaN();
  });
});

describe("bodyweightMessage", () => {
  const issueFor = (bodyweightKg: number) =>
    createProfileSchema.safeParse({ username: "IvanLifts", bodyweightKg }).error!.issues[0]!;

  it("restates the schema's kg range in pounds for a lb player", () => {
    const issue = issueFor(parseBodyweightInput("50", "lb")!); // 22.7 kg: too light
    expect(bodyweightMessage(issue.code, issue.message, "lb")).toBe("Bodyweight must be between 67 and 661 lb.");
  });

  it("states it in kg for a kg player", () => {
    const issue = issueFor(400);
    expect(bodyweightMessage(issue.code, issue.message, "kg")).toBe("Bodyweight must be between 30 and 300 kg.");
  });

  it.each(["kg", "lb"] as const)("states a %s range whose ends the schema really accepts", (unit) => {
    const { min, max } = bodyweightRange(unit);
    const accepts = (value: number) =>
      createProfileSchema.safeParse({ username: "IvanLifts", bodyweightKg: parseBodyweightInput(String(value), unit) }).success;

    expect([accepts(min), accepts(max)]).toEqual([true, true]);
    expect([accepts(min - 1), accepts(max + 1)]).toEqual([false, false]);
  });

  it("passes other messages through", () => {
    const issue = issueFor(Number.NaN);
    expect(bodyweightMessage(issue.code, issue.message, "lb")).toBe(issue.message);
  });
});
