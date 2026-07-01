/**
 * Tests for citation resolution.
 */

import { describe, it, expect } from "vitest";
import { resolveCitations } from "./citations.js";
import type { Source } from "./types.js";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const SOURCES: Source[] = [
  {
    id: "s1",
    title: "Bank of England — Monetary Policy",
    url: "https://www.bankofengland.co.uk/monetary-policy",
    excerpt_ref: "sources/s1.md",
    accessed: "2026-06-30",
    tier: 1,
    trust_rationale: "Central bank — primary authority.",
  },
  {
    id: "s2",
    title: "IMF Working Paper",
    url: "https://www.imf.org/...",
    excerpt_ref: "sources/s2.md",
    accessed: "2026-06-30",
    tier: 2,
    trust_rationale: "Tier-2 academic source.",
  },
  {
    id: "s3",
    title: "Federal Reserve Paper",
    url: "https://www.federalreserve.gov/...",
    excerpt_ref: "sources/s3.md",
    accessed: "2026-06-30",
    tier: 1,
    trust_rationale: "Central bank.",
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveCitations", () => {
  it("resolves a single known citation ID", () => {
    const result = resolveCitations(["s1"], SOURCES);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("s1");
    expect(result[0].title).toBe("Bank of England — Monetary Policy");
  });

  it("resolves multiple known citation IDs", () => {
    const result = resolveCitations(["s1", "s3"], SOURCES);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("s1");
    expect(result[1].id).toBe("s3");
  });

  it("skips unknown citation IDs silently", () => {
    const result = resolveCitations(["s1", "s999", "s2"], SOURCES);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("s1");
    expect(result[1].id).toBe("s2");
  });

  it("returns an empty array when citations is empty", () => {
    const result = resolveCitations([], SOURCES);
    expect(result).toHaveLength(0);
  });

  it("returns an empty array when no IDs match", () => {
    const result = resolveCitations(["x1", "x2"], SOURCES);
    expect(result).toHaveLength(0);
  });

  it("returns an empty array when sources is empty", () => {
    const result = resolveCitations(["s1"], []);
    expect(result).toHaveLength(0);
  });

  it("preserves the order of citationIds", () => {
    const result = resolveCitations(["s3", "s2", "s1"], SOURCES);
    expect(result[0].id).toBe("s3");
    expect(result[1].id).toBe("s2");
    expect(result[2].id).toBe("s1");
  });
});
