"""
Render per-beat narration audio for a teach-me lesson, using Kokoro (local).
Run inside a Kokoro venv:

    python render_audio.py <workspace>/lessons/<id>-<slug>.json

For each beat it renders and patches durations back into the lesson JSON:
  - narration beats  -> beat["audio"]                    (+ audio_duration_s)
  - quiz beats       -> beat["audio_intro"], beat["audio_explanation"]
  - contested beats  -> beat["audio_intro"] + each position's audio (+ audio_duration_s)
Audio is written under <workspace>/assets/audio/. Voice comes from the lesson's voice config.
"""

import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

SAMPLE_RATE = 24000


def to_numpy(audio):
    return audio.detach().cpu().numpy() if hasattr(audio, "detach") else np.asarray(audio)


def render(pipeline, voice, text, out_path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    chunks = [to_numpy(a) for _, _, a in pipeline(text, voice=voice, speed=1)]
    audio = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)
    sf.write(str(out_path), audio, SAMPLE_RATE)
    dur = round(len(audio) / SAMPLE_RATE, 2)
    print(f"  rendered {out_path}  ({dur}s)")
    return dur


def main(lesson_path):
    lesson_path = Path(lesson_path)
    root = lesson_path.parent.parent  # workspace root (lessons/ is one level down)
    lesson = json.loads(lesson_path.read_text())

    voice_cfg = lesson.get("voice", {"lang_code": "a", "voice": "af_heart"})
    pipeline = KPipeline(lang_code=voice_cfg.get("lang_code", "a"))
    voice = voice_cfg.get("voice", "af_heart")

    print(f"Rendering lesson {lesson['lesson_id']} with voice '{voice}'...")
    for beat in lesson["beats"]:
        btype = beat["type"]
        if btype == "narration":
            beat["audio_duration_s"] = render(pipeline, voice, beat["narration"], root / beat["audio"])
        elif btype == "quiz":
            if beat.get("narration_intro") and beat.get("audio_intro"):
                render(pipeline, voice, beat["narration_intro"], root / beat["audio_intro"])
            if beat.get("explanation") and beat.get("audio_explanation"):
                render(pipeline, voice, beat["explanation"], root / beat["audio_explanation"])
        elif btype == "contested":
            if beat.get("narration_intro") and beat.get("audio_intro"):
                render(pipeline, voice, beat["narration_intro"], root / beat["audio_intro"])
            for pos in beat.get("positions", []):
                if pos.get("narration") and pos.get("audio"):
                    pos["audio_duration_s"] = render(pipeline, voice, pos["narration"], root / pos["audio"])

    lesson_path.write_text(json.dumps(lesson, indent=2, ensure_ascii=False) + "\n")
    print(f"Done. Patched durations into {lesson_path}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python render_audio.py <lesson.json>")
        sys.exit(2)
    main(sys.argv[1])
