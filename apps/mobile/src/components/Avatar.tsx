import Svg, { Circle, G, Line, Path, Polyline } from "react-native-svg";
import { useTheme } from "@/theme/use-theme";
import { palettes, SKIN_TONES, type ColorScheme } from "@/theme/tokens";
import { extrasShape } from "./avatar-extras";
import { curvePath, DEFAULT_FACE, faceShape, hairPath, type Expression, type Face } from "./avatar-face";
import {
  avatarShape,
  BUST_VIEWBOX,
  cropFor,
  deltoidPath,
  limbPath,
  PEC_STROKE,
  pecPath,
  strokeFor,
  torsoPath,
  VIEWBOX,
  ZERO_DEVELOPMENT,
  type Development,
  type Limb,
} from "./avatar-shape";

// The stickman avatar (docs/ARCHITECTURE.md, "Avatar prototype"). It takes the avatar
// CONTRACT, the same inputs a Rive file will take later, and never a level:
//   development  0 to 1 per body part (shape)
//   extras       the stage's extras, e.g. ["wristbands", "outfit"] (unknown ones ignored)
//   face         the player's chosen presets (identity)
//   lean         reserved for the endurance look; always 0 for now
//   expression   chosen by the app (proud on the level-up), bends the chosen face
// All geometry comes from pure functions (avatar-shape, avatar-face, avatar-extras); this
// component only draws it: lines in ink, shapes filled with the background, so a bulging
// muscle covers the line behind it.

export type AvatarLook = {
  development: Development;
  extras: readonly string[];
  face: Face;
  lean: number;
  expression?: Expression;
};

/** A new player: lines only, no extras, the default face. */
export const ROOKIE_LOOK: AvatarLook = Object.freeze({
  development: ZERO_DEVELOPMENT,
  extras: [],
  face: DEFAULT_FACE,
  lean: 0,
});

type Props = {
  look?: AvatarLook;
  /** Height in px; the width follows the drawing's proportions. */
  height?: number;
  /**
   * "bust": head and shoulders only. The default (cropFor) is "bust" at SMALL_AVATAR_HEIGHT or less
   * (leaderboard rows, about 40 px), where a full body is too small to read, and "full" above.
   */
  crop?: "full" | "bust";
  /** The stage's name, for screen readers ("Your avatar, Regular stage"). */
  stageName?: string;
  /** Draw in this theme instead of the current one (the UI preview shows both side by side). */
  scheme?: ColorScheme;
};

export function Avatar({ look = ROOKIE_LOOK, height = 140, crop, stageName, scheme }: Props) {
  const view = cropFor(height, crop);
  const current = useTheme().colors;
  const c = scheme ? palettes[scheme] : current;

  const shape = avatarShape(look.development, look.lean);
  const extras = extrasShape(shape, look.extras);
  const face = faceShape(look.face, look.expression);
  const skin = face.skinTone ? SKIN_TONES[face.skinTone] : null;

  const vbY = view === "bust" ? BUST_VIEWBOX.y : 0;
  const vbHeight = view === "bust" ? BUST_VIEWBOX.height : VIEWBOX.height;
  const width = (height * VIEWBOX.width) / vbHeight;
  const sw = strokeFor(height, vbHeight);
  const line = { stroke: c.ink, strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const outlined = { ...line, fill: c.bg };
  const featureColor = skin ? skin.feature : c.ink;
  const featureLine = { ...line, stroke: featureColor, strokeWidth: sw * 0.75 };

  // A bare limb is its bone; a muscled one is one continuous outline (no seams at the joints).
  const limb = (l: Limb, key: string) => {
    const outline = limbPath(l);
    return outline ? (
      <Path key={key} d={outline} {...outlined} />
    ) : (
      <Polyline key={key} points={l.joints.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" {...line} />
    );
  };

  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 ${vbY} ${VIEWBOX.width} ${vbHeight}`}
      accessibilityRole="image"
      accessibilityLabel={stageName ? `Your avatar, ${stageName} stage` : "Your avatar"}
    >
      {extras.cape ? (
        <Path d={extras.cape} fill={c.purpleSoft} stroke={c.purple} strokeWidth={sw} strokeLinejoin="round" />
      ) : null}

      {shape.legs.map((l, i) => limb(l, `leg${i}`))}

      <Line x1={shape.neck.from.x} y1={shape.neck.from.y} x2={shape.neck.to.x} y2={shape.neck.to.y} {...line} />
      {shape.torso.kind === "line" ? (
        <Line x1={shape.torso.from.x} y1={shape.torso.from.y} x2={shape.torso.to.x} y2={shape.torso.to.y} {...line} />
      ) : (
        <G>
          <Path d={torsoPath(shape.torso)} {...outlined} />
          {pecPath(shape.torso) ? (
            <Path d={pecPath(shape.torso)!} fill="none" {...line} strokeWidth={sw * PEC_STROKE} />
          ) : null}
        </G>
      )}

      {extras.outfit ? (
        <G>
          <Path d={extras.outfit.shorts} {...outlined} fill={c.surfaceRaised} />
          <Path d={extras.outfit.top} {...outlined} fill={c.surfaceRaised} />
        </G>
      ) : null}

      {/* Without a torso shape, the Rookie's shoulder bar. */}
      {shape.torso.kind === "line" ? (
        <Line
          x1={shape.arms[0].joints[0]!.x}
          y1={shape.arms[0].joints[0]!.y}
          x2={shape.arms[1].joints[0]!.x}
          y2={shape.arms[1].joints[0]!.y}
          {...line}
        />
      ) : null}
      {shape.arms.map((l, i) => limb(l, `arm${i}`))}
      {shape.deltoids.map((d, i) => (
        <Path key={i} d={deltoidPath(d)} {...outlined} />
      ))}
      {shape.hands.map((h, i) => (
        <Circle key={i} cx={h.cx} cy={h.cy} r={h.r} {...outlined} fill={skin ? skin.fill : c.bg} />
      ))}
      {extras.wristbands.map((d, i) => (
        <Path key={i} d={d} {...line} fill={c.ink} />
      ))}

      <Circle cx={shape.head.cx} cy={shape.head.cy} r={shape.head.r} {...outlined} fill={skin ? skin.fill : c.bg} />
      {/* Hair is the feature colour: dark on a skin tone (in both themes), ink on the outline look. */}
      {face.hair ? <Path d={hairPath(face.hair)} {...line} fill={featureColor} /> : null}
      {face.eyes.map((e, i) =>
        e.kind === "dot" ? (
          <Circle key={i} cx={e.eye.cx} cy={e.eye.cy} r={e.eye.r} fill={featureColor} />
        ) : (
          <G key={i}>
            <Circle cx={e.eye.cx} cy={e.eye.cy} r={e.eye.r} fill={skin ? skin.fill : c.bg} {...featureLine} />
            <Circle cx={e.pupil.cx} cy={e.pupil.cy} r={e.pupil.r} fill={featureColor} />
          </G>
        ),
      )}
      {face.brows.map((b, i) => (
        <Line key={i} x1={b.from.x} y1={b.from.y} x2={b.to.x} y2={b.to.y} {...featureLine} />
      ))}
      {face.mouth.kind === "grin" ? (
        <Path d={`${curvePath(face.mouth.curve)} Z`} {...featureLine} fill={c.bg} />
      ) : (
        <Path d={curvePath(face.mouth.curve)} fill="none" {...featureLine} />
      )}
      {extras.headband ? (
        <G>
          <Path d={extras.headband.band} {...line} fill={c.ink} />
          <Path d={extras.headband.knot} fill="none" {...line} />
        </G>
      ) : null}
    </Svg>
  );
}
