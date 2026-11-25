import type { AvatarStage, Profile } from "@levelup/shared";
import { createCelebrationStore } from "@/stores/celebration-store";
import { memoryStorage } from "@/test/fixtures";
import { DEFAULT_FACE } from "@/components/avatar-face";
import type { AvatarLook } from "@/components/Avatar";
import {
  avatarReady,
  createCelebrationSync,
  levelUpLooks,
  levelUpMotion,
  levelUpText,
  pendingLevelUp,
} from "./level-up";

const REGULAR: AvatarStage = { key: "regular", name: "Regular", levelRequired: 4, extras: ["wristbands"] };
const ATHLETE: AvatarStage = { key: "athlete", name: "Athlete", levelRequired: 10, extras: ["wristbands", "outfit"] };

function profile(level: number, celebratedLevel: number | null, stage: AvatarStage | null): Profile {
  return {
    username: "Ivan",
    bodyweightKg: 80,
    weightUnit: "kg",
    timeZone: "UTC",
    totalXp: 0,
    level: { level, xpIntoLevel: 0, xpForNextLevel: 1000 },
    stage,
    celebratedLevel,
    xpBodyweightKg: 80,
    createdAt: "2026-11-01T06:00:00.000Z",
  };
}

describe("pendingLevelUp", () => {
  it("shows a level above the server's celebrated level, with the stage it reaches", () => {
    expect(pendingLevelUp(profile(4, 3, REGULAR), undefined)).toEqual({ from: 3, to: 4, newStage: REGULAR });
  });

  it("shows several levels at once from the last one celebrated, and a stage only if it starts after it", () => {
    expect(pendingLevelUp(profile(6, 4, REGULAR), undefined)).toEqual({ from: 4, to: 6, newStage: null });
    expect(pendingLevelUp(profile(10, 3, ATHLETE), undefined)).toEqual({ from: 3, to: 10, newStage: ATHLETE });
  });

  it("shows nothing at or below what was celebrated, on the server or on this phone", () => {
    expect(pendingLevelUp(profile(4, 4, REGULAR), undefined)).toBeNull();
    expect(pendingLevelUp(profile(5, 6, REGULAR), undefined)).toBeNull(); // the level went down (a correction)
    expect(pendingLevelUp(profile(4, 3, REGULAR), 4)).toBeNull();
  });

  it("shows nothing for a profile saved before celebratedLevel existed (no replay of old level-ups)", () => {
    expect(pendingLevelUp(profile(12, null, ATHLETE), undefined)).toBeNull();
  });
});

describe("celebration sync", () => {
  function setup(send: jest.Mock) {
    const storage = memoryStorage();
    const store = createCelebrationStore(storage);
    const onSaved = jest.fn();
    return { storage, store, onSaved, sync: createCelebrationSync({ store, send, onSaved }) };
  }

  it("offline: the level-up is shown once, kept on the phone across a restart, and sent later", async () => {
    const send = jest.fn().mockRejectedValueOnce(new TypeError("Network request failed"));
    const { storage, store, onSaved, sync } = setup(send);
    const before = profile(4, 3, REGULAR);
    expect(pendingLevelUp(before, store.getState().upTo.u)).not.toBeNull();

    await sync.markShown("u", 4);

    expect(send).toHaveBeenCalledWith(4);
    expect(onSaved).not.toHaveBeenCalled();
    // The profile still says 3 (the POST failed), but the phone remembers it showed 4.
    expect(pendingLevelUp(before, store.getState().upTo.u)).toBeNull();
    const restarted = createCelebrationStore(storage);
    expect(pendingLevelUp(before, restarted.getState().upTo.u)).toBeNull();

    // Back online: the next flush sends it, and the server's answer replaces the local value.
    const after = profile(4, 4, REGULAR);
    send.mockResolvedValueOnce(after);
    await sync.flush("u");

    expect(send).toHaveBeenCalledTimes(2);
    expect(store.getState().upTo).toEqual({});
    expect(onSaved).toHaveBeenCalledWith("u", after);
    expect(pendingLevelUp(after, store.getState().upTo.u)).toBeNull();
  });

  it("sends one request at a time, and keeps a higher level shown while one was in flight", async () => {
    let answer!: (p: Profile) => void;
    const send = jest.fn(() => new Promise<Profile>((resolve) => (answer = resolve)));
    const { store, sync } = setup(send);

    const first = sync.markShown("u", 4);
    void sync.flush("u"); // e.g. the profile reloaded meanwhile
    store.getState().markShown("u", 6); // another level-up shown before the answer
    answer(profile(6, 4, REGULAR));
    await first;

    expect(send).toHaveBeenCalledTimes(1);
    expect(store.getState().upTo).toEqual({ u: 6 }); // 6 still needs sending
  });

  it("does nothing when nothing waits, and keeps players apart", async () => {
    const send = jest.fn().mockResolvedValue(profile(4, 4, REGULAR));
    const { store, sync } = setup(send);
    store.getState().markShown("other", 9);

    await sync.flush("u");

    expect(send).not.toHaveBeenCalled();
    expect(store.getState().upTo).toEqual({ other: 9 });
  });
});

describe("levelUpText", () => {
  it("announces one level and the new stage", () => {
    expect(levelUpText({ from: 3, to: 4, newStage: REGULAR })).toEqual({
      levelText: "Level 4",
      stageText: "New stage: Regular",
      announcement: "Level up! Level 4. New stage: Regular.",
    });
  });

  it("announces one level without a stage", () => {
    expect(levelUpText({ from: 5, to: 6, newStage: null }).announcement).toBe("Level up! Level 6.");
  });

  it("shows several levels with an arrow, and says 'to' for screen readers", () => {
    expect(levelUpText({ from: 4, to: 6, newStage: null })).toMatchObject({
      levelText: "Level 4 → 6",
      announcement: "Level up! Level 4 to 6.",
    });
    expect(levelUpText({ from: 3, to: 10, newStage: ATHLETE }).announcement).toBe(
      "Level up! Level 3 to 10. New stage: Athlete.",
    );
  });
});

describe("levelUpMotion", () => {
  it("draws everything in its final state when reduce motion is on", () => {
    expect(levelUpMotion(true)).toEqual({ level: "none", avatar: "none", stage: "none" });
    expect(levelUpMotion(false)).toEqual({ level: "zoom", avatar: "grow", stage: "reveal" });
  });
});

describe("levelUpLooks", () => {
  const ROOKIE: AvatarStage = { key: "rookie", name: "Rookie", levelRequired: 1, extras: [] };
  const STAGES = [ROOKIE, REGULAR, ATHLETE];
  const player: AvatarLook = {
    development: { chest: 0.4, back: 0.4, shoulders: 0.2, arms: 0.3, core: 0, legs: 0 },
    extras: ["wristbands", "outfit"], // the (possibly older) look Home drew
    face: DEFAULT_FACE,
    stamina: 0,
    expression: "neutral",
  };

  it("a new stage: from the old stage's extras (neutral) to the new stage's (proud), the same body", () => {
    const looks = levelUpLooks({ from: 9, to: 10, newStage: ATHLETE }, player, STAGES);
    expect(looks.from).toEqual({ ...player, extras: ["wristbands"], expression: "neutral" });
    expect(looks.to).toEqual({ ...player, extras: ["wristbands", "outfit"], expression: "proud" });
  });

  it("several stages at once start from the stage at the last level celebrated", () => {
    const looks = levelUpLooks({ from: 3, to: 10, newStage: ATHLETE }, player, STAGES);
    expect(looks.from?.extras).toEqual([]);
    expect(looks.to.extras).toEqual(["wristbands", "outfit"]);
  });

  it("no new stage: nothing to reveal, the player's look, proud", () => {
    expect(levelUpLooks({ from: 5, to: 6, newStage: null }, player, STAGES)).toEqual({
      from: null,
      to: { ...player, expression: "proud" },
    });
  });

  it("stages never loaded on this phone, or a stage that adds no extra: the final look straight away", () => {
    expect(levelUpLooks({ from: 9, to: 10, newStage: ATHLETE }, player, undefined).from).toBeNull();
    const bare: AvatarStage = { ...ATHLETE, extras: ["wristbands"] };
    expect(levelUpLooks({ from: 9, to: 10, newStage: bare }, player, [ROOKIE, REGULAR, bare]).from).toBeNull();
  });
});

describe("avatarReady (when the level-up screen snapshots the avatar)", () => {
  it("waits while nothing is saved and the first request hasn't answered", () => {
    expect(avatarReady({ data: undefined, isFetched: false, failureCount: 0 })).toBe(false);
  });

  it("is ready with a saved copy, an answer, or a first failure (offline: no waiting through retries)", () => {
    expect(avatarReady({ data: {}, isFetched: false, failureCount: 0 })).toBe(true);
    expect(avatarReady({ data: undefined, isFetched: true, failureCount: 0 })).toBe(true);
    expect(avatarReady({ data: undefined, isFetched: false, failureCount: 1 })).toBe(true);
  });
});
