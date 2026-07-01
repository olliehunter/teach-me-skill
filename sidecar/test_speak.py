"""
Tests for the kokoro-onnx TTS sidecar.

Uses FastAPI's TestClient so no live server is needed. The model is loaded
lazily: /health passes without model files; /speak tests are skipped
gracefully when model files are absent.
"""

import io
import os

import pytest

MODEL_PATH = os.environ.get(
    "KOKORO_MODEL",
    os.path.join(os.path.dirname(__file__), "..", "models", "kokoro-v1.0.onnx"),
)
VOICES_PATH = os.environ.get(
    "KOKORO_VOICES",
    os.path.join(os.path.dirname(__file__), "..", "models", "voices-v1.0.bin"),
)

MODELS_PRESENT = os.path.isfile(MODEL_PATH) and os.path.isfile(VOICES_PATH)


@pytest.fixture(scope="module")
def client():
    """Return a TestClient pointed at the sidecar app with model env vars set."""
    os.environ.setdefault("KOKORO_MODEL", MODEL_PATH)
    os.environ.setdefault("KOKORO_VOICES", VOICES_PATH)

    # Import server AFTER setting env vars so the module-level defaults pick them up.
    import importlib
    import server as srv

    # Reset the lazy-loaded singleton so each test run starts fresh.
    srv._kokoro = None
    importlib.reload(srv)

    from fastapi.testclient import TestClient

    return TestClient(srv.app)


# ---------------------------------------------------------------------------
# /health  — must pass even when model files are absent
# ---------------------------------------------------------------------------


def test_health_instant(client):
    """/health returns ok without loading the model."""
    import server as srv

    # Ensure model NOT loaded before this call.
    srv._kokoro = None

    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
    # Model must still be None — lazy-load must not have been triggered.
    assert srv._kokoro is None, "Model was eagerly loaded; /health must be instant"


# ---------------------------------------------------------------------------
# /speak  — skipped when model files are absent
# ---------------------------------------------------------------------------


@pytest.mark.skipif(not MODELS_PRESENT, reason="Model files not present in /models/")
def test_speak_returns_wav(client):
    """/speak returns audio/wav with a non-trivial payload."""
    r = client.post(
        "/speak",
        json={
            "text": "Hello, this is a test.",
            "voice": "af_heart",
            "lang_code": "a",
            "speed": 1.0,
        },
    )
    assert r.status_code == 200
    assert r.headers["content-type"] == "audio/wav"
    # WAV files start with the RIFF header
    assert r.content[:4] == b"RIFF", "Response is not a valid WAV (missing RIFF header)"
    # A real synthesis should produce more than a trivial number of bytes.
    assert len(r.content) > 10_000, f"WAV suspiciously small: {len(r.content)} bytes"


@pytest.mark.skipif(not MODELS_PRESENT, reason="Model files not present in /models/")
def test_speak_lang_code_b_british(client):
    """/speak with lang_code='b' (British English) also returns wav."""
    r = client.post(
        "/speak",
        json={
            "text": "Good afternoon.",
            "voice": "bf_emma",
            "lang_code": "b",
            "speed": 1.0,
        },
    )
    assert r.status_code == 200
    assert r.content[:4] == b"RIFF"


@pytest.mark.skipif(not MODELS_PRESENT, reason="Model files not present in /models/")
def test_speak_full_lang_string(client):
    """/speak accepts a full kokoro lang string like 'en-us' directly."""
    r = client.post(
        "/speak",
        json={
            "text": "Testing full lang string.",
            "voice": "af_heart",
            "lang_code": "en-us",
            "speed": 1.0,
        },
    )
    assert r.status_code == 200
    assert r.content[:4] == b"RIFF"


@pytest.mark.skipif(not MODELS_PRESENT, reason="Model files not present in /models/")
def test_speak_wav_has_real_samples(client):
    """Synthesised WAV contains non-silent float32 audio samples."""
    import numpy as np
    import soundfile as sf

    r = client.post(
        "/speak",
        json={"text": "One two three.", "voice": "af_heart", "lang_code": "a", "speed": 1.0},
    )
    assert r.status_code == 200
    samples, sr = sf.read(io.BytesIO(r.content), dtype="float32")
    assert sr == 24000, f"Expected 24 kHz, got {sr}"
    assert len(samples) > 0
    # At least some samples should be non-zero (i.e. real audio, not silence).
    assert np.abs(samples).max() > 0.01, "Audio appears to be silent"


@pytest.mark.skipif(not MODELS_PRESENT, reason="Model files not present in /models/")
def test_speak_voice_lang_speed_from_body(client):
    """Voice, lang_code, and speed are taken from the request body (no hardcoded env)."""
    import server as srv

    # Confirm no TEACHME_VOICE / TEACHME_LANG env vars are referenced in server module.
    import inspect

    src = inspect.getsource(srv)
    assert "TEACHME_VOICE" not in src, "TEACHME_VOICE hardcode still present"
    assert "TEACHME_LANG" not in src, "TEACHME_LANG hardcode still present"
