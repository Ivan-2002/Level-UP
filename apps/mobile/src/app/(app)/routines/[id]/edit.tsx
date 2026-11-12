import { useLocalSearchParams } from "expo-router";
import { RoutineBuilderScreen } from "@/features/routines/RoutineBuilderScreen";

export default function EditRoutine() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RoutineBuilderScreen routineId={id} />;
}
