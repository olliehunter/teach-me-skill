/**
 * Lesson transport — pure step logic.
 *
 * These functions are pure (no side-effects) so they can be unit-tested
 * without any DOM or Svelte infrastructure.  The Svelte transport controller
 * (LessonPlayer.svelte) calls them and acts on the result.
 *
 * Beat-type dispatch note: auto-advance (via `autoAdvance`) is only wired up
 * for narration beats (audio.ended fires it).  Quiz/contested beats do NOT
 * auto-advance — the learner presses Next after interacting.
 */

// ---------------------------------------------------------------------------
// Step result discriminated union
// ---------------------------------------------------------------------------

export type StepResult =
  | { action: "goto"; index: number }
  | { action: "back_to_course" }
  | { action: "lesson_completed" };

// ---------------------------------------------------------------------------
// Step functions (back / next / auto-advance)
// ---------------------------------------------------------------------------

/**
 * "Back" button at `currentIndex`:
 *   - index 0 → back_to_course
 *   - otherwise → go to previous beat
 */
export function stepBack(currentIndex: number): StepResult {
  if (currentIndex <= 0) return { action: "back_to_course" };
  return { action: "goto", index: currentIndex - 1 };
}

/**
 * "Next" button / auto-advance at `currentIndex`:
 *   - last beat (currentIndex === totalBeats - 1) → lesson_completed
 *   - otherwise → go to next beat
 */
export function stepNext(currentIndex: number, totalBeats: number): StepResult {
  if (currentIndex >= totalBeats - 1) return { action: "lesson_completed" };
  return { action: "goto", index: currentIndex + 1 };
}

/**
 * Clamp an initial beat index to valid range [0, totalBeats - 1].
 * Used when resuming to ensure the stored index is still within bounds.
 */
export function clampBeatIndex(index: number, totalBeats: number): number {
  if (totalBeats <= 0) return 0;
  return Math.max(0, Math.min(index, totalBeats - 1));
}
