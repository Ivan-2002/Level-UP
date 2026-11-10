import { Router } from "express";
import { createProfileSchema } from "@levelup/shared";
import { requireAuth } from "../../middleware/require-auth.js";
import { validateBody } from "../../middleware/validate.js";
import * as controller from "./users.controller.js";

// The users module: the signed-in user and their game profile ("character").
// Routes only wire URL + method -> middleware -> controller. Reading this file
// tells you the whole public surface of the module and what guards each route.
export const usersRouter = Router();

usersRouter.get("/me", requireAuth, controller.getMe);

usersRouter.get("/profile", requireAuth, controller.getProfile);
usersRouter.post("/profile", requireAuth, validateBody(createProfileSchema), controller.createProfile);
