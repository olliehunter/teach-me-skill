---
id: 009
title: Sidecar /tutor endpoint
type: AFK
status: ready
blocked_by: [001]
---

## What to build

The grounded-tutor backend — the net-new subsystem. Add `POST /tutor {question, workspace_path, lesson_id,
beat_id}`. Assemble grounding **from workspace data only**: `MISSION.md` + the lesson `objective` + the whole
current-lesson narration + the **union of that lesson's cited source excerpts** (`sources/*.md` via each
source's `excerpt_ref`). Lesson-scoped — no cross-lesson memory.

Call Claude via the `anthropic` Python SDK with **structured output** `{answer_text, used_sources[]}`
(`messages.parse`). The model id is a **config value defaulting to `claude-sonnet-4-6`**; use
`thinking: {type: "adaptive"}` and **no** sampling params / `budget_tokens`. System instruction is
source-locked; if the answer isn't supported by the provided context, say so plainly and offer to flag it
(empty `used_sources`). Read `ANTHROPIC_API_KEY` from env / local config; if absent, return a structured
"no key" result — never crash.

## Acceptance criteria

- [ ] `/tutor` returns `{answer_text, used_sources}` grounded only in the lesson context + its cited excerpts
- [ ] The model id is configurable, defaulting to `claude-sonnet-4-6`; adaptive thinking, no sampling params
- [ ] An unsupported question yields an honest "not supported" answer + offer to flag, with `used_sources` empty
- [ ] A missing API key returns a structured "no key" result with no crash

## Blocked by

- 001 — Sidecar ported to kokoro-onnx with parametrized POST /speak
