/**
 * Tests for the visual renderer dispatch table.
 *
 * Verifies which visual kinds:
 *   - read file text via fs (svg_file, html_file)
 *   - call convertFileSrc for an asset URL (image_file)
 *   - sanitize inline content (inline_svg, svg_file, html_file)
 *   - return none immediately (none)
 */

import { describe, it, expect, vi } from "vitest";
import { renderVisual } from "./visualRenderer.js";
import type { FsAdapter } from "./workspace.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORKSPACE = "/fake/my-course";

function makeFs(files: Record<string, string>): FsAdapter {
  return {
    exists: async (path) => Object.prototype.hasOwnProperty.call(files, path),
    readTextFile: async (path) => {
      if (!Object.prototype.hasOwnProperty.call(files, path)) {
        throw new Error(`File not found: ${path}`);
      }
      return files[path];
    },
  };
}

const fakeConvertFileSrc = (path: string) => `asset://localhost${path}`;

// ---------------------------------------------------------------------------
// svg_file
// ---------------------------------------------------------------------------

describe("renderVisual — svg_file", () => {
  it("reads the file and returns html kind", async () => {
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
    const fs = makeFs({ [`${WORKSPACE}/assets/visuals/b1.svg`]: svgContent });

    const result = await renderVisual(
      { kind: "svg_file", src: "assets/visuals/b1.svg", alt: "test" },
      WORKSPACE,
      fs,
      fakeConvertFileSrc,
    );

    expect(result.kind).toBe("html");
    if (result.kind === "html") {
      expect(result.html).toContain("<svg");
      expect(result.html).toContain("<rect");
    }
  });

  it("strips <script> from SVG file content", async () => {
    const svgContent = '<svg><script>evil()</script><rect/></svg>';
    const fs = makeFs({ [`${WORKSPACE}/assets/visuals/b1.svg`]: svgContent });

    const result = await renderVisual(
      { kind: "svg_file", src: "assets/visuals/b1.svg", alt: "test" },
      WORKSPACE,
      fs,
      fakeConvertFileSrc,
    );

    expect(result.kind).toBe("html");
    if (result.kind === "html") {
      expect(result.html).not.toContain("<script");
      expect(result.html).not.toContain("evil()");
    }
  });

  it("strips onclick from SVG file content", async () => {
    const svgContent = '<svg><rect onclick="evil()"/></svg>';
    const fs = makeFs({ [`${WORKSPACE}/assets/visuals/b1.svg`]: svgContent });

    const result = await renderVisual(
      { kind: "svg_file", src: "assets/visuals/b1.svg", alt: "test" },
      WORKSPACE,
      fs,
      fakeConvertFileSrc,
    );

    expect(result.kind).toBe("html");
    if (result.kind === "html") {
      expect(result.html).not.toContain("onclick");
    }
  });

  it("does NOT call convertFileSrc for svg_file", async () => {
    const convertSpy = vi.fn(fakeConvertFileSrc);
    const svgContent = '<svg><rect/></svg>';
    const fs = makeFs({ [`${WORKSPACE}/assets/visuals/b1.svg`]: svgContent });

    await renderVisual(
      { kind: "svg_file", src: "assets/visuals/b1.svg", alt: "test" },
      WORKSPACE,
      fs,
      convertSpy,
    );

    expect(convertSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// html_file
// ---------------------------------------------------------------------------

describe("renderVisual — html_file", () => {
  it("reads the file and returns html kind", async () => {
    const htmlContent = '<div class="visual"><h2>Title</h2></div>';
    const fs = makeFs({ [`${WORKSPACE}/assets/visuals/b2.html`]: htmlContent });

    const result = await renderVisual(
      { kind: "html_file", src: "assets/visuals/b2.html", alt: "test" },
      WORKSPACE,
      fs,
      fakeConvertFileSrc,
    );

    expect(result.kind).toBe("html");
    if (result.kind === "html") {
      expect(result.html).toContain('class="visual"');
      expect(result.html).toContain("Title");
    }
  });

  it("strips <script> from HTML file content", async () => {
    const htmlContent = '<div><script>evil()</script><p>Safe content</p></div>';
    const fs = makeFs({ [`${WORKSPACE}/assets/visuals/b2.html`]: htmlContent });

    const result = await renderVisual(
      { kind: "html_file", src: "assets/visuals/b2.html", alt: "test" },
      WORKSPACE,
      fs,
      fakeConvertFileSrc,
    );

    expect(result.kind).toBe("html");
    if (result.kind === "html") {
      expect(result.html).not.toContain("<script");
      expect(result.html).toContain("Safe content");
    }
  });
});

// ---------------------------------------------------------------------------
// inline_svg
// ---------------------------------------------------------------------------

describe("renderVisual — inline_svg", () => {
  it("sanitizes and returns the svg string directly (no fs read)", async () => {
    const readSpy = vi.fn();
    const fs: FsAdapter = {
      exists: readSpy,
      readTextFile: readSpy,
    };

    const result = await renderVisual(
      {
        kind: "inline_svg",
        svg: '<svg><rect width="5" height="5"/></svg>',
        alt: "inline test",
      },
      WORKSPACE,
      fs,
      fakeConvertFileSrc,
    );

    expect(readSpy).not.toHaveBeenCalled();
    expect(result.kind).toBe("html");
    if (result.kind === "html") {
      expect(result.html).toContain("<svg");
      expect(result.html).toContain("<rect");
    }
  });

  it("strips <script> from inline SVG", async () => {
    const fs = makeFs({});
    const result = await renderVisual(
      {
        kind: "inline_svg",
        svg: '<svg><script>window.__pwned=true</script><circle r="5"/></svg>',
        alt: "inline test",
      },
      WORKSPACE,
      fs,
      fakeConvertFileSrc,
    );

    expect(result.kind).toBe("html");
    if (result.kind === "html") {
      expect(result.html).not.toContain("<script");
      expect(result.html).not.toContain("__pwned");
    }
  });
});

// ---------------------------------------------------------------------------
// image_file
// ---------------------------------------------------------------------------

describe("renderVisual — image_file", () => {
  it("calls convertFileSrc and returns image kind", async () => {
    const convertSpy = vi.fn(fakeConvertFileSrc);
    const fs = makeFs({});

    const result = await renderVisual(
      { kind: "image_file", src: "assets/visuals/b3.png", alt: "A diagram" },
      WORKSPACE,
      fs,
      convertSpy,
    );

    expect(result.kind).toBe("image");
    if (result.kind === "image") {
      expect(result.url).toBe(`asset://localhost${WORKSPACE}/assets/visuals/b3.png`);
      expect(result.alt).toBe("A diagram");
    }
    expect(convertSpy).toHaveBeenCalledWith(`${WORKSPACE}/assets/visuals/b3.png`);
  });

  it("does NOT call fs.readTextFile for image_file", async () => {
    const readSpy = vi.fn();
    const fs: FsAdapter = {
      exists: vi.fn().mockResolvedValue(false),
      readTextFile: readSpy,
    };

    await renderVisual(
      { kind: "image_file", src: "assets/visuals/b3.png", alt: "test" },
      WORKSPACE,
      fs,
      fakeConvertFileSrc,
    );

    expect(readSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// none
// ---------------------------------------------------------------------------

describe("renderVisual — none", () => {
  it("returns { kind: 'none' } without any I/O", async () => {
    const readSpy = vi.fn();
    const convertSpy = vi.fn();
    const fs: FsAdapter = {
      exists: readSpy,
      readTextFile: readSpy,
    };

    const result = await renderVisual(
      { kind: "none" },
      WORKSPACE,
      fs,
      convertSpy,
    );

    expect(result.kind).toBe("none");
    expect(readSpy).not.toHaveBeenCalled();
    expect(convertSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// path joining
// ---------------------------------------------------------------------------

describe("renderVisual — workspace path joining", () => {
  it("handles trailing slash on workspacePath for svg_file", async () => {
    const svgContent = '<svg><rect/></svg>';
    const fs = makeFs({ [`${WORKSPACE}/assets/visuals/b1.svg`]: svgContent });

    // Pass workspace with trailing slash — should still resolve correctly.
    const result = await renderVisual(
      { kind: "svg_file", src: "assets/visuals/b1.svg", alt: "test" },
      `${WORKSPACE}/`,
      fs,
      fakeConvertFileSrc,
    );

    expect(result.kind).toBe("html");
  });
});
