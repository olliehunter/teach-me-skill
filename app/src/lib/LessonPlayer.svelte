<script lang="ts">
  /**
   * LessonPlayer — substrate for playing a lesson one beat at a time.
   *
   * Responsibilities for issue 005:
   *   - Load the lesson manifest from the workspace.
   *   - Inject workspace assets/styles.css once as a global <style> block.
   *   - Render the current beat (starting at beat index 0).
   *   - Compute the rendered visual (reads file / converts to asset URL).
   *   - Provide readExcerpt() for the SourcePanel.
   *
   * Issue 006 (transport) will wrap this and add prev/next navigation.
   * The `beatIndex` prop is exposed so 006 can control which beat is shown.
   *
   * Props:
   *   lessonId     — the lesson to load (e.g. "0001").
   *   workspacePath — absolute path to the workspace root.
   *   beatIndex    — index of the beat to display (default 0; 006 drives this).
   *   onBack       — called when the learner wants to return to the course screen.
   */

  import { onMount } from "svelte";
  import { readTextFile } from "@tauri-apps/plugin-fs";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import NarrationBeatView from "./NarrationBeatView.svelte";
  import { renderVisual } from "./visualRenderer.js";
  import type { LessonManifest, NarrationBeat } from "./types.js";
  import type { FsAdapter } from "./workspace.js";
  import type { RenderedVisual } from "./visualRenderer.js";

  interface Props {
    lessonId: string;
    workspacePath: string;
    beatIndex?: number;
    onBack: () => void;
  }

  let { lessonId, workspacePath, beatIndex = 0, onBack }: Props = $props();

  // ---------------------------------------------------------------------------
  // Tauri fs adapter
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
  // Load state
  // ---------------------------------------------------------------------------

  type LoadState =
    | { phase: "loading" }
    | { phase: "error"; message: string }
    | {
        phase: "ready";
        manifest: LessonManifest;
        rendered: RenderedVisual;
      };

  let loadState = $state<LoadState>({ phase: "loading" });

  // ---------------------------------------------------------------------------
  // Derived: current narration beat
  // ---------------------------------------------------------------------------

  function getNarrationBeat(
    manifest: LessonManifest,
    idx: number,
  ): NarrationBeat | null {
    const beat = manifest.beats[idx];
    if (!beat || beat.type !== "narration") return null;
    return beat as NarrationBeat;
  }

  // ---------------------------------------------------------------------------
  // styles.css injection (once per lesson load)
  // ---------------------------------------------------------------------------

  async function injectWorkspaceStyles(wp: string) {
    const styleId = "workspace-styles";
    if (document.getElementById(styleId)) return; // already injected
    try {
      const css = await readTextFile(`${wp}/assets/styles.css`);
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = css;
      document.head.appendChild(style);
    } catch {
      // styles.css is optional; silently skip if absent
    }
  }

  // ---------------------------------------------------------------------------
  // Load the lesson manifest + render visual for the current beat
  // ---------------------------------------------------------------------------

  async function loadLesson() {
    loadState = { phase: "loading" };
    try {
      // Inject workspace styles first (idempotent).
      await injectWorkspaceStyles(workspacePath);

      // Find and parse the lesson manifest.
      const { course } = await findManifestPath(workspacePath, lessonId);
      const raw = await readTextFile(course);
      const manifest = JSON.parse(raw) as LessonManifest;

      // Render the first beat's visual.
      const beat = getNarrationBeat(manifest, beatIndex);
      if (!beat) {
        loadState = {
          phase: "error",
          message: `Beat at index ${beatIndex} is not a narration beat.`,
        };
        return;
      }

      const rendered = await renderVisual(
        beat.visual,
        workspacePath,
        tauriFsAdapter,
        convertFileSrc,
      );

      loadState = { phase: "ready", manifest, rendered };
    } catch (e) {
      loadState = { phase: "error", message: String(e) };
    }
  }

  /**
   * Locate the lesson JSON file.
   * Matches lessons/<lessonId>-<any-slug>.json by scanning all files.
   * For simplicity we try the manifest via course.json first.
   */
  async function findManifestPath(
    wp: string,
    lid: string,
  ): Promise<{ course: string }> {
    // Read course.json to get the slug.
    const courseJsonPath = `${wp}/course.json`;
    const courseRaw = await readTextFile(courseJsonPath);
    const course = JSON.parse(courseRaw);
    const ref = (course.lessons as Array<{ lesson_id: string; slug: string }>).find(
      (l) => l.lesson_id === lid,
    );
    if (!ref) throw new Error(`Lesson ${lid} not found in course.json`);
    const lessonPath = `${wp}/lessons/${ref.lesson_id}-${ref.slug}.json`;
    return { course: lessonPath };
  }

  // ---------------------------------------------------------------------------
  // readExcerpt — passed to NarrationBeatView for the SourcePanel
  // ---------------------------------------------------------------------------

  async function readExcerpt(excerptRef: string): Promise<string> {
    // excerpt_ref is workspace-relative (e.g. "sources/s1.md")
    return readTextFile(`${workspacePath}/${excerptRef}`);
  }

  // ---------------------------------------------------------------------------
  // Reactive: reload when lessonId or beatIndex changes
  // ---------------------------------------------------------------------------

  $effect(() => {
    // Track dependencies.
    const _lid = lessonId;
    const _idx = beatIndex;
    const _wp = workspacePath;
    void loadLesson();
  });
</script>

<div class="lesson-player">
  <!-- Back button -->
  <div class="top-bar">
    <button class="btn-back" onclick={onBack}>← Course</button>
    {#if loadState.phase === "ready"}
      <span class="lesson-title">{loadState.manifest.title}</span>
    {/if}
  </div>

  {#if loadState.phase === "loading"}
    <div class="status-center">
      <p>Loading lesson…</p>
    </div>

  {:else if loadState.phase === "error"}
    <div class="status-center status-error">
      <p>Could not load lesson: {loadState.message}</p>
      <button class="btn-back" onclick={onBack}>Back to course</button>
    </div>

  {:else if loadState.phase === "ready"}
    {@const beat = getNarrationBeat(loadState.manifest, beatIndex)}
    {#if beat}
      <NarrationBeatView
        {beat}
        sources={loadState.manifest.sources}
        {workspacePath}
        renderedHtml={loadState.rendered.kind === "html" ? loadState.rendered.html : ""}
        visualKind={loadState.rendered.kind}
        imageUrl={loadState.rendered.kind === "image" ? loadState.rendered.url : ""}
        imageAlt={loadState.rendered.kind === "image" ? loadState.rendered.alt : ""}
        audioSrc={convertFileSrc(`${workspacePath}/${beat.audio}`)}
        {readExcerpt}
      />
    {:else}
      <div class="status-center">
        <p>No narration beat at this position.</p>
      </div>
    {/if}
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

  .btn-back {
    background: none;
    border: none;
    font-family: inherit;
    font-size: 0.875rem;
    color: #555;
    cursor: pointer;
    padding: 0.25rem 0;
    transition: color 0.15s;
    flex-shrink: 0;
  }

  .btn-back:hover {
    color: #111;
  }

  .lesson-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: #374151;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
  }

  .status-error {
    color: #c0392b;
  }
</style>
