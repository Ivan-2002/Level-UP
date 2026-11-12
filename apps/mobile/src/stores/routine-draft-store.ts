import type { Exercise } from "@levelup/shared";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { addExercises, emptyDraft, type RoutineDraft } from "@/features/routines/routine-draft";

// The routine open in the builder. A store (not component state) because the Add
// exercise sheet is a separate screen that must add to it: Expo Router has no
// "return a value from a modal", so the two screens share this.
//
// Kept in memory only, unlike the active workout: losing a half-built routine when the
// app is killed costs a minute, and a saved draft would need "resume or discard?" UI.

type State = {
  draft: RoutineDraft;
  /** What the builder opened with: leaving with a different draft asks first. */
  original: RoutineDraft;
  /** Which routine the draft is for: "new", a routine id, or null before the first one. */
  draftFor: string | null;
  begin: (draft: RoutineDraft, draftFor?: string) => void;
  change: (update: (draft: RoutineDraft) => RoutineDraft) => void;
  addExercises: (exercises: Exercise[]) => void;
};

let keyCounter = 0;
const newKey = () => `draft-${++keyCounter}`;

export const routineDraftStore = createStore<State>()((set) => ({
  draft: emptyDraft(),
  original: emptyDraft(),
  draftFor: null,
  // Without draftFor, keeps the current one (e.g. "saved: reset what counts as unchanged").
  begin: (draft, draftFor) => set((s) => ({ draft, original: draft, draftFor: draftFor ?? s.draftFor })),
  change: (update) => set((s) => ({ draft: update(s.draft) })),
  addExercises: (exercises) => set((s) => ({ draft: addExercises(s.draft, exercises, newKey) })),
}));

export const newDraftKey = newKey;
export const useRoutineDraft = <T>(selector: (state: State) => T) => useStore(routineDraftStore, selector);
