import type { Request, Response } from "express";

// Runs only when no route matched the request.
export function notFound(req: Request, res: Response) {
  res.status(404).json({ error: "NotFound", message: `No route for ${req.method} ${req.path}` });
}
