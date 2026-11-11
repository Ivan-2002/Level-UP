import type { Request, Response } from "express";
import type { CreateExerciseInput, Exercise, ExerciseList, ListExercisesQuery } from "@levelup/shared";
import * as exercisesService from "./exercises.service.js";

export async function listExercises(req: Request, res: Response<ExerciseList, { query: ListExercisesQuery }>) {
  const items = await exercisesService.listExercises(req.session!.user.id, res.locals.query);
  // Wrapped in { items } (not a bare array) so fields like a cursor can be added later
  // without breaking the app.
  res.json({ items });
}

export async function createExercise(req: Request<object, unknown, CreateExerciseInput>, res: Response<Exercise>) {
  const exercise = await exercisesService.createCustomExercise(req.session!.user.id, req.body);
  res.status(201).json(exercise);
}
