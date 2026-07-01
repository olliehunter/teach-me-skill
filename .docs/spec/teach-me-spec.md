# teach-me — Shared Understanding & v1 Spec

*A narrated, source-grounded learning system that extends Matt Pocock's `teach` skill.*

## One-paragraph summary

`teach-me` is a personal learning tool. An **authoring/tutoring agent** (an extended version of Matt Pocock's `teach` skill, running in Claude Desktop) researches a knowledge-based topic from trusted sources and generates a course: a syllabus, lessons, narrated audio, visuals, and quizzes, written into a shared workspace folder. A separate, focused **Player** app then presents that course — an expressive local voice narrates while visuals and quizzes appear — and offers a prompt box where a source-grounded LLM tutor answers questions in the same voice. The Player records where you struggled back into the workspace, so the next authoring pass adapts.

## Scope and non-goals

- **Personal tool first.** No accounts, no auth, no hosting, no public-product concerns in v1. If it's good, "others on the internet" comes later with evidence.
- **Knowledge-based topics only.** Conceptual/declarative subjects (history, economics, theory, how-things-work). The tool must be honest about its boundary and gracefully decline or down-scope embodied/practical skills (yoga, instruments, welding), handing those off to humans/communities.
- **No hallucination, ever.** Every spoken claim must be traceable to a real source gathered during research. The tool should refuse to teach a topic it can't source well, rather than fluently guessing. (Matt's "never trust your parametric knowledge" rule carries over wholesale.)

## Architecture: two roles, one workspace

The system is **two roles over one shared workspace folder**, not two rigidly separate apps:

- **Authoring/tutoring role** — the extended `teach` skill in Claude Desktop. Researches, sequences, generates lessons + audio + visuals + quizzes, and (later) adapts based on learner struggles.
- **Presentation role** — the Player. A thin, focused, full-screen local app that plays audio, shows visuals, runs quizzes, captures responses, and hosts the tutor prompt box.

**The filesystem is the API.** Both roles read and write the same workspace directory. No bespoke interchange standard to invent — we extend Matt's existing directory structure (`MISSION.md`, `RESOURCES.md`, `learning-records/`, `lessons/`, `assets/`, `reference/`).

**v1 is two surfaces:** generate in Claude Desktop, then open the Player to learn, both pointed at the same folder. The seam is acceptable because generation is occasional and learning is where the hours go. A future unified app (agent embedded in the Player) is a convenience, not a v1 requirement — but the shared-workspace design keeps that path open.

## The format: beats

A lesson is a **timeline of beats**, not "an audio file plus slides." Each beat is:

```
beat = { narration_text, prerendered_audio_file, visual, citations[] }
```

A **quiz is a special kind of beat.** The Player's whole job becomes trivial: play this beat's audio, show its visual, advance. Sync happens at beat granularity, so no fragile word-level audio alignment is needed. This beat list is the real "standard format."

**Visuals are generated HTML/SVG by default** (accurate, lightweight, can embed clickable source links, matches Matt's existing Tufte-style output). Real raster images only when the topic genuinely needs one (a grape variety, an artwork, an anatomy diagram) — sourced and credited. Citations live as clickable links on each visual, which is how source-traceability survives the move to audio.

## Voice (TTS)

- **Narration is pre-rendered at authoring time** by the skill — no TTS engine bundled in the Player for lessons. This lets the skill use the heaviest, best-sounding model without latency pressure, and keeps the Player a portable playback shell.
- **The tutor speaks live**, in the **same voice** as the narration. This is the one place live TTS is required; voice-consistency is satisfied trivially because both use the same preset voice (see below).
- **Local TTS**, per the no-external-service preference.

**Decision (validated by spike): Kokoro-82M for both narration and the live tutor, using one preset voice for both.** We first chose Chatterbox-Turbo for its emotional expressiveness and voice cloning, but the spike on the target Mac (Apple Silicon, no NVIDIA) failed both gates: ~20% word hallucination on the cloned-voice path, and a real-time factor of 2.3x that made the live tutor never complete. Tuning couldn't fix the latency — expressive neural cloning wants a GPU not present here.

Kokoro was then spiked and passed cleanly:

- **Faithful** rendering of the text (no hallucination).
- **Narration** generated at real-time factor **0.19x** (49s of audio in ~10s).
- **Live tutor reply** generated in **~1.4s** (real-time factor 0.17x) — responsive enough for a real spoken tutor.
- **Apache-2.0** licensed (both the inference library and the Kokoro-82M weights/voicepacks) — **commercial use permitted**; already deployed in commercial TTS APIs. (Not legal advice; have counsel review if revenue depends on it. Note: training-data provenance is undocumented, a theoretical risk common to all open TTS models.) This also keeps the door open to the original "useful to others" / commercial direction.

**Conscious tradeoff:** Kokoro is clear and natural but not *dramatically* emotional, and it cannot clone a custom voice (you pick a preset). We accepted this to keep the tool **fully local, fast, and faithful** — judged the right trade for knowledge-based lessons where clarity matters more than theatre. Because narration and tutor share the same preset, the voices match by construction.

- **Voice choice** (which Kokoro preset is "the teacher") is a config field on the workspace; pick by ear later, don't block on it.
- **Deferred:** if emotional warmth ever proves essential, the escalation path is a cloud TTS (consciously trading away "fully local") — not a v1 concern.

## Commercial-license watch

v1 is a personal tool, but tech choices are kept commercial-clean and any copyleft/commercial-restricted dependency is flagged as it's introduced:

- **Kokoro-82M + weights/voicepacks** — Apache 2.0, commercial use OK. ✅
- **espeak-ng** (Kokoro/misaki pronunciation *fallback*) — **GPLv3 (copyleft)**. ⚠️ No obligation when you run it yourself; obligations trigger on **distribution to others**. Since v1 bundles it into a Tauri installer, architect it as a **separate bundled executable** the sidecar calls as a subprocess ("mere aggregation") so copyleft never reaches your code — then distribution only requires providing espeak-ng's source/offer.
- **Claude API** (authoring + tutor) — commercial use OK under Anthropic's paid terms. ✅
- **Matt Pocock `teach` skill** (extended by teach-me) — license **to be verified** before commercial use.

## Tutor

- **Cloud LLM brain, local voice.** The tutor's answer is generated by a cloud LLM call (Claude API — strong at staying grounded; trivial single-key setup), then spoken in the locked local voice.
- **Strictly source-grounded.** The tutor answers only from the workspace sources for the active lesson — closer to NotebookLM's source-locked chat than an open LLM. This is the learner's safety valve when something sounds off.
- **The Player makes its own grounded call** (the Desktop agent isn't running during a Player session). Struggles are written back to the workspace; the agent picks them up on the next authoring pass.

## Adaptivity

- **v1: static course + state hooks.** One-shot generation, but the format carries the hooks the adaptive loop will need — quiz results, "I was lost here" flags, mission metadata — even though v1 may not act on them yet.
- **v2: adaptive loop.** Player writes struggles into `learning-records/`; the agent reads them and resequences/regenerates upcoming lessons, preserving Matt's zone-of-proximal-development adaptivity.

## Player architecture (v1)

**Tauri desktop app, fully packaged.** Chosen over a bare local web app for the real-app feel and zero UI rework later; chosen as the *full* packaged version (not just a dev shell) deliberately.

- **Front end:** HTML/JS/SVG in Tauri's system webview — renders the beat visuals and plays the WAV audio natively, no rendering engine to build.
- **Python sidecar:** a FastAPI process compiled to a standalone binary (PyInstaller) and shipped as a Tauri `externalBin`, spawned on launch. Responsibilities: Kokoro TTS (live tutor voice), grounded Claude calls (tutor brain), appending `progress.jsonl`. Python keeps Kokoro in-process and matches `render_audio.py`/`validate.py`.
- **Tutor flow:** front end → sidecar endpoint (question + lesson context) → Claude, grounded strictly in cached `sources/*.md` → reply text → Kokoro renders it in the course voice → audio back to the webview.
- **API key:** the user's Claude key lives in local sidecar config (fine for a personal tool).

**Known hard parts (the real cost of "full v1"):** PyTorch bloats the bundle to ~1–2GB and needs careful PyInstaller config; macOS code-signing + notarization must cover the sidecar binary (hardened-runtime entitlements); espeak-ng paths/data must bundle correctly.

**Architectural rule for license cleanliness:** keep **espeak-ng as a separate bundled executable** the sidecar calls as a subprocess ("mere aggregation"), so its GPLv3 copyleft never reaches your code. Personal-use installers carry no GPL obligation; distributing to others requires providing espeak-ng's source/offer. Building it as a separate process from day one keeps the commercial path open.

## Sourcing, trust & contested content

The operational enforcement of the no-hallucination rule. Three linked decisions:

- **Trust bar — strict, Tier 1/2 only.** Sources are tiered (CRAAP / Wikipedia-RS style): **Tier 1** primary/authoritative (the standard, law, dataset, paper, official docs, owning institution), **Tier 2** reputable secondary (established textbooks, edited major outlets, recognised expert explainers), **Tier 3** everything else (blogs, forums, content farms, AI summaries). **Every taught claim must be backed by ≥1 Tier 1/2 source.** Tier 3 may point toward better sources but is never sole support. The skill records a one-line trust rationale per source in `RESOURCES.md` so trust is auditable.
- **Two-stage gate + down-scope-and-disclose.** *Planning gate* (per lesson, before authoring): if a planned lesson lacks Tier 1/2 coverage it's dropped or merged, not faked. *Authoring gate* (per beat): every beat must cite a Tier 1/2 source whose **cached excerpt actually supports the specific claim** — an explicit authoring re-read, since `validate.py` can only confirm a citation *exists*, not that it *supports*. When a topic is only partly sourceable, **teach the well-sourced subset and disclose the gaps** up front ("I can teach A, B, C to a high standard; I couldn't source D well enough, so it's excluded"). Refuse the whole topic only when its core can't clear the bar.
- **Contested content is first-class.** Reputable ≠ unanimous. When Tier 1/2 sources genuinely diverge, teach it **as a disagreement** — competing positions, who holds each and why, both cited — never collapsed into false certainty. Settled facts are taught directly; the skill's job is to sort which is which. On political/ethical matters the teacher presents the strongest version of each side and attributes them rather than voicing its own opinion. This is treated as a feature: "where the experts disagree, and why" is often the richest part of learning.

## Decisions locked (the grilling)

1. **Audience:** personal tool first, by design — not a public product yet.
2. **Player necessity:** a presentation surface must exist, but stay thin; the differentiator is the *skill's* pedagogical sequencing + expressive voice, not the player tech.
3. **Presentation mode:** narration (talk-at-you, interruptible) + visuals + quizzes — not interactive turn-by-turn tutoring during a lesson.
4. **Voice generation:** pre-rendered narration; live TTS only for the tutor, in the same locked voice.
5. **Static vs adaptive:** static course for v1, with state hooks designed in for a future adaptive loop.
6. **Boundary:** two roles over one shared workspace; drop "two apps" as a hard requirement.
7. **Surfaces:** two surfaces in v1 (generate in Desktop, learn in Player); integration path preserved.
8. **Trust:** research-grounded, citations on every visual, tutor locked to sources, no parametric guessing.
9. **Atomic unit:** the "beat"; visuals are HTML/SVG by default, real images only when necessary.
10. **Topic scope:** knowledge-based only; honest, graceful refusal of embodied/practical skills.
11. **Tutor:** cloud LLM brain + local voice; the Player makes its own grounded call.
12. **Trust bar:** strict — every taught claim backed by ≥1 Tier 1/2 source; trust rationale recorded and auditable.
13. **Sourcing gate:** two-stage (per-lesson planning + per-beat semantic support); down-scope-and-disclose when partly sourceable.
14. **Contested content:** first-class — taught as disagreement with both sides cited; even-handed on political/ethical matters.
15. **Success criteria:** accuracy hard-gate + sequence + engagement + **required delayed retention check**; first test on one known + one new topic.
16. **Player stack:** Tauri desktop app, fully packaged, with a PyInstaller'd Python sidecar (Kokoro + grounded Claude + progress); espeak-ng kept as a separate executable for license cleanliness.

## Reference implementation (companion files)

These were produced alongside this spec and are the concrete embodiment of it:

- **`beat-schema.md`** — the full format contract (workspace layout, `course.json`, lesson/beat JSON, `progress.jsonl`, tutor grounding, output guarantees).
- **`spike.py`** / **`chatterbox-spike.md`** — the Chatterbox spike that *failed* on the target Mac (recorded so the decision is traceable).
- **`spike_kokoro.py`** — the Kokoro spike that *passed* (narration 0.19x RTF, tutor reply ~1.4s).
- **`example-course/`** — a complete, validating example workspace: `MISSION.md`, `RESOURCES.md`, `course.json`, a cached source excerpt, one full lesson (`lessons/0001-…json`, 3 narration beats + 1 quiz), three Tufte-style SVG visuals with clickable source links, a shared stylesheet, plus:
  - **`render_audio.py`** — renders per-beat Kokoro audio and patches real durations into the lesson JSON.
  - **`validate.py`** — asserts the four output guarantees; passes clean on the example (audio warnings only until rendered).

## Open questions resolved since first draft

1. **TTS reality check — RESOLVED.** Chatterbox failed on the Mac (hallucination + 2.3x RTF); **Kokoro-82M passed** and is the locked choice (faithful, fast, local, Apache-2.0).
2. **Beat schema — RESOLVED.** Pinned in `beat-schema.md` and demonstrated in `example-course/`.
3. **Visual generation — DEMONSTRATED (one lesson).** HTML/SVG visuals with embedded citations work; still to prove the *skill* can generate them reliably at scale.

## Success criteria (how we judge v1)

Evaluate against fluency's trap: a beautifully narrated course maximises the *illusion* of mastery, so the test must reach past "it felt nice" to storage strength. Apply this rubric to a real course:

1. **Accuracy (hard gate):** sample ~10 claims, check each against its cited source. Target **zero** unsupported/wrong claims — anything above zero is a failure, not a deduction.
2. **Sequence:** each lesson builds on the last; nothing assumes untaught knowledge. Flag out-of-order beats.
3. **Engagement:** finished without forcing it? Honest 1–5.
4. **Retention (required, the real test):** a day or two later, cold, can you explain the core ideas in your own words and pass the quizzes without a replay? Storage strength, not in-the-moment fluency.
5. **Tutor:** answers grounded and correct when asked.

**First-test design:** run two courses — one on a topic you already know (audits accuracy + sequence as an expert) and one genuinely new (tests whether it actually teaches). The known topic proves it's *correct*; the new topic proves it *teaches*.

## Build backlog (design questions all resolved)

The grilling is complete — what remains is construction, in rough dependency order:

1. **Bundling spike — VALIDATED (A + B).** A Tauri app with a PyInstaller'd Python sidecar running Kokoro, spawned by Tauri, speaking in the webview (Checkpoint A) and working from a fully-bundled `.app` with no dev Python (Checkpoint B). Checkpoint C (sign + notarize) **deferred** — needs an Apple Developer account; not required to prove the engineering. Files in `bundle-spike/`. See "Bundling findings" below.
2. **Authoring skill (`teach-me`).** Extend Matt's `teach` to emit the beat format, apply the Tier 1/2 sourcing gate, render audio via `render_audio.py`, and run `validate.py` before marking a course `ready`.
3. **Player.** Build the Tauri front end against the example workspace (beat playback, quizzes, contested side-by-side, coverage disclosure, tutor box). The `bundle-spike/` is the seed — extend its front end, don't restart.
4. **First evaluation.** Run the success-criteria rubric on one known + one new topic, including the delayed retention check.

### Bundling findings (hard-won, don't rediscover)

Getting Kokoro into a PyInstaller `--onefile` binary required collecting data/libs that `--collect-all` alone missed. The working `build_sidecar.sh` recipe:

- **`language_tags`** ships `data/json/*.json` its loader reads by path → add via `--add-data` explicitly (also `csvw`, `segments`).
- **`espeakng_loader`** bundles espeak-ng's data dir *and* its shared library inside the package → add both (`--add-data` for `espeak-ng-data`, `--add-binary` for the dylib). No Homebrew espeak-ng needed.
- **`en_core_web_sm`** (spaCy model) — misaki's English G2P downloads it at runtime (fatal when frozen) → `python -m spacy download en_core_web_sm` at build time, then `--collect-all en_core_web_sm --collect-all spacy --copy-metadata en_core_web_sm`.
- **CORS** — the webview calls the sidecar cross-origin (`tauri://localhost` → `127.0.0.1:17861`); without `CORSMiddleware(allow_origins=["*"])` the fetch is sent but the response is unreadable (silent failure that looks like "sidecar didn't start"). `curl` working while the app fails is the tell.
- **Deferred for real build:** Kokoro pulls its model weights from Hugging Face on first run (needs network) — bundle the weights for true offline use. And for distribution, keep espeak-ng as a separate executable (GPLv3 aggregation) + sign/notarize (Checkpoint C).

## Suggested thinnest MVP slice

One topic you actually want to learn → skill generates a 3–5 lesson course (beats, HTML/SVG visuals, pre-rendered narration, quizzes, sources) into a workspace folder → a minimal Player plays the beats, runs quizzes, and offers a source-grounded tutor box that replies in the locked voice. No adaptivity yet, just the state hooks. If that one course is accurate, well-sequenced, and genuinely pleasant to sit through, the idea is validated and worth extending.
