/**
 * Tests for contested beat pure playback logic.
 *
 * All tests are headless — no DOM, no Svelte, no Tauri.
 */

import { describe, it, expect } from "vitest";
import {
  buildPlaybackSequence,
  advanceStep,
  activePositionIndex,
  isPlaybackDone,
  resolvePositionCitations,
} from "./contested.js";
import type { ContestedBeat, Source } from "./types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SOURCES: Source[] = [
  {
    id: "s1",
    title: "Federal Reserve — Dual Mandate",
    url: "https://www.federalreserve.gov/faqs/money_12848.htm",
    excerpt_ref: "sources/s1.md",
    accessed: "2026-07-01",
    tier: 1,
    trust_rationale: "US central bank.",
  },
  {
    id: "s2",
    title: "ECB — Price Stability",
    url: "https://www.ecb.europa.eu/mopo/intro/html/index.en.html",
    excerpt_ref: "sources/s2.md",
    accessed: "2026-07-01",
    tier: 1,
    trust_rationale: "Eurozone central bank.",
  },
];

const TWO_POSITION_BEAT: ContestedBeat = {
  id: "b1",
  type: "contested",
  narration_intro: "Economists genuinely disagree on this.",
  audio_intro: "assets/audio/0001-b1-intro.wav",
  question: "Should central banks have a dual mandate?",
  positions: [
    {
      label: "Dual Mandate",
      narration: "The Fed targets both price stability and maximum employment.",
      audio: "assets/audio/0001-b1-p1.wav",
      audio_duration_s: 8.5,
      citations: ["s1"],
    },
    {
      label: "Price Stability First",
      narration: "The ECB targets price stability above all else.",
      audio: "assets/audio/0001-b1-p2.wav",
      audio_duration_s: 7.2,
      citations: ["s2"],
    },
  ],
};

const THREE_POSITION_BEAT: ContestedBeat = {
  id: "b2",
  type: "contested",
  narration_intro: "Three camps disagree.",
  audio_intro: "assets/audio/0001-b2-intro.wav",
  question: "How fast should rates rise?",
  positions: [
    {
      label: "Fast",
      narration: "Raise quickly.",
      audio: "assets/audio/0001-b2-p1.wav",
      audio_duration_s: 5.0,
      citations: ["s1"],
    },
    {
      label: "Gradual",
      narration: "Raise slowly.",
      audio: "assets/audio/0001-b2-p2.wav",
      audio_duration_s: 5.0,
      citations: ["s2"],
    },
    {
      label: "Pause",
      narration: "Wait and see.",
      audio: "assets/audio/0001-b2-p3.wav",
      audio_duration_s: 5.0,
      citations: ["s1"],
    },
  ],
};

const NO_INTRO_BEAT: ContestedBeat = {
  id: "b3",
  type: "contested",
  narration_intro: "",
  audio_intro: "",
  question: "No intro question?",
  positions: [
    {
      label: "A",
      narration: "Side A.",
      audio: "assets/audio/0001-b3-p1.wav",
      audio_duration_s: 5.0,
      citations: ["s1"],
    },
    {
      label: "B",
      narration: "Side B.",
      audio: "assets/audio/0001-b3-p2.wav",
      audio_duration_s: 5.0,
      citations: ["s2"],
    },
  ],
};

// ---------------------------------------------------------------------------
// buildPlaybackSequence
// ---------------------------------------------------------------------------

describe("buildPlaybackSequence", () => {
  it("produces intro → position[0] → position[1] → done for a 2-position beat", () => {
    const steps = buildPlaybackSequence(TWO_POSITION_BEAT);

    expect(steps).toHaveLength(4); // intro + 2 positions + done
    expect(steps[0]).toEqual({ kind: "intro", audioPath: "assets/audio/0001-b1-intro.wav" });
    expect(steps[1]).toEqual({ kind: "position", positionIndex: 0, audioPath: "assets/audio/0001-b1-p1.wav" });
    expect(steps[2]).toEqual({ kind: "position", positionIndex: 1, audioPath: "assets/audio/0001-b1-p2.wav" });
    expect(steps[3]).toEqual({ kind: "done" });
  });

  it("produces intro → 3 positions → done for a 3-position beat", () => {
    const steps = buildPlaybackSequence(THREE_POSITION_BEAT);

    expect(steps).toHaveLength(5); // intro + 3 positions + done
    expect(steps[0].kind).toBe("intro");
    expect(steps[1]).toEqual({ kind: "position", positionIndex: 0, audioPath: "assets/audio/0001-b2-p1.wav" });
    expect(steps[2]).toEqual({ kind: "position", positionIndex: 1, audioPath: "assets/audio/0001-b2-p2.wav" });
    expect(steps[3]).toEqual({ kind: "position", positionIndex: 2, audioPath: "assets/audio/0001-b2-p3.wav" });
    expect(steps[4]).toEqual({ kind: "done" });
  });

  it("omits intro step when audio_intro is absent/empty", () => {
    const steps = buildPlaybackSequence(NO_INTRO_BEAT);

    expect(steps).toHaveLength(3); // 2 positions + done (no intro)
    expect(steps[0].kind).toBe("position");
    expect(steps[2]).toEqual({ kind: "done" });
  });

  it("always ends with a done sentinel", () => {
    const steps = buildPlaybackSequence(TWO_POSITION_BEAT);
    expect(steps[steps.length - 1]).toEqual({ kind: "done" });
  });

  it("skips positions that have no audio path", () => {
    const beatNoAudio: ContestedBeat = {
      ...TWO_POSITION_BEAT,
      positions: [
        { label: "A", narration: "A narration.", audio: "", audio_duration_s: 0, citations: ["s1"] },
        { label: "B", narration: "B narration.", audio: "assets/audio/p2.wav", audio_duration_s: 5, citations: ["s2"] },
      ],
    };
    const steps = buildPlaybackSequence(beatNoAudio);
    // intro + position 1 (only B has audio) + done = 3
    expect(steps).toHaveLength(3);
    expect(steps[0].kind).toBe("intro");
    expect(steps[1]).toMatchObject({ kind: "position", positionIndex: 1 });
    expect(steps[2]).toEqual({ kind: "done" });
  });
});

// ---------------------------------------------------------------------------
// advanceStep — never auto-completes
// ---------------------------------------------------------------------------

describe("advanceStep", () => {
  it("advances from intro to first position", () => {
    const steps = buildPlaybackSequence(TWO_POSITION_BEAT);
    expect(advanceStep(steps, 0)).toBe(1);
  });

  it("advances from last position to done", () => {
    const steps = buildPlaybackSequence(TWO_POSITION_BEAT);
    // step 2 is position[1]; step 3 is done
    expect(advanceStep(steps, 2)).toBe(3);
  });

  it("clamps at done — never goes past the end", () => {
    const steps = buildPlaybackSequence(TWO_POSITION_BEAT);
    const lastIndex = steps.length - 1;
    // Advancing from done stays at done
    expect(advanceStep(steps, lastIndex)).toBe(lastIndex);
  });

  it("done is reached without ever calling onBeatComplete (sentinel check)", () => {
    // The caller is responsible for NOT calling onBeatComplete when done.
    // We verify that the sequence ALWAYS ends in "done" and never in a
    // playable step, so there is no audio-ended event that could trigger auto-complete.
    const steps = buildPlaybackSequence(TWO_POSITION_BEAT);
    let current = 0;
    // Walk the full sequence; last step must be done
    while (!isPlaybackDone(steps, current)) {
      const next = advanceStep(steps, current);
      expect(next).toBeGreaterThan(current); // must always advance
      current = next;
    }
    expect(steps[current]).toEqual({ kind: "done" });
  });
});

// ---------------------------------------------------------------------------
// activePositionIndex
// ---------------------------------------------------------------------------

describe("activePositionIndex", () => {
  it("returns null when on the intro step", () => {
    const steps = buildPlaybackSequence(TWO_POSITION_BEAT);
    expect(activePositionIndex(steps, 0)).toBeNull();
  });

  it("returns 0 when on the first position step", () => {
    const steps = buildPlaybackSequence(TWO_POSITION_BEAT);
    expect(activePositionIndex(steps, 1)).toBe(0);
  });

  it("returns 1 when on the second position step", () => {
    const steps = buildPlaybackSequence(TWO_POSITION_BEAT);
    expect(activePositionIndex(steps, 2)).toBe(1);
  });

  it("returns null when on the done step", () => {
    const steps = buildPlaybackSequence(TWO_POSITION_BEAT);
    expect(activePositionIndex(steps, steps.length - 1)).toBeNull();
  });

  it("returns correct index for 3-position beat", () => {
    const steps = buildPlaybackSequence(THREE_POSITION_BEAT);
    // intro=0, p0=1, p1=2, p2=3, done=4
    expect(activePositionIndex(steps, 1)).toBe(0);
    expect(activePositionIndex(steps, 2)).toBe(1);
    expect(activePositionIndex(steps, 3)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// isPlaybackDone
// ---------------------------------------------------------------------------

describe("isPlaybackDone", () => {
  it("returns false for intro step", () => {
    const steps = buildPlaybackSequence(TWO_POSITION_BEAT);
    expect(isPlaybackDone(steps, 0)).toBe(false);
  });

  it("returns false for a position step", () => {
    const steps = buildPlaybackSequence(TWO_POSITION_BEAT);
    expect(isPlaybackDone(steps, 1)).toBe(false);
  });

  it("returns true for the done sentinel", () => {
    const steps = buildPlaybackSequence(TWO_POSITION_BEAT);
    expect(isPlaybackDone(steps, steps.length - 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolvePositionCitations
// ---------------------------------------------------------------------------

describe("resolvePositionCitations", () => {
  it("resolves citations for position 0", () => {
    const resolved = resolvePositionCitations(TWO_POSITION_BEAT, 0, SOURCES);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe("s1");
    expect(resolved[0].title).toBe("Federal Reserve — Dual Mandate");
  });

  it("resolves citations for position 1", () => {
    const resolved = resolvePositionCitations(TWO_POSITION_BEAT, 1, SOURCES);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe("s2");
    expect(resolved[0].title).toBe("ECB — Price Stability");
  });

  it("returns empty array for out-of-bounds position index", () => {
    const resolved = resolvePositionCitations(TWO_POSITION_BEAT, 99, SOURCES);
    expect(resolved).toHaveLength(0);
  });

  it("independently resolves each position's citations", () => {
    // Positions cite different sources — neither should bleed into the other
    const pos0 = resolvePositionCitations(TWO_POSITION_BEAT, 0, SOURCES);
    const pos1 = resolvePositionCitations(TWO_POSITION_BEAT, 1, SOURCES);
    expect(pos0[0].id).not.toBe(pos1[0].id);
  });
});
