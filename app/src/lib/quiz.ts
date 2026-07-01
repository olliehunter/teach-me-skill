/**
 * quiz.ts — pure logic for quiz beat grading and event building.
 *
 * Deliberately free of Svelte/Tauri/DOM so all functions are headlessly
 * testable with Vitest.  The QuizBeatView component calls these helpers;
 * it does not inline the logic itself.
 *
 * State machine phases (for use in QuizBeatView state):
 *   "intro"    — audio_intro is playing; options shown but submit disabled.
 *   "awaiting" — intro finished; learner can select an option and submit.
 *   "revealed" — answer submitted; correctness shown; audio_explanation plays.
 *   "complete" — audio_explanation ended; onBeatComplete will be called.
 */

import type { QuizBeat, QuizAnswerEvent } from "./types.js";

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export type QuizPhase = "intro" | "awaiting" | "revealed" | "complete";

/**
 * Returns the next phase after a given action in the quiz state machine.
 *
 * Actions:
 *   "intro_ended"       — audio_intro finished → move to awaiting.
 *   "answer_submitted"  — learner submitted an answer → move to revealed.
 *   "explanation_ended" — audio_explanation finished → move to complete.
 */
export function nextQuizPhase(
  current: QuizPhase,
  action: "intro_ended" | "answer_submitted" | "explanation_ended",
): QuizPhase {
  if (current === "intro" && action === "intro_ended") return "awaiting";
  if (current === "awaiting" && action === "answer_submitted") return "revealed";
  if (current === "revealed" && action === "explanation_ended") return "complete";
  // All other combinations are no-ops (guard against double-fires).
  return current;
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

/**
 * Grade a single-option answer.
 * Works for single_choice and true_false formats (one answer id).
 * For multi_choice pass the canonical sorted string of chosen ids if needed —
 * but v1 fixture only uses single_choice, so this stays simple.
 */
export function gradeAnswer(beat: QuizBeat, chosen: string): boolean {
  return chosen === beat.answer;
}

// ---------------------------------------------------------------------------
// Event building
// ---------------------------------------------------------------------------

/**
 * Build a typed quiz_answer progress event.
 * Stamped with a fresh ISO-8601 timestamp.
 */
export function buildQuizAnswerEvent(
  lessonId: string,
  beatId: string,
  chosen: string,
  correct: boolean,
): QuizAnswerEvent {
  return {
    ts: new Date().toISOString(),
    lesson: lessonId,
    beat: beatId,
    event: "quiz_answer",
    chosen,
    correct,
  };
}
