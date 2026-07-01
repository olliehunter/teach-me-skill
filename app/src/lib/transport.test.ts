/**
 * Unit tests for the pure transport step logic.
 */

import { describe, it, expect } from "vitest";
import { stepBack, stepNext, clampBeatIndex } from "./transport.js";

describe("stepBack", () => {
  it("returns back_to_course when at index 0", () => {
    expect(stepBack(0)).toEqual({ action: "back_to_course" });
  });

  it("returns goto previous index when not at first beat", () => {
    expect(stepBack(1)).toEqual({ action: "goto", index: 0 });
    expect(stepBack(3)).toEqual({ action: "goto", index: 2 });
    expect(stepBack(10)).toEqual({ action: "goto", index: 9 });
  });

  it("negative index is treated as edge (back_to_course)", () => {
    // Defensive: should never happen in practice but guard it
    expect(stepBack(-1)).toEqual({ action: "back_to_course" });
  });
});

describe("stepNext", () => {
  it("returns lesson_completed when at the last beat", () => {
    expect(stepNext(0, 1)).toEqual({ action: "lesson_completed" });
    expect(stepNext(3, 4)).toEqual({ action: "lesson_completed" });
    expect(stepNext(9, 10)).toEqual({ action: "lesson_completed" });
  });

  it("returns goto next index when not at last beat", () => {
    expect(stepNext(0, 4)).toEqual({ action: "goto", index: 1 });
    expect(stepNext(2, 4)).toEqual({ action: "goto", index: 3 });
  });

  it("handles single-beat lesson: next at 0 with totalBeats=1 → completed", () => {
    expect(stepNext(0, 1)).toEqual({ action: "lesson_completed" });
  });

  it("overshoot index still triggers lesson_completed", () => {
    // Defensive: index > totalBeats-1
    expect(stepNext(5, 4)).toEqual({ action: "lesson_completed" });
  });
});

describe("clampBeatIndex", () => {
  it("clamps to 0 for negative values", () => {
    expect(clampBeatIndex(-1, 4)).toBe(0);
  });

  it("clamps to totalBeats-1 for values above range", () => {
    expect(clampBeatIndex(10, 4)).toBe(3);
  });

  it("returns value unchanged when within range", () => {
    expect(clampBeatIndex(2, 4)).toBe(2);
    expect(clampBeatIndex(0, 4)).toBe(0);
    expect(clampBeatIndex(3, 4)).toBe(3);
  });

  it("returns 0 when totalBeats is 0 or negative", () => {
    expect(clampBeatIndex(0, 0)).toBe(0);
    expect(clampBeatIndex(5, 0)).toBe(0);
  });
});
