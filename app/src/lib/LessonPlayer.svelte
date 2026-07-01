<script lang="ts">
  /**
   * LessonPlayer — full lesson playback with transport + progress writing.
   *
   * Issue 006 responsibilities:
   *   - Load the lesson manifest (once per lessonId).
   *   - Inject workspace assets/styles.css once as a global <style> block.
   *   - Dispatch each beat through BeatView (the beat-type seam for 007/008).
   *   - Transport: auto-advance on narration audio ended; manual pause/play,
   *     replay-beat, back, next.
   *   - Beat-nav edges: back@first → onBack(); next@last → lesson_completed
   *     → onCompleted(lessonId).
   *   - Progress writing: lesson_started, beat_viewed (on enter), flag_lost,
   *     lesson_completed.
   *   - Resume: accepts `initialBeatIndex` (derived from progress fold by
   *     the parent); clamps it to valid range.
   *
   * Props:
   *   lessonId         — lesson to load (e.g. "0001").
   *   workspacePath    — absolute path to workspace root.
   *   initialBeatIndex — starting beat (default 0; set from progress fold for resume).
   *   onBack           — called when learner returns to course screen (back at first beat).
   *   onCompleted      — called when lesson_completed fires; parent highlights next lesson.
   *   progressWriter   — typed writer injected by parent (testable).
   */

  import { onMount } from "svelte";
  import { readTextFile } from "@tauri-apps/plugin-fs";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import BeatView from "./BeatView.svelte";
  import { renderVisual } from "./visualRenderer.js";
  import { stepBack, stepNext, clampBeatIndex } from "./transport.js";
  import { buildEvent } from "./progressWriter.js";
  import { resumeBeatIndex } from "./progress.js";
  import type { LessonManifest } from "./types.js";
  import type { FsAdapter } from "./workspace.js";
  import type { RenderedVisual } from "./visualRenderer.js";
  import type { ProgressWriter } from "./progressWriter.js";

  interface Props {
    lessonId: string;
    workspacePath: string;
    /**
     * Beat id to resume from (derived from progress fold by the parent).
     * If provided, LessonPlayer resolves it to a beat index after loading
     * the manifest.  Takes precedence over initialBeatIndex.
     */
    resumeFromBeatId?: string | null;
    /**
     * Fallback starting beat index (default 0).
     * Ignored when resumeFromBeatId is provided and resolves to a valid beat.
     */
    initialBeatIndex?: number;
    onBack: () => void;
    onCompleted: (lessonId: string) => void;
    progressWriter: ProgressWriter;
  }

  let {
    lessonId,
    workspacePath,
    resumeFromBeatId = null,
    initialBeatIndex = 0,
    onBack,
    onCompleted,
    progressWriter,
  }: Props = $props();

  // ---------------------------------------------------------------------------
  // Tauri fs adapter (read-only; writing goes through progressWriter)
  // ---------------------------------------------------------------------------

  const tauriFsAdapter: FsAdapter = {
    readTextFile: (path) => readTextFile(path),
    exists: async (path) => {
      try {
        await readTextFile(path);
        return true;
      } catch {
        return false;
      }
    },
  };

  // ---------------------------------------------------------------------------
  // Load state — manifest loaded once per lessonId
  // ---------------------------------------------------------------------------

  type ManifestState =
    | { phase: "loading" }
    | { phase: "error"; message: string }
    | { phase: "ready"; manifest: LessonManifest };

  let manifestState = $state<ManifestState>({ phase: "loading" });

  // ---------------------------------------------------------------------------
  // Transport state
  // ---------------------------------------------------------------------------

  /** 0-based index of the current beat. */
  let currentBeatIndex = $state(0);

  // ---------------------------------------------------------------------------
  // Visual render cache — one RenderedVisual per beat index
  // ---------------------------------------------------------------------------

  let renderedVisual = $state<RenderedVisual>({ kind: "none" });

  // ---------------------------------------------------------------------------
  // styles.css injection (idempotent, once per session)
  // ---------------------------------------------------------------------------

  async function injectWorkspaceStyles(wp: string) {
    const styleId = "workspace-styles";
    if (document.getElementById(styleId)) return;
    try {
      const css = await readTextFile(`${wp}/assets/styles.css`);
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = css;
      document.head.appendChild(style);
    } catch {
      // styles.css is optional
    }
  }

  // ---------------------------------------------------------------------------
  // Find the lesson manifest path via course.json
  // ---------------------------------------------------------------------------

  async function findManifestPath(wp: string, lid: string): Promise<string> {
    const courseRaw = await readTextFile(`${wp}/course.json`);
    const course = JSON.parse(courseRaw) as {
      lessons: Array<{ lesson_id: string; slug: string }>;
    };
    const ref = course.lessons.find((l) => l.lesson_id === lid);
    if (!ref) throw new Error(`Lesson ${lid} not found in course.json`);
    return `${wp}/lessons/${ref.lesson_id}-${ref.slug}.json`;
  }

  // ---------------------------------------------------------------------------
  // Load the manifest (once per lessonId / workspacePath)
  // ---------------------------------------------------------------------------

  async function loadManifest() {
    manifestState = { phase: "loading" };
    try {
      await injectWorkspaceStyles(workspacePath);
      const manifestPath = await findManifestPath(workspacePath, lessonId);
      const raw = await readTextFile(manifestPath);
      const manifest = JSON.parse(raw) as LessonManifest;
      manifestState = { phase: "ready", manifest };
    } catch (e) {
      manifestState = { phase: "error", message: String(e) };
    }
  }

  // ---------------------------------------------------------------------------
  // Render the visual for the current beat
  // ---------------------------------------------------------------------------

  async function renderCurrentVisual(manifest: LessonManifest, beatIdx: number) {
    const beat = manifest.beats[beatIdx];
    if (!beat) {
      renderedVisual = { kind: "none" };
      return;
    }
    if (beat.type === "narration") {
      try {
        renderedVisual = await renderVisual(
          beat.visual,
          workspacePath,
          tauriFsAdapter,
          convertFileSrc,
        );
      } catch {
        renderedVisual = { kind: "none" };
      }
    } else {
      // Quiz / contested placeholders don't use a pre-rendered visual
      renderedVisual = { kind: "none" };
    }
  }

  // ---------------------------------------------------------------------------
  // readExcerpt — passed to BeatView → NarrationBeatView → SourcePanel
  // ---------------------------------------------------------------------------

  async function readExcerpt(excerptRef: string): Promise<string> {
    return readTextFile(`${workspacePath}/${excerptRef}`);
  }

  // ---------------------------------------------------------------------------
  // Progress helpers
  // ---------------------------------------------------------------------------

  async function writeLessonStarted() {
    await progressWriter.append(
      buildEvent({ lesson: lessonId, event: "lesson_started" }),
    );
  }

  async function writeBeatViewed(beatId: string) {
    await progressWriter.append(
      buildEvent({ lesson: lessonId, beat: beatId, event: "beat_viewed" }),
    );
  }

  async function writeLessonCompleted() {
    await progressWriter.append(
      buildEvent({ lesson: lessonId, event: "lesson_completed" }),
    );
  }

  async function writeFlagLost(beatId: string) {
    await progressWriter.append(
      buildEvent({ lesson: lessonId, beat: beatId, event: "flag_lost" }),
    );
  }

  async function writeQuizAnswer(beatId: string, chosen: string, correct: boolean) {
    await progressWriter.append(
      buildEvent({
        lesson: lessonId,
        beat: beatId,
        event: "quiz_answer",
        chosen,
        correct,
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Navigate to a beat index (write beat_viewed, re-render visual)
  // ---------------------------------------------------------------------------

  async function goToBeat(manifest: LessonManifest, idx: number) {
    const clamped = clampBeatIndex(idx, manifest.beats.length);
    currentBeatIndex = clamped;
    const beat = manifest.beats[clamped];
    if (beat) await writeBeatViewed(beat.id);
    await renderCurrentVisual(manifest, clamped);
  }

  // ---------------------------------------------------------------------------
  // Transport handlers
  // ---------------------------------------------------------------------------

  function handleBack() {
    if (manifestState.phase !== "ready") return;
    const result = stepBack(currentBeatIndex);
    if (result.action === "back_to_course") {
      onBack();
    } else {
      void goToBeat(manifestState.manifest, result.index);
    }
  }

  async function handleNext() {
    if (manifestState.phase !== "ready") return;
    const result = stepNext(currentBeatIndex, manifestState.manifest.beats.length);
    if (result.action === "lesson_completed") {
      await writeLessonCompleted();
      onCompleted(lessonId);
    } else {
      void goToBeat(manifestState.manifest, result.index);
    }
  }

  /** Called by BeatView when narration audio ends — triggers auto-advance. */
  function handleBeatComplete() {
    void handleNext();
  }

  async function handleFlagLost() {
    if (manifestState.phase !== "ready") return;
    const beat = manifestState.manifest.beats[currentBeatIndex];
    if (beat) await writeFlagLost(beat.id);
  }

  // ---------------------------------------------------------------------------
  // Compute starting beat index from resumeFromBeatId or initialBeatIndex
  // ---------------------------------------------------------------------------

  function computeStartIndex(manifest: LessonManifest): number {
    if (resumeFromBeatId) {
      const beatIds = manifest.beats.map((b) => b.id);
      const resolved = resumeBeatIndex(beatIds, {
        lessonId,
        state: "in_progress",
        lastBeatId: resumeFromBeatId,
      });
      // resumeBeatIndex returns 0 for unknown ids; only use if > 0 or explicitly matched
      const matchIdx = beatIds.indexOf(resumeFromBeatId);
      if (matchIdx >= 0) return matchIdx;
    }
    return clampBeatIndex(initialBeatIndex, manifest.beats.length);
  }

  // ---------------------------------------------------------------------------
  // Reactive effects
  // ---------------------------------------------------------------------------

  // Reload manifest when lessonId or workspacePath changes.
  $effect(() => {
    const _lid = lessonId;
    const _wp = workspacePath;
    void (async () => {
      await loadManifest();
      // After loading, jump to the start beat and write lesson_started + beat_viewed.
      if (manifestState.phase === "ready") {
        const startIdx = computeStartIndex(manifestState.manifest);
        currentBeatIndex = startIdx;
        await writeLessonStarted();
        const beat = manifestState.manifest.beats[startIdx];
        if (beat) await writeBeatViewed(beat.id);
        await renderCurrentVisual(manifestState.manifest, startIdx);
      }
    })();
  });
</script>

<div class="lesson-player">
  <!-- ── Top bar ──────────────────────────────────────────────────────────── -->
  <div class="top-bar">
    <button class="btn-ghost btn-back" onclick={handleBack}>← Back</button>
    {#if manifestState.phase === "ready"}
      <span class="lesson-title">{manifestState.manifest.title}</span>
      <span class="beat-counter">
        {currentBeatIndex + 1} / {manifestState.manifest.beats.length}
      </span>
    {/if}
  </div>

  <!-- ── Beat content ─────────────────────────────────────────────────────── -->
  <div class="beat-content">
    {#if manifestState.phase === "loading"}
      <div class="status-center">
        <p>Loading lesson…</p>
      </div>

    {:else if manifestState.phase === "error"}
      <div class="status-center status-error">
        <p>Could not load lesson: {manifestState.message}</p>
        <button class="btn-ghost" onclick={onBack}>Back to course</button>
      </div>

    {:else if manifestState.phase === "ready"}
      {@const beat = manifestState.manifest.beats[currentBeatIndex]}
      {#if beat}
        <BeatView
          {beat}
          sources={manifestState.manifest.sources}
          {workspacePath}
          {renderedVisual}
          audioSrc={beat.type === "narration"
            ? convertFileSrc(`${workspacePath}/${beat.audio}`)
            : ""}
          {readExcerpt}
          onBeatComplete={handleBeatComplete}
          onQuizAnswer={(chosen, correct) =>
            void writeQuizAnswer(beat.id, chosen, correct)}
        />
      {:else}
        <div class="status-center">
          <p>No beat at position {currentBeatIndex}.</p>
        </div>
      {/if}
    {/if}
  </div>

  <!-- ── Transport bar ────────────────────────────────────────────────────── -->
  {#if manifestState.phase === "ready"}
    <div class="transport-bar">
      <div class="transport-left">
        <button
          class="btn-transport btn-flag"
          onclick={handleFlagLost}
          title="I was lost here — flag this beat"
          aria-label="Flag: I was lost here"
        >
          ? Lost
        </button>
      </div>

      <div class="transport-center">
        <button
          class="btn-transport btn-back-beat"
          onclick={handleBack}
          aria-label="Previous beat"
        >
          ← Back
        </button>

        <button
          class="btn-transport btn-next-beat"
          onclick={() => void handleNext()}
          aria-label="Next beat"
        >
          Next →
        </button>
      </div>

      <div class="transport-right">
        <!-- Spacer to balance the left "Lost" button -->
      </div>
    </div>
  {/if}
</div>

<style>
  .lesson-player {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: #f5f5f5;
  }

  /* Top bar */
  .top-bar {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.6rem 1.25rem;
    background: #fff;
    border-bottom: 1px solid #e5e7eb;
    min-height: 48px;
    flex-shrink: 0;
  }

  .btn-ghost {
    background: none;
    border: none;
    font-family: inherit;
    cursor: pointer;
    padding: 0.25rem 0;
    transition: color 0.15s;
    color: #555;
  }
  .btn-ghost:hover { color: #111; }

  .btn-back {
    font-size: 0.875rem;
    flex-shrink: 0;
  }

  .lesson-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: #374151;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }

  .beat-counter {
    font-size: 0.8rem;
    color: #9ca3af;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  /* Beat content area */
  .beat-content {
    flex: 1;
    overflow-y: auto;
  }

  /* Status messages */
  .status-center {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    color: #555;
    padding: 2rem;
    text-align: center;
    min-height: 300px;
  }

  .status-error {
    color: #c0392b;
  }

  /* Transport bar */
  .transport-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.25rem;
    background: #fff;
    border-top: 1px solid #e5e7eb;
    flex-shrink: 0;
  }

  .transport-left,
  .transport-right {
    min-width: 80px;
  }

  .transport-right {
    /* spacer */
  }

  .transport-center {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .btn-transport {
    font-family: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    border: 1px solid #e5e7eb;
    background: #f9fafb;
    color: #374151;
  }

  .btn-transport:hover {
    background: #f3f4f6;
    border-color: #9ca3af;
  }

  .btn-back-beat {
    /* same as default */
  }

  .btn-next-beat {
    background: #3b82f6;
    color: #fff;
    border-color: #3b82f6;
  }

  .btn-next-beat:hover {
    background: #2563eb;
    border-color: #2563eb;
  }

  .btn-flag {
    background: none;
    border-color: transparent;
    color: #9ca3af;
    font-size: 0.8rem;
    font-weight: 500;
    padding: 0.4rem 0.6rem;
  }

  .btn-flag:hover {
    color: #ef4444;
    background: #fef2f2;
    border-color: #fca5a5;
  }
</style>
