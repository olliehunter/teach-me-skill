<script lang="ts">
  /**
   * ContestedBeatView — renders a contested beat with side-by-side positions.
   *
   * Playback (DECISIONS.md §2):
   *   1. Play audio_intro (if present) via asset protocol.
   *   2. Auto-play each position's audio in order (position[0], position[1], …).
   *   3. STOP — never call onBeatComplete.  Manual Next only.
   *
   * Layout:
   *   - CSS grid: two equal columns, one per position.
   *   - Neither side is privileged in size, colour, or ordering signal.
   *   - Active position (currently playing) is highlighted with a subtle ring.
   *   - Per-position citation chips open the shared in-app SourcePanel.
   *
   * Props:
   *   beat          — the ContestedBeat.
   *   sources       — lesson sources[] (for citation resolution).
   *   workspacePath — absolute workspace root (for convertFileSrc asset URLs).
   *   readExcerpt   — async fn(excerptRef) → source text (for SourcePanel).
   *
   * Note: onBeatComplete is intentionally absent — this component never auto-advances.
   */

  import { convertFileSrc } from "@tauri-apps/api/core";
  import CitationChips from "./CitationChips.svelte";
  import SourcePanel from "./SourcePanel.svelte";
  import {
    buildPlaybackSequence,
    advanceStep,
    activePositionIndex,
    isPlaybackDone,
    resolvePositionCitations,
  } from "./contested.js";
  import type { ContestedBeat, Source } from "./types.js";

  interface Props {
    beat: ContestedBeat;
    sources: Source[];
    workspacePath: string;
    readExcerpt: (excerptRef: string) => Promise<string>;
  }

  let { beat, sources, workspacePath, readExcerpt }: Props = $props();

  // ---------------------------------------------------------------------------
  // Playback sequence
  // ---------------------------------------------------------------------------

  const steps = $derived(buildPlaybackSequence(beat));
  let stepIndex = $state(0);

  const currentActivePosition = $derived(activePositionIndex(steps, stepIndex));
  const playbackDone = $derived(isPlaybackDone(steps, stepIndex));

  /** Asset-protocol URL for the current step's audio, or "" when done. */
  const currentAudioSrc = $derived((): string => {
    const step = steps[stepIndex];
    if (!step || step.kind === "done") return "";
    const relPath = step.audioPath;
    if (!relPath) return "";
    try {
      return convertFileSrc(`${workspacePath}/${relPath}`);
    } catch {
      return "";
    }
  });

  // ---------------------------------------------------------------------------
  // Audio element binding
  // ---------------------------------------------------------------------------

  let audioEl: HTMLAudioElement | undefined = $state();

  /**
   * Called when the current audio element fires "ended".
   * Advances to the next step and plays it (or stops at "done").
   *
   * onBeatComplete is NEVER called here — manual Next only.
   */
  function handleAudioEnded() {
    stepIndex = advanceStep(steps, stepIndex);
    // If we just moved to a non-done step, play immediately.
    // The audio element's src will reactively update; we call play() after the
    // microtask tick so the src binding has settled.
    if (!isPlaybackDone(steps, stepIndex)) {
      requestAnimationFrame(() => audioEl?.play().catch(() => {}));
    }
  }

  /**
   * Replay the intro from the beginning (convenience restart).
   */
  function restart() {
    stepIndex = 0;
    requestAnimationFrame(() => audioEl?.play().catch(() => {}));
  }

  // ---------------------------------------------------------------------------
  // Source panel state
  // ---------------------------------------------------------------------------

  let panelSource = $state<Source | null>(null);
  let panelExcerptText = $state<string>("");
  let panelLoading = $state(false);

  async function openSourcePanel(source: Source) {
    panelLoading = true;
    panelSource = source;
    panelExcerptText = "";
    try {
      panelExcerptText = await readExcerpt(source.excerpt_ref);
    } catch {
      panelExcerptText = "(Excerpt not available — check that the course files are intact.)";
    } finally {
      panelLoading = false;
    }
  }

  function closeSourcePanel() {
    panelSource = null;
    panelExcerptText = "";
  }
</script>

<article class="contested-beat" aria-label="Contested beat {beat.id}">

  <!-- ── Question header ──────────────────────────────────────────────────── -->
  <header class="beat-header">
    <div class="header-badge" aria-hidden="true">⚖</div>
    <div class="header-text">
      <p class="intro-label">Different perspectives</p>
      <h2 class="beat-question">{beat.question}</h2>
    </div>
  </header>

  <!-- ── Hidden audio player — manages the intro + positions sequence ─────── -->
  {#if currentAudioSrc() && !playbackDone}
    <audio
      bind:this={audioEl}
      class="audio-player"
      src={currentAudioSrc()}
      controls
      autoplay
      preload="auto"
      aria-label="Contested beat audio"
      onended={handleAudioEnded}
    ></audio>
  {:else if playbackDone}
    <div class="playback-status" role="status">
      <span class="status-done">Playback complete — press Next when ready.</span>
      <button class="restart-btn" onclick={restart} aria-label="Replay from the beginning">
        ↺ Replay
      </button>
    </div>
  {/if}

  <!-- ── Side-by-side positions ───────────────────────────────────────────── -->
  <div
    class="positions-grid"
    style="--column-count: {beat.positions.length}"
  >
    {#each beat.positions as position, i (i)}
      {@const positionSources = resolvePositionCitations(beat, i, sources)}
      {@const isActive = currentActivePosition === i}
      {@const isPlayed = !playbackDone && currentActivePosition !== null && i < (currentActivePosition ?? 0)}

      <section
        class="position-card"
        class:position-card--active={isActive}
        class:position-card--played={isPlayed && !isActive}
        aria-label="Position: {position.label}"
        aria-current={isActive ? "true" : undefined}
      >
        <h3 class="position-label">{position.label}</h3>

        <p class="position-narration">{position.narration}</p>

        <!-- Per-position citation chips -->
        {#if positionSources.length > 0}
          <div class="citations-row">
            <span class="citations-label">Sources</span>
            <CitationChips sources={positionSources} onSelect={openSourcePanel} />
          </div>
        {/if}

        <!-- Playing indicator -->
        {#if isActive}
          <div class="playing-indicator" aria-live="polite" aria-label="Now playing this position">
            <span class="playing-dot" aria-hidden="true"></span>
            <span class="playing-text">Now playing</span>
          </div>
        {/if}
      </section>
    {/each}
  </div>

</article>

<!-- ── Source panel ─────────────────────────────────────────────────────────── -->
{#if panelSource}
  <SourcePanel
    source={panelSource}
    excerptText={panelLoading ? "Loading…" : panelExcerptText}
    onClose={closeSourcePanel}
  />
{/if}

<style>
  /* ── Layout ── */
  .contested-beat {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.5rem;
    max-width: 900px;
    margin: 0 auto;
  }

  /* ── Header ── */
  .beat-header {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .header-badge {
    font-size: 1.75rem;
    line-height: 1.2;
    flex-shrink: 0;
    color: #6366f1;
  }

  .header-text {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .intro-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6366f1;
    margin: 0;
  }

  .beat-question {
    font-size: 1.2rem;
    font-weight: 700;
    color: #111;
    margin: 0;
    line-height: 1.4;
  }

  /* ── Audio row ── */
  .audio-player {
    width: 100%;
    height: 40px;
  }

  .playback-status {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.6rem 0.75rem;
    background: #f3f4f6;
    border-radius: 8px;
    font-size: 0.875rem;
  }

  .status-done {
    color: #6b7280;
    flex: 1;
  }

  .restart-btn {
    background: none;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    padding: 0.25rem 0.6rem;
    font-size: 0.8rem;
    color: #374151;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.12s, border-color 0.12s;
  }

  .restart-btn:hover {
    background: #e5e7eb;
    border-color: #9ca3af;
  }

  /* ── Positions grid ── */
  .positions-grid {
    display: grid;
    /* Symmetric: equal columns regardless of count */
    grid-template-columns: repeat(var(--column-count, 2), 1fr);
    gap: 1rem;
  }

  /* On narrow viewports, stack vertically */
  @media (max-width: 600px) {
    .positions-grid {
      grid-template-columns: 1fr;
    }
  }

  /* ── Position card ── */
  .position-card {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.1rem 1.1rem 0.9rem;
    border: 1.5px solid #e5e7eb;
    border-radius: 10px;
    background: #fafafa;
    transition: border-color 0.15s, box-shadow 0.15s;
    /* Both cards are identical in size and chrome — neither is privileged */
  }

  .position-card--active {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
    background: #f5f5ff;
  }

  .position-card--played {
    opacity: 0.7;
  }

  .position-label {
    font-size: 0.95rem;
    font-weight: 700;
    color: #374151;
    margin: 0;
  }

  .position-narration {
    font-size: 0.925rem;
    line-height: 1.65;
    color: #1a1a1a;
    margin: 0;
    flex: 1;
  }

  /* Citations */
  .citations-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
    margin-top: auto;
  }

  .citations-label {
    font-size: 0.72rem;
    font-weight: 600;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex-shrink: 0;
  }

  /* Playing indicator */
  .playing-indicator {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    color: #6366f1;
    font-weight: 600;
  }

  .playing-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #6366f1;
    animation: pulse 1.2s ease-in-out infinite;
    flex-shrink: 0;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.45; transform: scale(0.75); }
  }

  .playing-text {
    letter-spacing: 0.03em;
  }
</style>
