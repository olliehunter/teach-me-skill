---
id: 002
title: Tauri + Svelte + TS app scaffold that spawns the sidecar (Checkpoint A)
type: AFK
status: ready
blocked_by: [001]
---

## What to build

Scaffold the real app — **Tauri + Vite + Svelte + TypeScript** — extending the proven seed: the Rust
startup-spawn of the sidecar, `externalBin` config, and the CSP baseline. Replace the seed's demo button
with a minimal Svelte shell that polls `/health` and can issue a `POST /speak`. This re-proves
**Checkpoint A** on the new engine (the seed proved a torch recipe we no longer use).

## Acceptance criteria

- [ ] `npm run tauri dev` launches the app and spawns the sidecar on startup
- [ ] The shell polls `/health` and enables a control once the sidecar is ready
- [ ] Triggering speech plays kokoro-onnx audio in the webview (Checkpoint A)
- [ ] CSP baseline is present and the app builds clean

## Blocked by

- 001 — Sidecar ported to kokoro-onnx with parametrized POST /speak
