"""
Render per-beat narration audio for a teach-me lesson, using kokoro-onnx (local).
Run inside a kokoro-onnx venv:

    python render_audio.py <workspace>/lessons/<id>-<slug>.json

For each beat it renders and patches durations back into the lesson JSON:
  - narration beats  -> beat["audio"]                    (+ audio_duration_s)
  - quiz beats       -> beat["audio_intro"], beat["audio_correct"], beat["audio_incorrect"]
                        (falls back to beat["audio_explanation"] for pre-split courses)
  - contested beats  -> beat["audio_intro"] + each position's audio (+ audio_duration_s)
Audio is written under <workspace>/assets/audio/. Voice comes from the lesson's voice config.

Model files are located via KOKORO_MODEL and KOKORO_VOICES env vars, defaulting to the
shared models at /Users/ollie/development/teachmeplayer/models/.
"""

import json
import os
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

# Default model paths (override via env vars at build/render time).
_DEFAULT_MODELS = "/Users/ollie/development/teachmeplayer/models"
KOKORO_MODEL = os.environ.get(
    "KOKORO_MODEL",
    os.path.join(_DEFAULT_MODELS, "kokoro-v1.0.onnx"),
)
KOKORO_VOICES = os.environ.get(
    "KOKORO_VOICES",
    os.path.join(_DEFAULT_MODELS, "voices-v1.0.bin"),
)

# Map course.json lang_code short-forms to kokoro-onnx lang strings.
# Mirrors the sidecar's LANG_CODE_MAP in sidecar/server.py.
LANG_CODE_MAP: dict[str, str] = {
    "a": "en-us",
    "b": "en-gb",
}


def render(kokoro: Kokoro, voice: str, lang: str, speed: float, text: str, out_path: Path) -> float:
    """Synthesise *text* and write a WAV to *out_path*. Returns duration in seconds."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    samples, sample_rate = kokoro.create(text, voice=voice, speed=speed, lang=lang)
    samples = np.asarray(samples, dtype=np.float32)
    sf.write(str(out_path), samples, sample_rate)
    dur = round(len(samples) / sample_rate, 2)
    print(f"  rendered {out_path}  ({dur}s)")
    return dur


def main(lesson_path: str) -> None:
    lesson_path = Path(lesson_path)
    root = lesson_path.parent.parent  # workspace root (lessons/ is one level down)
    lesson = json.loads(lesson_path.read_text())

    voice_cfg = lesson.get("voice", {"lang_code": "a", "voice": "af_heart", "speed": 1.0})
    lang_code = voice_cfg.get("lang_code", "a")
    lang = LANG_CODE_MAP.get(lang_code, lang_code)
    voice = voice_cfg.get("voice", "af_heart")
    speed = float(voice_cfg.get("speed", 1.0))

    print(f"Loading kokoro-onnx model from {KOKORO_MODEL} ...")
    kokoro = Kokoro(KOKORO_MODEL, KOKORO_VOICES)

    print(f"Rendering lesson {lesson['lesson_id']} with voice '{voice}' lang '{lang}' speed {speed}...")
    for beat in lesson["beats"]:
        btype = beat["type"]
        if btype == "narration":
            beat["audio_duration_s"] = render(
                kokoro, voice, lang, speed, beat["narration"], root / beat["audio"]
            )
        elif btype == "quiz":
            if beat.get("narration_intro") and beat.get("audio_intro"):
                render(kokoro, voice, lang, speed, beat["narration_intro"], root / beat["audio_intro"])
            # New split feedback clips: correct + incorrect.
            if beat.get("correct_feedback") and beat.get("audio_correct"):
                render(kokoro, voice, lang, speed, beat["correct_feedback"], root / beat["audio_correct"])
            if beat.get("incorrect_feedback") and beat.get("audio_incorrect"):
                render(kokoro, voice, lang, speed, beat["incorrect_feedback"], root / beat["audio_incorrect"])
            # Back-compat: pre-split single explanation clip.
            if beat.get("explanation") and beat.get("audio_explanation"):
                render(kokoro, voice, lang, speed, beat["explanation"], root / beat["audio_explanation"])
        elif btype == "contested":
            if beat.get("narration_intro") and beat.get("audio_intro"):
                render(kokoro, voice, lang, speed, beat["narration_intro"], root / beat["audio_intro"])
            for pos in beat.get("positions", []):
                if pos.get("narration") and pos.get("audio"):
                    pos["audio_duration_s"] = render(
                        kokoro, voice, lang, speed, pos["narration"], root / pos["audio"]
                    )

    lesson_path.write_text(json.dumps(lesson, indent=2, ensure_ascii=False) + "\n")
    print(f"Done. Patched durations into {lesson_path}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python render_audio.py <lesson.json>")
        sys.exit(2)
    main(sys.argv[1])
