import { useLocalSearchParams } from "expo-router";
import { CreateExerciseScreen } from "@/features/exercises/CreateExerciseScreen";

export default function CreateExercise() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  return <CreateExerciseScreen initialName={name ?? ""} />;
}
