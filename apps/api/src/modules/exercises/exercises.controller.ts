import type { Request, Response } from "express";
import type { ExerciseList } from "@levelup/shared";
import * as exercisesService from "./exercises.service.js";

export async function listExercises(req: Request, res: Response) {
  const items = await exercisesService.listExercises(req.session!.user.id);
  // Wrapped in { items } (not a bare array) so fields like a cursor can be added later
  // without breaking the app.
  res.json({ items } satisfies ExerciseList);
}
