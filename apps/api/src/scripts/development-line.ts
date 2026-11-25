import { BODY_PARTS, type DevelopmentValues } from "@levelup/shared";

/**
 * The line dev:grant-xp prints after a grant, e.g. "Development today: chest 0, back 0, ...,
 * legs 0.56": every body part in BODY_PARTS order, to 2 decimals (what a phone check
 * compares against). The values are GET /v1/avatar's, from the same service call.
 */
export function developmentLine(development: DevelopmentValues): string {
  const parts = BODY_PARTS.map((part) => `${part} ${Number(development[part].toFixed(2))}`);
  return `Development today: ${parts.join(", ")}`;
}
