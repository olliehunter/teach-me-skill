/**
 * Unit tests for progress.jsonl loading and folding.
 */

import { describe, it, expect } from "vitest";
import { loadProgress, completionSummary, resumeBeatIndex } from "./progress.js";
import type { FsAdapter } from "./workspace.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORKSPACE = "/fake/my-course";
const PROGRESS_PATH = `${WORKSPACE}/progress.jsonl`;
const LESSON_IDS = ["0001", "0002", "0003"];

function makeFs(files: Record<string, string>): FsAdapter {
  return {
    exists: async (path) => Object.prototype.hasOwnProperty.call(files, path),
    readTextFile: async (path) => {
      if (!Object.prototype.hasOwnProperty.call(files, path)) {
        throw new Error(`File not found: ${path}`);
      }
      return files[path];
    },
  };
}

function lines(...events: object[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadProgress", () => {
  it("returns zeroed state when progress.jsonl does not exist", async () => {
    const fs = makeFs({});
    const result = await loadProgress(WORKSPACE, LESSON_IDS, fs);

    expect(result.completedCount).toBe(0);
    expect(result.totalCount).toBe(3);
    for (const id of LESSON_IDS) {
      expect(result.lessons.get(id)?.state).toBe("not_started");
    }
  });

  it("marks a lesson completed on lesson_completed event", async () => {
    const fs = makeFs({
      [PROGRESS_PATH]: lines(
        { ts: "2026-01-01T10:00:00Z", lesson: "0001", event: "lesson_started" },
        { ts: "2026-01-01T10:05:00Z", lesson: "0001", beat: "b1", event: "beat_viewed" },
        { ts: "2026-01-01T10:10:00Z", lesson: "0001", event: "lesson_completed" },
      ),
    });

    const result = await loadProgress(WORKSPACE, LESSON_IDS, fs);

    expect(result.completedCount).toBe(1);
    expect(result.lessons.get("0001")?.state).toBe("completed");
    expect(result.lessons.get("0002")?.state).toBe("not_started");
  });

  it("marks a lesson in_progress on beat_viewed event", async () => {
    const fs = makeFs({
      [PROGRESS_PATH]: lines(
        { ts: "2026-01-01T10:00:00Z", lesson: "0002", event: "lesson_started" },
        { ts: "2026-01-01T10:01:00Z", lesson: "0002", beat: "b3", event: "beat_viewed" },
      ),
    });

    const result = await loadProgress(WORKSPACE, LESSON_IDS, fs);

    expect(result.lessons.get("0002")?.state).toBe("in_progress");
    expect(result.lessons.get("0002")?.lastBeatId).toBe("b3");
  });

  it("counts multiple completed lessons correctly", async () => {
    const fs = makeFs({
      [PROGRESS_PATH]: lines(
        { ts: "2026-01-01T10:00:00Z", lesson: "0001", event: "lesson_completed" },
        { ts: "2026-01-01T11:00:00Z", lesson: "0003", event: "lesson_completed" },
      ),
    });

    const result = await loadProgress(WORKSPACE, LESSON_IDS, fs);

    expect(result.completedCount).toBe(2);
    expect(result.totalCount).toBe(3);
  });

  it("does not downgrade a completed lesson to in_progress on later beat_viewed", async () => {
    const fs = makeFs({
      [PROGRESS_PATH]: lines(
        { ts: "2026-01-01T10:00:00Z", lesson: "0001", event: "lesson_completed" },
        // duplicate / replayed event after completion — should not downgrade
        { ts: "2026-01-01T10:01:00Z", lesson: "0001", beat: "b1", event: "beat_viewed" },
      ),
    });

    const result = await loadProgress(WORKSPACE, LESSON_IDS, fs);

    expect(result.lessons.get("0001")?.state).toBe("completed");
  });

  it("skips events for lesson_ids not in the course", async () => {
    const fs = makeFs({
      [PROGRESS_PATH]: lines(
        { ts: "2026-01-01T10:00:00Z", lesson: "9999", event: "lesson_completed" },
      ),
    });

    const result = await loadProgress(WORKSPACE, LESSON_IDS, fs);

    expect(result.completedCount).toBe(0);
  });

  it("skips malformed lines gracefully", async () => {
    const raw =
      JSON.stringify({ ts: "2026-01-01T10:00:00Z", lesson: "0001", event: "lesson_completed" }) +
      "\n{ invalid json }\n" +
      JSON.stringify({ ts: "2026-01-01T11:00:00Z", lesson: "0002", event: "lesson_completed" });

    const fs = makeFs({ [PROGRESS_PATH]: raw });
    const result = await loadProgress(WORKSPACE, LESSON_IDS, fs);

    expect(result.completedCount).toBe(2); // malformed line skipped
  });

  it("tracks lastBeatId as the most recent beat_viewed", async () => {
    const fs = makeFs({
      [PROGRESS_PATH]: lines(
        { ts: "2026-01-01T10:00:00Z", lesson: "0001", beat: "b1", event: "beat_viewed" },
        { ts: "2026-01-01T10:01:00Z", lesson: "0001", beat: "b2", event: "beat_viewed" },
        { ts: "2026-01-01T10:02:00Z", lesson: "0001", beat: "b3", event: "beat_viewed" },
      ),
    });

    const result = await loadProgress(WORKSPACE, LESSON_IDS, fs);

    expect(result.lessons.get("0001")?.lastBeatId).toBe("b3");
  });
});

describe("loadProgress — duplicate-event safety", () => {
  it("duplicate beat_viewed events do not corrupt lastBeatId (last one wins)", async () => {
    // A learner viewed b2, then b3, then somehow b2 again (e.g. back-nav replay).
    // lastBeatId should be the LAST beat_viewed in the log, not the furthest.
    // This is correct: fold gives us resume state, not furthest-ever-reached.
    // The FURTHEST is computed by resumeBeatIndex scanning the beatIds array.
    const fs = makeFs({
      [PROGRESS_PATH]: lines(
        { ts: "2026-01-01T10:00:00Z", lesson: "0001", beat: "b1", event: "beat_viewed" },
        { ts: "2026-01-01T10:01:00Z", lesson: "0001", beat: "b2", event: "beat_viewed" },
        { ts: "2026-01-01T10:02:00Z", lesson: "0001", beat: "b3", event: "beat_viewed" },
        { ts: "2026-01-01T10:03:00Z", lesson: "0001", beat: "b2", event: "beat_viewed" }, // went back
      ),
    });

    const result = await loadProgress(WORKSPACE, LESSON_IDS, fs);
    // Last event was b2 so lastBeatId = b2
    expect(result.lessons.get("0001")?.lastBeatId).toBe("b2");
  });

  it("lesson_completed followed by repeated beat_viewed does NOT downgrade to in_progress", async () => {
    const fs = makeFs({
      [PROGRESS_PATH]: lines(
        { ts: "2026-01-01T10:00:00Z", lesson: "0001", event: "lesson_started" },
        { ts: "2026-01-01T10:01:00Z", lesson: "0001", beat: "b1", event: "beat_viewed" },
        { ts: "2026-01-01T10:02:00Z", lesson: "0001", beat: "b2", event: "beat_viewed" },
        { ts: "2026-01-01T10:03:00Z", lesson: "0001", event: "lesson_completed" },
        // Duplicate / stale events after completion — must not corrupt state
        { ts: "2026-01-01T10:04:00Z", lesson: "0001", beat: "b2", event: "beat_viewed" },
        { ts: "2026-01-01T10:05:00Z", lesson: "0001", event: "lesson_started" },
      ),
    });

    const result = await loadProgress(WORKSPACE, LESSON_IDS, fs);
    expect(result.lessons.get("0001")?.state).toBe("completed");
    expect(result.completedCount).toBe(1);
  });

  it("re-folding identical log produces identical state (idempotent)", async () => {
    const logContent = lines(
      { ts: "2026-01-01T10:00:00Z", lesson: "0001", event: "lesson_started" },
      { ts: "2026-01-01T10:01:00Z", lesson: "0001", beat: "b1", event: "beat_viewed" },
      { ts: "2026-01-01T10:02:00Z", lesson: "0001", beat: "b2", event: "beat_viewed" },
    );
    const fs = makeFs({ [PROGRESS_PATH]: logContent });

    const r1 = await loadProgress(WORKSPACE, LESSON_IDS, fs);
    const r2 = await loadProgress(WORKSPACE, LESSON_IDS, fs);

    expect(r1.lessons.get("0001")?.state).toBe(r2.lessons.get("0001")?.state);
    expect(r1.lessons.get("0001")?.lastBeatId).toBe(r2.lessons.get("0001")?.lastBeatId);
  });
});

describe("resumeBeatIndex", () => {
  const BEAT_IDS = ["b1", "b2", "b3", "b4"];

  it("returns 0 when progress is undefined", () => {
    expect(resumeBeatIndex(BEAT_IDS, undefined)).toBe(0);
  });

  it("returns 0 when lastBeatId is not set", () => {
    expect(resumeBeatIndex(BEAT_IDS, { lessonId: "0001", state: "not_started" })).toBe(0);
  });

  it("returns the correct index for a known beat id", () => {
    expect(resumeBeatIndex(BEAT_IDS, { lessonId: "0001", state: "in_progress", lastBeatId: "b3" })).toBe(2);
  });

  it("returns 0 when lastBeatId is not in the beatIds array (stale id)", () => {
    expect(resumeBeatIndex(BEAT_IDS, { lessonId: "0001", state: "in_progress", lastBeatId: "b99" })).toBe(0);
  });

  it("returns 0 for the first beat", () => {
    expect(resumeBeatIndex(BEAT_IDS, { lessonId: "0001", state: "in_progress", lastBeatId: "b1" })).toBe(0);
  });

  it("returns last index for the last beat", () => {
    expect(resumeBeatIndex(BEAT_IDS, { lessonId: "0001", state: "in_progress", lastBeatId: "b4" })).toBe(3);
  });

  it("handles empty beatIds array gracefully", () => {
    expect(resumeBeatIndex([], { lessonId: "0001", state: "in_progress", lastBeatId: "b1" })).toBe(0);
  });
});

describe("completionSummary", () => {
  it("formats the summary string correctly", async () => {
    const fs = makeFs({
      [PROGRESS_PATH]: lines(
        { ts: "2026-01-01T10:00:00Z", lesson: "0001", event: "lesson_completed" },
      ),
    });
    const progress = await loadProgress(WORKSPACE, ["0001", "0002"], fs);

    expect(completionSummary(progress)).toBe("1 of 2 complete");
  });

  it("shows 0 of N when nothing completed", async () => {
    const fs = makeFs({});
    const progress = await loadProgress(WORKSPACE, ["0001", "0002", "0003"], fs);

    expect(completionSummary(progress)).toBe("0 of 3 complete");
  });
});
