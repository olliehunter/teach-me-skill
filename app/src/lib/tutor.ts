/**
 * tutor.ts — Pure logic for the tutor box.
 *
 * Keeps all testable state-machine transitions and request-body builders
 * isolated from Svelte reactivity and DOM so Vitest can cover them headlessly.
 *
 * Covers:
 *   - TutorState type + reducer
 *   - buildTutorRequest() — constructs the /tutor POST body
 *   - buildSpeakRequestFromVoice() — constructs the /speak POST body from course.voice
 *   - buildTutorProgressEvent() — builds the tutor_question progress event object
 *   - resolveUsedSources() — maps used_sources ids → Source[]  (reuses citations logic)
 */

import { resolveCitations } from "./citations.js";
import { buildEvent } from "./progressWriter.js";
import type { Source, VoiceConfig, TutorQuestionEvent } from "./types.js";
import type { SpeakRequest } from "./sidecar.js";

// ---------------------------------------------------------------------------
// Tutor state machine
// ---------------------------------------------------------------------------

/** All states the tutor box can be in. */
export type TutorState =
  | { status: "warming" }           // /health not yet ok
  | { status: "ready" }             // health ok, no answer loaded
  | { status: "in_flight" }         // POST /tutor in progress
  | { status: "no_key" }            // /tutor responded with no_key=true
  | { status: "error"; message: string }  // network/HTTP error
  | {
      status: "answered";
      answerText: string;
      usedSources: Source[];
    };

/** Events that drive the state machine. */
export type TutorEvent =
  | { type: "HEALTH_OK" }
  | { type: "HEALTH_TIMEOUT" }
  | { type: "SUBMIT" }
  | { type: "ANSWER"; answerText: string; usedSources: Source[] }
  | { type: "NO_KEY" }
  | { type: "ERROR"; message: string }
  | { type: "RESET" };              // clear answer, go back to ready

/**
 * Pure reducer for the tutor state machine.
 * Returns the next state given the current state + event.
 * Invalid transitions are no-ops (return the same state).
 */
export function tutorReducer(state: TutorState, event: TutorEvent): TutorState {
  switch (event.type) {
    case "HEALTH_OK":
      if (state.status === "warming") return { status: "ready" };
      return state;

    case "HEALTH_TIMEOUT":
      if (state.status === "warming") return { status: "error", message: "Tutor unavailable" };
      return state;

    case "SUBMIT":
      if (state.status === "ready" || state.status === "answered") {
        return { status: "in_flight" };
      }
      return state;

    case "ANSWER":
      if (state.status === "in_flight") {
        return {
          status: "answered",
          answerText: event.answerText,
          usedSources: event.usedSources,
        };
      }
      return state;

    case "NO_KEY":
      if (state.status === "in_flight") return { status: "no_key" };
      return state;

    case "ERROR":
      if (state.status === "in_flight") {
        return { status: "error", message: event.message };
      }
      return state;

    case "RESET":
      if (
        state.status === "answered" ||
        state.status === "error" ||
        state.status === "no_key"
      ) {
        return { status: "ready" };
      }
      return state;
  }
}

// ---------------------------------------------------------------------------
// Request body builders
// ---------------------------------------------------------------------------

export interface TutorRequestBody {
  question: string;
  workspace_path: string;
  lesson_id: string;
  beat_id?: string;
}

/**
 * Build the POST /tutor request body.
 */
export function buildTutorRequest(
  question: string,
  workspacePath: string,
  lessonId: string,
  beatId?: string,
): TutorRequestBody {
  const body: TutorRequestBody = {
    question,
    workspace_path: workspacePath,
    lesson_id: lessonId,
  };
  if (beatId) body.beat_id = beatId;
  return body;
}

/**
 * Build the POST /speak request body from answer text + course voice config.
 */
export function buildSpeakRequestFromVoice(
  answerText: string,
  voice: VoiceConfig,
): SpeakRequest {
  return {
    text: answerText,
    voice: voice.voice,
    lang_code: voice.lang_code,
    speed: voice.speed,
  };
}

// ---------------------------------------------------------------------------
// Progress event builder
// ---------------------------------------------------------------------------

/**
 * Build a tutor_question progress event.
 * beat is optional — on the course screen there may be no active beat.
 */
export function buildTutorQuestionEvent(
  lessonId: string,
  question: string,
  beatId?: string,
): TutorQuestionEvent {
  return buildEvent({
    lesson: lessonId,
    ...(beatId ? { beat: beatId } : {}),
    event: "tutor_question",
    text: question,
  }) as TutorQuestionEvent;
}

// ---------------------------------------------------------------------------
// Source resolution for used_sources
// ---------------------------------------------------------------------------

/**
 * Resolve a list of source IDs returned by /tutor into full Source objects.
 * Unknown IDs are silently skipped (same behaviour as resolveCitations).
 */
export function resolveUsedSources(
  usedSourceIds: string[],
  lessonSources: Source[],
): Source[] {
  return resolveCitations(usedSourceIds, lessonSources);
}
