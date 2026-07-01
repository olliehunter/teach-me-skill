/**
 * Tests for quiz.ts — pure quiz-beat logic.
 * Covers: grading, event shape, and state-machine transitions.
 * No DOM, no audio, no Tauri.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  gradeAnswer,
  buildQuizAnswerEvent,
  nextQuizPhase,
  selectQuizFeedback,
} from "./quiz.js";
import type { QuizBeat } from "./types.js";

// ---------------------------------------------------------------------------
// Fixture beat (mirrors .docs/fixtures/example-course/lessons/0001-…json b4)
// ---------------------------------------------------------------------------

const FIXTURE_BEAT: QuizBeat = {
  id: "b4",
  type: "quiz",
  format: "single_choice",
  narration_intro: "Quick check before we move on.",
  audio_intro: "assets/audio/0001-b4-intro.wav",
  prompt: "Why don't rate changes move prices straight away?",
  options: [
    { id: "a", text: "Loans, wages and prices all adjust only gradually" },
    { id: "b", text: "Banks are legally required to wait a fixed period" },
    { id: "c", text: "Prices are reset by the government once each year" },
  ],
  answer: "a",
  correct_feedback:
    "Right. Because contracts, loans, wages and prices adjust slowly, the full effect arrives only after long and variable lags.",
  audio_correct: "assets/audio/0001-b4-correct.wav",
  incorrect_feedback:
    "Not quite. The answer is that loans, wages and prices all adjust only gradually, so the full effect of a rate change lands only after long and variable lags.",
  audio_incorrect: "assets/audio/0001-b4-incorrect.wav",
  citations: ["s1"],
};

// ---------------------------------------------------------------------------
// gradeAnswer
// ---------------------------------------------------------------------------

describe("gradeAnswer", () => {
  it("returns true when chosen matches the beat answer", () => {
    expect(gradeAnswer(FIXTURE_BEAT, "a")).toBe(true);
  });

  it("returns false when chosen does not match the beat answer", () => {
    expect(gradeAnswer(FIXTURE_BEAT, "b")).toBe(false);
    expect(gradeAnswer(FIXTURE_BEAT, "c")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(gradeAnswer(FIXTURE_BEAT, "")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(gradeAnswer(FIXTURE_BEAT, "A")).toBe(false);
  });

  it("works with true_false format beats", () => {
    const tfBeat: QuizBeat = {
      ...FIXTURE_BEAT,
      format: "true_false",
      options: [
        { id: "true", text: "True" },
        { id: "false", text: "False" },
      ],
      answer: "true",
    };
    expect(gradeAnswer(tfBeat, "true")).toBe(true);
    expect(gradeAnswer(tfBeat, "false")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildQuizAnswerEvent
// ---------------------------------------------------------------------------

describe("buildQuizAnswerEvent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("produces the correct shape for a right answer", () => {
    const evt = buildQuizAnswerEvent("0001", "b4", "a", true);
    expect(evt).toEqual({
      ts: "2026-07-01T12:00:00.000Z",
      lesson: "0001",
      beat: "b4",
      event: "quiz_answer",
      chosen: "a",
      correct: true,
    });
  });

  it("produces the correct shape for a wrong answer", () => {
    const evt = buildQuizAnswerEvent("0001", "b4", "b", false);
    expect(evt).toEqual({
      ts: "2026-07-01T12:00:00.000Z",
      lesson: "0001",
      beat: "b4",
      event: "quiz_answer",
      chosen: "b",
      correct: false,
    });
  });

  it("ts is a valid ISO-8601 string", () => {
    const evt = buildQuizAnswerEvent("0001", "b4", "a", true);
    expect(() => new Date(evt.ts)).not.toThrow();
    expect(new Date(evt.ts).toISOString()).toBe(evt.ts);
  });

  it("event field is always 'quiz_answer'", () => {
    const evt = buildQuizAnswerEvent("0001", "b4", "c", false);
    expect(evt.event).toBe("quiz_answer");
  });
});

// ---------------------------------------------------------------------------
// nextQuizPhase — state machine transitions
// ---------------------------------------------------------------------------

describe("nextQuizPhase", () => {
  it("intro → awaiting on intro_ended", () => {
    expect(nextQuizPhase("intro", "intro_ended")).toBe("awaiting");
  });

  it("awaiting → revealed on answer_submitted", () => {
    expect(nextQuizPhase("awaiting", "answer_submitted")).toBe("revealed");
  });

  it("revealed → complete on feedback_ended", () => {
    expect(nextQuizPhase("revealed", "feedback_ended")).toBe("complete");
  });

  it("intro is unchanged by answer_submitted (guard)", () => {
    expect(nextQuizPhase("intro", "answer_submitted")).toBe("intro");
  });

  it("intro is unchanged by feedback_ended (guard)", () => {
    expect(nextQuizPhase("intro", "feedback_ended")).toBe("intro");
  });

  it("awaiting is unchanged by intro_ended (guard — double-fire)", () => {
    expect(nextQuizPhase("awaiting", "intro_ended")).toBe("awaiting");
  });

  it("revealed is unchanged by intro_ended (guard)", () => {
    expect(nextQuizPhase("revealed", "intro_ended")).toBe("revealed");
  });

  it("revealed is unchanged by answer_submitted (guard — prevent re-grading)", () => {
    expect(nextQuizPhase("revealed", "answer_submitted")).toBe("revealed");
  });

  it("complete is unchanged by any action", () => {
    expect(nextQuizPhase("complete", "intro_ended")).toBe("complete");
    expect(nextQuizPhase("complete", "answer_submitted")).toBe("complete");
    expect(nextQuizPhase("complete", "feedback_ended")).toBe("complete");
  });
});

// ---------------------------------------------------------------------------
// selectQuizFeedback — correct vs incorrect path
// ---------------------------------------------------------------------------

describe("selectQuizFeedback", () => {
  it("returns the correct clip + text on a right answer", () => {
    expect(selectQuizFeedback(FIXTURE_BEAT, true)).toEqual({
      text: FIXTURE_BEAT.correct_feedback,
      audio: "assets/audio/0001-b4-correct.wav",
    });
  });

  it("returns the incorrect clip + text on a wrong answer", () => {
    expect(selectQuizFeedback(FIXTURE_BEAT, false)).toEqual({
      text: FIXTURE_BEAT.incorrect_feedback,
      audio: "assets/audio/0001-b4-incorrect.wav",
    });
  });

  it("the incorrect path is distinct from the correct path (real teaching moment)", () => {
    const right = selectQuizFeedback(FIXTURE_BEAT, true);
    const wrong = selectQuizFeedback(FIXTURE_BEAT, false);
    expect(wrong.audio).not.toBe(right.audio);
    expect(wrong.text).not.toBe(right.text);
  });

  it("falls back to the pre-split explanation/audio_explanation for older courses", () => {
    // A course authored before the split has only explanation/audio_explanation.
    const legacy = {
      ...FIXTURE_BEAT,
      correct_feedback: undefined,
      audio_correct: undefined,
      incorrect_feedback: undefined,
      audio_incorrect: undefined,
      explanation: "Legacy single explanation.",
      audio_explanation: "assets/audio/0001-b4-explain.wav",
    } as unknown as QuizBeat;
    expect(selectQuizFeedback(legacy, true)).toEqual({
      text: "Legacy single explanation.",
      audio: "assets/audio/0001-b4-explain.wav",
    });
    expect(selectQuizFeedback(legacy, false)).toEqual({
      text: "Legacy single explanation.",
      audio: "assets/audio/0001-b4-explain.wav",
    });
  });

  it("resolves to empty strings when no feedback fields are present (no crash)", () => {
    const bare = {
      ...FIXTURE_BEAT,
      correct_feedback: undefined,
      audio_correct: undefined,
      incorrect_feedback: undefined,
      audio_incorrect: undefined,
    } as unknown as QuizBeat;
    expect(selectQuizFeedback(bare, true)).toEqual({ text: "", audio: "" });
    expect(selectQuizFeedback(bare, false)).toEqual({ text: "", audio: "" });
  });
});

// ---------------------------------------------------------------------------
// Integration: grade + event construction mirror each other
// ---------------------------------------------------------------------------

describe("gradeAnswer + buildQuizAnswerEvent integration", () => {
  it("correct flag in event matches gradeAnswer result for correct answer", () => {
    const chosen = "a";
    const correct = gradeAnswer(FIXTURE_BEAT, chosen);
    const evt = buildQuizAnswerEvent("0001", FIXTURE_BEAT.id, chosen, correct);
    expect(evt.correct).toBe(true);
    expect(evt.chosen).toBe(chosen);
  });

  it("correct flag in event matches gradeAnswer result for wrong answer", () => {
    const chosen = "c";
    const correct = gradeAnswer(FIXTURE_BEAT, chosen);
    const evt = buildQuizAnswerEvent("0001", FIXTURE_BEAT.id, chosen, correct);
    expect(evt.correct).toBe(false);
    expect(evt.chosen).toBe(chosen);
  });
});
