---
id: 001
title: Sidecar ported to kokoro-onnx with parametrized POST /speak
type: AFK
status: ready
blocked_by: []
---

## What to build

Replace the PyTorch `import kokoro` sidecar with **`kokoro-onnx`** (Kokoro on ONNX Runtime). Keep
`GET /health` (returns instantly; the model lazy-loads on first synthesis) and the
`CORSMiddleware(allow_origins=["*"])` fix. Change the speech endpoint to
`POST /speak {text, voice, lang_code, speed}` returning `audio/wav`, and **remove the
`TEACHME_VOICE`/`TEACHME_LANG` hardcode** — voice/lang/speed come from the request body. Load the ONNX
model + voices file from a configurable resource path / env var.

Rework `build_sidecar.sh` for `onnxruntime`: drop the torch `--onefile` handling and the spaCy
`en_core_web_sm` steps; keep **espeak-ng as a separate bundled executable** (still needed for
phonemisation) and the CORS fix. Smoke-test the raw PyInstaller binary with `curl` before any Tauri
wiring (the seed runbook's "fix packaging here, not in Tauri" rule).

## Acceptance criteria

- [ ] `GET /health` returns ok immediately at startup (model not yet loaded)
- [ ] `POST /speak {text, voice, lang_code, speed}` returns a playable `audio/wav` synthesized by kokoro-onnx
- [ ] Voice/lang/speed are taken from the request body; no hardcoded voice env remains
- [ ] The ONNX model + voices file load from a configurable resource path / env var
- [ ] Reworked `build_sidecar.sh` produces a raw binary that passes the curl smoke test with no dev PyTorch present

## Blocked by

- None — can start immediately
