import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth, type Session } from "../lib/auth.js";

// Tell TypeScript that, after this middleware, req.session exists.
declare global {
  namespace Express {
    interface Request {
      session?: Session;
    }
  }
}

// Put this in front of any route that needs a logged-in user.
// It reads the session from the request; no valid session = 401 Unauthorized.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) {
    res.status(401).json({ error: "Unauthorized", message: "Please sign in." });
    return;
  }
  req.session = session;
  next();
}
