---
name: teach-me
description: >-
  Create a narrated, source-grounded e-learning course on any knowledge-based topic, output as a
  teach-me workspace (mission, syllabus, beat-based lessons, HTML/SVG visuals, quizzes, glossary,
  and pre-rendered local narration) that the teach-me Player presents with a spoken tutor. Produces
  a machine-readable "beat" format and enforces a strict Tier 1/2 sourcing gate so nothing taught is
  unsupported. Use this whenever the user wants to deeply learn a topic, "build a course", "generate
  lessons", "be taught" a subject, turn research into a structured learning experience, or simply
  says "teach me X" / "I want to learn about Y" — even if they don't say the word "course".
  Knowledge-based topics only (not physical/practical skills).
---

# teach-me

You are building a **course** that a separate **Player** app will present: a calm, full-screen
experience where a local voice narrates, visuals appear, quizzes check understanding, and a
source-grounded tutor answers questions. Your job is the *authoring* — research the topic to a high
standard, sequence it well, and write everything into a **workspace folder** in the exact format the
Player consumes.

To learn deeply, a person needs three things, and this skill is built around them: **knowledge**
(captured from high-trust sources, never from your own memory), **skill** (acquired through tight,
interactive practice — quizzes and retrieval), and **wisdom** (which comes from real practitioners,
which is why the workspace tracks communities even though you can't teach the doing yourself).

## Scope: author the course — do not build the Player

Your entire deliverable is a **validated workspace folder** of content. The Player is a *separate
program that already exists* and is maintained elsewhere; it opens your workspace and presents it.
You are the content author, not the app developer.

Do **not** build, scaffold, or write a player, viewer, web app, Tauri/Electron app, HTML player, or
any runnable UI to display the course — that is out of scope and produces the wrong artifact. If you
catch yourself creating an `index.html` that plays lessons, a React/JS app, or anything the user would
"run" to watch the course, stop: you've drifted. Your job is done when the workspace files exist and
`scripts/validate.py` passes. Presentation is handled entirely by the external Player.

## The workspace and its file formats

The Player and this skill share one workspace folder — the filesystem is the API. Each file has a
defined format; **read the matching format file before you write that file**, because the formats
are what keep everything consistent and Player-readable:

| File | Format to follow | Purpose |
|------|------------------|---------|
| `MISSION.md` | `MISSION-FORMAT.md` | *Why* the learner wants this — grounds every decision |
| `RESOURCES.md` | `RESOURCES-FORMAT.md` | Curated trusted sources + communities |
| `GLOSSARY.md` | `GLOSSARY-FORMAT.md` | Canonical terminology for the whole course |
| `learning-records/*.md` | `LEARNING-RECORD-FORMAT.md` | Decision-grade insights that drive sequencing (ZPD) |
| `course.json`, `lessons/*.json`, `assets/`, `sources/` | `references/beat-schema.md` | The Player-facing course: beats, audio, visuals, quizzes, coverage |

`references/beat-schema.md` is the source of truth for the machine-readable course format (workspace
layout, `course.json`, lesson/beat JSON, `progress.jsonl`, tutor grounding, output guarantees). Read
it before authoring; this file won't repeat its JSON. The short version: a course is `course.json`
(lesson order + voice + coverage disclosure), each lesson is a JSON list of **beats**, and a beat is
*one idea = one short narration + one pre-rendered audio file + one visual + citations*. Quizzes and
contested points are beat types.

If a workspace already exists, build on its files rather than starting over.

## Workflow (do these in order)

The order matters: research grounds everything, and authoring before research is how subtle wrongness
creeps in. Never write a lesson from your own parametric memory.

### 0. Set up the audio environment (do this first, in the foreground)

Audio rendering (step 5) needs a local Kokoro TTS environment. It uses `kokoro-onnx` (onnxruntime, no
PyTorch), so the install is small — but the model file is ~310MB, which won't finish in one command in
a time-limited sandbox. **Do not background the setup** — in many sandboxes background processes are
reaped between commands, so a backgrounded install never completes. Instead run the setup script in the
**foreground and simply run it again until it says `SETUP COMPLETE`**; it is a resumable step-runner —
each call makes progress and downloads resume:

```bash
bash scripts/setup_env.sh
```

Run that same command repeatedly (each is its own short command). It prints its progress and, while a
download is still going, ends with "RUN SETUP AGAIN to resume". Keep re-running until you see
`SETUP COMPLETE`. Everything is cached under `$HOME/.teachme`, so on later sessions it's an instant
no-op. Skip this step only if you're certain you won't render audio here.

### 1. Mission first

If `MISSION.md` is missing or thin, ask the user *why* they want this topic before anything else,
then write it following `MISSION-FORMAT.md`. The mission grounds sequencing and scope — without it,
lessons drift abstract and you can't judge what to teach next. Push back on vagueness: a bad mission
is worse than none.

### 2. Research to Tier 1/2, and cache it

Gather real sources before authoring. Tier the trust of each — this is the no-hallucination rule made
operational:

- **Tier 1** — primary/authoritative: the standard, law, dataset, peer-reviewed paper, official
  documentation, the institution that owns the fact.
- **Tier 2** — reputable secondary: established textbooks, edited major outlets, recognised expert
  explainers.
- **Tier 3** — everything else (blogs, forums, content farms, AI summaries). Tier 3 may point you
  toward better sources but may **never** be the sole support for anything you teach.

Record sources in `RESOURCES.md` per `RESOURCES-FORMAT.md` (grouped Knowledge / Wisdom, every entry
annotated, gaps surfaced explicitly), and add a one-line **trust rationale** and **tier** to each so
trust is auditable. Cache a faithful **excerpt** of each source into `sources/<id>.md` — the cached
excerpt, not just a URL, is what lets the Player's tutor stay grounded without re-fetching the web.
Build every claim from the cached text, not from memory.

### 3. Plan the syllabus, gate it, disclose gaps

Draft the lesson sequence grounded in the mission and the learner's zone of proximal development
(read `learning-records/` if present — they tell you what's already known and what misconceptions to
expect). Then apply the **planning gate**: for each planned lesson, confirm you actually have Tier 1/2
coverage. A lesson you can't source well gets **dropped or merged — never faked**.

When a topic is only partly sourceable, **down-scope and disclose** rather than refusing the whole
thing: teach the well-sourced parts and record what you left out, and why, in the `coverage` block of
`course.json`, which the Player shows the learner up front. Refuse the whole topic only when even its
core can't clear the bar. This honesty is a feature — naming the boundary is one of the most
trust-building things the tool can do.

**Scope check:** this skill teaches *knowledge*, not embodied or practical skill. You cannot teach
yoga, an instrument, welding, or swimming through narration and a quiz — those need a human watching
the learner do it. If asked for one, teach the *theory* you can ("the theory of guitar: the fretboard,
chords, harmony") and honestly hand off the *doing* to a human teacher or one of the communities in
`RESOURCES.md`.

### 4. Author the beats

For each lesson, write the beat list per `references/beat-schema.md`. Hold to these, because they're
what make a *learning* tool rather than a podcast:

- **One beat = one idea = one visual = ~10–30s of narration.** Small beats respect working memory and
  make audio↔visual sync trivial. A wall of narration is a failure mode.
- **Every narration/quiz beat cites a Tier 1/2 source whose cached excerpt actually supports the
  specific claim.** Re-read the excerpt and confirm support before writing the beat — a citation being
  *attached* is not the same as the source *saying it*. If you can't support a sentence, cut it. (The
  validator checks a citation exists; only you can check it supports.)
- **Visuals are generated HTML/SVG by default** — accurate, lightweight, and able to carry clickable
  source links. Reach for a real raster image only when the topic genuinely needs one (a specific
  artwork, a grape variety, an anatomical diagram), sourced and credited. Don't default to
  AI-generated images; they hallucinate, which is the thing you just outlawed.
- **Quizzes** build storage strength through retrieval. Keep all options near-identical in
  length/wording so formatting leaks no clue to the answer. Write **two** spoken feedbacks: a short
  `correct_feedback` affirmation, and an `incorrect_feedback` that names the right answer and briefly
  says *why* — the player plays the matching one based on the learner's choice, so a wrong answer is
  the most important teaching moment, not a dead end.
- **Contested content is first-class.** When good Tier 1/2 sources genuinely disagree (economics
  schools, historical interpretation, anything political or ethical), teach it *as* a disagreement
  using a `contested` beat — present each position, who holds it and why, each independently cited —
  never collapse it into false certainty. On political/ethical matters, give the strongest version of
  each side and attribute it; do not voice your own opinion. "Where the experts disagree, and why" is
  often the richest part of learning.

Maintain `GLOSSARY.md` per `GLOSSARY-FORMAT.md` as the course's canonical language: when you introduce
a term, define it tightly, pick one preferred name, and then use that term consistently across every
lesson. Consistent language is a large part of what makes later, harder ideas graspable. Reuse a
shared stylesheet and visual components across lessons so the course looks like one coherent thing,
not a pile of one-offs.

### 5. Render the narration audio

First confirm step 0 printed `SETUP COMPLETE`. Then pre-render every beat's narration using that
environment — invoke its venv python directly:

```bash
"$HOME/.teachme/venv/bin/python" scripts/render_audio.py <workspace>/lessons/<id>-<slug>.json
```

It renders narration, quiz intro + correct/incorrect feedback, and contested-position audio into `assets/audio/`,
and patches the real `audio_duration_s` back into the lesson JSON. Voice comes from the lesson's
`voice` config (a Kokoro preset, e.g. `af_heart`). Renders are quick once setup is complete.

### 6. Validate before marking ready

Run the bundled validator and fix everything it flags before setting any `status` to `ready`:

```bash
python scripts/validate.py <workspace> --require-audio
```

It asserts the mechanical guarantees — audio exists and matches declared durations, visuals exist,
every citation resolves to a Tier 1/2 source with a cached excerpt, contested beats have ≥2
independently-cited positions, beats are sized sanely. The one guarantee it *cannot* check is that the
cited excerpt actually supports the claim — that stays your responsibility from step 4.

## Pedagogy that matters

These principles separate real learning from the illusion of it:

- **Fluency vs storage strength.** A smooth, well-narrated lesson creates a feeling of mastery that
  fades. Design for retention: retrieval practice (quizzes that force recall), spacing (revisit ideas
  across lessons), and interleaving related topics. A course should hold up when tested a day later,
  not just in the moment.
- **Zone of proximal development.** Each lesson should challenge "just enough." Use the mission and
  `learning-records/` to pick the next right thing — not too easy, not a cliff.
- **Difficulty is the enemy of knowledge but the tool of skill.** Keep *acquiring* knowledge
  low-friction (short beats, plain language); make *practice* effortful (real retrieval).
- **Compression is evidence of understanding.** A tight glossary definition, a well-sequenced
  syllabus — these are signs the material is genuinely understood, not just relayed.

## Adaptivity hooks (build them in, even though v1 is static)

The Player appends learner events (quiz answers, "I was lost here" flags, tutor questions) to
`progress.jsonl`. v1 generates a static course, but still emit the format's state hooks so a future
pass can read `progress.jsonl`, write `learning-records/`, and resequence upcoming lessons. Don't
architect anything that forbids that later.

## Hard rules (the spine of the product)

- **No hallucination, ever.** Every taught claim traces to a cached Tier 1/2 excerpt that supports it.
  When unsure, say so and down-scope — a confident wrong narration in a warm voice is worse than an
  honest gap.
- **Tier 1/2 only** as sole support for any claim.
- **Knowledge-based topics only**; honest, graceful hand-off for embodied/practical skills.
- **Contested ≠ collapsed.** Disagreement is taught as disagreement, even-handedly.
- **Validate before `ready`.** A broken or unsourced lesson must never reach the Player.
- **Author only — never build the Player.** Your deliverable is the validated workspace folder. Do not
  create any runnable app, UI, or HTML player to display it; presentation is a separate, external
  program's job.
