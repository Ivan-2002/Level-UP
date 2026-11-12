import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { ColorScheme } from "@/theme/tokens";

// Settings that belong to THIS PHONE, not to the player's account. The theme is one:
// you might want light on a tablet and dark on your phone. Account settings (the weight
// unit) live on the server's profile instead, so they follow you to a new phone.

export type ThemePreference = ColorScheme | "system";

export type SettingsState = {
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
};

/** The design system's default theme is dark. */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "dark";

export function createSettingsStore(storage: StateStorage) {
  return createStore<SettingsState>()(
    persist(
      (set) => ({
        themePreference: DEFAULT_THEME_PREFERENCE,
        setThemePreference: (themePreference) => set({ themePreference }),
      }),
      {
        name: "levelup.settings",
        version: 1,
        storage: createJSONStorage(() => storage),
        partialize: (state) => ({ themePreference: state.themePreference }),
      },
    ),
  );
}

/** Which palette to use. "system" follows the phone; if the phone won't say, dark. */
export function resolveColorScheme(preference: ThemePreference, system: string | null | undefined): ColorScheme {
  if (preference !== "system") return preference;
  return system === "light" ? "light" : "dark";
}
