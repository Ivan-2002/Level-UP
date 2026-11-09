import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";

// The app's connection to Better Auth on our API.
// Phones have no browser cookie jar, so the Expo plugin stores the session cookie in
// SecureStore: the iOS Keychain / Android Keystore, encrypted by the operating system.
// Never keep session tokens in plain AsyncStorage.
export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  plugins: [
    expoClient({
      scheme: "levelup",
      storagePrefix: "levelup",
      storage: SecureStore,
    }),
  ],
});
