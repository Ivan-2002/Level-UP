import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { colors } from "@/theme/colors";

type Mode = "sign-in" | "sign-up";

// One component for both screens: they share 90% of their layout and logic.
// The routes (auth)/sign-in.tsx and (auth)/sign-up.tsx just pick the mode.
export function AuthScreen({ mode }: { mode: Mode }) {
  const isSignUp = mode === "sign-up";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Quick checks before calling the server, for instant feedback.
  // The SERVER still validates everything: never trust the app alone.
  function validate(): string | null {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return "Enter a valid email address.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    return null;
  }

  async function submit() {
    const problem = validate();
    if (problem) return setError(problem);

    setError(null);
    setLoading(true);
    const trimmedEmail = email.trim().toLowerCase();

    try {
      const result = isSignUp
        ? await authClient.signUp.email({
            email: trimmedEmail,
            password,
            // Better Auth requires a name. The real username is chosen on "Create your character".
            name: trimmedEmail.split("@")[0] ?? "Player",
          })
        : await authClient.signIn.email({ email: trimmedEmail, password });

      if (result.error) {
        setError(result.error.message ?? "Something went wrong. Please try again.");
      }
    } catch (err) {
      // Thrown (not returned) errors are network problems: the server never answered.
      console.warn("[auth] request failed:", err);
      setError("Can't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
    // On success there is nothing to do here: the session changes, and the root
    // layout's guard automatically moves us to the signed-in part of the app.
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.brand}>
              LEVEL<Text style={{ color: colors.purple }}>UP</Text>
            </Text>
            <Text style={styles.title}>{isSignUp ? "Create your account" : "Welcome back"}</Text>
            <Text style={styles.subtitle}>
              {isSignUp ? "Start as a Rookie. Grow with every workout." : "Sign in to keep levelling up."}
            </Text>
          </View>

          <View style={styles.form}>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="you@example.com"
            />
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={isSignUp ? "new-password" : "current-password"}
              textContentType={isSignUp ? "newPassword" : "password"}
              placeholder={isSignUp ? "At least 8 characters" : "Your password"}
              onSubmitEditing={submit}
              returnKeyType="go"
            />
            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
          </View>

          <Button label={isSignUp ? "Create account" : "Sign in"} onPress={submit} loading={loading} />

          <Text style={styles.switchText}>
            {isSignUp ? "Already have an account? " : "New to LevelUp? "}
            <Link href={isSignUp ? "/sign-in" : "/sign-up"} replace style={styles.link}>
              {isSignUp ? "Sign in" : "Create an account"}
            </Link>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, justifyContent: "center", padding: 16, gap: 24 },
  header: { gap: 6 },
  brand: { color: colors.ink, fontSize: 18, fontWeight: "700", letterSpacing: 2 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "700", marginTop: 16 },
  subtitle: { color: colors.inkMuted, fontSize: 15 },
  form: { gap: 16 },
  error: { color: colors.danger, fontSize: 14 },
  switchText: { color: colors.inkMuted, fontSize: 14, textAlign: "center" },
  link: { color: colors.ice, fontWeight: "600" },
});
