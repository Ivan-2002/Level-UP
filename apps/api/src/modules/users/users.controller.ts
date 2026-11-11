import type { Request, Response } from "express";
import type { CreateProfileInput, RecordBodyweightInput } from "@levelup/shared";
import * as usersService from "./users.service.js";

// Controllers translate HTTP <-> service calls, and nothing else:
// read who is asking and what they sent, call the service, send the result.
// No business rules here. By the time a controller runs, requireAuth has set
// req.session and validateBody has already checked req.body.
// Express 5 forwards errors thrown in async handlers to the error handler automatically.

export function getMe(req: Request, res: Response) {
  const { user } = req.session!;
  res.json({ id: user.id, email: user.email, name: user.name });
}

export async function getProfile(req: Request, res: Response) {
  const profile = await usersService.getProfile(req.session!.user.id);
  res.json(profile);
}

export async function createProfile(req: Request<object, unknown, CreateProfileInput>, res: Response) {
  const profile = await usersService.createProfile(req.session!.user.id, req.body);
  res.status(201).json(profile); // 201 Created: a new resource now exists
}

export async function recordBodyweight(req: Request<object, unknown, RecordBodyweightInput>, res: Response) {
  const entry = await usersService.recordBodyweight(req.session!.user.id, req.body);
  res.json(entry); // 200, not 201: recording the same day again updates that day's entry
}
