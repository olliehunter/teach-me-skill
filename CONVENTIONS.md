# teach-me Player — Build Conventions (read first)

You are one subagent implementing **one issue** from `issues/NNN-*.md` in an isolated git
worktree. This file is the shared contract so independent contexts stay consistent. Read your
issue file, then the docs it references, then build.

## Authoritative docs (under `.docs/`)
- `.docs/PLAYER-PRD.md` — product brief (§7 = success criteria).
- `.docs/DECISIONS.md` — **locked v1 decisions; wins over older prose.**
- `.docs/PLAN.md` — phased plan.
- `.docs/spec/beat-schema.md` — **authoritative input format** (course.json, lesson JSON, beats).
- `.docs/seed/tauri-sidecar-spike.md` — the proven Tauri+PyInstaller runbook (extend it, don't restart).
- `.docs/seed/sidecar/` — working PyTorch `/health`+`/speak` sidecar + `build_sidecar.sh` to port.
- `.docs/seed/frontend/index.html` — minimal seed webview.

> **PATH NOTE:** the fixture lives at **`.docs/fixtures/example-course/`** (the issues/PLAN sometimes
> write `fixtures/…` — the real path is under `.docs/`). There is no top-level `fixtures/`.

## Canonical repo layout (all issues share this — do not invent alternatives)
```
/sidecar/                     # Python FastAPI sidecar (issue 001 creates; 009 extends)
    server.py  build_sidecar.sh  requirements.txt
/app/                         # Tauri + Vite + Svelte + TS app (issue 002 creates; 004+ extend)
    package.json  index.html  src/            # Svelte/TS front end
    src-tauri/                               # Rust shell (spawns sidecar)
    src-tauri/binaries/teachme-sidecar-<triple>   # built sidecar (gitignored)
/models/                      # kokoro-onnx model + voices (gitignored; downloaded at build)
    kokoro-*.onnx  voices-*.bin
.docs/fixtures/example-course/   # the fixture you build against
```
- **build_sidecar.sh** is run from `/sidecar/` and must output to `../app/src-tauri/binaries/`
  (`mkdir -p` it; the app dir may not exist yet when issue 001 runs — that's fine, still build the raw
  binary and smoke-test it).

## Engine / environment facts (already verified)
- Host triple: **`aarch64-apple-darwin`**. Python: **`python3.11`** (3.11.15). `espeak-ng` on PATH.
- **`kokoro-onnx` 0.5.0** is pip-installable; network works. It needs an ONNX model + voices file at
  runtime (e.g. `kokoro-v1.0.onnx` + `voices-v1.0.bin`). Download once into `/models/` and point the
  sidecar/render script at them via env var (e.g. `KOKORO_MODEL`, `KOKORO_VOICES`) or config.
  Do **not** commit model/voices/audio/`node_modules`/`target` — `.gitignore` already excludes them.
- kokoro-onnx API (verify against installed version): `from kokoro_onnx import Kokoro;
  k = Kokoro(model_path, voices_path); samples, sr = k.create(text, voice="af_heart", speed=1.0,
  lang="en-us")`. Returns numpy float32 + sample rate directly (no torch, no `.detach()`).
- Voice defaults from `course.json.voice`: `{engine:"kokoro", lang_code:"a", voice:"af_heart", speed:1.0}`.
  `lang_code:"a"` is Kokoro's American-English code; map to kokoro-onnx's `lang` if the API differs.
- Sidecar port **17861** (`TEACHME_PORT`). Keep `CORSMiddleware(allow_origins=["*"])`.

## progress.jsonl (front end is the ONLY writer; append-only, one JSON object per line)
`event ∈ lesson_started | beat_viewed | replayed | quiz_answer | flag_lost | tutor_question | lesson_completed`.
Shape: `{"ts":ISO8601,"lesson":"0001","beat":"b2","event":"...", ...extra}`. Examples:
`quiz_answer` adds `chosen`,`correct`; `tutor_question` adds `text`. Resume is **derived by folding the
log**, never stored.

## TDD expectations (this run was invoked via /tdd)
- Where there is **pure, testable logic**, write automated tests first and drive with red→green→refactor,
  one behavior at a time (vertical slices, not all-tests-then-all-code). Test through public interfaces,
  not internals. Prime candidates: progress fold/resume (006), structural validation (004), tutor
  grounding assembly (009), schema parsing/types (004).
- Front-end logic: **Vitest**. Python: **pytest**. Keep tests in the app/sidecar as appropriate.
- For irreducibly-manual/infra parts (PyInstaller bundling, live audio, Tauri spawn), the issue's
  acceptance criteria + a documented smoke test (e.g. `curl`) are the verification. State exactly what
  you ran and its output.
- Your issue's **acceptance criteria are the spec** you'll be reviewed against. Satisfy every bullet.

## Working rules
- Stay inside your worktree. Implement **only your issue** — don't do future issues' work.
- Reuse what earlier issues built (types, components, the sidecar). Match existing code style.
- **Commit** your work on your branch with a clear message. Do not touch `main`.
- Never commit secrets. `ANTHROPIC_API_KEY` is read at runtime from env/local config only.

## Report back to the reviewer (your final message) with:
1. **What you built** — files added/changed (paths).
2. **Acceptance criteria** — each bullet from your issue, and how you satisfied/verified it.
3. **Tests** — what you wrote and the exact command to run them + observed result.
4. **Verification** — exact commands you ran (curl, vitest, pytest, validate.py, build) and their output.
5. **Deviations / blockers** — anything you couldn't do (e.g. GUI/audio needing a human), assumptions made.
6. **Notes for dependents** — interfaces/exports later issues should reuse.
</content>
