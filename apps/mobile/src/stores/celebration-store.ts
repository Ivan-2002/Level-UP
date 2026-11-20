import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

// "Celebrated up to level N" on THIS phone, per player, until the server has it.
// The account's own record is profile.celebratedLevel (POST /profile/celebrated). This
// store only covers the gap: a level-up shown offline (or before the POST answered) must
// not be shown again, after a restart included. Cleared once the server confirms.

export type CelebrationState = {
  /** userId -> the highest level shown here that the server hasn't confirmed yet. */
  upTo: Record<string, number>;
  /** The level-up screen for `level` was shown. */
  markShown: (userId: string, level: number) => void;
  /** The server stored `level`: forget the local value unless a higher one was shown meanwhile. */
  confirm: (userId: string, level: number) => void;
};

export function createCelebrationStore(storage: StateStorage) {
  return createStore<CelebrationState>()(
    persist(
      (set, get) => ({
        upTo: {},
        markShown: (userId, level) => {
          const upTo = get().upTo;
          set({ upTo: { ...upTo, [userId]: Math.max(upTo[userId] ?? 0, level) } });
        },
        confirm: (userId, level) => {
          const { [userId]: shown, ...others } = get().upTo;
          if (shown !== undefined && shown <= level) set({ upTo: others });
        },
      }),
      {
        name: "levelup.celebration",
        version: 1,
        storage: createJSONStorage(() => storage),
        partialize: (state) => ({ upTo: state.upTo }),
      },
    ),
  );
}
