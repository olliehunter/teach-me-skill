#!/usr/bin/env bash
# Build the Kokoro ONNX sidecar into a single binary and place it where Tauri expects it,
# named with the host target triple (Tauri's externalBin convention).
#
# Run from sidecar/:   ./build_sidecar.sh
#
# Deps: python3.11, rustc (for the target triple), espeak-ng on PATH (phonemisation).
# Model files at KOKORO_MODEL / KOKORO_VOICES env vars (defaults to ../models/).
set -euo pipefail
cd "$(dirname "$0")"

# Start clean so a stale spec/build cannot mask flag changes.
rm -rf build dist teachme-sidecar.spec

python3.11 -m venv .build-venv
source .build-venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt pyinstaller

# Collect data dirs for packages whose loaders read files by path.
DATA_ARGS=()
for pkg in language_tags csvw segments; do
  pkg_dir="$(python -c "import os, importlib; m = importlib.import_module('$pkg'); print(os.path.join(os.path.dirname(m.__file__), 'data'))" 2>/dev/null || true)"
  if [ -n "$pkg_dir" ] && [ -d "$pkg_dir" ]; then
    echo "adding data: $pkg_dir -> $pkg/data"
    DATA_ARGS+=( --add-data "$pkg_dir:$pkg/data" )
  fi
done

# espeakng_loader bundles espeak-ng data dir and shared library inside the package.
ESPEAK_DATA="$(python -c "import espeakng_loader; print(espeakng_loader.get_data_path())" 2>/dev/null || true)"
ESPEAK_LIB="$(python -c "import espeakng_loader; print(espeakng_loader.get_library_path())" 2>/dev/null || true)"

if [ -n "$ESPEAK_DATA" ] && [ -d "$ESPEAK_DATA" ]; then
  echo "adding espeak data: $ESPEAK_DATA"
  DATA_ARGS+=( --add-data "$ESPEAK_DATA:espeakng_loader/espeak-ng-data" )
fi

BIN_ARGS=()
if [ -n "$ESPEAK_LIB" ] && [ -f "$ESPEAK_LIB" ]; then
  echo "adding espeak lib:  $ESPEAK_LIB"
  BIN_ARGS+=( --add-binary "$ESPEAK_LIB:espeakng_loader" )
fi

# onnxruntime ships native .dylib/.so files -- collect-all pulls them in.
# kokoro-onnx has a config.json vocab and tokenizer data that must be bundled.
# No torch, no spaCy, no en_core_web_sm needed (only espeak-ng via espeakng_loader).
pyinstaller server.py \
  --name teachme-sidecar \
  --onefile \
  --clean \
  --collect-all kokoro_onnx \
  --collect-all onnxruntime \
  --collect-all soundfile \
  --collect-all phonemizer \
  --collect-submodules uvicorn \
  --collect-submodules fastapi \
  "${DATA_ARGS[@]}" \
  "${BIN_ARGS[@]}" \
  --noconfirm

TRIPLE="$(rustc --print host-tuple)"
DEST="../app/src-tauri/binaries"
mkdir -p "$DEST"
cp "dist/teachme-sidecar" "$DEST/teachme-sidecar-${TRIPLE}"
chmod +x "$DEST/teachme-sidecar-${TRIPLE}"

echo ""
echo "OK -> $DEST/teachme-sidecar-${TRIPLE}"
echo ""
echo "Smoke test the raw binary before wiring Tauri:"
echo "  dist/teachme-sidecar &"
echo "  sleep 2 && curl http://127.0.0.1:17861/health"
echo '  curl -s -X POST http://127.0.0.1:17861/speak \'
echo '       -H "Content-Type: application/json" \'
echo '       -d "{\"text\":\"hello world\",\"voice\":\"af_heart\",\"lang_code\":\"a\",\"speed\":1.0}" \'
echo '       --output test.wav && ls -lh test.wav'
echo "  kill %1"
