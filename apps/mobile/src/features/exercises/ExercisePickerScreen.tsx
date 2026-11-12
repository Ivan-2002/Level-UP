import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { BODY_PARTS, type BodyPart, type Exercise } from "@levelup/shared";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { Icon } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { Text } from "@/components/Text";
import { activeWorkoutStore } from "@/stores/device-stores";
import { createStyles, useTheme } from "@/theme/use-theme";
import { capitalise } from "@/features/workouts/format";
import { filterExercises } from "./filter-exercises";
import { useExercises } from "./use-exercises";

// Presented as a modal from the workout screen. Picking an exercise adds it to the
// workout store, then closes: the store is how the two screens talk (Expo Router has no
// "return a value from a modal" API, and a shared store keeps it simple).
export function ExercisePickerScreen() {
  const { data: exercises, isPending, isError, error, refetch, isRefetching, isFetching } = useExercises();
  const [search, setSearch] = useState("");
  const [bodyPart, setBodyPart] = useState<BodyPart | null>(null);
  const styles = useStyles();
  const t = useTheme();

  const results = useMemo(
    () => (exercises ? filterExercises(exercises, search, bodyPart) : []),
    [exercises, search, bodyPart],
  );

  function pick(exercise: Exercise) {
    activeWorkoutStore.getState().addExercise(exercise);
    router.back();
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">
          Add exercise
        </Text>
        <IconButton icon="close" variant="plain" onPress={() => router.back()} accessibilityLabel="Close" />
      </View>

      <View style={styles.searchBox}>
        <Icon name="search" size={18} color={t.colors.inkMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search exercises"
          placeholderTextColor={t.colors.inkMuted}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search exercises"
          style={styles.searchInput}
        />
      </View>

      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          accessibilityRole="radiogroup"
          accessibilityLabel="Muscle group"
        >
          {[null, ...BODY_PARTS].map((part) => (
            <Chip
              key={part ?? "all"}
              label={part ? capitalise(part) : "All"}
              role="radio"
              selected={part === bodyPart}
              onPress={() => setBodyPart(part)}
            />
          ))}
        </ScrollView>
      </View>

      {isPending ? (
        <ActivityIndicator style={styles.centered} color={t.colors.purple} />
      ) : isError && !exercises ? (
        // Only when there is NO saved copy: first use, and offline.
        <View style={styles.message}>
          <Text tone="inkMuted" style={styles.messageText}>
            {"Couldn't load the exercise list. Connect once to save it on this phone; after that it works offline.\n\n"}
            {error.message}
          </Text>
          <Button label="Try again" onPress={() => refetch()} loading={isRefetching} />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(exercise) => exercise.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text tone="inkMuted" style={styles.messageText}>
              No exercises match.
            </Text>
          }
          ListFooterComponent={
            !isFetching && isError ? (
              <Text variant="caption" tone="warning" style={styles.offlineNote}>
                Offline: showing the list saved on this phone.
              </Text>
            ) : undefined
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => pick(item)}
              accessibilityRole="button"
              accessibilityHint="Adds it to your workout"
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            >
              <Text variant="bodyStrong">{item.name}</Text>
              <Text variant="caption" tone="inkMuted">
                {item.muscleGroup} · {item.equipment}
              </Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const useStyles = createStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: t.space[4], paddingTop: t.space[3] },
  searchBox: {
    marginHorizontal: t.space[4],
    marginTop: t.space[2],
    height: 48,
    borderRadius: t.radius.sm,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surfaceRaised,
    flexDirection: "row",
    alignItems: "center",
    gap: t.space[2],
    paddingHorizontal: 14,
  },
  searchInput: { ...t.type.body, flex: 1, color: t.colors.ink, height: "100%", paddingVertical: 0 },
  chips: { paddingHorizontal: t.space[4], paddingVertical: t.space[3], gap: t.space[2] },
  centered: { marginTop: t.space[8] },
  message: { padding: t.space[4], gap: t.space[4] },
  messageText: { textAlign: "center", padding: t.space[4] },
  offlineNote: { textAlign: "center", paddingVertical: t.space[3] },
  list: { paddingHorizontal: t.space[4], paddingBottom: t.space[8], gap: t.space[2] },
  item: {
    backgroundColor: t.colors.surface,
    borderColor: t.colors.border,
    borderWidth: 1,
    borderRadius: t.radius.md,
    paddingVertical: t.space[3],
    paddingHorizontal: 14,
    gap: 2,
  },
  itemPressed: { backgroundColor: t.colors.surfaceRaised },
}));
