import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth.js";

// GET /me: "who am I?" The first protected route, used to prove auth works end to end.
// Profile endpoints (create character, update weekly target) come next.
export const usersRouter = Router();

usersRouter.get("/me", requireAuth, (req, res) => {
  const { user } = req.session!;
  res.json({ id: user.id, email: user.email, name: user.name });
});
