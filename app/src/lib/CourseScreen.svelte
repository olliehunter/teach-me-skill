<script lang="ts">
  /**
   * Course Start Screen.
   *
   * Shows:
   *   - Course title
   *   - Coverage disclosure (covered + excluded-with-reasons; omitted if absent)
   *   - Lesson list in course.json order with status badges and launchability
   *   - Overall completion indicator ("N of M complete")
   *
   * Seam for 005/006: the `onLaunch` prop is called with the lesson_id when
   * the learner clicks Launch.  The parent component / route wires this to
   * the playback navigator once Phase 2 is built.
   */

  import type { CourseManifest } from "./types.js";
  import type { LessonValidation } from "./workspace.js";
  import type { CourseProgress } from "./progress.js";
  import { completionSummary } from "./progress.js";

  interface Props {
    course: CourseManifest;
    lessons: LessonValidation[];
    progress: CourseProgress;
    /** Called with lesson_id when the learner clicks "Launch" or "Resume". */
    onLaunch: (lessonId: string) => void;
    /** Called when the learner clicks "Open Different Folder". */
    onClose: () => void;
    /**
     * Lesson_id to highlight after a lesson_completed event (DECISIONS §5).
     * The highlighted lesson has a visual affordance nudging the learner to
     * start it next.  Null when no highlight is active.
     */
    highlightedLessonId?: string | null;
  }

  let { course, lessons, progress, onLaunch, onClose, highlightedLessonId = null }: Props = $props();

  const summary = $derived(completionSummary(progress));
</script>

<div class="course-screen">
  <!-- Header -->
  <header class="course-header">
    <div class="header-top">
      <button class="btn-ghost back-btn" onclick={onClose}>← Open different folder</button>
    </div>
    <h1 class="course-title">{course.title}</h1>
    <p class="completion-summary">{summary}</p>
  </header>

  <!-- Coverage disclosure -->
  {#if course.coverage}
    <section class="coverage">
      <h2>What this course covers</h2>
      {#if course.coverage.covered.length > 0}
        <ul class="covered-list">
          {#each course.coverage.covered as topic}
            <li>{topic}</li>
          {/each}
        </ul>
      {/if}

      {#if course.coverage.excluded.length > 0}
        <details class="excluded-details">
          <summary>Topics deliberately excluded</summary>
          <ul class="excluded-list">
            {#each course.coverage.excluded as item}
              <li>
                <span class="excluded-topic">{item.topic}</span>
                <span class="excluded-reason">{item.reason}</span>
              </li>
            {/each}
          </ul>
        </details>
      {/if}
    </section>
  {:else}
    <section class="coverage coverage--absent">
      <p class="coverage-absent-note">No coverage disclosure for this course.</p>
    </section>
  {/if}

  <!-- Lesson list -->
  <section class="lesson-list-section">
    <h2>Lessons</h2>
    <ol class="lesson-list">
      {#each lessons as lesson (lesson.lessonId)}
        {@const ref = course.lessons.find((l) => l.lesson_id === lesson.lessonId)}
        {@const lessonProgress = progress.lessons.get(lesson.lessonId)}

        <li
          class="lesson-item"
          class:lesson-item--not-launchable={!lesson.launchable}
          class:lesson-item--highlighted={lesson.lessonId === highlightedLessonId}
        >
          <div class="lesson-info">
            <div class="lesson-title-row">
              <span class="lesson-title">{lesson.title}</span>
              {#if ref}
                <span class="status-badge status-badge--{ref.status}">{ref.status}</span>
              {/if}
              {#if lessonProgress?.state === "completed"}
                <span class="progress-badge progress-badge--completed">✓ Complete</span>
              {:else if lessonProgress?.state === "in_progress"}
                <span class="progress-badge progress-badge--in-progress">In progress</span>
              {/if}
            </div>

            {#if !lesson.launchable && lesson.reason}
              <p class="lesson-not-rendered">{lesson.reason}</p>
            {/if}
          </div>

          <div class="lesson-actions">
            {#if lesson.launchable}
              <button
                class="btn-launch"
                onclick={() => onLaunch(lesson.lessonId)}
              >
                {lessonProgress?.state === "in_progress" ? "Resume" : "Launch"}
              </button>
            {:else}
              <span class="not-rendered-label">Not rendered yet</span>
            {/if}
          </div>
        </li>
      {/each}
    </ol>
  </section>
</div>

<style>
  .course-screen {
    max-width: 48rem;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
    font-family: -apple-system, system-ui, sans-serif;
  }

  /* Header */
  .course-header {
    margin-bottom: 2rem;
  }

  .header-top {
    margin-bottom: 1rem;
  }

  .back-btn {
    font-size: 0.875rem;
    color: #555;
    padding: 0.25rem 0;
  }

  .course-title {
    font-size: 2rem;
    font-weight: 700;
    color: #111;
    margin: 0 0 0.25rem;
  }

  .completion-summary {
    font-size: 0.95rem;
    color: #555;
    margin: 0;
  }

  /* Coverage */
  .coverage {
    background: #f8f9fa;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1.25rem 1.5rem;
    margin-bottom: 2rem;
  }

  .coverage h2 {
    font-size: 1rem;
    font-weight: 600;
    color: #111;
    margin: 0 0 0.75rem;
  }

  .covered-list {
    list-style: none;
    padding: 0;
    margin: 0 0 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .covered-list li::before {
    content: "✓ ";
    color: #2a7a2a;
    font-weight: 600;
  }

  .excluded-details summary {
    cursor: pointer;
    font-size: 0.875rem;
    color: #555;
    margin-top: 0.5rem;
  }

  .excluded-list {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .excluded-list li {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .excluded-topic {
    font-weight: 600;
    font-size: 0.875rem;
  }

  .excluded-reason {
    font-size: 0.8rem;
    color: #666;
    font-style: italic;
  }

  .coverage--absent .coverage-absent-note {
    font-size: 0.875rem;
    color: #888;
    margin: 0;
  }

  /* Lesson list */
  .lesson-list-section h2 {
    font-size: 1rem;
    font-weight: 600;
    color: #111;
    margin: 0 0 1rem;
  }

  .lesson-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .lesson-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.25rem;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    transition: border-color 0.15s;
  }

  .lesson-item:hover {
    border-color: #9ca3af;
  }

  .lesson-item--not-launchable {
    opacity: 0.7;
    background: #fafafa;
  }

  .lesson-item--highlighted {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    background: #eff6ff;
  }

  .lesson-info {
    flex: 1;
    min-width: 0;
  }

  .lesson-title-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .lesson-title {
    font-weight: 600;
    font-size: 0.95rem;
    color: #111;
  }

  .status-badge {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.15rem 0.45rem;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .status-badge--ready {
    background: #dcfce7;
    color: #166534;
  }

  .status-badge--needs_review {
    background: #fef9c3;
    color: #713f12;
  }

  .status-badge--draft {
    background: #f3f4f6;
    color: #374151;
  }

  .progress-badge {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.15rem 0.45rem;
    border-radius: 999px;
  }

  .progress-badge--completed {
    background: #dcfce7;
    color: #166534;
  }

  .progress-badge--in-progress {
    background: #dbeafe;
    color: #1e40af;
  }

  .lesson-not-rendered {
    font-size: 0.8rem;
    color: #b45309;
    margin: 0.35rem 0 0;
    font-style: italic;
  }

  .lesson-actions {
    flex-shrink: 0;
  }

  .btn-launch {
    font-size: 0.9rem;
    font-weight: 600;
    padding: 0.5rem 1.1rem;
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
  }

  .btn-launch:hover {
    background: #2563eb;
  }

  .not-rendered-label {
    font-size: 0.8rem;
    color: #9ca3af;
    white-space: nowrap;
  }

  /* Generic ghost button */
  .btn-ghost {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    font-family: inherit;
    transition: color 0.15s;
  }

  .btn-ghost:hover {
    color: #111;
  }
</style>
