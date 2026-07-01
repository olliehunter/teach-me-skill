# teach-me Player — Product Requirements & Build Brief

*A build brief for a fresh Claude Code context. Everything referenced here is in this folder.*

## 0. What you're building

A **local desktop app** that opens a "teach-me course workspace" (a folder of content produced by a
separate authoring skill) and presents it as a narrated e-learning experience: a local voice narrates
each unit while its visual shows on screen, quizzes check understanding, contested topics are shown
even-handedly, and a prompt box lets the learner ask a **source-grounded tutor** that answers in the
**same voice** as the narration. Everything is local except the tutor's LLM call.

Stack (already de-risked — see §6): **Tauri** (Rust shell + system webview) for the app, an
**HTML/JS/SVG** front end, and a bundled **Python (FastAPI + kokoro-onnx)** sidecar for local
text-to-speech.

> **TTS engine change (2026-07-01):** the authoring skill now renders narration with
> **`kokoro-onnx`** (Kokoro running on ONNX Runtime), **not** the PyTorch build of Kokoro the seed
> spike used. The Player's live-tutor TTS must use the **same `kokoro-onnx` engine and the same
> preset voice** so the tutor matches narration by construction. Practical upshot: the sidecar depends
> on `onnxruntime` (not `torch`), ships an `.onnx` model + a voices file instead of downloading
> PyTorch/HuggingFace weights, and drops the ~1–2 GB torch payload — so several seed build gotchas
> (torch `--onefile`, the spaCy `en_core_web_sm` model) fall away. See §6 and §8.3.

## 1. Context — how this fits a two-part system

teach-me is two roles over one shared folder (**the filesystem is the API**):

- The **authoring skill** researches a topic and writes a course into a workspace folder. Not your
  concern — it's already built.
- **This Player** reads that workspace and presents it. **Your job.**

Read `DECISIONS.md` for the v1 build decisions locked in the 2026-07-01 grilling (it wins over older
prose where they disagree), `spec/teach-me-spec.md` for the full design rationale, and
`spec/beat-schema.md` for the exact input format. Build against `fixtures/example-course/` (a real,
validating workspace). Extend the proven scaffold in `seed/` — **do not start the Tauri+sidecar
integration from scratch**; it's already working.

## 2. Input format (what you consume)

Authoritative spec: `spec/beat-schema.md`. In brief, a workspace folder contains:

- `course.json` — course title, lesson order, **`voice`** config (Kokoro preset), and a **`coverage`**
  block (what's covered / deliberately excluded) to disclose to the learner up front.
- `lessons/<id>-<slug>.json` — a lesson as an ordered list of **beats**. A beat is *one idea = one
  short narration + one pre-rendered audio file + one visual + citations*. Beat `type` ∈
  `narration | quiz | contested`.
- `assets/audio/*.wav` — **pre-rendered** narration (the skill already rendered these; you just play
  them).
- `assets/visuals/*.svg|html` — one visual per beat, with clickable source links baked in; plus a
  shared `assets/styles.css`.
- `sources/<id>.md` — cached source excerpts. **Critical for the tutor** — it answers only from these.
- `progress.jsonl` — append-only learner-event log. **You write this**; the authoring skill reads it
  later.

## 3. Core features (build these)

1. **Open a workspace** — Tauri file dialog to pick a course folder; verify `course.json` exists; show
   a friendly error if the folder isn't a course or its audio hasn't been rendered.
2. **Course start screen** — title + the `coverage` disclosure (covered / excluded-with-reasons) shown
   before the learner begins. Honesty about scope is a product principle, not a footnote.
3. **Beat playback** — walk a lesson's beats:
   - `narration`: play `beat.audio` while showing `beat.visual` (inject SVG/HTML inline so
     `styles.css` and citation links work); auto-advance on audio end, with manual pause / replay-beat
     / back / next.
   - `quiz`: play `audio_intro`, show `prompt` + `options`; on answer, reveal correctness and play the
     **pre-rendered** `audio_explanation`; record the result.
   - `contested`: play `audio_intro`, present the `positions` **side-by-side**, each with its own
     citations, and play each position's audio. Never visually privilege one side.
4. **Tutor prompt box** (always available) — learner types a question → grounded answer shown as text
   (with cited source links) and **spoken in the course voice**. See §5.
5. **Progress + resume** — append events to `progress.jsonl` (`lesson_started`, `beat_viewed`,
   `replayed`, `quiz_answer`, `flag_lost`, `tutor_question`, `lesson_completed`); resume where the
   learner left off.
6. **"I was lost here"** control on any beat → writes a `flag_lost` event. (Consumed later by the
   authoring skill; no player-side adaptivity in v1.)

## 4. Architecture

- **Tauri app** spawns the Python **sidecar** on startup (pattern proven in `seed/`), and serves the
  HTML/JS front end in the webview.
- **Front end** renders visuals, plays audio, drives quizzes/contested UI, and hosts the tutor box.
- **Sidecar (FastAPI, PyInstaller'd; `kokoro-onnx` via ONNX Runtime)** endpoints:
  - `GET /health` — readiness poll (exists in seed).
  - `POST /speak {text, voice}` → `audio/wav` — live TTS for the tutor. **Parametrize by `voice`**
    (the seed hardcodes it — fix this early) so it matches the course.
  - `POST /tutor {question, workspace_path, lesson_id, beat_id}` → grounded answer. **New — see §5.**
- **Note:** narration is *pre-rendered by the authoring skill*, so the Player's sidecar only needs
  **live** TTS (tutor). It does **not** batch-render narration.
- CORS is required (webview → `127.0.0.1` is cross-origin) — already handled in the seed sidecar.

## 5. The tutor contract (the main net-new work)

Everything else extends the seed; the tutor is the new subsystem. Suggested contract:

- **Endpoint:** `POST /tutor` with `{question, workspace_path, lesson_id, beat_id}`.
- **Grounding (sidecar side):** load `MISSION.md`, the lesson's `objective` + nearby beats'
  `narration`, and the **cached text** of that lesson's cited sources (`sources/*.md` via each
  source's `excerpt_ref`). Assemble a prompt whose system instruction is roughly: *"You are a tutor for
  this lesson. Answer only from the provided sources and lesson context. If the answer isn't supported,
  say so plainly and offer to flag it. Be concise and match the lesson's level."* Then the assembled
  context + the learner's question.
- **Model:** a current Claude model (make the exact model id a config value; a Sonnet-class model is a
  reasonable default for latency/cost).
- **Key:** read `ANTHROPIC_API_KEY` from local config/env. If absent, the tutor UI shows a friendly
  "add your key to enable the tutor" state — never crash.
- **Response:** `{answer_text, used_sources[]}`. Front end shows the text (+ source links) and calls
  `/speak {text: answer_text, voice: <course voice>}` to voice it.
- **Grounding discipline mirrors the authoring rule:** source-locked, no free-floating claims. This is
  the safety valve that keeps the spoken tutor trustworthy.

## 6. The seed — what's already proven (`seed/`)

A bundling spike already validated the hard engineering, so you inherit it rather than discovering it:

- `seed/tauri-sidecar-spike.md` — the runbook: Tauri scaffold, `externalBin` config, the Rust
  startup-spawn of the sidecar, CSP, and the **complete PyInstaller build recipe** with every Kokoro
  dependency gotcha already solved (the `language_tags` data files, `espeakng_loader` data+library, the
  spaCy `en_core_web_sm` model, and the CORS fix). Read this first.
- `seed/sidecar/{server.py, build_sidecar.sh, requirements.txt}` — the working sidecar (`/health` +
  `/speak`) and its build script.
- `seed/frontend/index.html` — a minimal webview that polls `/health` and calls `/speak`.
- **Validated:** Checkpoint A (spawns + speaks in dev) and B (bundled `.app` speaks with no dev
  Python). **Deferred:** C (code-sign + notarize) — needs an Apple Developer account; entitlements are
  in the runbook.

> **Engine port (do this alongside the voice fix):** the seed's `server.py` and the fixture's
> `render_audio.py` still `import kokoro` (the PyTorch build). Port the sidecar to **`kokoro-onnx`**
> to match the skill. What carries over unchanged: the Rust startup-spawn, `externalBin` config, CSP,
> the CORS fix, and keeping **espeak-ng as a separate bundled executable** for license cleanliness
> (kokoro-onnx still needs espeak-ng for phonemisation). What changes: drop `torch` and the spaCy
> `en_core_web_sm` steps; add the ONNX model + voices files as bundled resources (§8.3); the
> PyInstaller recipe simplifies and the bundle shrinks dramatically. The exact `kokoro-onnx`
> PyInstaller recipe needs re-validating (Checkpoints A/B) since it wasn't what the original spike froze.

**Extend the seed:** keep the Rust spawn + CSP + build recipe; port the sidecar to `kokoro-onnx`, add
`/tutor` and the `voice` parameter to the sidecar; build the real beat-playback UI in place of the demo
button.

## 7. Success criteria

- Opens `fixtures/example-course/`, shows its coverage, plays all four beats (3 narration + 1 quiz)
  with narration synced to visuals, runs the quiz and records the result, appends progress, and answers
  a typed tutor question **in the course voice** — end to end.
- The bundled `.app` runs with **no dev Python present** (Checkpoint B parity), the same bar the seed met.

## 8. Fix or uncover before you call it done

1. **`/speak` voice parametrization** — the seed hardcodes the voice via env; change it to accept
   `voice` per request so the tutor matches narration. Small, do it first.
2. **Tutor model + streaming** — pick the Claude model id (config). Decide whether the answer streams
   (start speaking sooner, more work) or returns whole (simpler). Whole is fine for v1.
3. **Offline model files** — `kokoro-onnx` needs its ONNX model (`kokoro-*.onnx`) and voices file
   (`voices-*.bin`) at runtime. Bundle both into the app as Tauri resources and point the sidecar at
   them by resource path / env var — no Hugging Face or PyTorch weight download. Bundling is now cheap
   (no multi-GB torch payload), so **bundle by default** for true offline use.
4. **Signing/notarization (Checkpoint C)** — needed only to distribute to others; needs an Apple
   Developer account. Entitlements (JIT / disable-library-validation for the PyInstaller'd Python) are
   in the runbook.
5. **Auto-advance & interrupt UX** — confirm auto-advance on audio end vs manual; define how "ask the
   tutor" pauses narration and resumes.
6. **Quiz feedback path** — use the **pre-rendered** `audio_explanation` for quiz feedback (fast,
   offline); reserve the live tutor path for freeform questions. Confirm this split.
7. **Workspace validation on open** — do a light structural check (course.json present, referenced
   audio exists) and show a clear "this course hasn't been rendered yet" message rather than failing
   mid-playback. `fixtures/example-course/validate.py` has reusable logic.
8. **Multi-lesson navigation** — the fixture has one lesson; design the lesson list / course nav for N
   lessons and cross-lesson progress.

## 9. Running the fixture before you build playback

The fixture ships **without rendered audio** (audio is large; the skill renders it). Generate it once
in a `kokoro-onnx` environment (the fixture's `render_audio.py` must be ported from the PyTorch
`kokoro` import to `kokoro-onnx` first — same as the sidecar), then verify:

```bash
python fixtures/example-course/render_audio.py fixtures/example-course/lessons/0001-interest-rate-lags.json
python fixtures/example-course/validate.py fixtures/example-course --require-audio   # expect 0 errors
```

Now `fixtures/example-course/` is a complete, playable course to build the Player against.

## 10. Folder map

```
player-handoff/
├── PLAYER-PRD.md                 ← this file (start here)
├── DECISIONS.md                  ← locked v1 build decisions (2026-07-01) — read second
├── PLAN.md                       ← phased implementation plan (tracer-bullet slices)
├── spec/
│   ├── teach-me-spec.md          ← full design rationale + all locked decisions
│   └── beat-schema.md            ← authoritative input format (READ THIS)
├── fixtures/
│   └── example-course/           ← a real, validating workspace to build against
└── seed/
    ├── tauri-sidecar-spike.md    ← the proven Tauri+sidecar runbook (build recipe + gotchas)
    ├── sidecar/                  ← working /health + /speak sidecar + build script
    └── frontend/index.html       ← minimal webview seed
```
