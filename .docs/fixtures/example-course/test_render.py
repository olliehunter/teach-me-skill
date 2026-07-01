"""
Tests for render_audio.py (kokoro-onnx port).

Verifies:
1. The script imports kokoro_onnx (not torch/kokoro).
2. Kokoro.create() renders a non-empty WAV to disk.
3. The rendered fixture WAV's actual duration matches the patched audio_duration_s
   within the validator's ±0.3s tolerance.

Skips gracefully when model files are absent (CI without models).
"""

import importlib
import json
import os
import tempfile
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

# --- paths ---------------------------------------------------------------

FIXTURE_DIR = Path(__file__).parent
LESSON_JSON = FIXTURE_DIR / "lessons" / "0001-interest-rate-lags.json"
AUDIO_DIR = FIXTURE_DIR / "assets" / "audio"

_DEFAULT_MODELS = "/Users/ollie/development/teachmeplayer/models"
MODEL_PATH = os.environ.get("KOKORO_MODEL", os.path.join(_DEFAULT_MODELS, "kokoro-v1.0.onnx"))
VOICES_PATH = os.environ.get("KOKORO_VOICES", os.path.join(_DEFAULT_MODELS, "voices-v1.0.bin"))

MODELS_PRESENT = Path(MODEL_PATH).exists() and Path(VOICES_PATH).exists()

# -------------------------------------------------------------------------


def test_render_audio_uses_kokoro_onnx_not_torch():
    """render_audio.py must import kokoro_onnx, not torch or kokoro (PyTorch variant)."""
    source = (FIXTURE_DIR / "render_audio.py").read_text()
    assert "from kokoro_onnx import" in source, "render_audio.py must import from kokoro_onnx"
    assert "from kokoro import" not in source, "render_audio.py must NOT import from PyTorch kokoro"
    assert "import torch" not in source, "render_audio.py must NOT import torch"


@pytest.mark.skipif(not MODELS_PRESENT, reason="kokoro-onnx model files not found — skip live render")
def test_kokoro_onnx_renders_non_empty_wav(tmp_path):
    """Kokoro.create() produces a non-empty float32 array at the expected sample rate."""
    from kokoro_onnx import Kokoro  # noqa: PLC0415

    kokoro = Kokoro(MODEL_PATH, VOICES_PATH)
    samples, sr = kokoro.create("Hello.", voice="af_heart", speed=1.0, lang="en-us")
    samples = np.asarray(samples, dtype=np.float32)

    assert sr > 0, "sample rate must be positive"
    assert len(samples) > 0, "samples array must be non-empty"
    assert samples.dtype == np.float32

    # Write to a real WAV and confirm soundfile can read it back.
    out = tmp_path / "hello.wav"
    sf.write(str(out), samples, sr)
    info = sf.info(str(out))
    assert info.frames > 0
    assert info.samplerate == sr


@pytest.mark.skipif(not MODELS_PRESENT, reason="kokoro-onnx model files not found — skip live render")
def test_fixture_wav_duration_matches_patched_value():
    """
    For each narration beat in the committed lesson JSON, verify that the actual
    WAV duration is within the validator's ±0.3s tolerance of audio_duration_s.
    This mirrors validate.py's check_audio() logic exactly.
    """
    if not LESSON_JSON.exists():
        pytest.skip("lesson JSON not found")

    lesson = json.loads(LESSON_JSON.read_text())
    tolerance = 0.3

    checked = 0
    for beat in lesson.get("beats", []):
        if beat["type"] != "narration":
            continue
        declared_dur = beat.get("audio_duration_s")
        audio_rel = beat.get("audio")
        if declared_dur is None or not audio_rel:
            continue
        wav_path = FIXTURE_DIR / audio_rel
        if not wav_path.exists():
            pytest.skip(f"WAV not rendered yet: {wav_path} — run render_audio.py first")

        info = sf.info(str(wav_path))
        actual = info.frames / info.samplerate
        assert abs(actual - declared_dur) <= tolerance, (
            f"beat {beat['id']}: declared {declared_dur}s, actual {actual:.3f}s "
            f"(delta {abs(actual - declared_dur):.3f}s > {tolerance}s)"
        )
        checked += 1

    assert checked > 0, "no narration beats found with audio_duration_s set"
