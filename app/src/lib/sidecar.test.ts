/**
 * Unit tests for the sidecar polling + speak utilities.
 * These run in Vitest with a fake fetch — no real sidecar needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pollSidecarHealth, postSpeak } from "./sidecar.js";

describe("pollSidecarHealth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("calls onReady immediately when /health returns 200", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    const onReady = vi.fn();
    const onTimeout = vi.fn();
    pollSidecarHealth(onReady, onTimeout, 1000, 120, "http://test");

    // Flush the first async attempt
    await vi.runAllTimersAsync();

    expect(mockFetch).toHaveBeenCalledWith("http://test/health");
    expect(onReady).toHaveBeenCalledOnce();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("retries after a failed attempt and calls onReady on second attempt", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    const onReady = vi.fn();
    const onTimeout = vi.fn();
    pollSidecarHealth(onReady, onTimeout, 1000, 120, "http://test");

    await vi.runAllTimersAsync();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(onReady).toHaveBeenCalledOnce();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("calls onTimeout after exhausting maxAttempts", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", mockFetch);

    const onReady = vi.fn();
    const onTimeout = vi.fn();
    pollSidecarHealth(onReady, onTimeout, 100, 3, "http://test");

    await vi.runAllTimersAsync();

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(onTimeout).toHaveBeenCalledOnce();
    expect(onReady).not.toHaveBeenCalled();
  });

  it("stops polling when cancel is called before second attempt", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", mockFetch);

    const onReady = vi.fn();
    const onTimeout = vi.fn();
    const cancel = pollSidecarHealth(onReady, onTimeout, 1000, 120, "http://test");

    // Flush only the initial microtask (first attempt fails, schedules a 1s timer).
    // Do NOT advance timers — that would trigger further attempts.
    await Promise.resolve();
    await Promise.resolve(); // two ticks to flush the rejected promise chain

    cancel(); // cancel before the 1s retry timer fires

    // Advance time past the retry interval — nothing should fire.
    await vi.advanceTimersByTimeAsync(2000);

    expect(mockFetch).toHaveBeenCalledTimes(1); // only the initial attempt
    expect(onReady).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
  });
});

describe("postSpeak", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends a POST request with JSON body and returns a Blob on success", async () => {
    const fakeBlob = new Blob(["wav-bytes"], { type: "audio/wav" });
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(fakeBlob),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await postSpeak(
      { text: "hello", voice: "af_heart", lang_code: "a", speed: 1.0 },
      "http://test",
    );

    expect(mockFetch).toHaveBeenCalledWith("http://test/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hello", voice: "af_heart", lang_code: "a", speed: 1.0 }),
    });
    expect(result).toBe(fakeBlob);
  });

  it("throws an error when the server returns a non-ok status", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve("invalid voice"),
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      postSpeak({ text: "hi" }, "http://test"),
    ).rejects.toThrow("Sidecar /speak error 422: invalid voice");
  });
});
