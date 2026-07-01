<script lang="ts">
  /**
   * teach-me Player — root page.
   *
   * States:
   *   idle        → "Open Course Folder" button (+ dev fixture shortcut)
   *   loading     → validating workspace
   *   not_a_course → friendly error
   *   ready       → CourseScreen
   *
   * The sidecar health check remains in a collapsed status strip so the
   * tutor (Phase 4) can reflect its status; it doesn't block course browsing.
   *
   * Seam for 005/006: `handleLaunch(lessonId)` is called when the learner
   * clicks Launch on the course screen.  Wire it to the playback route in
   * issue 005.
   */

  import { onMount, onDestroy } from "svelte";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { readTextFile, exists } from "@tauri-apps/plugin-fs";
  import { pollSidecarHealth } from "$lib/sidecar.js";
  import { validateWorkspace } from "$lib/workspace.js";
  import { loadProgress } from "$lib/progress.js";
  import CourseScreen from "$lib/CourseScreen.svelte";
  import type { FsAdapter, WorkspaceValidationResult } from "$lib/workspace.js";
  import type { CourseProgress } from "$lib/progress.js";

  // ---------------------------------------------------------------------------
  // Tauri fs adapter — wraps plugin-fs for injection into pure workspace logic
  // ---------------------------------------------------------------------------

  const tauriFsAdapter: FsAdapter = {
    readTextFile: (path) => readTextFile(path),
    exists: (path) => exists(path),
  };

  // ---------------------------------------------------------------------------
  // Sidecar health (used by the tutor in Phase 4; shown as a small status strip)
  // ---------------------------------------------------------------------------

  let sidecarStatus = $state<"waiting" | "ready" | "error">("waiting");

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
  // Workspace state machine
  // ---------------------------------------------------------------------------

  type PageState =
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "not_a_course"; reason: string }
    | { phase: "ready"; result: WorkspaceValidationResult & { kind: "valid" }; progress: CourseProgress };

  let pageState = $state<PageState>({ phase: "idle" });

  // Dev affordance: if running in dev mode, allow loading the fixture path
  // directly without a dialog.  Gated on import.meta.env.DEV so it compiles
  // away in production builds.
  const DEV_FIXTURE_PATH =
    "/Users/ollie/development/teachmeplayer/docs/fixtures/example-course";

  /** Load a workspace from a folder path (used by both the dialog and dev shortcut). */
  async function loadWorkspace(folderPath: string) {
    pageState = { phase: "loading" };
    try {
      const result = await validateWorkspace(folderPath, tauriFsAdapter);

      if (result.kind === "not_a_course") {
        pageState = { phase: "not_a_course", reason: result.reason };
        return;
      }

      const lessonIds = result.course.lessons.map((l) => l.lesson_id);
      const progress = await loadProgress(folderPath, lessonIds, tauriFsAdapter);

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
    if (!selected) return; // user cancelled
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
  }

  /**
   * Seam for 005/006 — called when the learner clicks "Launch" on a lesson.
   * Replace this with a navigation call (e.g. goto(`/lesson/${lessonId}`))
   * once the playback route exists.
   */
  function handleLaunch(lessonId: string) {
    // TODO (issue-005): navigate to the lesson playback view
    console.log("[teach-me] launch lesson", lessonId);
    alert(`Lesson ${lessonId} playback — coming in issue 005!`);
  }
</script>

<!-- ── Sidecar status strip ───────────────────────────────────────────────── -->
<div
  class="sidecar-strip"
  class:sidecar-strip--ready={sidecarStatus === "ready"}
  class:sidecar-strip--error={sidecarStatus === "error"}
  aria-label="Sidecar status"
>
  {#if sidecarStatus === "waiting"}
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
    <CourseScreen
      course={pageState.result.course}
      lessons={pageState.result.lessons}
      progress={pageState.progress}
      onLaunch={handleLaunch}
      onClose={handleClose}
    />
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
