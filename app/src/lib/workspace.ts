/**
 * Workspace loading and structural validation.
 *
 * This module contains ONLY pure logic.  It accepts an FsAdapter so the Tauri
 * fs layer can be swapped for a test mock without any Tauri imports leaking in.
 *
 * The actual Tauri dialog + fs wiring lives in the Svelte component so it
 * never runs in the Vitest environment.
 */

import type {
  CourseManifest,
  LessonManifest,
  LessonRef,
  NarrationBeat,
  QuizBeat,
  ContestedBeat,
} from "./types.js";

// ---------------------------------------------------------------------------
// Filesystem abstraction — mock in tests, Tauri fs in the app
// ---------------------------------------------------------------------------

export interface FsAdapter {
  /** Read a file and return its text content.  Throws on error. */
  readTextFile(path: string): Promise<string>;
  /** Return true if the path exists. */
  exists(path: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Validation result types  (graded, not binary)
// ---------------------------------------------------------------------------

export interface WorkspaceNotACourse {
  kind: "not_a_course";
  reason: string;
}

/** Per-lesson validation outcome. */
export interface LessonValidation {
  lessonId: string;
  title: string;
  /** True iff all files (lesson JSON + audio) exist and parsed. */
  launchable: boolean;
  /** Human-readable reason when not launchable. */
  reason?: string;
}

export interface WorkspaceValid {
  kind: "valid";
  workspacePath: string;
  course: CourseManifest;
  lessons: LessonValidation[];
}

export type WorkspaceValidationResult = WorkspaceNotACourse | WorkspaceValid;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Join path segments with forward slash; strips trailing slashes on base. */
function join(base: string, ...parts: string[]): string {
  const b = base.replace(/\/+$/, "");
  return [b, ...parts].join("/");
}

/** Collect all audio paths referenced in a lesson manifest. */
function audioPathsIn(manifest: LessonManifest): string[] {
  const paths: string[] = [];
  for (const beat of manifest.beats) {
    switch (beat.type) {
      case "narration":
        paths.push((beat as NarrationBeat).audio);
        break;
      case "quiz": {
        const q = beat as QuizBeat;
        paths.push(q.audio_intro, q.audio_explanation);
        break;
      }
      case "contested": {
        const c = beat as ContestedBeat;
        paths.push(c.audio_intro);
        for (const pos of c.positions) {
          paths.push(pos.audio);
        }
        break;
      }
    }
  }
  return paths;
}

/** Validate a single lesson and return its LessonValidation. */
async function validateLesson(
  workspacePath: string,
  ref: LessonRef,
  fs: FsAdapter,
): Promise<LessonValidation> {
  const lessonFile = join(
    workspacePath,
    "lessons",
    `${ref.lesson_id}-${ref.slug}.json`,
  );

  const fileExists = await fs.exists(lessonFile);
  if (!fileExists) {
    return {
      lessonId: ref.lesson_id,
      title: ref.title,
      launchable: false,
      reason: "Lesson file not found — has this course been generated?",
    };
  }

  let manifest: LessonManifest;
  try {
    const raw = await fs.readTextFile(lessonFile);
    manifest = JSON.parse(raw) as LessonManifest;
  } catch {
    return {
      lessonId: ref.lesson_id,
      title: ref.title,
      launchable: false,
      reason: "Lesson file could not be parsed.",
    };
  }

  // Check every audio path
  const audioPaths = audioPathsIn(manifest);
  for (const rel of audioPaths) {
    const abs = join(workspacePath, rel);
    const audioExists = await fs.exists(abs);
    if (!audioExists) {
      return {
        lessonId: ref.lesson_id,
        title: ref.title,
        launchable: false,
        reason: "Audio not rendered yet — run render_audio.py to prepare this lesson.",
      };
    }
  }

  return { lessonId: ref.lesson_id, title: ref.title, launchable: true };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a workspace folder.
 *
 * Grading:
 *   - no course.json, invalid JSON, or missing schema_version
 *     → `{ kind: "not_a_course" }`
 *   - lesson file missing or audio unrendered
 *     → lesson non-launchable; course still opens as `{ kind: "valid" }`
 */
export async function validateWorkspace(
  workspacePath: string,
  fs: FsAdapter,
): Promise<WorkspaceValidationResult> {
  const courseJsonPath = join(workspacePath, "course.json");

  if (!(await fs.exists(courseJsonPath))) {
    return {
      kind: "not_a_course",
      reason: "No course.json found in this folder.",
    };
  }

  let course: CourseManifest;
  try {
    const raw = await fs.readTextFile(courseJsonPath);
    course = JSON.parse(raw) as CourseManifest;
  } catch {
    return {
      kind: "not_a_course",
      reason: "course.json could not be parsed — it may be corrupt.",
    };
  }

  if (!course.schema_version) {
    return {
      kind: "not_a_course",
      reason:
        "course.json is missing schema_version — this doesn't look like a teach-me course.",
    };
  }

  const lessons = await Promise.all(
    course.lessons.map((ref) => validateLesson(workspacePath, ref, fs)),
  );

  return { kind: "valid", workspacePath, course, lessons };
}
