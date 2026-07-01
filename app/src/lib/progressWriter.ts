/**
 * Progress log writer — append-only, front end is the SOLE writer.
 *
 * Appends one JSON line per event to progress.jsonl.
 * Accepts an FsWriteAdapter so it can be tested without Tauri.
 *
 * Usage in the app:
 *   const writer = makeProgressWriter(workspacePath, makeTauriWriteAdapter());
 *   await writer.append({ ts: new Date().toISOString(), lesson: "0001", event: "lesson_started" });
 *
 * Event shapes (per CONVENTIONS.md / beat-schema.md):
 *   lesson_started   — { ts, lesson, event }
 *   beat_viewed      — { ts, lesson, beat, event }
 *   lesson_completed — { ts, lesson, event }
 *   flag_lost        — { ts, lesson, beat, event }
 *   replayed         — { ts, lesson, beat, event }
 *   quiz_answer      — { ts, lesson, beat, event, chosen, correct }
 *   tutor_question   — { ts, lesson, beat, event, text }
 */

import type { ProgressEvent } from "./types.js";

// ---------------------------------------------------------------------------
// Write adapter — swap out in tests
// ---------------------------------------------------------------------------

export interface FsWriteAdapter {
  /** Append text to a file, creating it if it doesn't exist. */
  appendText(path: string, data: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Progress writer
// ---------------------------------------------------------------------------

export interface ProgressWriter {
  append(event: ProgressEvent): Promise<void>;
}

export function makeProgressWriter(
  workspacePath: string,
  fs: FsWriteAdapter,
): ProgressWriter {
  const base = workspacePath.replace(/\/+$/, "");
  const progressPath = `${base}/progress.jsonl`;

  return {
    async append(event: ProgressEvent): Promise<void> {
      const line = JSON.stringify(event) + "\n";
      await fs.appendText(progressPath, line);
    },
  };
}

// ---------------------------------------------------------------------------
// Convenience: build a typed event with a fresh timestamp
// ---------------------------------------------------------------------------

export function buildEvent(
  partial: Omit<ProgressEvent, "ts">,
): ProgressEvent {
  return { ts: new Date().toISOString(), ...partial } as ProgressEvent;
}

// ---------------------------------------------------------------------------
// Tauri adapter (live app only — never imported in Vitest environment)
// ---------------------------------------------------------------------------

/**
 * Create the Tauri-backed FsWriteAdapter.
 * Dynamically imports the Tauri plugin so this function is safe to call in
 * a Svelte component that gets tree-shaken away in tests.
 */
export function makeTauriWriteAdapter(): FsWriteAdapter {
  return {
    async appendText(path: string, data: string): Promise<void> {
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      await writeTextFile(path, data, { append: true, create: true });
    },
  };
}
