# teach-me Player — Locked Decisions (v1)

*Companion to `PLAYER-PRD.md`. Records the design decisions resolved in the grilling session on
2026-07-01, before implementation. The PRD is the "what/why"; this is the "how we settled it." Where
this doc and older prose in `spec/` disagree, this doc wins for the Player v1 build.*

## Stack / engine

- **TTS engine: `kokoro-onnx`** (Kokoro on ONNX Runtime), not the PyTorch build. Same engine + same
  preset voice for narration (skill-rendered) and the live tutor, so voices match by construction.
  Sidecar depends on `onnxruntime`, ships an `.onnx` model + voices file as bundled resources, and
  carries no torch/spaCy payload. `seed/sidecar/server.py` and `fixtures/example-course/render_audio.py`
  still `import kokoro` (PyTorch) and must be ported. See PRD §0/§6/§8.3.
- **App shell:** Tauri (Rust + system webview), extending the proven seed scaffold.
- **Front end:** Vite + Svelte + TypeScript. "Thin Player" is about *role* (plays beats, decides no
  pedagogy), not tooling. The beat schema is modeled as TS types.

## 1. File-I/O boundary — hybrid-A

- Front end reads `course.json` / lesson JSON via the Tauri `fs` plugin.
- Audio + visuals load via the Tauri **asset protocol** (`convertFileSrc`), not HTTP.
- Front end **owns `progress.jsonl`** and is its only writer (single writer; `tutor_question` is written
  by the front end after `/tutor` returns).
- Sidecar does **only** `/speak` + `/tutor`.

## 2. Playback state machine

- **narration:** auto-advance on audio `ended`; manual pause/play, replay-beat, back, next.
- **quiz:** hard stop — play `audio_intro`, await answer; on answer reveal correctness + play pre-rendered
  `audio_explanation`; auto-advance only after the explanation ends.
- **contested:** play `audio_intro`, auto-play each position's audio top-to-bottom, then **stop**
  (manual next). Positions rendered side-by-side, each with its own citations; never privilege a side.
- **tutor interrupt:** submitting a tutor question pauses narration and remembers position; after the
  spoken answer, **stay paused** with a resume affordance (learner-controlled, not auto-resume).
- **beat-nav edges:** "back" at a lesson's first beat → course screen; "next" at the last beat →
  `lesson_completed` → course screen.

## 3. Tutor

- **Grounding:** whole current-lesson narration + lesson `objective` + `MISSION.md` + the union of that
  lesson's cited source excerpts (`sources/*.md` via `excerpt_ref`). **Lesson-scoped only** — no
  cross-lesson memory in v1.
- **`used_sources`:** returned by the model as **structured output** (`{answer_text, used_sources[]}` via
  `messages.parse`), so shown citations reflect what was actually used; empty when unsupported.
- **Unsupported answers:** say so plainly + offer to flag (writes a flag event to `progress.jsonl`).
- **Model:** config value, default **`claude-sonnet-4-6`** (Opus 4.8 as easy override). Chosen for
  latency/cost on a small-context, spoken-back task — a conscious departure from the Opus-default.
- **Params:** whole (non-streaming) response; `thinking: {type: "adaptive"}`; **no** sampling params /
  `budget_tokens` (forbidden on these models).
- **API key:** sidecar reads `ANTHROPIC_API_KEY` from env / local config; absent → `/tutor` returns a
  structured "no key" result and the tutor UI shows "add your key." Rest of the app works fully.
- **Voice:** the tutor always uses **`course.voice`** (lesson-level voice overrides ignored for the live
  tutor in v1). `/speak` becomes `POST {text, voice, lang_code, speed}`; `TEACHME_VOICE` hardcode dropped.
- **Tutor UX:** input disabled while a request is in flight; answer rendered as lightly-formatted text
  with source chips (no heavy markdown pipeline in v1).

## 4. Progress + resume

- **Events** (`progress.jsonl`, append-only): `lesson_started`, `beat_viewed` (**on entering** a beat),
  `quiz_answer`, `replayed`, `flag_lost`, `tutor_question`, `lesson_completed`.
- **Resume is derived, not stored:** fold `progress.jsonl` at open into per-lesson state (not started /
  in progress @ last `beat_viewed` / completed). Append-only + re-fold means duplicates never corrupt.
- **Resume UX:** open lands on the **course start screen** (coverage disclosure + lesson list + Resume
  button that jumps to the furthest in-progress beat). No auto-dive into playback.

## 5. Multi-lesson navigation

- Course screen lists `course.json` lessons in order with status badges + overall completion
  ("N of M complete").
- **Free navigation** — no prerequisite gating or notes.
- `status` (`draft`/`needs_review`/`ready`) is an **informational badge only**; `draft`/`needs_review`
  are launchable-but-caveated.
- The **only** launch gate is validation: a lesson is launchable iff it validates / its audio is rendered;
  otherwise shown with a "not rendered yet" state. One unrendered lesson never blocks the course.
- On `lesson_completed` → course screen with the next lesson highlighted (no auto-launch).

## 6. Contested beat

- Built in **v1** (side-by-side positions, per-position citations, `audio_intro` then each position's
  audio per the state machine).
- A small **contested test fixture** is authored (≥2 positions, each independently cited) since
  `example-course` doesn't exercise it.

## 7. Validation on open

- **Light structural check in the front end** (Tauri `fs`): `course.json` exists/parses/has
  `schema_version`; lesson files resolve; referenced `audio`/`visual` files exist.
- **Graded failure**, not fatal: no `course.json` → "not a course"; unrendered lesson → that lesson
  non-launchable; course still opens.
- Full `validate.py` (durations, tiers, claim support) stays the **authoring-side** gate — not run by
  the Player.

## 8. Visuals + citations

- **Per-kind:** `inline_svg` inject the string; `svg_file`/`html_file` **read file text and inject inline**
  (so `styles.css` cascades + `<a>` links work); `image_file` via asset protocol `<img>`; `none` no visual.
  Injected HTML is trusted/local but `<script>` is not executed.
- **`styles.css`:** workspace `assets/styles.css` injected once as a global `<style>` block.
- **Citations:** Player-rendered citation chips (`beat.citations`) *and* source `<a>` inside visuals both
  open an **in-app source panel** rendering the cached excerpt (`sources/<id>.md`) with an outbound link
  to `url` — not a jump straight to the browser.
- **CSP:** widen the seed CSP to allow the Tauri asset protocol for `img-src`/`media-src` (+ blob for
  tutor audio).

## 9. Quiz feedback path

- Quiz feedback = the **pre-rendered `audio_explanation`** (offline, no LLM), same whether right/wrong,
  after a correct/incorrect reveal.
- The live tutor is **not** in the quiz loop; the always-available tutor box handles freeform follow-ups
  ("why is B wrong?"). The beat-schema "chosen-answer feedback spoken live" line is **superseded** for v1.

## 10. Sidecar readiness

- Playback / visuals / quizzes / contested / coverage / progress / resume are **fully independent of the
  sidecar**. The app is usable the moment it opens.
- The **tutor is the only sidecar-gated feature**: "warming up" until `/health` ok → enabled (or "add
  your key"); sidecar failure leaves learning unaffected and only disables the tutor.
- `kokoro-onnx` is lazy-loaded on first `/speak` (optionally warm after `/health`).

## 11. Packaging

- v1 target = **Checkpoint B** parity (bundled `.app` runs with no dev Python, plays end-to-end),
  **re-validated on the `kokoro-onnx` recipe** (A/B must be re-proven since the engine changed).
- **Checkpoint C (sign + notarize) deferred** — only needed to distribute to others; needs an Apple
  Developer account. Unsigned local `.app` is fine for personal use.

## Known caveats carried into v1

- If a lesson ever overrides `course.voice`, its pre-rendered narration uses the override while the tutor
  stays on the course voice → they diverge for that lesson. Acceptable for v1 (fixture uses one voice).
- `spec/teach-me-spec.md` still describes the Kokoro/TTS choice in PyTorch terms (~1–2 GB bundle). Not
  reconciled — it's design-rationale, not the build brief. Update if it causes confusion.
