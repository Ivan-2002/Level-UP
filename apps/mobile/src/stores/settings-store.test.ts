import { memoryStorage } from "@/test/fixtures";
import { createSettingsStore, resolveColorScheme } from "./settings-store";

describe("resolveColorScheme", () => {
  it("uses the player's choice when they made one", () => {
    expect(resolveColorScheme("light", "dark")).toBe("light");
    expect(resolveColorScheme("dark", "light")).toBe("dark");
  });

  it("follows the phone for 'system', falling back to dark when the phone won't say", () => {
    expect(resolveColorScheme("system", "light")).toBe("light");
    expect(resolveColorScheme("system", "dark")).toBe("dark");
    expect(resolveColorScheme("system", null)).toBe("dark");
    expect(resolveColorScheme("system", "unspecified")).toBe("dark");
  });
});

describe("settings store", () => {
  it("defaults to the dark theme", () => {
    expect(createSettingsStore(memoryStorage()).getState().themePreference).toBe("dark");
  });

  it("remembers the theme across restarts", () => {
    const storage = memoryStorage();
    createSettingsStore(storage).getState().setThemePreference("light");

    expect(createSettingsStore(storage).getState().themePreference).toBe("light");
  });
});
