/**
 * Progress log reader and fold.
 *
 * progress.jsonl is append-only, one JSON object per line.
 * Resume state is derived by folding the log — never stored.
 *
 * Pure logic; accepts an FsAdapter so it can be tested without Tauri.
 */

import type { ProgressEvent } from "./types.js";
import type { FsAdapter } from "./workspace.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LessonProgressState = "not_started" | "in_progress" | "completed";

export interface LessonProgress {
  lessonId: string;
  state: LessonProgressState;
  /** Beat id of the furthest `beat_viewed` event (for resume UX in 005/006). */
  lastBeatId?: string;
}

export interface CourseProgress {
  completedCount: number;
  totalCount: number;
  /** Keyed by lesson_id. */
  lessons: Map<string, LessonProgress>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load and fold progress.jsonl for a workspace.
 *
 * If the file doesn't exist the result is zeroed state (new learner).
 * Malformed lines are silently skipped (append-only log may have partial writes).
 */
export async function loadProgress(
  workspacePath: string,
  lessonIds: string[],
  fs: FsAdapter,
): Promise<CourseProgress> {
  const base = workspacePath.replace(/\/+$/, "");
  const progressPath = `${base}/progress.jsonl`;

  const lessons = new Map<string, LessonProgress>(
    lessonIds.map((id) => [id, { lessonId: id, state: "not_started" }]),
  );

  const fileExists = await fs.exists(progressPath);
  if (!fileExists) {
    return {
      completedCount: 0,
      totalCount: lessonIds.length,
      lessons,
    };
  }

  let raw: string;
  try {
    raw = await fs.readTextFile(progressPath);
  } catch {
    return { completedCount: 0, totalCount: lessonIds.length, lessons };
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event = JSON.parse(trimmed) as ProgressEvent;
      const current = lessons.get(event.lesson);
      if (!current) continue; // event for a lesson not in this course

      if (event.event === "lesson_completed") {
        lessons.set(event.lesson, { ...current, state: "completed" });
      } else if (
        (event.event === "lesson_started" || event.event === "beat_viewed") &&
        current.state !== "completed"
      ) {
        lessons.set(event.lesson, {
          ...current,
          state: "in_progress",
          lastBeatId: event.beat ?? current.lastBeatId,
        });
      }
    } catch {
      // skip malformed lines
    }
  }

  const completedCount = [...lessons.values()].filter(
    (l) => l.state === "completed",
  ).length;

  return { completedCount, totalCount: lessonIds.length, lessons };
}

/** Format the completion summary for display, e.g. "1 of 3 complete". */
export function completionSummary(progress: CourseProgress): string {
  return `${progress.completedCount} of ${progress.totalCount} complete`;
}
