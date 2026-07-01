---
id: 003
title: render_audio.py ported to kokoro-onnx; example-course rendered + validates
type: AFK
status: ready
blocked_by: [001]
---

## What to build

Port `fixtures/example-course/render_audio.py` from the PyTorch `kokoro` import to **`kokoro-onnx`** (the
same engine as the sidecar, so narration and the live tutor match by construction). Render the
`example-course` per-beat audio and patch real durations back into the lesson JSON. Confirm the fixture
validates with audio present.

## Acceptance criteria

- [ ] `render_audio.py` renders every beat via kokoro-onnx and patches `audio_duration_s`
- [ ] `python validate.py fixtures/example-course --require-audio` reports 0 errors
- [ ] Rendered `.wav` files exist under `fixtures/example-course/assets/audio/`

## Blocked by

- 001 — Sidecar ported to kokoro-onnx with parametrized POST /speak
