---
id: 011
title: Bundle .app (Checkpoint B) + end-to-end acceptance
type: HITL
status: ready
blocked_by: [006, 007, 008, 010, 003]
---

## What to build

Package the `.app` at **Checkpoint B** — the kokoro-onnx sidecar plus the ONNX model + voices files as
bundled resources — and prove it runs with **no dev Python present**. Then run the full PRD §7 acceptance
pass on `example-course` (plus the contested test fixture): open → coverage → play all beats with synced
visuals → run the quiz and record the result → append progress → answer a typed tutor question in the course
voice — end to end.

**Checkpoint C (code-sign + notarize) is explicitly out of scope** (needs an Apple Developer account;
entitlements remain in the seed runbook). This slice is **HITL**: a human must run the bundled app and confirm
it actually speaks and plays audio, which can't be fully automated.

## Acceptance criteria

- [ ] `npm run tauri build` produces an `.app` that runs with no dev Python present
- [ ] The bundled app opens `example-course`, shows coverage, and plays all beats with synced visuals
- [ ] The quiz runs and records; progress is appended; resume works from the bundled app
- [ ] A typed tutor question is answered and spoken in the course voice from the bundled app
- [ ] A human confirms end-to-end audio playback + narration sync in the bundled build (HITL sign-off)

## Blocked by

- 006 — Lesson transport + progress + resume
- 007 — Quiz beat
- 008 — Contested beat + contested test fixture
- 010 — Tutor box wired end-to-end
- 003 — render_audio.py ported to kokoro-onnx; example-course rendered + validates
