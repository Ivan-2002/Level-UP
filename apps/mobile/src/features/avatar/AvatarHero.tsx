import { View } from "react-native";
import type { Profile } from "@levelup/shared";
import { Avatar } from "@/components/Avatar";
import { Text } from "@/components/Text";
import { createStyles } from "@/theme/use-theme";
import { homeLevel } from "@/features/progress/level-card";
import { playerLook } from "./avatar-look";
import { useAvatar } from "./use-avatar";

/** Home's avatar height: the full body (the crop is for 64 px or less). */
export const HERO_AVATAR_HEIGHT = 200;

/**
 * The top of Home: the avatar, the username and the level bar as ONE element, not a Card
 * (docs/ARCHITECTURE.md, "Avatar prototype": Home was a stack of identical cards with
 * nothing leading). The level numbers are the server's confirmed ones (profile.level):
 * workouts still waiting to sync don't move them. The avatar draws from the saved copy of
 * GET /v1/avatar at once, offline too, and redraws when it refreshes.
 */
export function AvatarHero({ userId, profile }: { userId: string; profile: Profile }) {
  const { data: avatar } = useAvatar(userId);
  const styles = useStyles();
  const level = homeLevel(profile);

  return (
    <View style={styles.hero}>
      <Avatar look={playerLook(avatar, profile)} height={HERO_AVATAR_HEIGHT} stageName={profile.stage?.name} />
      <View style={styles.side}>
        <Text
          variant="display"
          accessibilityRole="header"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {profile.username}
        </Text>
        <View accessible accessibilityLabel={level.accessibilityLabel} style={styles.level}>
          <Text variant="labelStrong" tone="purple">
            {level.title}
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${level.fraction * 100}%` }]} />
          </View>
          <Text variant="caption" tone="inkMuted" tabular>
            {level.progressText}
          </Text>
        </View>
      </View>
    </View>
  );
}

const useStyles = createStyles((t) => ({
  hero: { flexDirection: "row", alignItems: "flex-end", gap: t.space[4], paddingBottom: t.space[2] },
  // The name and level sit beside the figure, level with its waist and legs.
  side: { flex: 1, minWidth: 0, gap: t.space[3], paddingBottom: t.space[6] },
  level: { gap: 6 },
  track: { height: 8, borderRadius: t.radius.pill, backgroundColor: t.colors.purpleSoft, overflow: "hidden" },
  fill: { height: 8, backgroundColor: t.colors.purple },
}));
