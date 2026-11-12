import { useFonts } from "expo-font";
import { fontFiles } from "./tokens";

// The five font files the type scale uses, loaded at runtime with useFonts (works in Expo
// Go; the alternative, embedding them with the expo-font config plugin, avoids the
// load step but needs a new native build every time fonts change).
//
// We require each file by path instead of importing from "@expo-google-fonts/sora": the
// package's index requires EVERY weight, which would put ~9 MB of fonts in the app bundle
// instead of ~1.6 MB.
const files = {
  [fontFiles.soraSemiBold]: require("@expo-google-fonts/sora/600SemiBold/Sora_600SemiBold.ttf"),
  [fontFiles.soraBold]: require("@expo-google-fonts/sora/700Bold/Sora_700Bold.ttf"),
  [fontFiles.interRegular]: require("@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf"),
  [fontFiles.interMedium]: require("@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf"),
  [fontFiles.interSemiBold]: require("@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf"),
};

/** True once the fonts are ready, OR failed to load (then text falls back to the system font). */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(files);
  if (error) console.warn("[fonts] failed to load, using the system font:", error);
  return loaded || error !== null;
}
