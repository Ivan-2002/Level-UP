import { StyleSheet, useColorScheme } from "react-native";
import { useSettings } from "@/stores/device-stores";
import { resolveColorScheme } from "@/stores/settings-store";
import { themes, type ColorScheme, type Theme } from "./tokens";

/**
 * The current theme's tokens. Re-renders the component when the theme changes: the
 * player's choice changes (settings store), or "system" is chosen and the phone switches.
 *
 * Why a hook and not a React context provider: both inputs are already subscribable
 * (a Zustand store and useColorScheme), so a provider would only pass the same value
 * down a second way.
 */
export function useTheme(): Theme {
  const preference = useSettings((s) => s.themePreference);
  const system = useColorScheme();
  return themes[resolveColorScheme(preference, system)];
}

/**
 * Define a component's styles from theme tokens, outside the component:
 *
 *   const useStyles = createStyles((t) => ({ card: { backgroundColor: t.colors.surface } }));
 *   function Card() { const styles = useStyles(); ... }
 *
 * The style sheet is built ONCE per theme and reused, like a module-level
 * StyleSheet.create, so render stays cheap; switching theme just picks the other sheet.
 */
export function createStyles<S extends StyleDefinitions>(factory: (theme: Theme) => S & StyleDefinitions) {
  const sheets = new Map<ColorScheme, Readonly<S>>();
  return function useStyles(): Readonly<S> {
    const theme = useTheme();
    let sheet = sheets.get(theme.scheme);
    if (!sheet) {
      sheet = StyleSheet.create(factory(theme));
      sheets.set(theme.scheme, sheet);
    }
    return sheet;
  };
}

// The same generic shape StyleSheet.create uses, so style values keep their literal types
// ("center", not string) and a typo like justifyContent: "centre" is a type error.
// Taken from create's own parameter, because React Native 0.88 no longer exports a public
// name for it.
type StyleDefinitions = Parameters<typeof StyleSheet.create>[0];
