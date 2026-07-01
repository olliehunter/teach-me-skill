/**
 * Unit tests for workspace structural validation.
 *
 * All Tauri fs calls are mocked via the FsAdapter interface — no real files
 * or Tauri runtime needed.
 */

import { describe, it, expect } from "vitest";
import { validateWorkspace } from "./workspace.js";
import type { FsAdapter } from "./workspace.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORKSPACE = "/fake/my-course";

/** Build an FsAdapter where the provided map is the "filesystem". */
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

const VALID_COURSE_JSON = JSON.stringify({
  schema_version: "1.0",
  title: "Test Course",
  voice: { engine: "kokoro", lang_code: "a", voice: "af_heart", speed: 1.0 },
  lessons: [
    { lesson_id: "0001", slug: "lesson-one", title: "Lesson One", status: "ready" },
  ],
});

const VALID_COURSE_JSON_NO_COVERAGE = JSON.stringify({
  schema_version: "1.0",
  title: "No-Coverage Course",
  voice: { engine: "kokoro", lang_code: "a", voice: "af_heart", speed: 1.0 },
  lessons: [
    { lesson_id: "0001", slug: "lesson-one", title: "Lesson One", status: "ready" },
  ],
  // no `coverage` key — optional
});

const VALID_LESSON_JSON = JSON.stringify({
  schema_version: "1.0",
  lesson_id: "0001",
  slug: "lesson-one",
  title: "Lesson One",
  objective: "Learn something.",
  prerequisites: [],
  estimated_seconds: 60,
  voice: { engine: "kokoro", lang_code: "a", voice: "af_heart", speed: 1.0 },
  sources: [],
  beats: [
    {
      id: "b1",
      type: "narration",
      narration: "Hello.",
      audio: "assets/audio/0001-b1.wav",
      audio_duration_s: 2.0,
      visual: { kind: "none" },
      citations: [],
    },
  ],
});

const LESSON_WITH_QUIZ_JSON = JSON.stringify({
  schema_version: "1.0",
  lesson_id: "0001",
  slug: "lesson-one",
  title: "Lesson One",
  objective: "Learn something.",
  prerequisites: [],
  estimated_seconds: 60,
  voice: { engine: "kokoro", lang_code: "a", voice: "af_heart", speed: 1.0 },
  sources: [],
  beats: [
    {
      id: "b1",
      type: "quiz",
      format: "single_choice",
      narration_intro: "Quick check.",
      audio_intro: "assets/audio/0001-b1-intro.wav",
      prompt: "What is 1+1?",
      options: [{ id: "a", text: "2" }],
      answer: "a",
      explanation: "Yes.",
      audio_explanation: "assets/audio/0001-b1-explain.wav",
      citations: [],
    },
  ],
});

const LESSON_WITH_CONTESTED_JSON = JSON.stringify({
  schema_version: "1.0",
  lesson_id: "0001",
  slug: "lesson-one",
  title: "Lesson One",
  objective: "Learn something.",
  prerequisites: [],
  estimated_seconds: 60,
  voice: { engine: "kokoro", lang_code: "a", voice: "af_heart", speed: 1.0 },
  sources: [],
  beats: [
    {
      id: "b1",
      type: "contested",
      narration_intro: "Experts disagree.",
      audio_intro: "assets/audio/0001-b1-intro.wav",
      question: "Which is best?",
      positions: [
        {
          label: "Side A",
          narration: "A is great.",
          audio: "assets/audio/0001-b1-p1.wav",
          audio_duration_s: 5.0,
          citations: [],
        },
        {
          label: "Side B",
          narration: "B is great.",
          audio: "assets/audio/0001-b1-p2.wav",
          audio_duration_s: 5.0,
          citations: [],
        },
      ],
    },
  ],
});

// ---------------------------------------------------------------------------
// Tests: not-a-course cases
// ---------------------------------------------------------------------------

describe("validateWorkspace — not_a_course cases", () => {
  it("returns not_a_course when course.json is absent", async () => {
    const fs = makeFs({}); // empty filesystem
    const result = await validateWorkspace(WORKSPACE, fs);

    expect(result.kind).toBe("not_a_course");
    if (result.kind === "not_a_course") {
      expect(result.reason).toMatch(/course\.json/i);
    }
  });

  it("returns not_a_course when course.json contains invalid JSON", async () => {
    const fs = makeFs({ [`${WORKSPACE}/course.json`]: "{ invalid json" });
    const result = await validateWorkspace(WORKSPACE, fs);

    expect(result.kind).toBe("not_a_course");
    if (result.kind === "not_a_course") {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it("returns not_a_course when course.json has no schema_version", async () => {
    const noVersion = JSON.stringify({
      title: "Bad Course",
      voice: {},
      lessons: [],
    });
    const fs = makeFs({ [`${WORKSPACE}/course.json`]: noVersion });
    const result = await validateWorkspace(WORKSPACE, fs);

    expect(result.kind).toBe("not_a_course");
    if (result.kind === "not_a_course") {
      expect(result.reason).toMatch(/schema_version/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: valid course cases
// ---------------------------------------------------------------------------

describe("validateWorkspace — valid course", () => {
  it("returns valid when course.json + lesson file + audio all exist", async () => {
    const fs = makeFs({
      [`${WORKSPACE}/course.json`]: VALID_COURSE_JSON,
      [`${WORKSPACE}/lessons/0001-lesson-one.json`]: VALID_LESSON_JSON,
      [`${WORKSPACE}/assets/audio/0001-b1.wav`]: "binary",
    });

    const result = await validateWorkspace(WORKSPACE, fs);

    expect(result.kind).toBe("valid");
    if (result.kind === "valid") {
      expect(result.course.title).toBe("Test Course");
      expect(result.lessons).toHaveLength(1);
      expect(result.lessons[0].launchable).toBe(true);
      expect(result.lessons[0].lessonId).toBe("0001");
    }
  });

  it("lesson is non-launchable but course still opens when lesson file is missing", async () => {
    const fs = makeFs({
      [`${WORKSPACE}/course.json`]: VALID_COURSE_JSON,
      // lesson file absent
    });

    const result = await validateWorkspace(WORKSPACE, fs);

    expect(result.kind).toBe("valid");
    if (result.kind === "valid") {
      expect(result.lessons[0].launchable).toBe(false);
      expect(result.lessons[0].reason).toBeTruthy();
    }
  });

  it("lesson is non-launchable when audio file is missing (not rendered)", async () => {
    const fs = makeFs({
      [`${WORKSPACE}/course.json`]: VALID_COURSE_JSON,
      [`${WORKSPACE}/lessons/0001-lesson-one.json`]: VALID_LESSON_JSON,
      // audio absent
    });

    const result = await validateWorkspace(WORKSPACE, fs);

    expect(result.kind).toBe("valid");
    if (result.kind === "valid") {
      expect(result.lessons[0].launchable).toBe(false);
      expect(result.lessons[0].reason).toMatch(/audio/i);
    }
  });

  it("course with no coverage block is still valid", async () => {
    const fs = makeFs({
      [`${WORKSPACE}/course.json`]: VALID_COURSE_JSON_NO_COVERAGE,
      [`${WORKSPACE}/lessons/0001-lesson-one.json`]: VALID_LESSON_JSON,
      [`${WORKSPACE}/assets/audio/0001-b1.wav`]: "binary",
    });

    const result = await validateWorkspace(WORKSPACE, fs);

    expect(result.kind).toBe("valid");
    if (result.kind === "valid") {
      expect(result.course.coverage).toBeUndefined();
      expect(result.lessons[0].launchable).toBe(true);
    }
  });

  it("checks all quiz audio paths (audio_intro + audio_explanation)", async () => {
    const fs = makeFs({
      [`${WORKSPACE}/course.json`]: VALID_COURSE_JSON,
      [`${WORKSPACE}/lessons/0001-lesson-one.json`]: LESSON_WITH_QUIZ_JSON,
      [`${WORKSPACE}/assets/audio/0001-b1-intro.wav`]: "binary",
      // audio_explanation absent
    });

    const result = await validateWorkspace(WORKSPACE, fs);

    expect(result.kind).toBe("valid");
    if (result.kind === "valid") {
      expect(result.lessons[0].launchable).toBe(false);
      expect(result.lessons[0].reason).toMatch(/audio/i);
    }
  });

  it("checks all contested audio paths (audio_intro + each position audio)", async () => {
    const fs = makeFs({
      [`${WORKSPACE}/course.json`]: VALID_COURSE_JSON,
      [`${WORKSPACE}/lessons/0001-lesson-one.json`]: LESSON_WITH_CONTESTED_JSON,
      [`${WORKSPACE}/assets/audio/0001-b1-intro.wav`]: "binary",
      [`${WORKSPACE}/assets/audio/0001-b1-p1.wav`]: "binary",
      // p2 audio absent
    });

    const result = await validateWorkspace(WORKSPACE, fs);

    expect(result.kind).toBe("valid");
    if (result.kind === "valid") {
      expect(result.lessons[0].launchable).toBe(false);
    }
  });

  it("lesson with draft status is launchable when all files present", async () => {
    const draftCourse = JSON.stringify({
      schema_version: "1.0",
      title: "Draft Course",
      voice: { engine: "kokoro", lang_code: "a", voice: "af_heart", speed: 1.0 },
      lessons: [
        { lesson_id: "0001", slug: "lesson-one", title: "Lesson One", status: "draft" },
      ],
    });
    const fs = makeFs({
      [`${WORKSPACE}/course.json`]: draftCourse,
      [`${WORKSPACE}/lessons/0001-lesson-one.json`]: VALID_LESSON_JSON,
      [`${WORKSPACE}/assets/audio/0001-b1.wav`]: "binary",
    });

    const result = await validateWorkspace(WORKSPACE, fs);

    expect(result.kind).toBe("valid");
    if (result.kind === "valid") {
      // status is informational only; launchability is from file validation
      expect(result.lessons[0].launchable).toBe(true);
    }
  });

  it("workspace path with trailing slash is normalised correctly", async () => {
    const wsWithSlash = `${WORKSPACE}/`;
    const fs = makeFs({
      [`${WORKSPACE}/course.json`]: VALID_COURSE_JSON,
      [`${WORKSPACE}/lessons/0001-lesson-one.json`]: VALID_LESSON_JSON,
      [`${WORKSPACE}/assets/audio/0001-b1.wav`]: "binary",
    });

    const result = await validateWorkspace(wsWithSlash, fs);

    expect(result.kind).toBe("valid");
  });
});
