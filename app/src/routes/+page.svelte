<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  const SIDECAR_BASE = "http://127.0.0.1:17861";

  // --- state (Svelte 5 runes) ---
  let status = $state<"waiting" | "ready" | "error">("waiting");
  let statusMessage = $state("Waiting for sidecar…");
  let speakText = $state("Hello — this is teach-me Player speaking via kokoro-onnx.");
  let voice = $state("af_heart");
  let langCode = $state("a");
  let speed = $state(1.0);
  let isSpeaking = $state(false);
  let speakError = $state<string | null>(null);

  // --- health poll ---
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let pollCount = 0;
  const MAX_POLLS = 120; // 2 min at 1s intervals

  async function pollHealth() {
    if (pollCount >= MAX_POLLS) {
      status = "error";
      statusMessage = "Sidecar did not start in time — check logs.";
      return;
    }
    pollCount++;
    try {
      const res = await fetch(`${SIDECAR_BASE}/health`);
      if (res.ok) {
        status = "ready";
        statusMessage = "Sidecar ready.";
        return; // stop polling
      }
    } catch {
      // not up yet — keep polling
    }
    pollTimer = setTimeout(pollHealth, 1000);
  }

  onMount(() => {
    pollHealth();
  });

  onDestroy(() => {
    if (pollTimer !== null) clearTimeout(pollTimer);
  });

  // --- speak ---
  async function handleSpeak() {
    if (status !== "ready" || isSpeaking) return;
    isSpeaking = true;
    speakError = null;
    statusMessage = "Synthesising…";
    try {
      const res = await fetch(`${SIDECAR_BASE}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: speakText,
          voice,
          lang_code: langCode,
          speed,
        }),
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`HTTP ${res.status}: ${detail}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        URL.revokeObjectURL(url);
        statusMessage = "Done.";
        isSpeaking = false;
      };
      audio.onerror = (e) => {
        URL.revokeObjectURL(url);
        speakError = "Audio playback error.";
        statusMessage = "Sidecar ready.";
        isSpeaking = false;
      };
      statusMessage = "Playing…";
      await audio.play();
    } catch (e) {
      speakError = String(e);
      statusMessage = "Sidecar ready.";
      isSpeaking = false;
    }
  }
</script>

<main class="shell">
  <h1>teach-me Player</h1>
  <p class="status" class:ready={status === "ready"} class:error={status === "error"}>
    {statusMessage}
  </p>

  <section class="speak-form">
    <label for="speak-text">Text</label>
    <textarea
      id="speak-text"
      rows="3"
      bind:value={speakText}
      disabled={status !== "ready" || isSpeaking}
    ></textarea>

    <div class="row">
      <label for="voice">Voice</label>
      <input id="voice" type="text" bind:value={voice} disabled={status !== "ready" || isSpeaking} />

      <label for="lang">Lang code</label>
      <input id="lang" type="text" bind:value={langCode} disabled={status !== "ready" || isSpeaking} style="width:3rem" />

      <label for="speed">Speed</label>
      <input id="speed" type="number" bind:value={speed} min="0.5" max="2.0" step="0.1"
        disabled={status !== "ready" || isSpeaking} style="width:4rem" />
    </div>

    <button
      id="speak-btn"
      onclick={handleSpeak}
      disabled={status !== "ready" || isSpeaking}
    >
      {isSpeaking ? "Speaking…" : "Speak"}
    </button>
  </section>

  {#if speakError}
    <p class="error-msg">Error: {speakError}</p>
  {/if}
</main>

<style>
  :global(body) {
    font-family: -apple-system, system-ui, sans-serif;
    background: #f5f5f5;
    margin: 0;
    padding: 0;
  }

  .shell {
    max-width: 36rem;
    margin: 4rem auto;
    padding: 0 1.5rem;
  }

  h1 {
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
  }

  .status {
    color: #666;
    margin-bottom: 1.5rem;
    font-size: 0.95rem;
  }
  .status.ready { color: #2a7a2a; }
  .status.error { color: #c0392b; }

  .speak-form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  label {
    font-size: 0.85rem;
    font-weight: 600;
    color: #333;
  }

  textarea, input[type="text"], input[type="number"] {
    font-size: 1rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-sizing: border-box;
  }

  textarea { width: 100%; resize: vertical; }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  button {
    margin-top: 0.5rem;
    font-size: 1rem;
    padding: 0.6rem 1.4rem;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.2s;
    align-self: flex-start;
  }
  button:hover:not(:disabled) { background: #2563eb; }
  button:disabled { background: #9ca3af; cursor: not-allowed; }

  .error-msg {
    color: #c0392b;
    font-size: 0.9rem;
    margin-top: 0.75rem;
  }
</style>
