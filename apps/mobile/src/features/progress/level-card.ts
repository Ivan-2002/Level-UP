import type { Profile } from "@levelup/shared";

// What Home's level bar says. The numbers are the server's (profile.level): it owns the
// level curve, and the cached profile keeps the bar working offline.

export type HomeLevel = {
  /** "Level 6 · Regular" ("Level 6" when the profile has no stage). */
  title: string;
  /** "2,140 / 6,109 XP": XP into the level, of the XP the level spans. */
  progressText: string;
  /** 0 to 1, how much of the bar is filled. */
  fraction: number;
  /** The whole card as one element: "Level 6, Regular. 2,140 of 6,109 XP to level 7." */
  accessibilityLabel: string;
};

const n = (v: number) => v.toLocaleString("en-US");

export function homeLevel(profile: Pick<Profile, "level" | "stage">): HomeLevel {
  const { level, xpIntoLevel, xpForNextLevel } = profile.level;
  const stage = profile.stage?.name;
  return {
    title: stage ? `Level ${level} · ${stage}` : `Level ${level}`,
    progressText: `${n(xpIntoLevel)} / ${n(xpForNextLevel)} XP`,
    fraction: Math.min(1, Math.max(0, xpIntoLevel / xpForNextLevel)),
    accessibilityLabel: `Level ${level}${stage ? `, ${stage}` : ""}. ${n(xpIntoLevel)} of ${n(xpForNextLevel)} XP to level ${level + 1}.`,
  };
}
