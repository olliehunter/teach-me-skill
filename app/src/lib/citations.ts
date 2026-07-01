/**
 * Citation resolution helpers.
 *
 * Pure logic — no Tauri or DOM imports.  Used by NarrationBeatView,
 * CitationChips, and reused by 008 (contested) and 010 (tutor) which share
 * the same citation chip + source panel pattern.
 */

import type { Source } from "./types.js";

/**
 * Resolve an array of citation IDs to their Source objects.
 *
 * Unknown IDs are silently skipped so that a corrupt or forward-looking
 * citation doesn't crash the player.
 *
 * @param citationIds - Array of source IDs from a beat's `citations` field.
 * @param sources - The lesson's `sources` array.
 * @returns Resolved Source objects, in the same order as citationIds.
 */
export function resolveCitations(
  citationIds: string[],
  sources: Source[],
): Source[] {
  const map = new Map<string, Source>(sources.map((s) => [s.id, s]));
  return citationIds.flatMap((id) => {
    const source = map.get(id);
    return source !== undefined ? [source] : [];
  });
}
