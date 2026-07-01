/**
 * quiz.ts — pure logic for quiz beat grading, feedback selection, and event
 * building.
 *
 * Deliberately free of Svelte/Tauri/DOM so all functions are headlessly
 * testable with Vitest.  The QuizBeatView component calls these helpers;
 * it does not inline the logic itself.
 *
 * State machine phases (for use in QuizBeatView state):
 *   "intro"    — audio_intro is playing; options shown but submit disabled.
 *   "awaiting" — intro finished; learner can select an option and submit.
 *   "revealed" — answer submitted; correctness shown; the matching feedback
 *                clip plays (audio_correct on a right answer, audio_incorrect
 *                on a wrong one).
 *   "complete" — feedback audio ended; onBeatComplete will be called.
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
 *   "intro_ended"      — audio_intro finished → move to awaiting.
 *   "answer_submitted" — learner submitted an answer → move to revealed.
 *   "feedback_ended"   — the correct/incorrect feedback clip finished → complete.
 */
export function nextQuizPhase(
  current: QuizPhase,
  action: "intro_ended" | "answer_submitted" | "feedback_ended",
): QuizPhase {
  if (current === "intro" && action === "intro_ended") return "awaiting";
  if (current === "awaiting" && action === "answer_submitted") return "revealed";
  if (current === "revealed" && action === "feedback_ended") return "complete";
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
// Feedback selection (correct vs incorrect path)
// ---------------------------------------------------------------------------

export interface QuizFeedback {
  /** Lightly-formatted feedback text to show under the options. */
  text: string;
  /** Workspace-relative path to the pre-rendered feedback clip to play. */
  audio: string;
}

/**
 * Pick the feedback text + audio clip for the graded result.
 *
 * New schema: the player plays `audio_correct`/`correct_feedback` when the
 * learner picks the answer, and `audio_incorrect`/`incorrect_feedback` for any
 * wrong choice — the incorrect clip is the real teaching moment (it names and
 * justifies the right answer).
 *
 * Back-compat: if a course still uses the pre-split `explanation`/
 * `audio_explanation` fields, fall back to those so older workspaces keep
 * playing.  Missing fields resolve to "" (the view then simply plays nothing
 * and shows no text, rather than crashing).
 */
export function selectQuizFeedback(beat: QuizBeat, correct: boolean): QuizFeedback {
  if (correct) {
    return {
      text: beat.correct_feedback ?? beat.explanation ?? "",
      audio: beat.audio_correct ?? beat.audio_explanation ?? "",
    };
  }
  return {
    text: beat.incorrect_feedback ?? beat.explanation ?? "",
    audio: beat.audio_incorrect ?? beat.audio_explanation ?? "",
  };
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
