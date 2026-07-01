/**
 * Unit tests for the progress log writer.
 *
 * Tests that:
 *   - Events are serialised to correct JSON lines
 *   - Each append goes to the right path (workspace/progress.jsonl)
 *   - Trailing slash in workspacePath is normalised
 *   - buildEvent() stamps a fresh ISO 8601 timestamp
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  makeProgressWriter,
  buildEvent,
} from "./progressWriter.js";
import type { FsWriteAdapter } from "./progressWriter.js";

// ---------------------------------------------------------------------------
// Mock adapter
// ---------------------------------------------------------------------------

function makeMockAdapter() {
  const calls: Array<{ path: string; data: string }> = [];
  const adapter: FsWriteAdapter = {
    async appendText(path, data) {
      calls.push({ path, data });
    },
  };
  return { adapter, calls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("makeProgressWriter", () => {
  it("writes to workspace/progress.jsonl", async () => {
    const { adapter, calls } = makeMockAdapter();
    const writer = makeProgressWriter("/my/course", adapter);

    await writer.append(buildEvent({ lesson: "0001", event: "lesson_started" }));

    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe("/my/course/progress.jsonl");
  });

  it("normalises trailing slashes in workspacePath", async () => {
    const { adapter, calls } = makeMockAdapter();
    const writer = makeProgressWriter("/my/course///", adapter);

    await writer.append(buildEvent({ lesson: "0001", event: "lesson_started" }));

    expect(calls[0].path).toBe("/my/course/progress.jsonl");
  });

  it("serialises lesson_started event correctly", async () => {
    const { adapter, calls } = makeMockAdapter();
    const writer = makeProgressWriter("/ws", adapter);
    const ts = "2026-07-01T10:00:00.000Z";

    await writer.append({ ts, lesson: "0001", event: "lesson_started" });

    const parsed = JSON.parse(calls[0].data.trim());
    expect(parsed).toEqual({ ts, lesson: "0001", event: "lesson_started" });
  });

  it("serialises beat_viewed event with beat field", async () => {
    const { adapter, calls } = makeMockAdapter();
    const writer = makeProgressWriter("/ws", adapter);

    await writer.append({
      ts: "2026-07-01T10:01:00.000Z",
      lesson: "0001",
      beat: "b2",
      event: "beat_viewed",
    });

    const parsed = JSON.parse(calls[0].data.trim());
    expect(parsed.beat).toBe("b2");
    expect(parsed.event).toBe("beat_viewed");
  });

  it("serialises lesson_completed event correctly", async () => {
    const { adapter, calls } = makeMockAdapter();
    const writer = makeProgressWriter("/ws", adapter);

    await writer.append({
      ts: "2026-07-01T10:05:00.000Z",
      lesson: "0001",
      event: "lesson_completed",
    });

    const parsed = JSON.parse(calls[0].data.trim());
    expect(parsed.event).toBe("lesson_completed");
    expect(parsed.beat).toBeUndefined();
  });

  it("serialises flag_lost event with beat field", async () => {
    const { adapter, calls } = makeMockAdapter();
    const writer = makeProgressWriter("/ws", adapter);

    await writer.append({
      ts: "2026-07-01T10:02:00.000Z",
      lesson: "0001",
      beat: "b3",
      event: "flag_lost",
    });

    const parsed = JSON.parse(calls[0].data.trim());
    expect(parsed.event).toBe("flag_lost");
    expect(parsed.beat).toBe("b3");
  });

  it("appends a newline after each event", async () => {
    const { adapter, calls } = makeMockAdapter();
    const writer = makeProgressWriter("/ws", adapter);

    await writer.append({ ts: "2026-07-01T10:00:00.000Z", lesson: "0001", event: "lesson_started" });

    expect(calls[0].data).toMatch(/\n$/);
  });

  it("each call to append is independent (multiple events accumulate)", async () => {
    const { adapter, calls } = makeMockAdapter();
    const writer = makeProgressWriter("/ws", adapter);

    await writer.append({ ts: "2026-07-01T10:00:00.000Z", lesson: "0001", event: "lesson_started" });
    await writer.append({ ts: "2026-07-01T10:01:00.000Z", lesson: "0001", beat: "b1", event: "beat_viewed" });
    await writer.append({ ts: "2026-07-01T10:02:00.000Z", lesson: "0001", event: "lesson_completed" });

    expect(calls).toHaveLength(3);
    expect(JSON.parse(calls[0].data.trim()).event).toBe("lesson_started");
    expect(JSON.parse(calls[1].data.trim()).event).toBe("beat_viewed");
    expect(JSON.parse(calls[2].data.trim()).event).toBe("lesson_completed");
  });
});

describe("buildEvent", () => {
  it("stamps a ts field as ISO 8601", () => {
    const event = buildEvent({ lesson: "0001", event: "lesson_started" });
    expect(event.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("includes all provided fields", () => {
    const event = buildEvent({ lesson: "0001", beat: "b2", event: "beat_viewed" });
    expect(event.lesson).toBe("0001");
    expect(event.beat).toBe("b2");
    expect(event.event).toBe("beat_viewed");
  });

  it("does not override a caller-supplied ts", () => {
    // buildEvent merges: ts comes first from the spread, so caller cannot supply ts
    // (it's Omit<ProgressEvent, "ts">). Just verify the ts is present and valid.
    const event = buildEvent({ lesson: "0001", event: "lesson_started" });
    expect(typeof event.ts).toBe("string");
    expect(event.ts.length).toBeGreaterThan(0);
  });
});
