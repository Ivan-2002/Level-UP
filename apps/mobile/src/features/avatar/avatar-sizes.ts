import { VIEWBOX } from "@/components/avatar-shape";

// How big the avatar is drawn on each screen, from the window size, so it's as large as
// the screen allows on small phones too. Plain functions, unit-tested.

/** The avatar's width when drawn `height` px tall (its viewBox proportions). */
export const avatarWidthFor = (height: number) => (height * VIEWBOX.width) / VIEWBOX.height;
const heightFor = (width: number) => (width * VIEWBOX.height) / VIEWBOX.width;

/** Share of Home's content width the hero avatar takes; the name and level bar sit beside it. */
export const HERO_WIDTH_SHARE = 0.45;

/**
 * The hero avatar's height for Home's content width (the window minus its padding): about
 * 45% of the width, so 257 px on an iPhone SE, 278 px on an iPhone 17. Full body (the crop
 * is for 64 px or less).
 */
export function heroAvatarHeight(contentWidth: number): number {
  return Math.round(heightFor(contentWidth * HERO_WIDTH_SHARE));
}

/** The level-up avatar: about twice the old 180 px, and never over half the screen's height. */
export const LEVEL_UP_AVATAR_MAX = 360;

/**
 * The level-up avatar's height for the window's height: half of it, at most 360 px. Half
 * leaves room for the headline and Continue on an iPhone SE (667 → 334 px); an iPhone 17
 * gets the full 360. The reveal of the new extras is the focus of the screen.
 */
export function levelUpAvatarHeight(windowHeight: number): number {
  return Math.round(Math.min(LEVEL_UP_AVATAR_MAX, windowHeight * 0.5));
}
