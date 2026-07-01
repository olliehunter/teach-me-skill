/**
 * Tests for tutor.ts pure logic:
 *   - tutorReducer state machine transitions
 *   - buildTutorRequest / buildSpeakRequestFromVoice request body construction
 *   - buildTutorQuestionEvent progress event construction
 *   - resolveUsedSources source resolution
 *
 * Tests for postTutor in sidecar.test.ts (fetch-mock pattern already established there).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  tutorReducer,
  buildTutorRequest,
  buildSpeakRequestFromVoice,
  buildTutorQuestionEvent,
  resolveUsedSources,
  type TutorState,
  type TutorEvent,
} from "./tutor.js";
import type { Source, VoiceConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VOICE: VoiceConfig = {
  engine: "kokoro",
  lang_code: "a",
  voice: "af_heart",
  speed: 1.0,
};

const SOURCES: Source[] = [
  {
    id: "s1",
    title: "Source One",
    url: "https://example.com/s1",
    excerpt_ref: "sources/s1.md",
    accessed: "2026-01-01",
    tier: 1,
    trust_rationale: "reputable",
  },
  {
    id: "s2",
    title: "Source Two",
    url: "https://example.com/s2",
    excerpt_ref: "sources/s2.md",
    accessed: "2026-01-02",
    tier: 2,
    trust_rationale: "secondary",
  },
];

// ---------------------------------------------------------------------------
// tutorReducer — warming transitions
// ---------------------------------------------------------------------------

describe("tutorReducer — warming", () => {
  const warming: TutorState = { status: "warming" };

  it("HEALTH_OK → ready", () => {
    const next = tutorReducer(warming, { type: "HEALTH_OK" });
    expect(next.status).toBe("ready");
  });

  it("HEALTH_TIMEOUT → error", () => {
    const next = tutorReducer(warming, { type: "HEALTH_TIMEOUT" });
    expect(next.status).toBe("error");
    if (next.status === "error") {
      expect(next.message).toBeTruthy();
    }
  });

  it("SUBMIT while warming is a no-op", () => {
    const next = tutorReducer(warming, { type: "SUBMIT" });
    expect(next.status).toBe("warming");
  });

  it("RESET while warming is a no-op", () => {
    const next = tutorReducer(warming, { type: "RESET" });
    expect(next.status).toBe("warming");
  });
});

// ---------------------------------------------------------------------------
// tutorReducer — ready transitions
// ---------------------------------------------------------------------------

describe("tutorReducer — ready", () => {
  const ready: TutorState = { status: "ready" };

  it("SUBMIT → in_flight", () => {
    const next = tutorReducer(ready, { type: "SUBMIT" });
    expect(next.status).toBe("in_flight");
  });

  it("HEALTH_OK while ready is a no-op", () => {
    const next = tutorReducer(ready, { type: "HEALTH_OK" });
    expect(next.status).toBe("ready");
  });
});

// ---------------------------------------------------------------------------
// tutorReducer — in_flight transitions
// ---------------------------------------------------------------------------

describe("tutorReducer — in_flight", () => {
  const inFlight: TutorState = { status: "in_flight" };

  it("ANSWER → answered with text and sources", () => {
    const next = tutorReducer(inFlight, {
      type: "ANSWER",
      answerText: "The answer is X.",
      usedSources: [SOURCES[0]],
    });
    expect(next.status).toBe("answered");
    if (next.status === "answered") {
      expect(next.answerText).toBe("The answer is X.");
      expect(next.usedSources).toHaveLength(1);
      expect(next.usedSources[0].id).toBe("s1");
    }
  });

  it("NO_KEY → no_key", () => {
    const next = tutorReducer(inFlight, { type: "NO_KEY" });
    expect(next.status).toBe("no_key");
  });

  it("ERROR → error with message", () => {
    const next = tutorReducer(inFlight, { type: "ERROR", message: "Network error" });
    expect(next.status).toBe("error");
    if (next.status === "error") {
      expect(next.message).toBe("Network error");
    }
  });

  it("SUBMIT while in_flight is a no-op (prevents double-submit)", () => {
    const next = tutorReducer(inFlight, { type: "SUBMIT" });
    expect(next.status).toBe("in_flight");
  });
});

// ---------------------------------------------------------------------------
// tutorReducer — answered transitions
// ---------------------------------------------------------------------------

describe("tutorReducer — answered", () => {
  const answered: TutorState = {
    status: "answered",
    answerText: "Some answer",
    usedSources: [],
  };

  it("SUBMIT while answered → in_flight (ask another question)", () => {
    const next = tutorReducer(answered, { type: "SUBMIT" });
    expect(next.status).toBe("in_flight");
  });

  it("RESET → ready (clear answer)", () => {
    const next = tutorReducer(answered, { type: "RESET" });
    expect(next.status).toBe("ready");
  });
});

// ---------------------------------------------------------------------------
// tutorReducer — no_key transitions
// ---------------------------------------------------------------------------

describe("tutorReducer — no_key", () => {
  const noKey: TutorState = { status: "no_key" };

  it("RESET → ready", () => {
    const next = tutorReducer(noKey, { type: "RESET" });
    expect(next.status).toBe("ready");
  });

  it("SUBMIT while no_key is a no-op", () => {
    const next = tutorReducer(noKey, { type: "SUBMIT" });
    expect(next.status).toBe("no_key");
  });
});

// ---------------------------------------------------------------------------
// tutorReducer — error transitions
// ---------------------------------------------------------------------------

describe("tutorReducer — error", () => {
  const error: TutorState = { status: "error", message: "boom" };

  it("RESET → ready", () => {
    const next = tutorReducer(error, { type: "RESET" });
    expect(next.status).toBe("ready");
  });
});

// ---------------------------------------------------------------------------
// buildTutorRequest
// ---------------------------------------------------------------------------

describe("buildTutorRequest", () => {
  it("builds the POST /tutor body with all fields", () => {
    const body = buildTutorRequest(
      "What is X?",
      "/path/to/workspace",
      "0001",
      "b1",
    );
    expect(body).toEqual({
      question: "What is X?",
      workspace_path: "/path/to/workspace",
      lesson_id: "0001",
      beat_id: "b1",
    });
  });

  it("omits beat_id when not provided", () => {
    const body = buildTutorRequest("What is X?", "/path/to/workspace", "0001");
    expect(body).not.toHaveProperty("beat_id");
    expect(body.question).toBe("What is X?");
  });

  it("omits beat_id when undefined is passed explicitly", () => {
    const body = buildTutorRequest("Q", "/workspace", "0001", undefined);
    expect(body).not.toHaveProperty("beat_id");
  });
});

// ---------------------------------------------------------------------------
// buildSpeakRequestFromVoice
// ---------------------------------------------------------------------------

describe("buildSpeakRequestFromVoice", () => {
  it("builds the POST /speak body from course.voice", () => {
    const req = buildSpeakRequestFromVoice("Hello world", VOICE);
    expect(req).toEqual({
      text: "Hello world",
      voice: "af_heart",
      lang_code: "a",
      speed: 1.0,
    });
  });

  it("passes through non-default speed", () => {
    const slowVoice: VoiceConfig = { ...VOICE, speed: 0.8 };
    const req = buildSpeakRequestFromVoice("text", slowVoice);
    expect(req.speed).toBe(0.8);
  });
});

// ---------------------------------------------------------------------------
// buildTutorQuestionEvent
// ---------------------------------------------------------------------------

describe("buildTutorQuestionEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("produces a valid tutor_question event with beat", () => {
    vi.setSystemTime(new Date("2026-07-01T10:00:00.000Z"));
    const evt = buildTutorQuestionEvent("0001", "What is this?", "b2");
    expect(evt.event).toBe("tutor_question");
    expect(evt.lesson).toBe("0001");
    expect(evt.beat).toBe("b2");
    expect(evt.text).toBe("What is this?");
    expect(evt.ts).toBe("2026-07-01T10:00:00.000Z");
  });

  it("omits beat when not provided (course-screen context)", () => {
    const evt = buildTutorQuestionEvent("0001", "General question");
    expect(evt.beat).toBeUndefined();
    expect(evt.text).toBe("General question");
    expect(evt.lesson).toBe("0001");
  });
});

// ---------------------------------------------------------------------------
// resolveUsedSources
// ---------------------------------------------------------------------------

describe("resolveUsedSources", () => {
  it("resolves known source IDs to Source objects", () => {
    const resolved = resolveUsedSources(["s1", "s2"], SOURCES);
    expect(resolved).toHaveLength(2);
    expect(resolved[0].id).toBe("s1");
    expect(resolved[1].id).toBe("s2");
  });

  it("skips unknown IDs silently", () => {
    const resolved = resolveUsedSources(["s1", "unknown-id"], SOURCES);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe("s1");
  });

  it("returns empty array for empty id list", () => {
    const resolved = resolveUsedSources([], SOURCES);
    expect(resolved).toHaveLength(0);
  });

  it("returns empty array when sources list is empty", () => {
    const resolved = resolveUsedSources(["s1"], []);
    expect(resolved).toHaveLength(0);
  });
});
