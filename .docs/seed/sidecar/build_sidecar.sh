#!/usr/bin/env bash
# Build the Kokoro sidecar into a single binary and place it where Tauri expects it,
# named with the host target triple (Tauri's externalBin convention).
#
# Run from sidecar/:   ./build_sidecar.sh
#
# NOTE on torch + PyInstaller: --onefile is the cleanest fit for Tauri's sidecar API,
# but PyTorch is large and unpacks to a temp dir on each launch (slow first start).
# If --onefile misbehaves, switch to --onedir and ship via bundle.resources instead
# (see the runbook, "Fallback: onedir + resources").
set -euo pipefail
cd "$(dirname "$0")"

# Start clean so a stale spec/build can't mask flag changes.
rm -rf build dist teachme-sidecar.spec

python3.11 -m venv .build-venv
source .build-venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt pyinstaller

# misaki's English G2P needs a spaCy model and will try to DOWNLOAD it at runtime
# (fatal in a frozen binary). Install it now so it's present and gets bundled.
python -m spacy download en_core_web_sm

# Some deps ship JSON/data files that --collect-all misses or mis-places (notably
# language_tags, whose loader reads <pkg>/data/json/index.json by path). Add those
# data dirs explicitly, computed from the installed location.
DATA_ARGS=()
for pkg in language_tags csvw segments; do
  d="$(python -c "import os,importlib; m=importlib.import_module('$pkg'); print(os.path.join(os.path.dirname(m.__file__),'data'))")"
  if [ -d "$d" ]; then
    echo "adding data: $d -> $pkg/data"
    DATA_ARGS+=( --add-data "$d:$pkg/data" )
  fi
done

# espeakng_loader bundles espeak-ng's DATA dir and SHARED LIBRARY inside the package,
# and its loader looks for them next to __file__. Place both exactly where it expects.
ESPEAK_DATA="$(python -c "import espeakng_loader; print(espeakng_loader.get_data_path())")"
ESPEAK_LIB="$(python -c "import espeakng_loader; print(espeakng_loader.get_library_path())")"
echo "adding espeak data: $ESPEAK_DATA"
echo "adding espeak lib:  $ESPEAK_LIB"
DATA_ARGS+=( --add-data "$ESPEAK_DATA:espeakng_loader/espeak-ng-data" )
BIN_ARGS=( --add-binary "$ESPEAK_LIB:espeakng_loader" )

pyinstaller server.py \
  --name teachme-sidecar \
  --onefile \
  --clean \
  --collect-all kokoro \
  --collect-all misaki \
  --collect-all torch \
  --collect-all phonemizer \
  --collect-all segments \
  --collect-all csvw \
  --collect-all language_tags \
  --collect-all espeakng_loader \
  --collect-all spacy \
  --collect-all en_core_web_sm \
  --copy-metadata en_core_web_sm \
  --collect-submodules uvicorn \
  --collect-submodules fastapi \
  "${DATA_ARGS[@]}" \
  "${BIN_ARGS[@]}" \
  --noconfirm

TRIPLE="$(rustc --print host-tuple)"   # e.g. aarch64-apple-darwin
DEST="../src-tauri/binaries"
mkdir -p "$DEST"
cp "dist/teachme-sidecar" "$DEST/teachme-sidecar-${TRIPLE}"
chmod +x "$DEST/teachme-sidecar-${TRIPLE}"

echo "OK -> $DEST/teachme-sidecar-${TRIPLE}"
echo "Smoke test the raw binary before wiring Tauri:"
echo "  $DEST/teachme-sidecar-${TRIPLE}   # then curl http://127.0.0.1:17861/health"
