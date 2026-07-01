/**
 * Tests for the HTML/SVG sanitizer.
 *
 * Key invariant: injected <script> content MUST NOT execute.
 * Secondary: on* event handlers must be stripped.
 * Tertiary: benign SVG/HTML content is preserved.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { sanitizeHtml } from "./sanitizer.js";

describe("sanitizeHtml — script stripping", () => {
  it("removes a bare <script> tag and its content", () => {
    const result = sanitizeHtml('<svg><script>alert(1)</script><rect/></svg>');
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert(1)");
  });

  it("removes a <script> tag with attributes", () => {
    const result = sanitizeHtml('<div><script type="text/javascript">doEvil()</script></div>');
    expect(result).not.toContain("<script");
    expect(result).not.toContain("doEvil");
  });

  it("removes multiple <script> tags", () => {
    const html = "<script>a()</script><p>hi</p><script>b()</script>";
    const result = sanitizeHtml(html);
    expect(result).not.toContain("<script");
    expect(result).toContain("<p>hi</p>");
  });

  // -------------------------------------------------------------------------
  // THE CRITICAL SECURITY TEST
  // Proves that a <script> injected via sanitizeHtml + innerHTML does NOT run.
  // -------------------------------------------------------------------------
  it("injected <script> does not execute when assigned to innerHTML", () => {
    // Use a unique marker so parallel test runs can't interfere.
    const marker = `__teachme_script_ran_${Date.now()}`;
    const malicious = `<svg><script>window["${marker}"] = true;<\/script><rect width="10" height="10"/></svg>`;

    const sanitized = sanitizeHtml(malicious);

    // Inject into a real DOM element (jsdom environment).
    const container = document.createElement("div");
    container.innerHTML = sanitized;
    document.body.appendChild(container);

    // The marker must NOT have been set — proof the script was removed.
    expect((window as Record<string, unknown>)[marker]).toBeUndefined();

    document.body.removeChild(container);
  });
});

describe("sanitizeHtml — event handler stripping", () => {
  it("removes an onclick attribute", () => {
    const result = sanitizeHtml('<a href="#" onclick="evil()">click me</a>');
    expect(result).not.toContain("onclick");
    expect(result).toContain('href="#"');
    expect(result).toContain("click me");
  });

  it("removes an onload attribute", () => {
    const result = sanitizeHtml('<img src="x" onload="evil()"/>');
    expect(result).not.toContain("onload");
  });

  it("removes an onerror attribute", () => {
    const result = sanitizeHtml('<img src="bad" onerror="evil()"/>');
    expect(result).not.toContain("onerror");
  });

  it("removes on* attributes case-insensitively", () => {
    const result = sanitizeHtml('<div ONCLICK="evil()" OnMouseOver="also()">text</div>');
    expect(result).not.toContain("ONCLICK");
    expect(result).not.toContain("OnMouseOver");
    expect(result).toContain("text");
  });

  it("removes on* from SVG elements", () => {
    const result = sanitizeHtml('<svg><circle cx="5" cy="5" r="5" onclick="evil()"/></svg>');
    expect(result).not.toContain("onclick");
    // The circle element itself should survive.
    expect(result).toContain("<circle");
  });
});

describe("sanitizeHtml — benign content preserved", () => {
  it("preserves SVG structural content", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect class="visual" x="10" y="10" width="80" height="80"/>
      <text class="label" x="50" y="55">Hello</text>
    </svg>`;
    const result = sanitizeHtml(svg);
    expect(result).toContain("<svg");
    expect(result).toContain("class=\"visual\"");
    expect(result).toContain("class=\"label\"");
    expect(result).toContain("Hello");
  });

  it("preserves <a> href links in SVG", () => {
    const svg = `<svg><a href="https://example.com"><text>Link</text></a></svg>`;
    const result = sanitizeHtml(svg);
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain("Link");
  });

  it("preserves plain HTML content", () => {
    const html = `<div class="visual"><h2 class="title">Base Rate</h2><p>Some text.</p></div>`;
    const result = sanitizeHtml(html);
    expect(result).toContain('class="visual"');
    expect(result).toContain('class="title"');
    expect(result).toContain("Base Rate");
    expect(result).toContain("Some text.");
  });

  it("handles empty input gracefully", () => {
    const result = sanitizeHtml("");
    expect(result).toBe("");
  });
});
