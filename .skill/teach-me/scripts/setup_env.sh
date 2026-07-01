#!/usr/bin/env bash
# Resumable, idempotent, FOREGROUND setup for teach-me audio rendering.
#
# IMPORTANT: do NOT background this (no `nohup ... &`). In sandboxes with a per-command
# time limit, background processes are reaped between calls, so a backgrounded install never
# finishes. Instead this script is a *step-runner*: each foreground call makes progress and
# exits before the time limit, and large downloads RESUME on the next call.
#
#   Run it, and simply RUN IT AGAIN until it prints "SETUP COMPLETE":
#     bash scripts/setup_env.sh
#     bash scripts/setup_env.sh   # resumes
#     ...                          # repeat until "SETUP COMPLETE"
#
# It uses kokoro-onnx (onnxruntime, no PyTorch) so the install is small and fast. Everything is
# cached under $TEACHME_HOME so later sessions are a no-op.
set -uo pipefail

TEACHME_HOME="${TEACHME_HOME:-$HOME/.teachme}"
VENV="$TEACHME_HOME/venv"
MODELS="$TEACHME_HOME/models"
mkdir -p "$MODELS"

ONNX_URL="https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
VOICES_URL="https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
ONNX="$MODELS/kokoro-v1.0.onnx"
VOICES="$MODELS/voices-v1.0.bin"

done_mark() { [ -f "$TEACHME_HOME/$1.done" ]; }
mark()      { touch "$TEACHME_HOME/$1.done"; }

# --- Step 1: venv + lightweight deps (no torch). pip caches, so re-running is cheap. ---
if ! done_mark deps; then
  echo "[1/3] installing kokoro-onnx (onnxruntime, no PyTorch)…"
  [ -d "$VENV" ] || python3 -m venv "$VENV"
  # shellcheck disable=SC1091
  source "$VENV/bin/activate"
  pip install --upgrade pip >/dev/null 2>&1 || true
  if pip install "kokoro-onnx>=0.4" soundfile numpy; then
    mark deps
    echo "  deps installed."
  else
    echo "  deps not finished this call — RUN SETUP AGAIN."; exit 0
  fi
fi

# --- Step 2: the model file (~310MB) — resumable across calls via curl -C -. ---
if ! done_mark onnx; then
  echo "[2/3] downloading kokoro model (resumable; re-run to continue)…"
  curl -L -C - --max-time 40 -o "$ONNX" "$ONNX_URL"; rc=$?
  if [ $rc -eq 0 ]; then mark onnx; echo "  model complete."
  else echo "  model still downloading (curl rc=$rc) — RUN SETUP AGAIN to resume."; exit 0; fi
fi

# --- Step 3: the voices file (~27MB) — resumable. ---
if ! done_mark voices; then
  echo "[3/3] downloading voices (resumable)…"
  curl -L -C - --max-time 40 -o "$VOICES" "$VOICES_URL"; rc=$?
  if [ $rc -eq 0 ]; then mark voices; echo "  voices complete."
  else echo "  voices still downloading (curl rc=$rc) — RUN SETUP AGAIN to resume."; exit 0; fi
fi

echo "SETUP COMPLETE (venv=$VENV, models=$MODELS)"
