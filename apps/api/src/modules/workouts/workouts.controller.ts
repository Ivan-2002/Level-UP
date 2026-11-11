import type { Request, Response } from "express";
import type {
  ExerciseSummary,
  ExerciseSummaryQuery,
  FinishWorkoutInput,
  FinishWorkoutResponse,
  ListWorkoutsQuery,
  RecentExerciseList,
  WorkoutDetail,
  WorkoutPage,
} from "@levelup/shared";
import * as workoutsService from "./workouts.service.js";
import * as historyService from "./exercise-history.service.js";

// HTTP in, HTTP out. By the time these run, requireAuth has set req.session and the
// validation middleware has checked the body / query.

export async function finishWorkout(req: Request<object, unknown, FinishWorkoutInput>, res: Response) {
  const { created, ...response } = await workoutsService.finishWorkout(req.session!.user.id, req.body);
  // The service says WHETHER something new was created; choosing the status code is HTTP's job.
  // 201 Created: saved now. 200 OK: this clientId was already saved (a retry); nothing new.
  // Both carry the same workout + summary, so the app can show the summary either way.
  res.status(created ? 201 : 200).json(response satisfies FinishWorkoutResponse);
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

export async function getWorkoutSummary(req: Request<{ id: string }>, res: Response<FinishWorkoutResponse>) {
  res.json(await workoutsService.getWorkoutSummary(req.session!.user.id, req.params.id));
}

export async function exerciseSummary(req: Request<{ id: string }>, res: Response<ExerciseSummary, { query: ExerciseSummaryQuery }>) {
  res.json(await historyService.exerciseSummary(req.session!.user.id, req.params.id, res.locals.query.sessions));
}

export async function recentExercises(req: Request, res: Response<RecentExerciseList>) {
  res.json(await historyService.recentExercises(req.session!.user.id));
}
