---
id: 005
title: A narration beat renders and plays
type: AFK
status: ready
blocked_by: [004, 003]
---

## What to build

The visual + playback substrate for one narration beat. Build the **visual renderer** covering every
`visual.kind`: inline-inject `svg_file` / `html_file` / `inline_svg` (read file text and inject inline so
the shared `styles.css` cascades and `<a>` links are live), `image_file` via the Tauri asset protocol
`<img>`, and `none`. Inject the workspace `assets/styles.css` once as a global `<style>` block. **Widen the
CSP** to allow the asset protocol for `img-src`/`media-src` (+ `blob:`). Play the beat's pre-rendered audio
via the asset protocol.

Render **citation chips** from `beat.citations` plus an **in-app source panel** that shows the cached
excerpt (`sources/<id>.md`) with an outbound link to the source `url`; intercept `<a>` links inside injected
visuals to open that same panel rather than jumping to a browser. Injected `<script>` must not execute.

## Acceptance criteria

- [ ] A narration beat shows its visual with `styles.css` applied and plays its audio
- [ ] Each `visual.kind` renders correctly (`svg_file`, `html_file`, `inline_svg`, `image_file`, `none`)
- [ ] Citation chips open the in-app source panel showing the cached excerpt + outbound link
- [ ] Source `<a>` links inside a visual open the same panel (no browser jump)
- [ ] Injected `<script>` is not executed

## Blocked by

- 004 — Open a workspace → course start screen
- 003 — render_audio.py ported to kokoro-onnx; example-course rendered + validates
