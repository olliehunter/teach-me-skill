/**
 * Contested beat — pure playback logic.
 *
 * Contains NO Tauri, DOM, or Svelte imports so it is fully headless-testable.
 *
 * Playback sequence (DECISIONS.md §2):
 *   1. audio_intro  (if present)
 *   2. position[0].audio
 *   3. position[1].audio
 *   … (all positions in order)
 *   4. DONE — playback stops; onBeatComplete is NEVER called (manual Next only)
 *
 * The sequence is a flat array of PlaybackStep values.  The UI walks through
 * them one at a time, playing each audio file and advancing to the next step
 * when it ends.  The final step is always { kind: "done" } which is a sentinel
 * meaning "stop; wait for the learner to press Next."
 */

import type { ContestedBeat } from "./types.js";
import { resolveCitations } from "./citations.js";
import type { Source } from "./types.js";

// ---------------------------------------------------------------------------
// Playback step types
// ---------------------------------------------------------------------------

export type PlaybackStep =
  | { kind: "intro"; audioPath: string }
  | { kind: "position"; positionIndex: number; audioPath: string }
  | { kind: "done" };

// ---------------------------------------------------------------------------
// Sequence builder
// ---------------------------------------------------------------------------

/**
 * Build the ordered playback sequence for a contested beat.
 *
 * The sequence always ends with { kind: "done" }, which signals that playback
 * has stopped and the learner must press Next manually.
 *
 * Positions with no `audio` field are skipped (the text is still displayed).
 */
export function buildPlaybackSequence(beat: ContestedBeat): PlaybackStep[] {
  const steps: PlaybackStep[] = [];

  if (beat.audio_intro) {
    steps.push({ kind: "intro", audioPath: beat.audio_intro });
  }

  for (let i = 0; i < beat.positions.length; i++) {
    const pos = beat.positions[i];
    if (pos.audio) {
      steps.push({ kind: "position", positionIndex: i, audioPath: pos.audio });
    }
  }

  // Sentinel: playback finished — manual Next required.
  steps.push({ kind: "done" });
  return steps;
}

// ---------------------------------------------------------------------------
// Step helpers
// ---------------------------------------------------------------------------

/**
 * Advance to the next step index.
 *
 * Clamps at the last index (the "done" sentinel) so callers can never go
 * past the end of the sequence.
 */
export function advanceStep(steps: PlaybackStep[], currentIndex: number): number {
  return Math.min(currentIndex + 1, steps.length - 1);
}

/**
 * Return the position index that is currently playing, or null if the
 * current step is the intro or the done sentinel.
 *
 * Used by the UI to highlight the active position card.
 */
export function activePositionIndex(
  steps: PlaybackStep[],
  stepIndex: number,
): number | null {
  const step = steps[stepIndex];
  if (!step || step.kind !== "position") return null;
  return step.positionIndex;
}

/**
 * Return true iff the current step is the "done" sentinel, meaning playback
 * has finished and the learner is waiting to press Next.
 *
 * The caller must NEVER call onBeatComplete when this returns true; manual
 * navigation only.
 */
export function isPlaybackDone(steps: PlaybackStep[], stepIndex: number): boolean {
  const step = steps[stepIndex];
  return step?.kind === "done";
}

// ---------------------------------------------------------------------------
// Per-position citation resolution
// ---------------------------------------------------------------------------

/**
 * Resolve citations for a specific position by index.
 *
 * Delegates to the shared resolveCitations helper so the UI gets the full
 * Source objects for each position's citation chips.
 */
export function resolvePositionCitations(
  beat: ContestedBeat,
  positionIndex: number,
  sources: Source[],
): Source[] {
  const position = beat.positions[positionIndex];
  if (!position) return [];
  return resolveCitations(position.citations, sources);
}
