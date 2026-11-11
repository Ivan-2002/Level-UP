import type { Request, Response } from "express";
import type { Routine, RoutineInput, RoutineList } from "@levelup/shared";
import * as routinesService from "./routines.service.js";

type WithId = Request<{ id: string }, unknown, RoutineInput>;

export async function listRoutines(req: Request, res: Response<RoutineList>) {
  res.json({ items: await routinesService.listRoutines(req.session!.user.id) });
}

export async function getRoutine(req: Request<{ id: string }>, res: Response<Routine>) {
  res.json(await routinesService.getRoutine(req.session!.user.id, req.params.id));
}

export async function createRoutine(req: Request<object, unknown, RoutineInput>, res: Response<Routine>) {
  res.status(201).json(await routinesService.createRoutine(req.session!.user.id, req.body));
}

export async function updateRoutine(req: WithId, res: Response<Routine>) {
  res.json(await routinesService.updateRoutine(req.session!.user.id, req.params.id, req.body));
}

export async function deleteRoutine(req: Request<{ id: string }>, res: Response) {
  await routinesService.deleteRoutine(req.session!.user.id, req.params.id);
  res.status(204).end(); // 204 No Content: done, nothing to send back
}
