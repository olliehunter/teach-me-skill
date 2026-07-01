---
id: 010
title: Tutor box wired end-to-end
type: AFK
status: ready
blocked_by: [009, 005]
---

## What to build

The always-visible tutor box in the front end. Gate its state on `/health`: **warming → ready**, or **"add
your key"** (sidecar reports no key), or **error**. On submit (input disabled while a request is in flight):
call `/tutor`, render `answer_text` + `used_sources` chips (chips open the in-app source panel from issue
005), then `POST /speak {text: answer_text, voice: course.voice}` and play the result. Submitting **pauses
narration** and it **stays paused** after the spoken answer (a resume affordance, no auto-resume). Append a
`tutor_question` event. The tutor always uses `course.voice`.

The rest of the app must remain fully usable when the tutor is unavailable (no key / sidecar down).

## Acceptance criteria

- [ ] The tutor box shows warming / no-key / error / ready states correctly, driven by `/health`
- [ ] A typed question returns a grounded answer, shows cited-source chips (→ source panel), and is spoken in the course voice
- [ ] Narration pauses on submit and stays paused after the spoken answer
- [ ] Input is disabled while a request is in flight; a `tutor_question` event is appended
- [ ] With no key, the box shows "add your key" and the rest of the app is unaffected

## Blocked by

- 009 — Sidecar /tutor endpoint
- 005 — A narration beat renders and plays (source panel + playback/pause integration)
