# teach-me — Beat Schema (v1)

The contract between the two roles. The **authoring/tutoring role** (extended `teach` skill) *writes* this; the **presentation role** (Player) *reads* it. The filesystem is the API — there is no live protocol, just a shared workspace folder.

## Design principles

1. **The Player is dumb.** Everything it needs to present a lesson is declared in data. The Player never decides pedagogy; it plays beats and records what the learner did.
2. **Authored content is read-mostly; learner state is append-only and separate.** The skill owns `course.json` / `lessons/`; the Player owns `progress.jsonl`. They never write the same file. This is what lets a course be regenerated without losing learner history, and vice versa.
3. **A beat = one idea = one visual = one short narration.** Keep narration per beat to ~10–30s. Small beats keep working memory free and make audio↔visual sync trivial (beat-level, never word-level).
4. **Every claim is source-traceable.** Every narration/quiz beat cites source IDs; sources carry both a URL and a cached text excerpt so the tutor can stay grounded offline.

## Workspace layout

Extends Matt Pocock's `teach` structure (additions marked **+**):

```
<workspace>/
  MISSION.md                 # why the learner wants this (grounds everything)
  RESOURCES.md               # trusted sources, human-readable
  course.json              + # machine-readable course manifest (lesson order, voice)
  lessons/
    0001-<slug>.json       + # the BEAT MANIFEST the Player consumes
    0001-<slug>.html         # (optional) Matt-style human-reviewable lesson
  assets/
    audio/0001-b3.wav      + # pre-rendered narration, one file per beat
    visuals/0001-b3.svg    + # one visual per beat (HTML/SVG default)
    styles.css               # shared stylesheet (Matt's shared component)
  sources/                 + # cached source excerpts for tutor grounding
    s1.md
  reference/                 # compressed reference docs (Matt)
  learning-records/          # ADR-style records of what was learned (Matt)
  progress.jsonl           + # append-only learner-event log, written by the Player
  NOTES.md                   # teaching preferences (Matt)
```

## `course.json`

```json
{
  "schema_version": "1.0",
  "title": "Understanding Interest Rates",
  "mission_ref": "MISSION.md",
  "voice": { "engine": "kokoro", "lang_code": "a", "voice": "af_heart", "speed": 1.0 },
  "lessons": [
    { "lesson_id": "0001", "slug": "what-is-a-base-rate", "title": "What a Base Rate Is", "status": "ready" },
    { "lesson_id": "0002", "slug": "interest-rate-lags",  "title": "Why Rate Changes Take Time", "status": "ready" }
  ],
  "coverage": {
    "covered": ["What the base rate is", "Transmission and lags"],
    "excluded": [
      { "topic": "Quantitative easing mechanics", "reason": "Could not source to Tier 1/2 standard at authoring time." }
    ]
  },
  "created": "2026-06-30T10:00:00Z",
  "generated_by": "teach-me 0.1"
}
```

`status` ∈ `draft | ready | needs_review`. `voice` is the course default; a lesson may override it. **`coverage`** is the down-scope disclosure: the Player surfaces `covered` / `excluded` at course start so the learner knows the boundaries up front. An empty `excluded` means the full intended syllabus cleared the Tier 1/2 bar.

## `lessons/<id>-<slug>.json` — the beat manifest

```json
{
  "schema_version": "1.0",
  "lesson_id": "0002",
  "slug": "interest-rate-lags",
  "title": "Why Rate Changes Take Time",
  "mission_ref": "MISSION.md",
  "objective": "Explain why monetary policy acts with long and variable lags.",
  "prerequisites": ["0001"],
  "estimated_seconds": 180,
  "voice": { "engine": "kokoro", "lang_code": "a", "voice": "af_heart", "speed": 1.0 },
  "sources": [
    {
      "id": "s1",
      "title": "Monetary Policy and Its Transmission",
      "url": "https://www.bankofengland.co.uk/...",
      "excerpt_ref": "sources/s1.md",
      "accessed": "2026-06-30",
      "tier": 1,
      "trust_rationale": "Central bank — primary authority on its own policy mechanism."
    }
  ],
  "beats": [ /* see below */ ],
  "created": "2026-06-30T10:00:00Z",
  "generated_by": "teach-me 0.1"
}
```

### Narration beat

```json
{
  "id": "b1",
  "type": "narration",
  "narration": "When a central bank raises its base rate, borrowing gets more expensive, so spending cools.",
  "audio": "assets/audio/0002-b1.wav",
  "audio_duration_s": 9.2,
  "visual": { "kind": "svg_file", "src": "assets/visuals/0002-b1.svg", "alt": "Rate up arrow lowering a demand curve" },
  "citations": ["s1"]
}
```

`visual.kind` ∈ `svg_file | html_file | image_file | inline_svg | none`. For `inline_svg`, replace `src` with `"svg": "<svg>…</svg>"`. `alt` is required for accessibility. `citations` are source IDs; the Player renders them as clickable links anchored to the visual (this is how source-traceability survives audio).

### Quiz beat

```json
{
  "id": "b4",
  "type": "quiz",
  "format": "single_choice",
  "narration_intro": "Quick check.",
  "audio_intro": "assets/audio/0002-b4-intro.wav",
  "prompt": "Why don't rate changes move prices immediately?",
  "options": [
    { "id": "a", "text": "Policy works through the economy with a time lag" },
    { "id": "b", "text": "Central banks deliberately delay every single rate change" },
    { "id": "c", "text": "Prices are fixed by law for a set period each year" }
  ],
  "answer": "a",
  "explanation": "Correct — transmission through wages, loans and prices takes months.",
  "audio_explanation": "assets/audio/0002-b4-explain.wav",
  "citations": ["s1"]
}
```

`format` ∈ `single_choice | multi_choice | true_false` for v1. **Authoring rule (Matt):** all options should be near-identical in length/word-count so formatting leaks no clue to the answer. `audio_intro`/`audio_explanation` are pre-rendered so the tutor voice speaks quiz framing too; the chosen-answer feedback is spoken live by the tutor path.

### Contested beat

Used when Tier 1/2 sources genuinely disagree. The teacher presents the disagreement *as* a disagreement rather than collapsing it to one answer. The Player renders the positions side-by-side, each with its own citations.

```json
{
  "id": "b6",
  "type": "contested",
  "narration_intro": "Here's where good economists genuinely disagree.",
  "audio_intro": "assets/audio/0002-b6-intro.wav",
  "question": "How much should a central bank prioritise jobs versus inflation?",
  "positions": [
    {
      "label": "Inflation-first",
      "narration": "One camp argues price stability must come first, because high inflation erodes everyone's wages and savings.",
      "audio": "assets/audio/0002-b6-p1.wav",
      "audio_duration_s": 11.0,
      "citations": ["s1"]
    },
    {
      "label": "Employment-first",
      "narration": "Another camp argues that tolerating slightly higher inflation is worth it to keep more people in work.",
      "audio": "assets/audio/0002-b6-p2.wav",
      "audio_duration_s": 10.4,
      "citations": ["s3"]
    }
  ],
  "visual": { "kind": "svg_file", "src": "assets/visuals/0002-b6.svg", "alt": "Two contrasting policy positions side by side" }
}
```

Rules: **at least two positions**, each with **its own Tier 1/2 citation(s)**; no position is presented as the "correct" one. For political/ethical topics, each position states the strongest version of that side and attributes it; the teacher does not voice its own opinion.

### Beat types (v1)

`narration`, `quiz`, and `contested`. Reserved for later: `section` (chapter divider), `interaction` (light in-browser task).

## `progress.jsonl` — written by the Player

Append-only, one JSON object per line. The skill reads this on the next authoring pass to update `learning-records/` and resequence. The Player never rewrites authored files.

```json
{"ts":"2026-06-30T11:02:10Z","lesson":"0002","beat":"b4","event":"quiz_answer","chosen":"b","correct":false}
{"ts":"2026-06-30T11:02:40Z","lesson":"0002","beat":"b2","event":"replayed"}
{"ts":"2026-06-30T11:03:05Z","lesson":"0002","beat":"b2","event":"flag_lost"}
{"ts":"2026-06-30T11:03:30Z","lesson":"0002","beat":"b2","event":"tutor_question","text":"what actually is the base rate?"}
```

`event` ∈ `lesson_started | beat_viewed | replayed | quiz_answer | flag_lost | tutor_question | lesson_completed`. These are the **state hooks** for the future adaptive loop; v1 logs them even if the skill doesn't yet act on all of them.

## Tutor grounding contract

When the learner asks a question in the Player, the Player builds the LLM prompt from workspace data only:

- `MISSION.md` (why they're learning)
- the current lesson's `objective` + the current/nearby beats' `narration`
- the **cached text** of the cited sources (`sources/*.md` via each source's `excerpt_ref`) — *not* just URLs, so grounding works without re-fetching
- explicit instruction: answer only from the supplied sources; if unsupported, say so and offer to flag it

The answer is returned as text, spoken live via Kokoro in the course voice, and the question is logged to `progress.jsonl`. This keeps the tutor source-locked (no parametric drift) and consistent with the no-hallucination rule.

## What the skill must guarantee on output

1. Every `audio` / `audio_intro` / `audio_explanation` path exists and matches `audio_duration_s` (±0.3s).
2. Every `visual.src` exists; every `citations` ID resolves in `sources`; every source has a reachable `excerpt_ref`, a `tier` of 1 or 2, and a `trust_rationale`.
3. Narration beats stay within the ~10–30s target; a lesson stays short (Matt: respect working memory).
4. Every contested beat has ≥2 positions, each independently cited.
5. **No beat makes a claim that isn't supported by its cited source excerpt.** This is the deepest guarantee and the one tooling *cannot* fully check — the validator confirms a citation exists and is Tier 1/2, but the skill must, at authoring time, re-read the excerpt and confirm it actually supports the claim, or cut the beat.

A validator script (skill-side) asserts the mechanical guarantees (1–4) before a course is marked `ready`. Guarantee 5 is an authoring discipline, not an automated check — cheap insurance plus honest acknowledgement of the one thing only the author can verify.
