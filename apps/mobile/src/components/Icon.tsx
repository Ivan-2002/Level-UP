import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react-native";
// One import per icon (not `import { Check } from "lucide-react-native"`): the package's
// index pulls in all ~1,500 icons, and Metro can't reliably drop the unused ones.
import Award from "lucide-react-native/icons/award";
import Check from "lucide-react-native/icons/check";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import ChevronUp from "lucide-react-native/icons/chevron-up";
import Dumbbell from "lucide-react-native/icons/dumbbell";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import History from "lucide-react-native/icons/history";
import House from "lucide-react-native/icons/house";
import ListChecks from "lucide-react-native/icons/list-checks";
import Minus from "lucide-react-native/icons/minus";
import Pause from "lucide-react-native/icons/pause";
import Pencil from "lucide-react-native/icons/pencil";
import Play from "lucide-react-native/icons/play";
import Plus from "lucide-react-native/icons/plus";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import RotateCcw from "lucide-react-native/icons/rotate-ccw";
import Search from "lucide-react-native/icons/search";
import Timer from "lucide-react-native/icons/timer";
import Trash2 from "lucide-react-native/icons/trash-2";
import TrendingUp from "lucide-react-native/icons/trending-up";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import X from "lucide-react-native/icons/x";
import Zap from "lucide-react-native/icons/zap";
import { useTheme } from "@/theme/use-theme";
import { ICON_STROKE } from "@/theme/tokens";

// Names describe what the icon MEANS in this app, not what it draws, so swapping a
// drawing later is a one-line change here and no screen imports Lucide directly.
const icons = {
  alert: TriangleAlert,
  back: ChevronLeft,
  check: Check,
  close: X,
  coach: TrendingUp,
  delete: Trash2,
  down: ChevronDown,
  dumbbell: Dumbbell,
  edit: Pencil,
  forward: ChevronRight,
  history: History,
  home: House,
  minus: Minus,
  more: Ellipsis,
  pause: Pause,
  play: Play,
  plus: Plus,
  pr: Award,
  reset: RotateCcw,
  routines: ListChecks,
  search: Search,
  sync: RefreshCw,
  timer: Timer,
  up: ChevronUp,
  xp: Zap,
} satisfies Record<string, ComponentType<LucideProps>>;

export type IconName = keyof typeof icons;

type Props = { name: IconName; size?: number; color?: string; strokeWidth?: number; fill?: string };

/**
 * A Lucide icon at the design's 1.75 stroke. Hidden from screen readers: an icon is
 * decoration, so the button or row around it carries the accessibilityLabel.
 */
export function Icon({ name, size = 20, color, strokeWidth = ICON_STROKE, fill = "none" }: Props) {
  const t = useTheme();
  const Glyph = icons[name];
  return (
    <Glyph
      size={size}
      color={color ?? t.colors.ink}
      strokeWidth={strokeWidth}
      fill={fill}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
