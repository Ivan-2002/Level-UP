import { useLocalSearchParams } from "expo-router";
import { AddExerciseSheet } from "@/features/exercises/AddExerciseSheet";

// ?for=workout (the workout in progress) or ?for=routine (the routine builder).
export default function AddExercise() {
  const { for: target } = useLocalSearchParams<{ for?: string }>();
  return <AddExerciseSheet target={target === "routine" ? "routine" : "workout"} />;
}
