<script lang="ts">
  /**
   * TutorBox — always-visible tutor prompt box.
   *
   * State machine:
   *   warming (polling /health) → ready → in_flight → answered | no_key | error
   *
   * On submit:
   *   1. Fires onPauseNarration() so the lesson player pauses and stays paused.
   *   2. POST /tutor → get grounded answer + used_sources.
   *   3. Render answer_text + citation chips (resolved against lessonSources).
   *   4. POST /speak with answer_text + course.voice, play the wav blob.
   *   5. Append tutor_question event via progressWriter.
   *
   * Props:
   *   workspacePath    — workspace root; required to build the /tutor request.
   *   lessonId         — current lesson (may change; required for progress event).
   *   beatId           — current beat id (optional — absent on course screen).
   *   lessonSources    — lesson's sources[] for citation resolution.
   *   courseVoice      — course.voice config; used for /speak after an answer.
   *   sidecarReady     — parent passes sidecar health status (warming / ready / error).
   *   progressWriter   — injected writer; null when no workspace is loaded.
   *   onPauseNarration — called on question submit; pauses narration player.
   *   readExcerpt      — async fn(excerptRef) → string; reads sources/<id>.md.
   */

  import CitationChips from "./CitationChips.svelte";
  import SourcePanel from "./SourcePanel.svelte";
  import {
    tutorReducer,
    buildTutorRequest,
    buildSpeakRequestFromVoice,
    buildTutorQuestionEvent,
    resolveUsedSources,
    type TutorState,
  } from "./tutor.js";
  import { postTutor, postSpeak } from "./sidecar.js";
  import type { Source, VoiceConfig } from "./types.js";
  import type { ProgressWriter } from "./progressWriter.js";

  interface Props {
    workspacePath: string;
    lessonId: string;
    beatId?: string;
    lessonSources: Source[];
    courseVoice: VoiceConfig;
    /** "warming" | "ready" | "error" — driven by parent's pollSidecarHealth result */
    sidecarReady: "warming" | "ready" | "error";
    progressWriter: ProgressWriter | null;
    onPauseNarration?: () => void;
    readExcerpt: (excerptRef: string) => Promise<string>;
  }

  let {
    workspacePath,
    lessonId,
    beatId,
    lessonSources,
    courseVoice,
    sidecarReady,
    progressWriter,
    onPauseNarration,
    readExcerpt,
  }: Props = $props();

  // ---------------------------------------------------------------------------
  // Tutor state — starts in warming; parent-driven health status converts it
  // ---------------------------------------------------------------------------

  let tutorState = $state<TutorState>({ status: "warming" });

  // Keep tutor state in sync with parent's sidecar health signal.
  // Once health is confirmed, flip warming → ready (only once; subsequent changes
  // don't collapse back to warming so an in-flight request is unaffected).
  $effect(() => {
    if (sidecarReady === "ready" && tutorState.status === "warming") {
      tutorState = tutorReducer(tutorState, { type: "HEALTH_OK" });
    } else if (sidecarReady === "error" && tutorState.status === "warming") {
      tutorState = tutorReducer(tutorState, { type: "HEALTH_TIMEOUT" });
    }
  });

  // ---------------------------------------------------------------------------
  // Question input
  // ---------------------------------------------------------------------------

  let questionText = $state("");

  // Input is disabled during in-flight or when not yet ready.
  const inputDisabled = $derived(
    tutorState.status === "warming" ||
    tutorState.status === "in_flight" ||
    tutorState.status === "no_key" ||
    (tutorState.status === "error"),
  );

  const submitDisabled = $derived(
    inputDisabled || questionText.trim().length === 0,
  );

  // ---------------------------------------------------------------------------
  // Source panel state (for used_sources chips)
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
  // Submit handler
  // ---------------------------------------------------------------------------

  async function handleSubmit() {
    const question = questionText.trim();
    if (!question) return;
    if (tutorState.status !== "ready" && tutorState.status !== "answered") return;

    // 1. Pause narration immediately (stays paused; no auto-resume).
    onPauseNarration?.();

    // 2. Transition to in_flight (disables input).
    tutorState = tutorReducer(tutorState, { type: "SUBMIT" });

    try {
      // 3. POST /tutor.
      const reqBody = buildTutorRequest(question, workspacePath, lessonId, beatId);
      const response = await postTutor(reqBody);

      if (response.no_key) {
        tutorState = tutorReducer(tutorState, { type: "NO_KEY" });
        return;
      }

      // 4. Resolve used_sources IDs → Source objects.
      const usedSources = resolveUsedSources(response.used_sources, lessonSources);

      // 5. Transition to answered (render text + chips).
      tutorState = tutorReducer(tutorState, {
        type: "ANSWER",
        answerText: response.answer_text,
        usedSources,
      });

      // 6. Write tutor_question progress event.
      if (progressWriter) {
        try {
          const evt = buildTutorQuestionEvent(lessonId, question, beatId);
          await progressWriter.append(evt);
        } catch {
          // progress write failure is non-fatal
        }
      }

      // 7. POST /speak and play the spoken answer.
      try {
        const speakReq = buildSpeakRequestFromVoice(response.answer_text, courseVoice);
        const wavBlob = await postSpeak(speakReq);
        const audioUrl = URL.createObjectURL(wavBlob);
        const audio = new Audio(audioUrl);
        audio.addEventListener("ended", () => URL.revokeObjectURL(audioUrl), { once: true });
        // Narration stays paused after spoken answer ends — no auto-resume.
        await audio.play();
      } catch {
        // Audio playback failure is non-fatal — the text answer is already shown.
      }

    } catch (err) {
      tutorState = tutorReducer(tutorState, {
        type: "ERROR",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && !submitDisabled) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  function handleReset() {
    tutorState = tutorReducer(tutorState, { type: "RESET" });
    questionText = "";
  }
</script>

<!-- Tutor box is always rendered (visible on course screen and during playback) -->
<section class="tutor-box" aria-label="Tutor">
  <div class="tutor-header">
    <span class="tutor-label">Ask the tutor</span>

    {#if tutorState.status === "warming"}
      <span class="status-badge status-warming" aria-live="polite">Warming up…</span>
    {:else if tutorState.status === "in_flight"}
      <span class="status-badge status-inflight" aria-live="polite">Thinking…</span>
    {:else if tutorState.status === "error"}
      <span class="status-badge status-error" aria-live="assertive">Tutor unavailable</span>
    {:else if tutorState.status === "no_key"}
      <span class="status-badge status-nokey" aria-live="assertive">No API key</span>
    {/if}
  </div>

  <!-- ── Answer area ──────────────────────────────────────────────────── -->
  {#if tutorState.status === "no_key"}
    <div class="no-key-notice" role="alert">
      Add your Anthropic API key to enable the tutor.
      <br />
      <small>Set <code>ANTHROPIC_API_KEY</code> in the sidecar environment and restart.</small>
    </div>
  {:else if tutorState.status === "error"}
    <div class="error-notice" role="alert">
      {tutorState.message}
      <button class="btn-link" onclick={handleReset}>Retry</button>
    </div>
  {:else if tutorState.status === "answered"}
    <div class="answer-area" aria-live="polite">
      <div class="answer-text">
        {tutorState.answerText}
      </div>

      {#if tutorState.usedSources.length > 0}
        <div class="answer-citations">
          <span class="citations-label">Sources</span>
          <CitationChips sources={tutorState.usedSources} onSelect={openSourcePanel} />
        </div>
      {/if}

      <button class="btn-ask-another" onclick={handleReset}>
        Ask another question
      </button>
    </div>
  {/if}

  <!-- ── Input row ────────────────────────────────────────────────────── -->
  {#if tutorState.status !== "answered" && tutorState.status !== "no_key"}
    <div class="input-row">
      <textarea
        class="question-input"
        placeholder={tutorState.status === "warming"
          ? "Tutor warming up…"
          : tutorState.status === "error"
          ? "Tutor unavailable"
          : "Ask a question about this lesson…"}
        bind:value={questionText}
        disabled={inputDisabled}
        rows={2}
        aria-label="Tutor question"
        onkeydown={handleKeydown}
      ></textarea>
      <button
        class="btn-send"
        onclick={() => void handleSubmit()}
        disabled={submitDisabled}
        aria-label="Send question"
      >
        {tutorState.status === "in_flight" ? "…" : "Ask"}
      </button>
    </div>
  {/if}
</section>

<!-- Source panel (outside the section to float above everything) -->
{#if panelSource}
  <SourcePanel
    source={panelSource}
    excerptText={panelLoading ? "Loading…" : panelExcerptText}
    onClose={closeSourcePanel}
  />
{/if}

<style>
  .tutor-box {
    background: #fff;
    border-top: 2px solid #e0e7ff;
    padding: 0.9rem 1.25rem 1rem;
    flex-shrink: 0;
  }

  /* Header row */
  .tutor-header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.65rem;
  }

  .tutor-label {
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6366f1;
  }

  /* Status badges */
  .status-badge {
    font-size: 0.68rem;
    font-weight: 600;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .status-warming {
    background: #fef9c3;
    color: #713f12;
  }

  .status-inflight {
    background: #dbeafe;
    color: #1e40af;
  }

  .status-error {
    background: #fee2e2;
    color: #991b1b;
  }

  .status-nokey {
    background: #fef3c7;
    color: #92400e;
  }

  /* Notices */
  .no-key-notice,
  .error-notice {
    font-size: 0.85rem;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    margin-bottom: 0.65rem;
  }

  .no-key-notice {
    background: #fffbeb;
    color: #78350f;
    border: 1px solid #fde68a;
  }

  .error-notice {
    background: #fff1f2;
    color: #9f1239;
    border: 1px solid #fecdd3;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .btn-link {
    background: none;
    border: none;
    font-family: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    color: #3b82f6;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
  }

  /* Answer area */
  .answer-area {
    margin-bottom: 0.65rem;
  }

  .answer-text {
    font-size: 0.9rem;
    line-height: 1.6;
    color: #1a1a1a;
    white-space: pre-wrap;
    word-break: break-word;
    padding: 0.65rem 0.75rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    margin-bottom: 0.5rem;
  }

  .answer-citations {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }

  .citations-label {
    font-size: 0.72rem;
    font-weight: 600;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex-shrink: 0;
  }

  .btn-ask-another {
    font-size: 0.8rem;
    font-weight: 600;
    color: #6366f1;
    background: none;
    border: 1px solid #c7d2fe;
    border-radius: 6px;
    padding: 0.3rem 0.8rem;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.12s, border-color 0.12s;
  }

  .btn-ask-another:hover {
    background: #eef2ff;
    border-color: #a5b4fc;
  }

  /* Input row */
  .input-row {
    display: flex;
    gap: 0.5rem;
    align-items: flex-end;
  }

  .question-input {
    flex: 1;
    font-family: inherit;
    font-size: 0.875rem;
    padding: 0.5rem 0.7rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    resize: none;
    line-height: 1.5;
    color: #111;
    background: #fff;
    transition: border-color 0.15s;
  }

  .question-input:focus {
    outline: none;
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
  }

  .question-input:disabled {
    background: #f9fafb;
    color: #9ca3af;
    cursor: not-allowed;
  }

  .btn-send {
    font-family: inherit;
    font-size: 0.875rem;
    font-weight: 700;
    padding: 0.5rem 1.1rem;
    background: #6366f1;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
    align-self: stretch;
  }

  .btn-send:hover:not(:disabled) {
    background: #4f46e5;
  }

  .btn-send:disabled {
    background: #a5b4fc;
    cursor: not-allowed;
  }
</style>
