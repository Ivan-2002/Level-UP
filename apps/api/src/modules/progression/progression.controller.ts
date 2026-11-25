import type { Request, Response } from "express";
import * as developmentService from "./development.service.js";

// Controllers translate HTTP <-> service calls, and nothing else (see users.controller).

export async function getAvatar(req: Request, res: Response) {
  res.json(await developmentService.avatarOf(req.session!.user.id));
}
