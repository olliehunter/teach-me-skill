---
id: 006
title: Lesson transport + progress + resume
type: AFK
status: ready
blocked_by: [005]
---

## What to build

Turn a single beat into a playable lesson. Build the **narration transport**: auto-advance on audio end;
manual pause/play, replay-beat, back, next; nav edges (back at the first beat and next at the last beat both
return to the course screen). Append progress events to `progress.jsonl` (front end is the **sole writer**):
`lesson_started`, `beat_viewed` **on entering** each beat, `lesson_completed` after the final beat.

**Derive resume** by folding `progress.jsonl` at open into per-lesson state (not started / in progress @ last
`beat_viewed` / completed); the Resume button jumps to the furthest in-progress beat, and completing a lesson
returns to the course screen with the next lesson highlighted. Add the **"I was lost here"** control, which
appends a `flag_lost` event.

## Acceptance criteria

- [ ] Playing a lesson auto-advances through beats; pause/replay/back/next all work; nav edges return to the course screen
- [ ] `progress.jsonl` gains `lesson_started` / `beat_viewed` (on entry) / `lesson_completed` as expected
- [ ] Quit + reopen resumes at the furthest in-progress beat, computed by folding the append-only log
- [ ] "I was lost here" appends a `flag_lost` event

## Blocked by

- 005 — A narration beat renders and plays
