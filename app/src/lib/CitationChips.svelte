<script lang="ts">
  /**
   * CitationChips — renders a row of clickable citation chips.
   *
   * Each chip shows the source ID and title.  Clicking a chip fires `onSelect`
   * with the Source object so the parent can open the SourcePanel.
   *
   * Reused by 008 (contested beat, per-position citations) and 010 (tutor).
   *
   * Props:
   *   sources  — resolved Source objects (already looked up by the parent).
   *   onSelect — called with the Source when a chip is clicked.
   */

  import type { Source } from "./types.js";

  interface Props {
    sources: Source[];
    onSelect: (source: Source) => void;
  }

  let { sources, onSelect }: Props = $props();
</script>

{#if sources.length > 0}
  <ul class="citation-chips" aria-label="Citations">
    {#each sources as source (source.id)}
      <li>
        <button
          class="chip"
          onclick={() => onSelect(source)}
          title={source.title}
          aria-label="View source: {source.title}"
        >
          <span class="chip-id">{source.id}</span>
          <span class="chip-title">{source.title}</span>
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .citation-chips {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.2rem 0.6rem;
    background: #f0f4ff;
    border: 1px solid #c7d5f5;
    border-radius: 999px;
    font-family: inherit;
    font-size: 0.78rem;
    color: #2563eb;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s;
    max-width: 220px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chip:hover {
    background: #dbeafe;
    border-color: #93c5fd;
  }

  .chip-id {
    font-weight: 700;
    flex-shrink: 0;
  }

  .chip-title {
    overflow: hidden;
    text-overflow: ellipsis;
    color: #374151;
    font-weight: 400;
  }
</style>
