import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/Button";
import { Text } from "@/components/Text";
import { TextField } from "@/components/TextField";
import { createStyles } from "@/theme/use-theme";

type Mode = "sign-in" | "sign-up";

// One component for both screens: they share 90% of their layout and logic.
// The routes (auth)/sign-in.tsx and (auth)/sign-up.tsx just pick the mode.
export function AuthScreen({ mode }: { mode: Mode }) {
  const isSignUp = mode === "sign-up";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const styles = useStyles();

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
            <Text variant="heading" style={styles.brand}>
              LEVEL
              <Text variant="heading" tone="purple">
                UP
              </Text>
            </Text>
            <Text variant="display" accessibilityRole="header" style={styles.title}>
              {isSignUp ? "Create your account" : "Welcome back"}
            </Text>
            <Text tone="inkMuted">
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
              <Text tone="danger" accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
          </View>

          <Button label={isSignUp ? "Create account" : "Sign in"} onPress={submit} loading={loading} />

          <Text variant="label" tone="inkMuted" style={styles.switchText}>
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

const useStyles = createStyles((t) => ({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: t.colors.bg },
  content: { flexGrow: 1, justifyContent: "center", padding: t.space[4], gap: t.space[6] },
  header: { gap: 6 },
  brand: { letterSpacing: 2 },
  title: { marginTop: t.space[4] },
  form: { gap: t.space[4] },
  switchText: { textAlign: "center" },
  link: { ...t.type.labelStrong, color: t.colors.ice },
}));
