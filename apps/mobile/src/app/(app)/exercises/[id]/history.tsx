import { useLocalSearchParams } from "expo-router";
import { ExerciseHistoryScreen } from "@/features/workouts/ExerciseHistoryScreen";

export default function ExerciseHistory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExerciseHistoryScreen exerciseId={id} />;
}
