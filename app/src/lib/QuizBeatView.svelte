<script lang="ts">
  /**
   * QuizBeatView — renders a quiz beat with full interaction.
   *
   * State machine (see quiz.ts → QuizPhase):
   *   "intro"    — audio_intro plays; prompt + options shown; submit disabled.
   *   "awaiting" — intro finished; learner selects an option and submits.
   *   "revealed" — answer submitted; correct option highlighted; audio_explanation plays.
   *   "complete" — audio_explanation ended; onBeatComplete called once.
   *
   * Audio:
   *   Both audio files load via the Tauri asset protocol (convertFileSrc).
   *   Because Vitest runs headlessly, all audio calls are wrapped in try/catch.
   *
   * Props:
   *   beat          — the QuizBeat to display.
   *   sources       — lesson sources array (for citation chips).
   *   workspacePath — absolute workspace root (used to build asset-protocol URLs).
   *   onBeatComplete — called once, after audio_explanation ends (triggers auto-advance).
   *   onQuizAnswer  — called with (chosen, correct) so LessonPlayer can write the
   *                   quiz_answer progress event.  Fired immediately on submit, before
   *                   the explanation audio starts.
   */

  import { onMount } from "svelte";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import CitationChips from "./CitationChips.svelte";
  import SourcePanel from "./SourcePanel.svelte";
  import { resolveCitations } from "./citations.js";
  import { gradeAnswer, nextQuizPhase } from "./quiz.js";
  import type { QuizPhase } from "./quiz.js";
  import type { QuizBeat, Source } from "./types.js";

  interface Props {
    beat: QuizBeat;
    sources: Source[];
    workspacePath: string;
    readExcerpt: (excerptRef: string) => Promise<string>;
    /** Called when explanation audio ends — triggers transport auto-advance. */
    onBeatComplete: () => void;
    /**
     * Called immediately on submit with (chosen, correct).
     * LessonPlayer uses this to append the quiz_answer event to progress.jsonl.
     */
    onQuizAnswer: (chosen: string, correct: boolean) => void;
  }

  let {
    beat,
    sources,
    workspacePath,
    readExcerpt,
    onBeatComplete,
    onQuizAnswer,
  }: Props = $props();

  // ---------------------------------------------------------------------------
  // Asset-protocol URLs
  // ---------------------------------------------------------------------------

  const introSrc = $derived(convertFileSrc(`${workspacePath}/${beat.audio_intro}`));
  const explainSrc = $derived(convertFileSrc(`${workspacePath}/${beat.audio_explanation}`));

  // ---------------------------------------------------------------------------
  // Quiz state
  // ---------------------------------------------------------------------------

  let phase = $state<QuizPhase>("intro");
  /** Selected option id for single_choice / true_false. */
  let selectedId = $state<string | null>(null);
  /** Selected option ids for multi_choice. */
  let multiSelected = $state<Set<string>>(new Set());
  /** Whether onBeatComplete has been called (guard against double-fire). */
  let completed = $state(false);

  // Derived grading result (only meaningful in "revealed" phase)
  const isCorrect = $derived(
    phase === "revealed" || phase === "complete"
      ? selectedId !== null
        ? gradeAnswer(beat, selectedId)
        : false
      : false,
  );

  // ---------------------------------------------------------------------------
  // Audio element refs
  // ---------------------------------------------------------------------------

  let introAudioEl = $state<HTMLAudioElement | undefined>();
  let explainAudioEl = $state<HTMLAudioElement | undefined>();

  // ---------------------------------------------------------------------------
  // Play intro on mount
  // ---------------------------------------------------------------------------

  onMount(() => {
    introAudioEl?.play().catch(() => {
      // Headless / permission denied — skip to awaiting
      phase = nextQuizPhase(phase, "intro_ended");
    });
  });

  // ---------------------------------------------------------------------------
  // Audio event handlers
  // ---------------------------------------------------------------------------

  function handleIntroEnded() {
    phase = nextQuizPhase(phase, "intro_ended");
  }

  function handleExplanationEnded() {
    phase = nextQuizPhase(phase, "explanation_ended");
    if (!completed) {
      completed = true;
      onBeatComplete();
    }
  }

  // ---------------------------------------------------------------------------
  // Multi-choice toggle
  // ---------------------------------------------------------------------------

  function toggleMulti(id: string) {
    if (phase !== "awaiting") return;
    const next = new Set(multiSelected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    multiSelected = next;
  }

  // ---------------------------------------------------------------------------
  // Submit handler
  // ---------------------------------------------------------------------------

  function handleSubmit() {
    if (phase !== "awaiting") return;

    let chosen: string | null = null;
    if (beat.format === "multi_choice") {
      // Treat the lexically-sorted join as the "chosen" string for logging.
      const ids = [...multiSelected].sort();
      chosen = ids.length > 0 ? ids.join(",") : null;
    } else {
      chosen = selectedId;
    }
    if (!chosen) return;

    const correct = gradeAnswer(beat, chosen);
    onQuizAnswer(chosen, correct);
    phase = nextQuizPhase(phase, "answer_submitted");

    // Start explanation audio after a short tick so DOM updates first.
    setTimeout(() => {
      explainAudioEl?.play().catch(() => {
        // Headless — auto-advance immediately
        handleExplanationEnded();
      });
    }, 0);
  }

  // ---------------------------------------------------------------------------
  // Citation / source panel
  // ---------------------------------------------------------------------------

  const resolvedSources = $derived(resolveCitations(beat.citations, sources));

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
  // Option helpers
  // ---------------------------------------------------------------------------

  function isOptionCorrect(optId: string): boolean {
    return optId === beat.answer;
  }

  function isOptionSelected(optId: string): boolean {
    if (beat.format === "multi_choice") return multiSelected.has(optId);
    return selectedId === optId;
  }

  function optionClass(optId: string): string {
    const classes = ["option"];
    if (isOptionSelected(optId)) classes.push("option--selected");
    if (phase === "revealed" || phase === "complete") {
      if (isOptionCorrect(optId)) classes.push("option--correct");
      else if (isOptionSelected(optId)) classes.push("option--wrong");
    }
    return classes.join(" ");
  }
</script>

<!-- Hidden audio elements — controls=false; playback is script-driven -->
<audio
  bind:this={introAudioEl}
  src={introSrc}
  onended={handleIntroEnded}
  aria-hidden="true"
></audio>

{#if phase === "revealed" || phase === "complete"}
  <audio
    bind:this={explainAudioEl}
    src={explainSrc}
    onended={handleExplanationEnded}
    aria-hidden="true"
  ></audio>
{/if}

<article class="quiz-beat" aria-label="Quiz beat {beat.id}">

  <!-- ── Prompt ──────────────────────────────────────────────────────────── -->
  <div class="quiz-prompt">
    <div class="quiz-label" aria-label="Quiz question">Quiz</div>
    <h2 class="prompt-text">{beat.prompt}</h2>
  </div>

  <!-- ── Options ─────────────────────────────────────────────────────────── -->
  <fieldset class="options-fieldset" disabled={phase === "intro"}>
    <legend class="sr-only">Choose an answer</legend>
    {#each beat.options as option (option.id)}
      <label class={optionClass(option.id)}>
        {#if beat.format === "multi_choice"}
          <input
            type="checkbox"
            class="option-input"
            name="quiz-{beat.id}"
            value={option.id}
            checked={multiSelected.has(option.id)}
            disabled={phase === "intro" || phase === "revealed" || phase === "complete"}
            onchange={() => toggleMulti(option.id)}
          />
        {:else}
          <!-- single_choice and true_false both use radio -->
          <input
            type="radio"
            class="option-input"
            name="quiz-{beat.id}"
            value={option.id}
            bind:group={selectedId}
            disabled={phase === "intro" || phase === "revealed" || phase === "complete"}
          />
        {/if}
        <span class="option-text">{option.text}</span>
        {#if (phase === "revealed" || phase === "complete") && isOptionCorrect(option.id)}
          <span class="option-badge option-badge--correct" aria-label="Correct answer">✓</span>
        {:else if (phase === "revealed" || phase === "complete") && isOptionSelected(option.id) && !isOptionCorrect(option.id)}
          <span class="option-badge option-badge--wrong" aria-label="Your answer — incorrect">✗</span>
        {/if}
      </label>
    {/each}
  </fieldset>

  <!-- ── Submit ──────────────────────────────────────────────────────────── -->
  {#if phase === "intro" || phase === "awaiting"}
    <button
      class="btn-submit"
      onclick={handleSubmit}
      disabled={phase === "intro" || (beat.format === "multi_choice" ? multiSelected.size === 0 : selectedId === null)}
      aria-label="Submit answer"
    >
      {phase === "intro" ? "Listening…" : "Submit"}
    </button>
  {/if}

  <!-- ── Feedback (revealed) ──────────────────────────────────────────────── -->
  {#if phase === "revealed" || phase === "complete"}
    <div
      class="feedback {isCorrect ? 'feedback--correct' : 'feedback--wrong'}"
      role="status"
      aria-live="polite"
    >
      <span class="feedback-icon" aria-hidden="true">{isCorrect ? "✓" : "✗"}</span>
      <span class="feedback-label">{isCorrect ? "Correct!" : "Not quite."}</span>
      <p class="feedback-explanation">{beat.explanation}</p>
    </div>
  {/if}

  <!-- ── Citations ────────────────────────────────────────────────────────── -->
  {#if resolvedSources.length > 0}
    <div class="citations-row">
      <span class="citations-label">Sources</span>
      <CitationChips sources={resolvedSources} onSelect={openSourcePanel} />
    </div>
  {/if}

</article>

{#if panelSource}
  <SourcePanel
    source={panelSource}
    excerptText={panelLoading ? "Loading…" : panelExcerptText}
    onClose={closeSourcePanel}
  />
{/if}

<style>
  .quiz-beat {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.5rem;
    max-width: 720px;
    margin: 0 auto;
  }

  /* ── Prompt ── */
  .quiz-prompt {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .quiz-label {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6366f1;
  }

  .prompt-text {
    font-size: 1.15rem;
    font-weight: 700;
    color: #111827;
    margin: 0;
    line-height: 1.45;
  }

  /* ── Options ── */
  .options-fieldset {
    border: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .option {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border: 2px solid #e5e7eb;
    border-radius: 10px;
    cursor: pointer;
    background: #fff;
    transition: border-color 0.12s, background 0.12s;
    position: relative;
  }

  .option:hover:not(.option--correct):not(.option--wrong):not(:has(input:disabled)) {
    border-color: #a5b4fc;
    background: #f5f3ff;
  }

  .option--selected {
    border-color: #6366f1;
    background: #eef2ff;
  }

  .option--correct {
    border-color: #16a34a;
    background: #f0fdf4;
  }

  .option--wrong {
    border-color: #dc2626;
    background: #fef2f2;
  }

  .option-input {
    flex-shrink: 0;
    accent-color: #6366f1;
    width: 1.1rem;
    height: 1.1rem;
    cursor: pointer;
  }

  .option-text {
    font-size: 0.95rem;
    color: #1f2937;
    line-height: 1.4;
    flex: 1;
  }

  .option-badge {
    font-size: 1rem;
    font-weight: 700;
    flex-shrink: 0;
  }

  .option-badge--correct {
    color: #16a34a;
  }

  .option-badge--wrong {
    color: #dc2626;
  }

  /* ── Submit ── */
  .btn-submit {
    align-self: flex-start;
    padding: 0.6rem 1.5rem;
    background: #6366f1;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-submit:hover:not(:disabled) {
    background: #4f46e5;
  }

  .btn-submit:disabled {
    background: #a5b4fc;
    cursor: not-allowed;
  }

  /* ── Feedback ── */
  .feedback {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 1rem 1.25rem;
    border-radius: 10px;
    border: 2px solid transparent;
  }

  .feedback--correct {
    border-color: #86efac;
    background: #f0fdf4;
  }

  .feedback--wrong {
    border-color: #fca5a5;
    background: #fef2f2;
  }

  .feedback-icon {
    font-size: 1.25rem;
    line-height: 1;
  }

  .feedback-label {
    font-size: 0.85rem;
    font-weight: 700;
    color: #374151;
  }

  .feedback-explanation {
    font-size: 0.93rem;
    color: #1f2937;
    line-height: 1.6;
    margin: 0;
  }

  /* ── Citations ── */
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

  /* ── Screen-reader only ── */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
