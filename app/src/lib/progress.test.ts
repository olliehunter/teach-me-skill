/**
 * Unit tests for progress.jsonl loading and folding.
 */

import { describe, it, expect } from "vitest";
import { loadProgress, completionSummary } from "./progress.js";
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
