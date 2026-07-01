<script lang="ts">
  /**
   * teach-me Player — root page.
   *
   * States:
   *   idle        → "Open Course Folder" button (+ dev fixture shortcut)
   *   loading     → validating workspace
   *   not_a_course → friendly error
   *   ready       → CourseScreen or LessonPlayer
   *
   * Issue 006 additions:
   *   - `handleLaunch` computes resume beat index from folded progress.
   *   - `handleCompleted` writes no events (LessonPlayer does that); it
   *     highlights the next lesson on the course screen.
   *   - Progress is re-loaded when returning from a lesson so badges refresh.
   *   - `progressWriter` is created once from the Tauri adapter and passed
   *     into LessonPlayer (keeps Tauri out of LessonPlayer's import graph).
   */

  import { onMount, onDestroy } from "svelte";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { readTextFile, exists, writeTextFile } from "@tauri-apps/plugin-fs";
  import { pollSidecarHealth } from "$lib/sidecar.js";
  import { validateWorkspace } from "$lib/workspace.js";
  import { loadProgress, resumeBeatIndex } from "$lib/progress.js";
  import { makeProgressWriter } from "$lib/progressWriter.js";
  import CourseScreen from "$lib/CourseScreen.svelte";
  import LessonPlayer from "$lib/LessonPlayer.svelte";
  import TutorBox from "$lib/TutorBox.svelte";
  import type { FsAdapter, WorkspaceValidationResult } from "$lib/workspace.js";
  import type { CourseProgress } from "$lib/progress.js";
  import type { ProgressWriter } from "$lib/progressWriter.js";
  import type { Source, VoiceConfig } from "$lib/types.js";

  // ---------------------------------------------------------------------------
  // Tauri fs adapter — wraps plugin-fs for injection into pure workspace logic
  // ---------------------------------------------------------------------------

  const tauriFsAdapter: FsAdapter = {
    readTextFile: (path) => readTextFile(path),
    exists: (path) => exists(path),
  };

  // ---------------------------------------------------------------------------
  // Progress writer (Tauri-backed; injected into LessonPlayer)
  // ---------------------------------------------------------------------------

  /** Set when a workspace is loaded; cleared on close. */
  let activeProgressWriter = $state<ProgressWriter | null>(null);

  // ---------------------------------------------------------------------------
  // Sidecar health (shown as a small status strip; used by tutor in Phase 4)
  // ---------------------------------------------------------------------------

  let sidecarStatus = $state<"warming" | "ready" | "error">("warming");
  let cancelHealthPoll: (() => void) | null = null;

  onMount(() => {
    cancelHealthPoll = pollSidecarHealth(
      () => { sidecarStatus = "ready"; },
      () => { sidecarStatus = "error"; },
    );
  });

  onDestroy(() => {
    cancelHealthPoll?.();
  });

  // ---------------------------------------------------------------------------
  // Tutor narration pause registration
  // ---------------------------------------------------------------------------

  /**
   * Holds the pause function registered by LessonPlayer.
   * Null when no lesson is playing.  Called by TutorBox on question submit.
   */
  let pauseNarrationFn = $state<(() => void) | null>(null);

  function handleRegisterPause(fn: () => void) {
    pauseNarrationFn = fn;
  }

  function handlePauseNarration() {
    pauseNarrationFn?.();
  }

  // readExcerpt function for TutorBox source panel (reads sources/<id>.md).
  async function readExcerpt(excerptRef: string): Promise<string> {
    if (pageState.phase !== "ready") return "";
    return readTextFile(`${pageState.result.workspacePath}/${excerptRef}`);
  }

  // ---------------------------------------------------------------------------
  // Lesson context for TutorBox (sources + beat id, updated by LessonPlayer)
  // ---------------------------------------------------------------------------

  let currentLessonSources = $state<import("$lib/types.js").Source[]>([]);
  let currentBeatId = $state<string | undefined>(undefined);

  function handleLessonSources(sources: import("$lib/types.js").Source[]) {
    currentLessonSources = sources;
  }

  function handleCurrentBeatId(beatId: string | undefined) {
    currentBeatId = beatId;
  }

  // ---------------------------------------------------------------------------
  // Workspace state machine
  // ---------------------------------------------------------------------------

  type PageState =
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "not_a_course"; reason: string }
    | {
        phase: "ready";
        result: WorkspaceValidationResult & { kind: "valid" };
        progress: CourseProgress;
      };

  let pageState = $state<PageState>({ phase: "idle" });

  /**
   * When non-null, the lesson player is shown.
   * `lastBeatId` is passed to LessonPlayer as `resumeFromBeatId` so it can
   * resolve the beat index after loading the manifest.
   */
  let playingLesson = $state<{
    lessonId: string;
    lastBeatId: string | null;
  } | null>(null);

  /** Lesson to highlight on the course screen after lesson_completed (DECISIONS §5). */
  let highlightedLessonId = $state<string | null>(null);

  // Dev affordance: load the fixture path without a dialog.
  const DEV_FIXTURE_PATH =
    "/Users/ollie/development/teachmeplayer/docs/fixtures/example-course";

  /** Load a workspace from a folder path. */
  async function loadWorkspace(folderPath: string) {
    pageState = { phase: "loading" };
    highlightedLessonId = null;
    try {
      const result = await validateWorkspace(folderPath, tauriFsAdapter);

      if (result.kind === "not_a_course") {
        pageState = { phase: "not_a_course", reason: result.reason };
        return;
      }

      const lessonIds = result.course.lessons.map((l) => l.lesson_id);
      const progress = await loadProgress(folderPath, lessonIds, tauriFsAdapter);

      // Create the progress writer for this workspace.
      activeProgressWriter = makeProgressWriter(folderPath, {
        async appendText(path: string, data: string) {
          await writeTextFile(path, data, { append: true, create: true });
        },
      });

      pageState = { phase: "ready", result, progress };
    } catch (e) {
      pageState = {
        phase: "not_a_course",
        reason: `Unexpected error: ${String(e)}`,
      };
    }
  }

  /** Open a folder picker dialog and load the selected workspace. */
  async function handleOpenWorkspace() {
    const selected = await openDialog({ directory: true, multiple: false });
    if (!selected) return;
    const folderPath = typeof selected === "string" ? selected : selected[0];
    if (!folderPath) return;
    await loadWorkspace(folderPath);
  }

  /** Dev shortcut: load the fixture directly. */
  async function handleLoadFixture() {
    await loadWorkspace(DEV_FIXTURE_PATH);
  }

  function handleClose() {
    pageState = { phase: "idle" };
    playingLesson = null;
    highlightedLessonId = null;
    activeProgressWriter = null;
  }

  /**
   * Called when the learner clicks "Launch" or "Resume" on a lesson.
   * The page only knows `lastBeatId` from the progress fold; LessonPlayer
   * resolves it to a beat index after loading the manifest.
   */
  function handleLaunch(lessonId: string) {
    if (pageState.phase !== "ready") return;
    highlightedLessonId = null;
    const lessonProgress = pageState.progress.lessons.get(lessonId);
    const lastBeatId = lessonProgress?.lastBeatId ?? null;
    playingLesson = { lessonId, lastBeatId };
  }

  /**
   * Return from the lesson player to the course screen (back at first beat).
   * Reload progress so badges refresh.
   */
  async function handleBackToCourse() {
    playingLesson = null;
    pauseNarrationFn = null;
    currentLessonSources = [];
    currentBeatId = undefined;
    await reloadProgress();
  }

  /**
   * Called when LessonPlayer fires lesson_completed.
   * Highlights the next lesson in the course, reloads progress.
   */
  async function handleLessonCompleted(lessonId: string) {
    if (pageState.phase !== "ready") return;
    const lessons = pageState.result.course.lessons;
    const idx = lessons.findIndex((l) => l.lesson_id === lessonId);
    // Highlight the next lesson if there is one
    highlightedLessonId = idx >= 0 && idx + 1 < lessons.length
      ? lessons[idx + 1].lesson_id
      : null;
    playingLesson = null;
    pauseNarrationFn = null;
    currentLessonSources = [];
    currentBeatId = undefined;
    await reloadProgress();
  }

  /** Re-fold progress.jsonl and update the page state. */
  async function reloadProgress() {
    if (pageState.phase !== "ready") return;
    const lessonIds = pageState.result.course.lessons.map((l) => l.lesson_id);
    const progress = await loadProgress(
      pageState.result.workspacePath,
      lessonIds,
      tauriFsAdapter,
    );
    pageState = { ...pageState, progress };
  }
</script>

<!-- ── Sidecar status strip ───────────────────────────────────────────────── -->
<div
  class="sidecar-strip"
  class:sidecar-strip--ready={sidecarStatus === "ready"}
  class:sidecar-strip--error={sidecarStatus === "error"}
  aria-label="Sidecar status"
>
  {#if sidecarStatus === "warming"}
    Tutor warming up…
  {:else if sidecarStatus === "ready"}
    Tutor ready
  {:else}
    Tutor unavailable
  {/if}
</div>

<!-- ── Main content ──────────────────────────────────────────────────────── -->
<main class="shell">
  {#if pageState.phase === "idle"}
    <div class="landing">
      <h1>teach-me Player</h1>
      <p class="landing-sub">Pick a course folder to begin.</p>
      <button class="btn-primary" onclick={handleOpenWorkspace}>
        Open Course Folder
      </button>

      {#if import.meta.env.DEV}
        <div class="dev-fixture">
          <span class="dev-label">DEV</span>
          <button class="btn-ghost-small" onclick={handleLoadFixture}>
            Load example-course fixture
          </button>
        </div>
      {/if}
    </div>

  {:else if pageState.phase === "loading"}
    <div class="loading">
      <p>Checking course folder…</p>
    </div>

  {:else if pageState.phase === "not_a_course"}
    <div class="error-state">
      <h1>This folder isn't a course</h1>
      <p class="error-reason">{pageState.reason}</p>
      <button class="btn-primary" onclick={handleOpenWorkspace}>
        Try Another Folder
      </button>
      {#if import.meta.env.DEV}
        <button class="btn-ghost-small" onclick={handleLoadFixture}>
          Load fixture instead
        </button>
      {/if}
    </div>

  {:else if pageState.phase === "ready"}
    <div class="ready-shell">
      {#if playingLesson && activeProgressWriter}
        <LessonPlayer
          lessonId={playingLesson.lessonId}
          workspacePath={pageState.result.workspacePath}
          resumeFromBeatId={playingLesson.lastBeatId}
          progressWriter={activeProgressWriter}
          onBack={() => void handleBackToCourse()}
          onCompleted={(lid) => void handleLessonCompleted(lid)}
          onRegisterPause={handleRegisterPause}
          onLessonSources={handleLessonSources}
          onCurrentBeatId={handleCurrentBeatId}
        />
      {:else}
        <CourseScreen
          course={pageState.result.course}
          lessons={pageState.result.lessons}
          progress={pageState.progress}
          {highlightedLessonId}
          onLaunch={handleLaunch}
          onClose={handleClose}
        />
      {/if}

      <!-- TutorBox is ALWAYS visible when a workspace is loaded -->
      <TutorBox
        workspacePath={pageState.result.workspacePath}
        lessonId={playingLesson?.lessonId ?? (pageState.result.course.lessons[0]?.lesson_id ?? "")}
        beatId={currentBeatId}
        lessonSources={currentLessonSources}
        courseVoice={pageState.result.course.voice}
        sidecarReady={sidecarStatus}
        progressWriter={activeProgressWriter}
        onPauseNarration={handlePauseNarration}
        {readExcerpt}
      />
    </div>
  {/if}
</main>

<style>
  /* Sidecar strip */
  .sidecar-strip {
    position: fixed;
    top: 0;
    right: 0;
    font-size: 0.72rem;
    padding: 0.25rem 0.75rem;
    background: #f3f4f6;
    color: #666;
    border-bottom-left-radius: 6px;
    z-index: 100;
  }
  .sidecar-strip--ready { background: #dcfce7; color: #166534; }
  .sidecar-strip--error { background: #fee2e2; color: #991b1b; }

  /* Shell */
  :global(body) {
    font-family: -apple-system, system-ui, sans-serif;
    background: #f5f5f5;
    margin: 0;
    padding: 0;
    min-height: 100vh;
  }

  .shell {
    min-height: 100vh;
  }

  /* Ready shell — stacks content + tutor box in a column filling the viewport */
  .ready-shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .ready-shell > :global(:first-child) {
    flex: 1;
  }

  /* Landing */
  .landing {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    gap: 1rem;
    text-align: center;
    padding: 2rem;
  }

  .landing h1 {
    font-size: 2rem;
    font-weight: 700;
    color: #111;
    margin: 0;
  }

  .landing-sub {
    color: #555;
    margin: 0;
  }

  /* Loading */
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    color: #555;
  }

  /* Error */
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    gap: 1rem;
    text-align: center;
    padding: 2rem;
    max-width: 36rem;
    margin: 0 auto;
  }

  .error-state h1 {
    font-size: 1.5rem;
    color: #111;
    margin: 0;
  }

  .error-reason {
    color: #c0392b;
    font-size: 0.95rem;
    margin: 0;
  }

  /* Buttons */
  .btn-primary {
    font-size: 1rem;
    font-weight: 600;
    padding: 0.65rem 1.5rem;
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-primary:hover { background: #2563eb; }

  .btn-ghost-small {
    background: none;
    border: none;
    font-family: inherit;
    font-size: 0.8rem;
    color: #888;
    cursor: pointer;
    padding: 0.25rem 0;
    text-decoration: underline;
  }
  .btn-ghost-small:hover { color: #555; }

  /* Dev fixture bar */
  .dev-fixture {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .dev-label {
    font-size: 0.65rem;
    font-weight: 700;
    background: #fbbf24;
    color: #451a03;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    letter-spacing: 0.06em;
  }
</style>
