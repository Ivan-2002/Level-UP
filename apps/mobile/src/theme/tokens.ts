import type { TextStyle } from "react-native";

// ---------------------------------------------------------------------------
// LevelUp design tokens (the "LevelUp Design System", tokens.json v1).
// This file is the ONLY place a colour, font, radius or spacing value is written down;
// components ask for tokens by name through useTheme() / createStyles().
//
// What each colour MEANS (keep it that way, or the colours stop carrying meaning):
// - purple   = progress only: XP, levels, PRs. "You grew."
// - success  = completed sets, saved things.
// - primary  = actions and the selected state; one filled primary button per screen.
// - ice      = links and focus rings.
// No gradients, no glow, no shadows: thin borders separate surfaces.
// ---------------------------------------------------------------------------

export type ColorScheme = "dark" | "light";

export type Palette = {
  bg: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  ink: string;
  inkMuted: string;
  primary: string;
  onPrimary: string;
  purple: string;
  purpleSoft: string;
  ice: string;
  success: string;
  /** The tick drawn ON a success fill. */
  onSuccess: string;
  /** Background of a completed set row: success at 8%, as in the design. */
  successTint: string;
  warning: string;
  danger: string;
};

const dark: Palette = {
  bg: "#0B0D1A",
  surface: "#141729",
  surfaceRaised: "#1C2038",
  border: "#2A2F4A",
  ink: "#E6EAF7",
  inkMuted: "#9AA0BF",
  primary: "#5457E6",
  onPrimary: "#FFFFFF",
  purple: "#9B8CFF",
  purpleSoft: "#2A2550",
  ice: "#A5E8FF",
  success: "#34D399",
  onSuccess: "#0B0D1A",
  successTint: "rgba(52, 211, 153, 0.08)",
  warning: "#FBBF24",
  danger: "#F87171",
};

const light: Palette = {
  bg: "#F5F6FC",
  surface: "#FFFFFF",
  surfaceRaised: "#ECEEF8",
  border: "#D6DAEC",
  ink: "#12142A",
  inkMuted: "#5A6082",
  primary: "#4F46E5",
  onPrimary: "#FFFFFF",
  // Three light values are a touch darker than tokens.json, because the originals miss the
  // 4.5:1 text contrast rule on some backgrounds the design uses (theme/contrast.test.ts):
  //   purple  #6D5AE6 -> #5F4AE4  (was 3.95:1 on purple-soft: the PR chip)
  //   ice     #0E7FA8 -> #0D7398  (was 4.21:1 on bg: links, "Add exercise")
  //   warning #B45309 -> #AD5009  (was 4.34:1 on surface-raised)
  // Same hue and saturation, only lightness lowered, by the smallest step that passes.
  purple: "#5F4AE4",
  purpleSoft: "#E7E3FF",
  ice: "#0D7398",
  success: "#047857",
  onSuccess: "#FFFFFF",
  successTint: "rgba(4, 120, 87, 0.08)",
  warning: "#AD5009",
  danger: "#B91C1C",
};

export const palettes: Record<ColorScheme, Palette> = { dark, light };

// --- Type ----------------------------------------------------------------------------
// Sora for numbers and titles, Inter for body text. In React Native every weight of a
// custom font is its OWN family name (fontWeight can't pick a weight from a family loaded
// at runtime, especially on Android), so a text style names the exact file it uses.

export const fontFiles = {
  soraSemiBold: "Sora_600SemiBold",
  soraBold: "Sora_700Bold",
  interRegular: "Inter_400Regular",
  interMedium: "Inter_500Medium",
  interSemiBold: "Inter_600SemiBold",
} as const;

type TypeStyle = Pick<TextStyle, "fontFamily" | "fontSize" | "lineHeight">;

const face = (fontFamily: string, fontSize: number, lineHeight: number): TypeStyle => ({ fontFamily, fontSize, lineHeight });

export const type = {
  // Display (Sora). The first four are tokens.json's; "value" is the design's stat tile number.
  display: face(fontFiles.soraBold, 32, 38),
  stat: face(fontFiles.soraBold, 28, 32),
  title: face(fontFiles.soraSemiBold, 22, 28),
  heading: face(fontFiles.soraSemiBold, 17, 24),
  value: face(fontFiles.soraBold, 20, 26),
  /** Numbers typed into the set table. */
  input: face(fontFiles.soraSemiBold, 16, 20),
  // Text (Inter).
  body: face(fontFiles.interRegular, 15, 22),
  bodyStrong: face(fontFiles.interSemiBold, 15, 22),
  label: face(fontFiles.interMedium, 13, 18),
  labelStrong: face(fontFiles.interSemiBold, 13, 18),
  caption: face(fontFiles.interRegular, 12, 16),
  captionStrong: face(fontFiles.interSemiBold, 12, 16),
  button: face(fontFiles.interSemiBold, 16, 22),
} satisfies Record<string, TypeStyle>;

export type TypeVariant = keyof typeof type;

// --- Space and shape ---------------------------------------------------------------
// A 4px grid. Names follow tokens.json (space-1 = 4px ... space-8 = 32px).

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32 } as const;

export const radius = {
  /** Chips, small badges, inputs. */
  sm: 8,
  /** Buttons, list rows, stat tiles. */
  md: 12,
  /** Cards. */
  lg: 16,
  /** Sheets, the hero card. */
  xl: 24,
  /** XP bar, level badge. */
  pill: 999,
} as const;

/** Minimum size of anything you can tap (Apple and Android guidelines). */
export const TAP_TARGET = 44;

/** Lucide stroke width the design uses everywhere. */
export const ICON_STROKE = 1.75;

export type Theme = {
  scheme: ColorScheme;
  colors: Palette;
  type: typeof type;
  space: typeof space;
  radius: typeof radius;
};

export const themes: Record<ColorScheme, Theme> = {
  dark: { scheme: "dark", colors: dark, type, space, radius },
  light: { scheme: "light", colors: light, type, space, radius },
};
