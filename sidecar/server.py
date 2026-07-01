"""
teach-me Player — Kokoro ONNX TTS sidecar (FastAPI).
Synthesises speech via kokoro-onnx (no PyTorch dependency).

Endpoints:
  GET  /health                              -> {"status":"ok"}  (model lazy-loaded; instant)
  POST /speak  {text, voice, lang_code, speed} -> audio/wav
  POST /tutor  {question, workspace_path, lesson_id, beat_id}
               -> {answer_text, used_sources, no_key}

Voice/lang/speed come from the request body — no hardcoded env vars.
Model files are located via KOKORO_MODEL and KOKORO_VOICES env vars.

Run standalone for testing:  python server.py   (serves on 127.0.0.1:17861)
"""

from __future__ import annotations

import io
import os
from typing import Optional

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

PORT = int(os.environ.get("TEACHME_PORT", "17861"))

# Paths to the ONNX model + voices file (download once into /models/).
# Override at runtime via env vars; defaults resolve relative to this file
# so the dev venv workflow works without extra setup.
_HERE = os.path.dirname(os.path.abspath(__file__))
_MODELS_DIR = os.path.join(_HERE, "..", "models")

KOKORO_MODEL = os.environ.get(
    "KOKORO_MODEL",
    os.path.join(_MODELS_DIR, "kokoro-v1.0.onnx"),
)
KOKORO_VOICES = os.environ.get(
    "KOKORO_VOICES",
    os.path.join(_MODELS_DIR, "voices-v1.0.bin"),
)

# lang_code values used in course.json voice objects map to kokoro-onnx lang strings.
# "a" = American English, "b" = British English (matches original Kokoro naming).
LANG_CODE_MAP: dict[str, str] = {
    "a": "en-us",
    "b": "en-gb",
}

app = FastAPI()

# The Tauri webview (origin tauri://localhost or the dev-server port) calls this
# sidecar cross-origin. Without CORS headers the webview sends the request but is
# blocked from reading the response. Allow all origins — fine for a localhost tool.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_kokoro: Optional[object] = None


def get_kokoro():
    """Lazy-load the Kokoro ONNX model on first call so /health responds instantly."""
    global _kokoro
    if _kokoro is None:
        from kokoro_onnx import Kokoro  # imported lazily so startup is fast
        _kokoro = Kokoro(KOKORO_MODEL, KOKORO_VOICES)
    return _kokoro


class SpeakRequest(BaseModel):
    text: str
    voice: str = "af_heart"
    lang_code: str = "a"
    speed: float = 1.0


@app.get("/health")
def health():
    return {"status": "ok"}


class TutorRequest(BaseModel):
    question: str
    workspace_path: str
    lesson_id: str
    beat_id: Optional[str] = None
    model: Optional[str] = None


@app.post("/tutor")
def tutor(req: TutorRequest):
    """
    Grounded tutor endpoint.

    Assembles lesson context (MISSION.md + objective + beat narrations + source
    excerpts) and calls Claude via the anthropic SDK with structured output.

    Always returns JSON — never a 500. If ANTHROPIC_API_KEY is absent the
    response carries no_key=True with an informational answer_text.
    """
    from tutor import TutorResult, call_tutor

    result: TutorResult = call_tutor(
        question=req.question,
        workspace_path=req.workspace_path,
        lesson_id=req.lesson_id,
        beat_id=req.beat_id,
        model=req.model,
    )
    return result.model_dump()


@app.post("/speak")
def speak(req: SpeakRequest):
    # Map lang_code short form ("a"/"b") to kokoro-onnx lang string ("en-us"/"en-gb").
    # If the caller already supplies a full lang string, pass it through unchanged.
    lang = LANG_CODE_MAP.get(req.lang_code, req.lang_code)

    try:
        kokoro = get_kokoro()
        samples, sample_rate = kokoro.create(
            req.text,
            voice=req.voice,
            speed=req.speed,
            lang=lang,
        )
    except (AssertionError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    buf = io.BytesIO()
    sf.write(buf, samples, sample_rate, format="WAV")
    return Response(content=buf.getvalue(), media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn
    print(f"TEACHME_SIDECAR starting on 127.0.0.1:{PORT}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
