---
id: 007
title: Quiz beat
type: AFK
status: ready
blocked_by: [006]
---

## What to build

Quiz beat playback within the transport. Play `audio_intro`, show `prompt` + `options`; on answer, reveal
correctness and highlight the correct option, then play the **pre-rendered `audio_explanation`** (same
whether right or wrong — no live TTS in the quiz loop). Append a `quiz_answer {chosen, correct}` event.
Auto-advance to the next beat only **after the explanation finishes**. (Freeform "why is B wrong?" follow-ups
are handled by the always-available tutor box in issue 010, not here.)

## Acceptance criteria

- [ ] Quiz plays `audio_intro`, shows the prompt + options, and accepts an answer
- [ ] Correctness is revealed with the right option highlighted; the pre-rendered explanation plays
- [ ] A `quiz_answer` event is recorded with the chosen option and correctness
- [ ] Playback auto-advances after the explanation finishes

## Blocked by

- 006 — Lesson transport + progress + resume
