import { useLocalSearchParams } from "expo-router";
import { RoutineDetailScreen } from "@/features/routines/RoutineDetailScreen";

export default function RoutineDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RoutineDetailScreen routineId={id} />;
}
