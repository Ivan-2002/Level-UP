import type { AvatarResponse, AvatarStage } from "@levelup/shared";
import { DEFAULT_FACE } from "@/components/avatar-face";
import { ZERO_DEVELOPMENT } from "@/components/avatar-shape";
import { playerLook } from "./avatar-look";

const REGULAR: AvatarStage = { key: "regular", name: "Regular", levelRequired: 4, extras: ["wristbands"] };
const ATHLETE: AvatarStage = { key: "athlete", name: "Athlete", levelRequired: 10, extras: ["wristbands", "outfit"] };
const NO_DAYS = { chest: null, back: null, shoulders: null, arms: null, core: null, legs: null };

const avatar = (stage: AvatarStage | null): AvatarResponse => ({
  stage,
  stages: [REGULAR, ATHLETE],
  development: { chest: 0.3, back: 0, shoulders: 0, arms: 0.1, core: 0, legs: 0.56 },
  stamina: 0,
  lastTrainedOn: NO_DAYS,
});

describe("playerLook", () => {
  it("draws the server's development, the profile's stage extras and the default face", () => {
    expect(playerLook(avatar(REGULAR), { stage: REGULAR })).toEqual({
      development: avatar(REGULAR).development,
      extras: ["wristbands"],
      face: DEFAULT_FACE,
      stamina: 0,
      expression: "neutral",
    });
  });

  it("takes the extras from the profile, so they match the level bar's stage name even if the avatar copy is older", () => {
    expect(playerLook(avatar(REGULAR), { stage: ATHLETE }).extras).toEqual(["wristbands", "outfit"]);
  });

  it("falls back to the avatar's stage without a profile, and to lines only with nothing loaded", () => {
    expect(playerLook(avatar(ATHLETE), null).extras).toEqual(["wristbands", "outfit"]);
    expect(playerLook(undefined, undefined)).toMatchObject({ development: ZERO_DEVELOPMENT, extras: [], stamina: 0 });
  });

  it("passes the expression through (proud on the level-up)", () => {
    expect(playerLook(avatar(REGULAR), { stage: REGULAR }, "proud").expression).toBe("proud");
  });
});
