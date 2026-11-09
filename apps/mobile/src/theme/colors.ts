// Colour tokens from the LevelUp Design System (dark theme, the default).
// Screens use these names, never raw hex values, so a theme change happens in one place.
// Light theme values are added when we build theme switching.
export const colors = {
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
  warning: "#FBBF24",
  danger: "#F87171",
} as const;
