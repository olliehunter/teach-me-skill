# teach-me Player — Checkpoint B Acceptance (Issue 011, HITL)

> **✅ SIGNED OFF (2026-07-01).** Human confirmed the bundled `.app` end-to-end on a
> current build (all fixes included): opens a workspace, shows coverage, plays narration
> with synced SVG visuals, runs the quiz with split correct/incorrect feedback audio,
> records progress + resume, completes a lesson ("Finish lesson" → course screen), and
> answers a spoken tutor question in the course voice — with no dev Python present.


Issues 001–010 are implemented, reviewed against their acceptance criteria, and merged to `main`
with all automated tests green (161 front-end Vitest + 30 Python sidecar pytest). Issue 011 is the
**human-in-the-loop** capstone: build the bundled `.app`, run it with **no dev Python**, and confirm
end-to-end audio + narration sync by ear. That final sign-off cannot be automated.

## What's already automated & verified
- Sidecar ported to `kokoro-onnx`; raw PyInstaller binary passes the `curl` `/health` + `/speak` smoke
  test producing a valid WAV, **with no dev torch/PyTorch present** (issue 001).
- `render_audio.py` ported; `example-course` renders and `validate.py --require-audio` → **0 errors**
  (issue 003). Contested fixture likewise validates 0 errors (issue 008).
- Front-end app builds clean (`npm run build`) and the Rust shell compiles (`cargo build`).
- Bundling wired: the ONNX model + voices ship as Tauri **resources** (`bundle.resources`); the Rust
  spawn resolves them from `resource_dir()/models/` in a packaged app and falls back to the repo-root
  `/models/` in dev (`app/src-tauri/src/lib.rs::resolve_model_paths`).

## Prerequisites for the model files
`/models/kokoro-v1.0.onnx` (~326 MB) and `/models/voices-v1.0.bin` (~28 MB) are **gitignored** (large).
They are already present locally. On a fresh clone, re-download them from the `kokoro-onnx`
`model-files-v1.0` release into `/models/` before building.

## Build the bundle
```bash
cd sidecar && ./build_sidecar.sh          # produces app/src-tauri/binaries/teachme-sidecar-<triple>
cd ../app  && npm install && npm run tauri build
# → app/src-tauri/target/release/bundle/macos/teach-me Player.app  (+ .dmg)
```

## HITL acceptance pass — run the bundled `.app` (no dev Python on PATH)
Open the built `.app` and confirm the PRD §7 success criteria end-to-end:
1. **Opens a workspace** — pick `/.docs/fixtures/example-course/` via the file dialog.
2. **Coverage** — course start screen shows the title, coverage disclosure (this fixture has none →
   neutral note), and one launchable lesson with a status badge + "N of M complete".
3. **Narration + visuals** — launch the lesson; the 3 narration beats play their audio **by ear** with
   the SVG visual on screen (styles.css applied), auto-advancing on audio end. Citation chip → in-app
   source panel; a source `<a>` inside a visual opens the same panel (no browser jump).
4. **Quiz** — beat b4 plays `audio_intro`, shows prompt+options; answer → correctness revealed + correct
   option highlighted + pre-rendered explanation plays → auto-advances.
5. **Contested** — open `/.docs/fixtures/contested-fixture/`; the contested beat shows positions
   side-by-side, plays intro then each position's audio in order, then stops (manual Next).
6. **Progress + resume** — `progress.jsonl` gains `lesson_started`/`beat_viewed`/`quiz_answer`/
   `lesson_completed`; quit and reopen → Resume jumps to the furthest in-progress beat.
7. **"I was lost here"** appends a `flag_lost` event.
8. **Tutor** — with `ANTHROPIC_API_KEY` set in the sidecar's env/local config, type a question → grounded
   answer with cited-source chips, **spoken in the course voice**; narration pauses and stays paused.
   With **no** key, the tutor box shows "add your key" and the rest of the app is fully usable.
9. **No dev Python** — confirm the app speaks with no dev Python interpreter on PATH (Checkpoint B).

## Out of scope (per DECISIONS §11)
Checkpoint C (code-sign + notarize) — needs an Apple Developer account; entitlements
(`allow-jit`, `disable-library-validation`) are in `.docs/seed/tauri-sidecar-spike.md`. An unsigned
local `.app` is fine for personal use.
