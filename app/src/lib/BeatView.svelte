<script lang="ts">
  /**
   * BeatView — beat-type dispatch component.
   *
   * This is the SEAM for issues 007 (quiz) and 008 (contested).
   * Each beat type has its own branch here.  Adding a new beat type means:
   *   1. Import the new <FooBeatView> component.
   *   2. Add an {:else if beat.type === "foo"} branch below.
   *   3. Pass the `onBeatComplete` callback when the beat's content is done
   *      (e.g. after quiz explanation audio ends for 007, or manually for 008).
   *
   * For NARRATION: `onBeatComplete` is wired to the audio `ended` event so
   *   the transport auto-advances.
   * For QUIZ / CONTESTED (placeholder): the learner must press Next;
   *   `onBeatComplete` is NOT called automatically.  007/008 will wire it up.
   *
   * Props:
   *   beat           — the current Beat (discriminated union).
   *   sources        — lesson sources array (for citation chips).
   *   workspacePath  — absolute workspace root.
   *   renderedHtml   — pre-rendered visual HTML (narration beats only).
   *   visualKind     — "html" | "image" | "none" (narration beats only).
   *   imageUrl       — asset-protocol URL (narration image beats only).
   *   imageAlt       — alt text for image visuals (narration beats only).
   *   audioSrc       — asset-protocol URL for beat audio (narration beats only).
   *   readExcerpt    — async fn(excerptRef) → source text.
   *   onBeatComplete — called when narration audio ends (triggers auto-advance).
   *                    NOT called by quiz/contested placeholders.
   */

  import NarrationBeatView from "./NarrationBeatView.svelte";
  import type { Beat, Source } from "./types.js";
  import type { RenderedVisual } from "./visualRenderer.js";

  interface Props {
    beat: Beat;
    sources: Source[];
    workspacePath: string;
    // Narration rendering (pre-computed by LessonPlayer; ignored for quiz/contested)
    renderedVisual: RenderedVisual;
    audioSrc: string;
    readExcerpt: (excerptRef: string) => Promise<string>;
    /** Called when the beat's content completes naturally (narration: audio ended). */
    onBeatComplete: () => void;
  }

  let {
    beat,
    sources,
    workspacePath,
    renderedVisual,
    audioSrc,
    readExcerpt,
    onBeatComplete,
  }: Props = $props();
</script>

{#if beat.type === "narration"}
  <NarrationBeatView
    {beat}
    {sources}
    {workspacePath}
    renderedHtml={renderedVisual.kind === "html" ? renderedVisual.html : ""}
    visualKind={renderedVisual.kind}
    imageUrl={renderedVisual.kind === "image" ? renderedVisual.url : ""}
    imageAlt={renderedVisual.kind === "image" ? renderedVisual.alt : ""}
    {audioSrc}
    {readExcerpt}
    {onBeatComplete}
  />

{:else if beat.type === "quiz"}
  <!--
    Quiz beat placeholder — 007 will replace this with full quiz interaction.
    No auto-advance: the learner presses Next when ready.
  -->
  <div class="beat-placeholder beat-placeholder--quiz" role="region" aria-label="Quiz beat {beat.id}">
    <div class="placeholder-icon" aria-hidden="true">?</div>
    <h2 class="placeholder-title">Quiz</h2>
    <p class="placeholder-prompt">{beat.prompt}</p>
    <p class="placeholder-note">Full quiz interaction coming in issue 007. Press Next to continue.</p>
  </div>

{:else if beat.type === "contested"}
  <!--
    Contested beat placeholder — 008 will replace this with side-by-side positions.
    No auto-advance: the learner presses Next when ready.
  -->
  <div class="beat-placeholder beat-placeholder--contested" role="region" aria-label="Contested beat {beat.id}">
    <div class="placeholder-icon" aria-hidden="true">⚖</div>
    <h2 class="placeholder-title">Contested</h2>
    <p class="placeholder-prompt">{beat.question}</p>
    <p class="placeholder-note">Full contested view coming in issue 008. Press Next to continue.</p>
  </div>

{:else}
  <!-- Unknown beat type — future-proof fallback -->
  <div class="beat-placeholder beat-placeholder--unknown" role="region" aria-label="Unknown beat type">
    <p>Unknown beat type. Press Next to continue.</p>
  </div>
{/if}

<style>
  .beat-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 3rem 2rem;
    max-width: 720px;
    margin: 0 auto;
    text-align: center;
  }

  .placeholder-icon {
    font-size: 3rem;
    line-height: 1;
    color: #9ca3af;
  }

  .placeholder-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: #374151;
    margin: 0;
  }

  .placeholder-prompt {
    font-size: 1rem;
    color: #1a1a1a;
    margin: 0;
    max-width: 36rem;
    line-height: 1.65;
  }

  .placeholder-note {
    font-size: 0.85rem;
    color: #9ca3af;
    font-style: italic;
    margin: 0;
  }

  .beat-placeholder--quiz {
    border: 2px dashed #e5e7eb;
    border-radius: 12px;
    background: #fafafa;
    margin-top: 1.5rem;
  }

  .beat-placeholder--contested {
    border: 2px dashed #e5e7eb;
    border-radius: 12px;
    background: #fafafa;
    margin-top: 1.5rem;
  }

  .beat-placeholder--unknown {
    border: 2px dashed #fca5a5;
    border-radius: 12px;
    background: #fff5f5;
    margin-top: 1.5rem;
    color: #c0392b;
  }
</style>
