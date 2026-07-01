<script lang="ts">
  /**
   * NarrationBeatView — renders a single narration beat.
   *
   * Handles:
   *   - Visual rendering (all kinds: svg_file, html_file, inline_svg,
   *     image_file, none) — injected inline after sanitization.
   *   - Audio playback via the Tauri asset protocol.
   *   - Citation chips that open the in-app SourcePanel.
   *   - Link interception inside injected visuals — <a> clicks open the
   *     SourcePanel for matching sources instead of jumping to a browser.
   *
   * Reused as-is by 006 (transport wraps it); citation chips + SourcePanel
   * are also reused by 008 and 010.
   *
   * Props:
   *   beat         — the NarrationBeat to display.
   *   sources      — lesson's sources[] array (for citation resolution).
   *   workspacePath — absolute path to the workspace root.
   *   renderedHtml  — sanitized visual HTML (pre-rendered by parent/LessonPlayer).
   *   visualKind    — discriminant so the template knows how to render.
   *   imageUrl      — asset-protocol URL when visualKind === 'image'.
   *   imageAlt      — alt text for image visuals.
   *   audioSrc      — asset-protocol URL for the beat's WAV file.
   *   readExcerpt   — async fn(excerptRef) → string; reads sources/<id>.md text.
   */

  import { onMount } from "svelte";
  import CitationChips from "./CitationChips.svelte";
  import SourcePanel from "./SourcePanel.svelte";
  import { resolveCitations } from "./citations.js";
  import type { NarrationBeat, Source } from "./types.js";

  interface Props {
    beat: NarrationBeat;
    sources: Source[];
    workspacePath: string;
    renderedHtml: string;         // "" when kind is image or none
    visualKind: "html" | "image" | "none";
    imageUrl: string;             // only used when visualKind === "image"
    imageAlt: string;             // only used when visualKind === "image"
    audioSrc: string;             // asset-protocol URL for the audio file
    /** Reads sources/<id>.md; called when user opens a source panel. */
    readExcerpt: (excerptRef: string) => Promise<string>;
  }

  let {
    beat,
    sources,
    workspacePath,
    renderedHtml,
    visualKind,
    imageUrl,
    imageAlt,
    audioSrc,
    readExcerpt,
  }: Props = $props();

  // ---------------------------------------------------------------------------
  // Citation resolution
  // ---------------------------------------------------------------------------

  const resolvedSources = $derived(resolveCitations(beat.citations, sources));

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

  // ---------------------------------------------------------------------------
  // Visual container — intercept <a> clicks to open source panel
  // ---------------------------------------------------------------------------

  let visualContainer: HTMLDivElement | undefined = $state();

  /**
   * Handle a click event bubbling up from inside the visual container.
   * If the target (or its ancestor) is an <a> element, intercept and check
   * whether the href matches a known source URL.  If yes, open the in-app
   * source panel.  If no match, let the browser handle it (Tauri will open
   * the system browser for external links).
   */
  function handleVisualClick(e: MouseEvent) {
    const target = e.target as Element | null;
    if (!target) return;

    // Walk up to find the nearest <a> ancestor.
    const anchor = target.closest("a");
    if (!anchor) return;

    const href = anchor.getAttribute("href") ?? "";
    if (!href || href.startsWith("#")) return; // fragment links: let pass

    // Check if the href matches a known source URL.
    const matchedSource = resolvedSources.find((s) => s.url === href);
    if (matchedSource) {
      e.preventDefault();
      openSourcePanel(matchedSource);
    }
    // If no match, do nothing — Tauri's default behaviour will open the
    // system browser for external hrefs.
  }
</script>

<article class="narration-beat" aria-label="Narration beat {beat.id}">

  <!-- ── Visual ──────────────────────────────────────────────────────────── -->
  <div
    class="visual-container"
    bind:this={visualContainer}
    onclick={handleVisualClick}
    onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") handleVisualClick(e as unknown as MouseEvent); }}
    role="presentation"
  >
    {#if visualKind === "html" && renderedHtml}
      <!-- Sanitized SVG or HTML injected inline so styles.css cascades -->
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html renderedHtml}
    {:else if visualKind === "image"}
      <img class="visual-image" src={imageUrl} alt={imageAlt} />
    {:else if visualKind === "none"}
      <!-- No visual for this beat -->
      <div class="visual-none" aria-hidden="true"></div>
    {/if}
  </div>

  <!-- ── Narration text ──────────────────────────────────────────────────── -->
  <div class="narration-text" aria-live="polite">
    <p>{beat.narration}</p>
  </div>

  <!-- ── Audio player ────────────────────────────────────────────────────── -->
  <div class="audio-row">
    {#if audioSrc}
      <!-- autoplay is deliberately off; 006 (transport) controls playback.
           controls=true lets the learner play/pause manually in this substrate. -->
      <audio
        class="audio-player"
        src={audioSrc}
        controls
        preload="auto"
        aria-label="Narration audio"
      ></audio>
    {:else}
      <p class="audio-missing">Audio not available for this beat.</p>
    {/if}
  </div>

  <!-- ── Citation chips ──────────────────────────────────────────────────── -->
  {#if resolvedSources.length > 0}
    <div class="citations-row">
      <span class="citations-label">Sources</span>
      <CitationChips sources={resolvedSources} onSelect={openSourcePanel} />
    </div>
  {/if}

</article>

<!-- ── Source panel (rendered outside the article to sit above everything) -->
{#if panelSource}
  <SourcePanel
    source={panelSource}
    excerptText={panelLoading ? "Loading…" : panelExcerptText}
    onClose={closeSourcePanel}
  />
{/if}

<style>
  .narration-beat {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 1.5rem;
    max-width: 720px;
    margin: 0 auto;
  }

  /* Visual */
  .visual-container {
    width: 100%;
    border-radius: 8px;
    overflow: hidden;
    background: #fbfaf7;
    border: 1px solid #e5e7eb;
    min-height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Allow injected SVGs to fill the container */
  .visual-container :global(svg) {
    max-width: 100%;
    height: auto;
    display: block;
  }

  .visual-image {
    max-width: 100%;
    height: auto;
    display: block;
  }

  .visual-none {
    width: 100%;
    height: 100px;
  }

  /* Narration */
  .narration-text p {
    font-size: 1rem;
    line-height: 1.65;
    color: #1a1a1a;
    margin: 0;
  }

  /* Audio */
  .audio-row {
    display: flex;
    align-items: center;
  }

  .audio-player {
    width: 100%;
    height: 40px;
  }

  .audio-missing {
    font-size: 0.85rem;
    color: #9ca3af;
    margin: 0;
  }

  /* Citations */
  .citations-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .citations-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex-shrink: 0;
  }
</style>
