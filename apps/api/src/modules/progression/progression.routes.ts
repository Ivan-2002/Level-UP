import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth.js";
import * as controller from "./progression.controller.js";

// The progression module's routes. Modules own data and rules, not URL prefixes: the avatar's
// development is a rule over the XP ledger, which this module owns, so it serves /avatar.
export const progressionRouter = Router();

// Everything the avatar is drawn from (stage, development per body part, stamina), as of
// the player's local today. 404 ProfileNotFound without a character.
progressionRouter.get("/avatar", requireAuth, controller.getAvatar);
