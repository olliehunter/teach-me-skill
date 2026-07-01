/**
 * HTML/SVG sanitizer for inline injection.
 *
 * Local/trusted content is injected inline so that the global styles.css
 * cascades and <a> links remain live.  The security invariant is that
 * <script> elements NEVER execute and on* event handlers are stripped.
 *
 * Uses DOMParser (available in the Tauri webview and jsdom test env).
 * Not a full XSS sanitizer — designed specifically for the threat model of
 * local-workspace SVG/HTML files authored by the teach-me skill.
 */

/**
 * Sanitize an HTML or SVG string for safe inline injection.
 *
 * Guarantees:
 *   - All <script> elements are removed.
 *   - All on* event handler attributes are removed.
 *   - Benign structural content (SVG shapes, text, <a> href links) is preserved.
 *
 * @param html - Raw HTML or SVG string (may be a fragment).
 * @returns Sanitized HTML string, safe to assign to innerHTML.
 */
export function sanitizeHtml(html: string): string {
  const parser = new DOMParser();
  // Wrap in a full document so the parser handles SVG fragments correctly.
  const doc = parser.parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    "text/html",
  );

  // Remove every <script> element (and their content).
  doc.querySelectorAll("script").forEach((el) => el.remove());

  // Strip all on* event handler attributes from every element.
  doc.querySelectorAll("*").forEach((el) => {
    const toRemove: string[] = [];
    for (const attr of el.attributes) {
      if (/^on/i.test(attr.name)) {
        toRemove.push(attr.name);
      }
    }
    toRemove.forEach((name) => el.removeAttribute(name));
  });

  return doc.body.innerHTML;
}
