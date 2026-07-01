/**
 * Visual renderer — pure logic for resolving a Visual descriptor to a
 * renderable form.
 *
 * Keeps Tauri concerns out of the hot path so the dispatch table is testable
 * without a webview.  Both `fs` and `convertFileSrc` are injected so tests
 * can mock them.
 *
 * Issue 006 / 008 / 010 can call renderVisual directly; they don't need to
 * re-implement the dispatch logic.
 */

import type { Visual } from "./types.js";
import type { FsAdapter } from "./workspace.js";
import { sanitizeHtml } from "./sanitizer.js";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type RenderedVisual =
  /** Inline SVG or HTML (sanitized). Assign to innerHTML of a container. */
  | { kind: "html"; html: string }
  /** Image loaded via the Tauri asset protocol. Render as <img src=url>. */
  | { kind: "image"; url: string; alt: string }
  /** No visual for this beat. */
  | { kind: "none" };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a Visual descriptor to a RenderedVisual.
 *
 * - `svg_file` / `html_file`: reads file text via `fs`, then sanitizes.
 * - `inline_svg`: sanitizes the inline SVG string.
 * - `image_file`: converts the absolute path to an asset-protocol URL.
 * - `none`: returns `{ kind: "none" }` immediately (no I/O).
 *
 * @param visual - Visual descriptor from the beat manifest.
 * @param workspacePath - Absolute path to the workspace root (no trailing slash).
 * @param fs - Filesystem adapter (mock in tests; Tauri `plugin-fs` in the app).
 * @param convertFileSrc - Asset-URL converter (mock in tests; Tauri's in the app).
 */
export async function renderVisual(
  visual: Visual,
  workspacePath: string,
  fs: FsAdapter,
  convertFileSrc: (absolutePath: string) => string,
): Promise<RenderedVisual> {
  const base = workspacePath.replace(/\/+$/, "");

  switch (visual.kind) {
    case "svg_file":
    case "html_file": {
      const absPath = `${base}/${visual.src}`;
      const raw = await fs.readTextFile(absPath);
      return { kind: "html", html: sanitizeHtml(raw) };
    }

    case "inline_svg":
      return { kind: "html", html: sanitizeHtml(visual.svg) };

    case "image_file": {
      const absPath = `${base}/${visual.src}`;
      const url = convertFileSrc(absPath);
      return { kind: "image", url, alt: visual.alt };
    }

    case "none":
      return { kind: "none" };
  }
}
