<script lang="ts">
  /**
   * SourcePanel — in-app panel showing a cached source excerpt + outbound link.
   *
   * Opened by citation chips and by <a> link interception inside injected visuals.
   * Reused by 008 (contested citations) and 010 (tutor source citations).
   *
   * Props:
   *   source      — the Source object from the lesson manifest.
   *   excerptText — raw text of sources/<id>.md (read by the parent before opening).
   *   onClose     — called when the learner dismisses the panel.
   */

  import type { Source } from "./types.js";

  interface Props {
    source: Source;
    excerptText: string;
    onClose: () => void;
  }

  let { source, excerptText, onClose }: Props = $props();
</script>

<!-- Backdrop click closes the panel -->
<div
  class="panel-backdrop"
  role="presentation"
  onclick={onClose}
  onkeydown={(e) => { if (e.key === "Escape") onClose(); }}
>
  <!-- Stop propagation so clicks inside the panel don't close it -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <aside
    class="source-panel"
    aria-label="Source: {source.title}"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
  >
    <header class="panel-header">
      <div class="panel-meta">
        <span class="tier-badge tier-badge--{source.tier}">Tier {source.tier}</span>
        <span class="accessed">Accessed {source.accessed}</span>
      </div>
      <button class="close-btn" onclick={onClose} aria-label="Close source panel">✕</button>
    </header>

    <h2 class="panel-title">{source.title}</h2>

    <div class="excerpt">
      <pre class="excerpt-text">{excerptText}</pre>
    </div>

    <footer class="panel-footer">
      <a
        class="outbound-link"
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open original source ↗
      </a>
      <p class="trust-note">{source.trust_rationale}</p>
    </footer>
  </aside>
</div>

<style>
  .panel-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    z-index: 200;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    padding: 1rem;
  }

  .source-panel {
    background: #fff;
    border-radius: 10px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.22);
    width: 420px;
    max-width: 100%;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Header */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.9rem 1.1rem 0.5rem;
    border-bottom: 1px solid #e5e7eb;
    flex-shrink: 0;
  }

  .panel-meta {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .tier-badge {
    font-size: 0.68rem;
    font-weight: 700;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .tier-badge--1 {
    background: #dcfce7;
    color: #166534;
  }

  .tier-badge--2 {
    background: #dbeafe;
    color: #1e40af;
  }

  .accessed {
    font-size: 0.75rem;
    color: #9ca3af;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1rem;
    color: #9ca3af;
    cursor: pointer;
    padding: 0.2rem;
    line-height: 1;
    transition: color 0.15s;
  }

  .close-btn:hover {
    color: #374151;
  }

  /* Title */
  .panel-title {
    font-size: 1rem;
    font-weight: 600;
    color: #111;
    margin: 0;
    padding: 0.75rem 1.1rem 0.5rem;
    flex-shrink: 0;
  }

  /* Excerpt */
  .excerpt {
    flex: 1;
    overflow-y: auto;
    padding: 0 1.1rem;
  }

  .excerpt-text {
    font-family: -apple-system, system-ui, sans-serif;
    font-size: 0.875rem;
    line-height: 1.6;
    color: #374151;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
  }

  /* Footer */
  .panel-footer {
    padding: 0.75rem 1.1rem 1rem;
    border-top: 1px solid #e5e7eb;
    flex-shrink: 0;
  }

  .outbound-link {
    font-size: 0.85rem;
    font-weight: 600;
    color: #3b82f6;
    text-decoration: none;
    display: inline-block;
    margin-bottom: 0.4rem;
  }

  .outbound-link:hover {
    text-decoration: underline;
  }

  .trust-note {
    font-size: 0.75rem;
    color: #9ca3af;
    margin: 0;
    font-style: italic;
  }
</style>
