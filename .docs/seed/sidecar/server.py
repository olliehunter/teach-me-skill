"""
teach-me bundling spike — Kokoro TTS sidecar (FastAPI).
Proves the sidecar can be PyInstaller'd and spawned by Tauri.

Endpoints:
  GET /health         -> {"status":"ok"}  (front end polls this until ready)
  GET /speak?text=... -> audio/wav         (Kokoro renders the text in the course voice)

Kokoro is lazy-loaded on the first /speak so /health responds instantly at startup.
Run standalone for testing:  python server.py   (serves on 127.0.0.1:17861)
"""

import io
import os

import numpy as np
import soundfile as sf
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

VOICE = os.environ.get("TEACHME_VOICE", "af_heart")
LANG = os.environ.get("TEACHME_LANG", "a")
PORT = int(os.environ.get("TEACHME_PORT", "17861"))
SR = 24000

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

_pipeline = None


def get_pipeline():
    global _pipeline
    if _pipeline is None:
        from kokoro import KPipeline  # imported lazily so startup is fast
        _pipeline = KPipeline(lang_code=LANG)
    return _pipeline


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/speak")
def speak(text: str):
    pipe = get_pipeline()
    chunks = []
    for _, _, audio in pipe(text, voice=VOICE, speed=1):
        a = audio.detach().cpu().numpy() if hasattr(audio, "detach") else np.asarray(audio)
        chunks.append(a)
    audio = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)
    buf = io.BytesIO()
    sf.write(buf, audio, SR, format="WAV")
    return Response(content=buf.getvalue(), media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn
    print(f"TEACHME_SIDECAR starting on 127.0.0.1:{PORT}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
