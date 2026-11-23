import { useEffect, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInUp, ZoomIn, useReducedMotion } from "react-native-reanimated";
import { router } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { useProfile } from "@/features/profile/use-profile";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Text } from "@/components/Text";
import { createStyles } from "@/theme/use-theme";
import { levelUpMotion, levelUpText } from "./level-up";
import { celebrationSync, levelUpClosed, usePendingLevelUp } from "./use-celebration";

/**
 * The level-up moment, opened by useLevelUpPrompt (Home, the workout summary). It reads the
 * pending level-up ONCE: marking it shown clears it, and the screen must keep showing it.
 * - Reduce motion: no zoom or growth; everything is drawn in its final state.
 * - Screen readers hear "Level up! Level 6. New stage: Regular." when it opens; the
 *   headline carries the same words, and the stickman is decoration, hidden from them.
 * - Marked shown ON OPEN (the effect below), not on Continue, so a killed app never shows
 *   it again. Closing is then only navigation: Continue and Android's back button both pop
 *   the screen, and the cleanup runs either way. No swipe (gestureEnabled: false).
 */
export function LevelUpScreen() {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id;
  const { data: profile } = useProfile(userId);
  const pending = usePendingLevelUp(userId, profile);
  const [levelUp] = useState(pending);
  const motion = levelUpMotion(useReducedMotion());
  const styles = useStyles();
  const text = levelUp ? levelUpText(levelUp) : null;

  useEffect(() => {
    if (!levelUp || !userId || !text) {
      router.back(); // opened with nothing to celebrate (e.g. already shown on another phone)
      return levelUpClosed;
    }
    // Remembered on the phone at once (never shown twice), then sent to the server.
    void celebrationSync.markShown(userId, levelUp.to);
    // After the screen's transition, or iOS may drop the announcement.
    const timer = setTimeout(() => AccessibilityInfo.announceForAccessibility(text.announcement), 600);
    return () => {
      clearTimeout(timer);
      levelUpClosed();
    };
    // Runs once: levelUp is a snapshot taken on the first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!levelUp || !text) return null;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <View accessible accessibilityRole="header" accessibilityLabel={text.announcement} style={styles.headline}>
          <Text variant="label" tone="purple">
            Level up!
          </Text>
          <Animated.View entering={motion.level === "zoom" ? ZoomIn.springify().damping(14) : undefined}>
            <Text variant="display" tabular style={styles.level}>
              {text.levelText}
            </Text>
          </Animated.View>
          {text.stageText ? (
            <Text variant="heading" tone="purple">
              {text.stageText}
            </Text>
          ) : null}
        </View>

        {/* Decoration: the headline already says everything. Milestone 6 draws the stage's extras. */}
        <Animated.View
          entering={motion.avatar === "grow" ? FadeInUp.delay(250).springify().damping(16) : undefined}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.avatar}
        >
          <Avatar width={130} height={175} />
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <Button label="Continue" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

const useStyles = createStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  content: { flex: 1, alignItems: "center", justifyContent: "center", gap: t.space[6], padding: t.space[4] },
  headline: { alignItems: "center", gap: t.space[2] },
  level: { textAlign: "center" },
  avatar: { alignItems: "center" },
  footer: { padding: t.space[4] },
}));
