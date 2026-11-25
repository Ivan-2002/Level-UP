import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Avatar, CAPE_FILL_OPACITY, type AvatarLook } from "./Avatar";
import { DEFAULT_FACE } from "./avatar-face";
import { extrasShape } from "./avatar-extras";
import { drawnDevelopment } from "./avatar-growth";
import { avatarShape, limbPath, ZERO_DEVELOPMENT } from "./avatar-shape";

// The draw ORDER is the component's job (the shapes are tested in their own files): SVG
// paints later elements over earlier ones. Rendered to SVG markup with react-native-svg's
// primitives mapped to plain SVG tags.

jest.mock("react-native-svg", () => {
  const { createElement: h } = jest.requireActual("react");
  const svgProps = ({ accessibilityRole, accessibilityLabel, ...rest }: Record<string, unknown>) => rest;
  const tag = (name: string) => (props: Record<string, unknown>) => h(name, svgProps(props));
  return {
    __esModule: true,
    default: tag("svg"),
    G: tag("g"),
    Path: tag("path"),
    Circle: tag("circle"),
    Line: tag("line"),
    Polyline: tag("polyline"),
  };
});

const legend = (development: AvatarLook["development"]): AvatarLook => ({
  development,
  extras: ["wristbands", "outfit", "headband", "cape"],
  face: DEFAULT_FACE,
  stamina: 0,
});
const render = (look: AvatarLook) => renderToStaticMarkup(createElement(Avatar, { look, height: 278, scheme: "dark" }));

describe("Avatar draw order", () => {
  it("draws the cape behind the legs and arms, so it never hides them", () => {
    const development = { chest: 0.5, back: 0.5, shoulders: 0.5, arms: 0.4, core: 0.2, legs: 0.6 };
    const markup = render(legend(development));
    const shape = avatarShape(drawnDevelopment(development));
    const cape = markup.indexOf(`d="${extrasShape(shape, ["cape"]).cape}"`);
    expect(cape).toBeGreaterThan(-1);
    for (const limb of [...shape.legs, ...shape.arms]) {
      const at = markup.indexOf(`d="${limbPath(limb)}"`);
      expect(at).toBeGreaterThan(cape);
    }
  });

  it("fills the cape with purple at the cape opacity, and draws the clasp", () => {
    const markup = render(legend(ZERO_DEVELOPMENT));
    expect(markup).toContain(`fill-opacity="${CAPE_FILL_OPACITY}"`);
    expect(markup).toContain(`d="${extrasShape(avatarShape(ZERO_DEVELOPMENT), ["cape"]).clasp}"`);
  });
});
