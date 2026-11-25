import { useEffect, useState } from "react";
import { AccessibilityInfo, StyleSheet, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInUp, FadeOut, ZoomIn, useReducedMotion } from "react-native-reanimated";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { authClient } from "@/lib/auth-client";
import { useProfile } from "@/features/profile/use-profile";
import { playerLook } from "@/features/avatar/avatar-look";
import { avatarWidthFor, levelUpAvatarHeight } from "@/features/avatar/avatar-sizes";
import { useAvatar } from "@/features/avatar/use-avatar";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Text } from "@/components/Text";
import { createStyles } from "@/theme/use-theme";
import {
  avatarReady,
  levelUpLooks,
  levelUpMotion,
  levelUpText,
  STAGE_REVEAL_DELAY_MS,
  STAGE_REVEAL_FADE_MS,
  type LevelUpLooks,
} from "./level-up";
import { celebrationSync, levelUpClosed, usePendingLevelUp } from "./use-celebration";

/**
 * The level-up moment, opened by useLevelUpPrompt (Home, the workout summary). It reads the
 * pending level-up ONCE: marking it shown clears it, and the screen must keep showing it.
 * - A new stage: the avatar rises in with the OLD stage's extras, then crossfades to the new
 *   ones with the proud expression (levelUpLooks), with a light tap as they appear.
 * - Reduce motion: no zoom, growth or crossfade; the final look (new extras, proud) at once.
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
  const avatarQuery = useAvatar(userId);
  // The figure is a snapshot too, so a refetch landing mid-animation can't redraw it. It's
  // taken once the avatar is known (avatarReady), not on the first render: right after
  // signing in on a phone nothing is saved yet, and a snapshot then drew lines only.
  const [looks, setLooks] = useState<LevelUpLooks | null>(null);
  if (!looks && levelUp && avatarReady(avatarQuery)) {
    setLooks(levelUpLooks(levelUp, playerLook(avatarQuery.data, profile), avatarQuery.data?.stages));
  }
  const motion = levelUpMotion(useReducedMotion());
  const reveals = !!looks?.from && motion.stage === "reveal";
  const [revealed, setRevealed] = useState(false);
  const styles = useStyles();
  const avatarHeight = levelUpAvatarHeight(useWindowDimensions().height);
  const text = levelUp ? levelUpText(levelUp) : null;

  useEffect(() => {
    if (!levelUp || !userId || !text) {
      router.back(); // opened with nothing to celebrate (e.g. already shown on another phone)
      return levelUpClosed;
    }
    // Remembered on the phone at once (never shown twice), then sent to the server.
    void celebrationSync.markShown(userId, levelUp.to);
    // One success tap as the level appears. Not motion, so it plays with reduce motion on too;
    // the phone's own haptics setting can still turn it off. Failing (web, no engine) is fine.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // After the screen's transition, or iOS may drop the announcement.
    const timer = setTimeout(() => AccessibilityInfo.announceForAccessibility(text.announcement), 600);
    return () => {
      clearTimeout(timer);
      levelUpClosed();
    };
    // Runs once: levelUp is a snapshot taken on the first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The new stage's extras appear once the figure has risen into place (timed from when it's drawn).
  useEffect(() => {
    if (!reveals) return;
    const reveal = setTimeout(() => {
      setRevealed(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }, STAGE_REVEAL_DELAY_MS);
    return () => clearTimeout(reveal);
  }, [reveals]);

  if (!levelUp || !text) return null;
  const showFinal = revealed || !reveals;
  const box = { width: avatarWidthFor(avatarHeight), height: avatarHeight };

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

        {/* Decoration: the headline already says everything. Its box is kept while the avatar loads. */}
        {!looks ? <View style={box} /> : null}
        {looks ? (
          <Animated.View
            entering={motion.avatar === "grow" ? FadeInUp.delay(250).springify().damping(16) : undefined}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.avatar}
          >
            {/* Two layers in one box: the old look fades out as the new one fades in. */}
            <View style={box}>
              {!showFinal && looks.from ? (
                <Animated.View exiting={FadeOut.duration(STAGE_REVEAL_FADE_MS)} style={StyleSheet.absoluteFill}>
                  <Avatar look={looks.from} height={avatarHeight} />
                </Animated.View>
              ) : null}
              {showFinal ? (
                <Animated.View
                  entering={reveals ? FadeIn.duration(STAGE_REVEAL_FADE_MS) : undefined}
                  style={StyleSheet.absoluteFill}
                >
                  <Avatar look={looks.to} height={avatarHeight} />
                </Animated.View>
              ) : null}
            </View>
          </Animated.View>
        ) : null}
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
