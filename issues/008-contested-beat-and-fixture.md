---
id: 008
title: Contested beat + contested test fixture
type: AFK
status: ready
blocked_by: [006, 003]
---

## What to build

Contested beat rendering. Present the `positions` **side-by-side**, each with its own citations, never
visually privileging a side; play `audio_intro`, then each position's audio top-to-bottom, then **stop**
(manual next). Reuse the citation chips + in-app source panel from issue 005.

Because `example-course` has no contested beat, **author a small contested test fixture** (≥2 positions, each
independently cited to a Tier 1/2 source) and render its audio via the ported `render_audio.py`, so this code
path is actually exercised and passes `validate.py`.

## Acceptance criteria

- [ ] A contested beat renders its positions side-by-side, each with its own citations, none privileged
- [ ] `audio_intro` plays, then each position's audio in order, then playback stops (manual next)
- [ ] A contested test fixture exists with ≥2 independently-cited positions, renders audio, and passes `validate.py`

## Blocked by

- 006 — Lesson transport + progress + resume
- 003 — render_audio.py ported to kokoro-onnx (to render the fixture's audio)
