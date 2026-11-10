import type { Request, Response } from "express";
import type { FinishWorkoutInput, ListWorkoutsQuery, WorkoutDetail, WorkoutPage } from "@levelup/shared";
import * as workoutsService from "./workouts.service.js";

// HTTP in, HTTP out. By the time these run, requireAuth has set req.session and the
// validation middleware has checked the body / query.

export async function finishWorkout(req: Request<object, unknown, FinishWorkoutInput>, res: Response) {
  const { workout, created } = await workoutsService.finishWorkout(req.session!.user.id, req.body);
  // The service says WHETHER something new was created; choosing the status code is HTTP's job.
  // 201 Created: saved now. 200 OK: this clientId was already saved (a retry); nothing new.
  res.status(created ? 201 : 200).json(workout satisfies WorkoutDetail);
}

// The second Response type parameter types res.locals, filled in by validateQuery.
export async function listWorkouts(req: Request, res: Response<WorkoutPage, { query: ListWorkoutsQuery }>) {
  const page = await workoutsService.listWorkouts(req.session!.user.id, res.locals.query);
  res.json(page);
}

export async function getWorkout(req: Request<{ id: string }>, res: Response<WorkoutDetail>) {
  const workout = await workoutsService.getWorkout(req.session!.user.id, req.params.id);
  res.json(workout);
}
