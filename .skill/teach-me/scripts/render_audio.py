"""
Render per-beat narration audio for a teach-me lesson, using kokoro-onnx (local, no PyTorch).

Prereq: run scripts/setup_env.sh until it prints "SETUP COMPLETE" (installs kokoro-onnx and
downloads the model files under $TEACHME_HOME). Then invoke this with that venv's python:

    "$HOME/.teachme/venv/bin/python" render_audio.py <workspace>/lessons/<id>-<slug>.json

For each beat it renders and patches durations back into the lesson JSON:
  - narration beats  -> beat["audio"]                    (+ audio_duration_s)
  - quiz beats       -> beat["audio_intro"], beat["audio_correct"], beat["audio_incorrect"]
  - contested beats  -> beat["audio_intro"] + each position's audio (+ audio_duration_s)
Audio goes to <workspace>/assets/audio/. Voice comes from the lesson's voice config.
"""

import json
import os
import sys
from pathlib import Path

import soundfile as sf
from kokoro_onnx import Kokoro

TEACHME_HOME = os.environ.get("TEACHME_HOME", os.path.expanduser("~/.teachme"))
MODELS = os.path.join(TEACHME_HOME, "models")

# Kokoro lang_code (from the workspace voice config) -> kokoro-onnx lang tag.
LANG_MAP = {"a": "en-us", "b": "en-gb"}

_kokoro = None


def get_kokoro():
    global _kokoro
    if _kokoro is None:
        onnx = os.path.join(MODELS, "kokoro-v1.0.onnx")
        voices = os.path.join(MODELS, "voices-v1.0.bin")
        if not (os.path.exists(onnx) and os.path.exists(voices)):
            sys.exit(f"Model files missing under {MODELS}. Run scripts/setup_env.sh first.")
        _kokoro = Kokoro(onnx, voices)
    return _kokoro


def render(kokoro, voice, lang, text, out_path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    samples, sr = kokoro.create(text, voice=voice, speed=1.0, lang=lang)
    sf.write(str(out_path), samples, sr)
    dur = round(len(samples) / sr, 2)
    print(f"  rendered {out_path}  ({dur}s)")
    return dur


def main(lesson_path):
    lesson_path = Path(lesson_path)
    root = lesson_path.parent.parent  # workspace root (lessons/ is one level down)
    lesson = json.loads(lesson_path.read_text())

    voice_cfg = lesson.get("voice", {"lang_code": "a", "voice": "af_heart"})
    voice = voice_cfg.get("voice", "af_heart")
    lang = LANG_MAP.get(voice_cfg.get("lang_code", "a"), "en-us")
    kokoro = get_kokoro()

    print(f"Rendering lesson {lesson['lesson_id']} with voice '{voice}' ({lang})...")
    for beat in lesson["beats"]:
        btype = beat["type"]
        if btype == "narration":
            beat["audio_duration_s"] = render(kokoro, voice, lang, beat["narration"], root / beat["audio"])
        elif btype == "quiz":
            if beat.get("narration_intro") and beat.get("audio_intro"):
                render(kokoro, voice, lang, beat["narration_intro"], root / beat["audio_intro"])
            if beat.get("correct_feedback") and beat.get("audio_correct"):
                render(kokoro, voice, lang, beat["correct_feedback"], root / beat["audio_correct"])
            if beat.get("incorrect_feedback") and beat.get("audio_incorrect"):
                render(kokoro, voice, lang, beat["incorrect_feedback"], root / beat["audio_incorrect"])
        elif btype == "contested":
            if beat.get("narration_intro") and beat.get("audio_intro"):
                render(kokoro, voice, lang, beat["narration_intro"], root / beat["audio_intro"])
            for pos in beat.get("positions", []):
                if pos.get("narration") and pos.get("audio"):
                    pos["audio_duration_s"] = render(kokoro, voice, lang, pos["narration"], root / pos["audio"])

    lesson_path.write_text(json.dumps(lesson, indent=2, ensure_ascii=False) + "\n")
    print(f"Done. Patched durations into {lesson_path}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python render_audio.py <lesson.json>")
        sys.exit(2)
    main(sys.argv[1])
