# teach-me Player — Implementation Plan (v1)

*Derived from `PLAYER-PRD.md` + `DECISIONS.md`. Dependency-ordered, tracer-bullet slices: get a thin
end-to-end path working early (open → play → progress), then layer beat types and the tutor. Each phase
is independently shippable and has explicit exit criteria.*

**Sequencing rationale:** Phase 0 first because the engine swap (`kokoro-onnx`) is the only *un-proven*
part of the stack — the seed proved a torch recipe we're no longer using, so we de-risk the new recipe
before building UI on top of it. After that, work flows front-end-outward; the tutor (Phase 4) is the
net-new subsystem and depends on nothing in Phases 1–3 except the resolved course voice, so it can start
in parallel once Phase 0 lands.

---

## Phase 0 — Scaffold + engine port (de-risk `kokoro-onnx`)

**Goal:** the seed, reborn on `kokoro-onnx`, spawns and speaks — in dev (A) and bundled (B).

- Scaffold the real app: Tauri + Vite + Svelte + TS, extending `seed/` (keep the Rust startup-spawn,
  `externalBin`, CSP baseline). Replace the demo `index.html` button with a Svelte shell.
- **Port the sidecar** `server.py` PyTorch `import kokoro` → `kokoro-onnx`:
  - `GET /health` unchanged (instant; model lazy-loads on first speak).
  - `POST /speak {text, voice, lang_code, speed}` → `audio/wav`. Remove the `TEACHME_VOICE`/`TEACHME_LANG`
    hardcode. Keep `CORSMiddleware(allow_origins=["*"])`.
  - Load the ONNX model + voices file from a resource path / env var.
- **Bundle recipe:** rewrite `build_sidecar.sh` for `onnxruntime` (drop torch `--onefile` pain + the spaCy
  `en_core_web_sm` steps); add the `.onnx` model + voices file as bundled resources; keep espeak-ng as a
  separate bundled executable (still needed for phonemisation) + the CORS fix.
- **Port** `fixtures/example-course/render_audio.py` to `kokoro-onnx`; render `example-course` audio;
  `python validate.py fixtures/example-course --require-audio` → 0 errors.

**Exit:** Checkpoint A (dev: click speak → hear `kokoro-onnx`) and B (bundled `.app`, no dev Python,
still speaks) both green on the new engine. `example-course` has rendered audio + validates.

---

## Phase 1 — Open a workspace (tracer bullet to "a course opens")

**Goal:** pick a folder, validate it, see the course start screen.

- **TS types** for `course.json` + the beat schema (`narration | quiz | contested`, `visual.kind` union,
  sources, coverage). This is the contract the whole front end builds on.
- **Open workspace:** Tauri file dialog → pick folder; read `course.json` via `fs`.
- **Light structural validation** (front end): `course.json` exists/parses/has `schema_version`; lesson
  files resolve; referenced `audio`/`visual` exist. Graded failures (not a course / lesson not rendered).
- **Course start screen:** title + **coverage disclosure** (covered / excluded-with-reasons); lesson list
  in `course.json` order with status badges, overall completion, and per-lesson launchability from
  validation (not `status`). Free navigation.

**Exit:** opening `example-course` shows its title, coverage, and one launchable lesson; opening a
non-course folder shows a friendly error; a course with an unrendered lesson opens with that lesson
marked "not rendered yet."

---

## Phase 2 — Beat playback core (narration end-to-end + progress)

**Goal:** play a lesson's narration beats with synced visuals, record progress, resume.

- **Visual renderer:** inline-inject `svg_file`/`html_file`/`inline_svg`; `image_file` via asset protocol;
  `none`; global `assets/styles.css` `<style>` injection. Widen CSP for the asset protocol (+ blob).
- **Narration beat + transport:** asset-protocol `<audio>`; auto-advance on `ended`; pause/play,
  replay-beat, back, next; beat-nav edges (back@first / next@last → course screen).
- **Progress + resume:** append `lesson_started` / `beat_viewed` (on entry) / `lesson_completed`; derive
  resume by folding `progress.jsonl` at open; Resume button jumps to furthest in-progress beat.
- **Citations:** citation chips + **in-app source panel** (render `sources/<id>.md` + outbound `url` link);
  intercept `<a>` inside injected visuals to the same panel.
- **"I was lost here"** control → `flag_lost` event.

**Exit:** play all 3 narration beats of `example-course` with visuals + citations; quit and reopen resumes
at the right beat; `progress.jsonl` shows the expected event stream.

---

## Phase 3 — Quiz + contested beats

**Goal:** the remaining two v1 beat types.

- **Quiz beat:** play `audio_intro`; show `prompt` + `options`; on answer reveal correctness + highlight
  the right option + play pre-rendered `audio_explanation`; append `quiz_answer {chosen, correct}`;
  auto-advance after the explanation ends. No live TTS in the loop.
- **Contested beat:** side-by-side positions, each with its own citations; play `audio_intro` then each
  position's audio in order, then stop (manual next); never privilege a side.
- **Author a contested test fixture** (≥2 positions, each independently cited; render its audio) to
  exercise the path.

**Exit:** the `example-course` quiz runs and records the result; the contested fixture renders side-by-side
and plays each position; both survive `validate.py`.

---

## Phase 4 — Tutor subsystem (the net-new work)

**Goal:** a source-grounded tutor that answers in the course voice. Can start once Phase 0 lands.

- **Sidecar `POST /tutor {question, workspace_path, lesson_id, beat_id}`:**
  - Assemble grounding: `MISSION.md` + lesson `objective` + whole-lesson narration + union of the lesson's
    cited source excerpts (`sources/*.md`). Lesson-scoped.
  - Claude call via the `anthropic` Python SDK, **structured output** `{answer_text, used_sources[]}`
    (`messages.parse`); model = config, default `claude-sonnet-4-6`; `thinking: {type:"adaptive"}`, no
    sampling params. Source-locked system instruction; unsupported → say so + offer to flag.
  - Key from env / local config; absent → structured "no key" result (never crash).
- **Front-end tutor box** (always visible): warming / no-key / error / ready states gated on `/health`.
  Submit (input disabled in-flight) → `/tutor` → render `answer_text` + `used_sources` chips (→ source
  panel) → `POST /speak {text: answer_text, voice: course.voice}` → play. Pauses narration on submit,
  **stays paused** after the answer. Append `tutor_question`.

**Exit:** with a key set, a typed question returns a grounded answer, shows cited sources, and is spoken
in the course voice; with no key, the box shows "add your key" and the rest of the app is unaffected.

---

## Phase 5 — Package + end-to-end acceptance

**Goal:** meet the PRD success criteria from a bundled build.

- Bundle the `.app` (Checkpoint B) with the `kokoro-onnx` sidecar + ONNX model/voices resources.
- **Full acceptance pass** on `example-course` (+ contested fixture): open → coverage → play all beats →
  run quiz + record → append progress → answer a tutor question in the course voice — end to end, with
  **no dev Python present**.
- Checkpoint C (sign + notarize) explicitly **out of scope**; entitlements remain in the runbook.

**Exit:** the bundled `.app` passes the §7 success criteria unaided.

---

## Parallelization / critical path

- **Critical path:** Phase 0 → 1 → 2 → 3 → 5.
- **Phase 4 (tutor)** depends only on Phase 0 (sidecar + voice) and the source-panel UI from Phase 2; the
  sidecar `/tutor` half can be built in parallel with Phases 1–3.
- **Contested test fixture** (Phase 3) can be authored anytime after the schema types (Phase 1).

## Risks / watch-items

- **Engine recipe (Phase 0)** is the top risk — the `kokoro-onnx` PyInstaller bundle + espeak-ng data +
  ONNX model/voices resource resolution is unproven; keep it isolated and smoke-test the raw binary before
  wiring Tauri, exactly as the seed runbook advises.
- **CSP + asset protocol** (Phase 2): inline SVG/HTML injection + asset-protocol audio/img needs the CSP
  widened correctly, or visuals/audio silently fail — verify in the bundled build, not just dev.
- **Tutor latency** (Phase 4): first `/speak` pays a one-time model load; warm after `/health` if sluggish.
