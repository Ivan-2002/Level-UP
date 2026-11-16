import { Redirect } from "expo-router";
import { UiPreviewScreen } from "@/features/dev/UiPreviewScreen";

// Development builds only: release builds have no way in, and redirect home if linked here.
export default function UiPreview() {
  return __DEV__ ? <UiPreviewScreen /> : <Redirect href="/" />;
}
