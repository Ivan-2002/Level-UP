import { avatarWidthFor, heroAvatarHeight, levelUpAvatarHeight } from "./avatar-sizes";

describe("avatar sizes", () => {
  it("the hero takes about 45% of Home's content width, full body on every phone", () => {
    expect(heroAvatarHeight(375 - 32)).toBe(257); // iPhone SE
    expect(heroAvatarHeight(402 - 32)).toBe(278); // iPhone 17
    expect(avatarWidthFor(heroAvatarHeight(402 - 32))).toBeCloseTo(0.45 * 370, 0);
    expect(heroAvatarHeight(320 - 32)).toBeGreaterThan(64); // never the crop
  });

  it("the level-up avatar is half the screen's height, at most 360 px", () => {
    expect(levelUpAvatarHeight(667)).toBe(334); // iPhone SE
    expect(levelUpAvatarHeight(874)).toBe(360); // iPhone 17
    expect(levelUpAvatarHeight(956)).toBe(360); // Pro Max
  });
});
