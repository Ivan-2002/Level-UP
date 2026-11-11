import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { BODY_PARTS, type BodyPart, type Exercise } from "@levelup/shared";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { activeWorkoutStore } from "@/stores/device-stores";
import { colors } from "@/theme/colors";
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
        <Text style={styles.title} accessibilityRole="header">
          Add exercise
        </Text>
        <Pressable onPress={() => router.back()} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Close">
          <Icon name="close" color={colors.ink} />
        </Pressable>
      </View>

      <View style={styles.searchBox}>
        <Icon name="search" size={18} color={colors.inkMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search exercises"
          placeholderTextColor={colors.inkMuted}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search exercises"
          style={styles.searchInput}
        />
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {[null, ...BODY_PARTS].map((part) => {
            const selected = part === bodyPart;
            return (
              <Pressable
                key={part ?? "all"}
                onPress={() => setBodyPart(part)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{part ? capitalise(part) : "All"}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isPending ? (
        <ActivityIndicator style={styles.centered} color={colors.purple} />
      ) : isError && !exercises ? (
        // Only when there is NO saved copy: first use, and offline.
        <View style={styles.message}>
          <Text style={styles.messageText}>
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
          ListEmptyComponent={<Text style={styles.messageText}>No exercises match.</Text>}
          ListFooterComponent={
            !isFetching && isError ? (
              <Text style={styles.offlineNote}>Offline: showing the list saved on this phone.</Text>
            ) : undefined
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => pick(item)}
              accessibilityRole="button"
              accessibilityHint="Adds it to your workout"
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            >
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemMeta}>
                {item.muscleGroup} · {item.equipment}
              </Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 12 },
  title: { color: colors.ink, fontSize: 22, fontWeight: "700" },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  searchBox: {
    marginHorizontal: 16,
    marginTop: 8,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, color: colors.ink, fontSize: 15, height: "100%" },
  chips: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "center",
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.ink, fontSize: 14, fontWeight: "500" },
  chipTextSelected: { color: colors.onPrimary },
  centered: { marginTop: 32 },
  message: { padding: 16, gap: 16 },
  messageText: { color: colors.inkMuted, fontSize: 14, textAlign: "center", padding: 16 },
  offlineNote: { color: colors.warning, fontSize: 12, textAlign: "center", paddingVertical: 12 },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
  item: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 2,
  },
  itemPressed: { opacity: 0.7 },
  itemName: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  itemMeta: { color: colors.inkMuted, fontSize: 12 },
});
