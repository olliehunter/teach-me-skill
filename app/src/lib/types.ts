/**
 * teach-me Player — authoritative TypeScript types.
 *
 * Source of truth: .docs/spec/beat-schema.md
 * These types are the contract for the whole front end and are reused by
 * issues 005 / 006 / 007 / 008 / 010.  Keep them faithful to the schema.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export interface VoiceConfig {
  engine: string;   // "kokoro"
  lang_code: string; // e.g. "a" (American English)
  voice: string;    // e.g. "af_heart"
  speed: number;
}

export interface Source {
  id: string;
  title: string;
  url: string;
  excerpt_ref: string; // relative path to sources/<id>.md
  accessed: string;    // ISO date string
  tier: 1 | 2;
  trust_rationale: string;
}

// ---------------------------------------------------------------------------
// Visual kinds  (beat-schema.md §visual.kind)
// ---------------------------------------------------------------------------

export interface VisualSvgFile {
  kind: "svg_file";
  src: string;
  alt: string;
}

export interface VisualHtmlFile {
  kind: "html_file";
  src: string;
  alt: string;
}

export interface VisualImageFile {
  kind: "image_file";
  src: string;
  alt: string;
}

/** SVG content is inlined directly — no `src`; use `svg` instead. */
export interface VisualInlineSvg {
  kind: "inline_svg";
  svg: string;
  alt: string;
}

export interface VisualNone {
  kind: "none";
}

export type Visual =
  | VisualSvgFile
  | VisualHtmlFile
  | VisualImageFile
  | VisualInlineSvg
  | VisualNone;

// ---------------------------------------------------------------------------
// Beat types  (narration | quiz | contested)
// ---------------------------------------------------------------------------

export interface NarrationBeat {
  id: string;
  type: "narration";
  narration: string;
  audio: string;           // workspace-relative path
  audio_duration_s: number;
  visual: Visual;
  citations: string[];     // source IDs
}

export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizBeat {
  id: string;
  type: "quiz";
  format: "single_choice" | "multi_choice" | "true_false";
  narration_intro: string;
  audio_intro: string;        // workspace-relative path
  prompt: string;
  options: QuizOption[];
  answer: string;             // option id
  explanation: string;
  audio_explanation: string;  // workspace-relative path
  citations: string[];
}

export interface ContestPosition {
  label: string;
  narration: string;
  audio: string;              // workspace-relative path
  audio_duration_s: number;
  citations: string[];
}

export interface ContestedBeat {
  id: string;
  type: "contested";
  narration_intro: string;
  audio_intro: string;        // workspace-relative path
  question: string;
  positions: ContestPosition[]; // ≥ 2 required by schema
  visual?: Visual;
}

export type Beat = NarrationBeat | QuizBeat | ContestedBeat;

// ---------------------------------------------------------------------------
// Lesson manifest  (lessons/<id>-<slug>.json)
// ---------------------------------------------------------------------------

export interface LessonManifest {
  schema_version: string;
  lesson_id: string;
  slug: string;
  title: string;
  mission_ref?: string;
  objective: string;
  prerequisites: string[];     // lesson_id refs
  estimated_seconds: number;
  voice: VoiceConfig;
  sources: Source[];
  beats: Beat[];
  created?: string;
  generated_by?: string;
}

// ---------------------------------------------------------------------------
// Course manifest  (course.json)
// ---------------------------------------------------------------------------

export type LessonStatus = "draft" | "needs_review" | "ready";

export interface LessonRef {
  lesson_id: string;
  slug: string;
  title: string;
  status: LessonStatus;
}

export interface CoverageExclusion {
  topic: string;
  reason: string;
}

/**
 * Optional coverage block.  When present, surfaces what the course covers and
 * what was deliberately excluded (with reasons).  Its absence means the author
 * chose not to include a coverage disclosure — the Player should handle this
 * gracefully (omit the coverage section, or show a neutral note).
 */
export interface Coverage {
  covered: string[];
  excluded: CoverageExclusion[];
}

export interface CourseManifest {
  schema_version: string;
  title: string;
  mission_ref?: string;
  voice: VoiceConfig;
  lessons: LessonRef[];
  coverage?: Coverage;         // optional — absence is valid
  created?: string;
  generated_by?: string;
}

// ---------------------------------------------------------------------------
// Progress log  (progress.jsonl — written by the Player)
// ---------------------------------------------------------------------------

export type ProgressEventType =
  | "lesson_started"
  | "beat_viewed"
  | "replayed"
  | "quiz_answer"
  | "flag_lost"
  | "tutor_question"
  | "lesson_completed";

export interface ProgressEventBase {
  ts: string;       // ISO 8601
  lesson: string;   // lesson_id
  beat?: string;    // beat id (absent for lesson-level events)
  event: ProgressEventType;
}

export interface QuizAnswerEvent extends ProgressEventBase {
  event: "quiz_answer";
  chosen: string;
  correct: boolean;
}

export interface TutorQuestionEvent extends ProgressEventBase {
  event: "tutor_question";
  text: string;
}

export type ProgressEvent = ProgressEventBase | QuizAnswerEvent | TutorQuestionEvent;
