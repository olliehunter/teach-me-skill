/**
 * Sidecar client utilities for teach-me Player.
 * The sidecar runs at SIDECAR_BASE on startup and exposes /health + /speak.
 */

export const SIDECAR_BASE = "http://127.0.0.1:17861";

export interface SpeakRequest {
  text: string;
  voice?: string;
  lang_code?: string;
  speed?: number;
}

/**
 * Poll GET /health until the sidecar is up.
 * Calls `onReady` when the sidecar responds with 200.
 * Calls `onTimeout` if `maxAttempts` are exhausted.
 * Returns a cancel function — call it to stop polling early.
 */
export function pollSidecarHealth(
  onReady: () => void,
  onTimeout: () => void,
  intervalMs = 1000,
  maxAttempts = 120,
  base = SIDECAR_BASE,
): () => void {
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  async function attempt() {
    if (cancelled) return;
    attempts++;
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) {
        if (!cancelled) onReady();
        return;
      }
    } catch {
      // not up yet
    }
    if (attempts >= maxAttempts) {
      if (!cancelled) onTimeout();
      return;
    }
    timer = setTimeout(attempt, intervalMs);
  }

  attempt();

  return () => {
    cancelled = true;
    if (timer !== null) clearTimeout(timer);
  };
}

/**
 * POST /speak and return a Blob (audio/wav).
 * Throws on HTTP error.
 */
export async function postSpeak(
  req: SpeakRequest,
  base = SIDECAR_BASE,
): Promise<Blob> {
  const res = await fetch(`${base}/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Sidecar /speak error ${res.status}: ${detail}`);
  }
  return res.blob();
}
