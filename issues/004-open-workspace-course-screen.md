---
id: 004
title: Open a workspace → course start screen
type: AFK
status: ready
blocked_by: [002]
---

## What to build

The first learner-facing slice: pick a course folder and see it presented. Define **TypeScript types** for
`course.json` + the beat schema (`narration | quiz | contested`, the `visual.kind` union, sources,
coverage). Add a Tauri file dialog to pick a folder and read `course.json` via the `fs` plugin. Run the
**light structural validation** in the front end (course.json exists/parses/has `schema_version`; lesson
files resolve; referenced `audio`/`visual` files exist) with graded, friendly failures — full `validate.py`
stays the authoring gate.

Render the **course start screen**: title + the **coverage disclosure** (covered / excluded-with-reasons)
+ a lesson list in `course.json` order with status badges, an overall-completion indicator, and per-lesson
**launchability derived from validation, not `status`**. Navigation is free (no prerequisite gating);
`status` (`draft`/`needs_review`/`ready`) is an informational badge only.

## Acceptance criteria

- [ ] Picking `example-course` shows title + coverage + a lesson list with a launchable lesson
- [ ] Picking a non-course folder shows a friendly "this folder isn't a course" error
- [ ] A course with an unrendered lesson opens with that lesson marked "not rendered yet" (non-launchable); the course still opens
- [ ] `draft`/`needs_review` lessons show a status badge but remain launchable when they validate

## Blocked by

- 002 — Tauri + Svelte + TS app scaffold that spawns the sidecar
- (soft) 003 — needed to demo a fully launchable lesson
