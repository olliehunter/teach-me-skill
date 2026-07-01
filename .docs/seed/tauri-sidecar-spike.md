# teach-me — Tauri + Kokoro sidecar bundling spike

**Purpose:** de-risk the hardest engineering in the player *before* building the real
thing — prove a Tauri app can bundle a PyInstaller'd Python (Kokoro) sidecar, spawn it,
talk to it, and be **signed + notarized** on macOS. Same de-risk-first move the TTS spike was.

This runs on your Mac. I can't build/sign/notarize from here, so this is an exact runbook
plus the real code (`sidecar/server.py`, `sidecar/build_sidecar.sh`, `frontend/index.html`).

## Pass / fail checkpoints

- **A — Dev:** `npm run tauri dev`, click **Speak**, you hear Kokoro. (Sidecar spawns + talks.)
- **B — Bundle:** `npm run tauri build` produces a `.app`/`.dmg`; it runs on a machine with
  **no Python installed** and still speaks. (Sidecar is genuinely bundled.)
- **C — Trust:** the app is **signed and notarized**; it opens on a second Mac without
  Gatekeeper blocking it. (This is the part most people underestimate — it's the real test.)

If A and B pass but C is painful, that's a finding: it tells you the true cost of "full v1"
packaging before you've sunk the player build into it.

## Prerequisites

- Xcode Command Line Tools, Rust (`rustup`), Node 18+, Python 3.11.
- Tauri CLI deps per https://v2.tauri.app/start/prerequisites/
- For checkpoint C: an **Apple Developer account** ($99/yr), a "Developer ID Application"
  certificate in your Keychain, and an app-specific password for notarization.

## Step 1 — Build the sidecar binary

```bash
cd bundle-spike/sidecar
chmod +x build_sidecar.sh
./build_sidecar.sh
```

This PyInstaller-bundles `server.py` + Kokoro + torch into one binary and copies it to
`src-tauri/binaries/teachme-sidecar-<target-triple>` (Tauri's required naming).

**Smoke-test the raw binary first** (catch torch/PyInstaller issues before Tauri is involved):

```bash
./src-tauri/binaries/teachme-sidecar-$(rustc --print host-tuple) &
sleep 8 && curl "http://127.0.0.1:17861/health"          # -> {"status":"ok"}
curl "http://127.0.0.1:17861/speak?text=hello" --output test.wav && afplay test.wav
kill %1
```

If this fails, it's a PyInstaller packaging problem (see Gotchas) — fix it here, not in Tauri.

## Step 2 — Scaffold the Tauri app

```bash
cd bundle-spike
npm create tauri-app@latest app -- --template vanilla --manager npm
cd app
npm install
npm run tauri add shell        # adds tauri-plugin-shell + its init()
```

Then replace the generated front-end entry with our spike UI:

```bash
cp ../frontend/index.html ./index.html   # (vanilla template serves index.html at root)
```

Move the built sidecar into the app:

```bash
mkdir -p src-tauri/binaries
cp ../src-tauri/binaries/teachme-sidecar-* src-tauri/binaries/
```

## Step 3 — Wire the sidecar into Tauri

**`src-tauri/tauri.conf.json`** — declare the external binary and allow the webview to reach
the sidecar over localhost:

```jsonc
{
  "bundle": {
    "externalBin": ["binaries/teachme-sidecar"]
  },
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:17861; media-src 'self' blob:"
    }
  }
}
```

(`externalBin` base name has no triple — Tauri matches the `-<triple>` file automatically.)

**`src-tauri/src/lib.rs`** — spawn the sidecar at startup and keep it alive for the app's
lifetime by moving the child handle into a task that drains its output:

```rust
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let sidecar = app
                .shell()
                .sidecar("teachme-sidecar")
                .expect("failed to create sidecar command");
            let (mut rx, child) = sidecar.spawn().expect("failed to spawn sidecar");
            // Hold `child` here so the process lives as long as the app does.
            tauri::async_runtime::spawn(async move {
                let _child = child;
                while let Some(event) = rx.recv().await {
                    if let CommandEvent::Stderr(bytes) = event {
                        eprintln!("[sidecar] {}", String::from_utf8_lossy(&bytes));
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

(Spawning from Rust avoids needing JS shell-permission scopes; the Rust side has full access.)

## Step 4 — Checkpoint A (dev)

```bash
npm run tauri dev
```

Wait for "Sidecar ready.", click **Speak** → you should hear Kokoro. ✅ A.

## Step 5 — Checkpoint B (bundle, no Python)

```bash
npm run tauri build
```

Open `src-tauri/target/release/bundle/macos/<app>.app`. To prove the sidecar is truly
bundled, test where Python isn't on PATH:

```bash
env -i HOME="$HOME" /path/to/<app>.app/Contents/MacOS/<app>
```

Speak still works → ✅ B.

## Step 6 — Checkpoint C (sign + notarize)

Add an entitlements file (PyInstaller'd Python needs these under the hardened runtime):

**`src-tauri/entitlements.plist`**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
</dict></plist>
```

Point Tauri at your signing identity + entitlements in **`tauri.conf.json`**:

```jsonc
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Your Name (TEAMID)",
      "entitlements": "entitlements.plist"
    }
  }
}
```

Notarize during build by exporting credentials, then building:

```bash
export APPLE_ID="you@example.com"
export APPLE_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="YOURTEAMID"
npm run tauri build
```

Verify and test trust:

```bash
codesign --verify --deep --strict --verbose=2 "/path/to/<app>.app"
spctl -a -vvv "/path/to/<app>.app"          # should say: accepted, source=Notarized Developer ID
```

Copy the `.dmg` to a second Mac and open it without Gatekeeper warnings → ✅ C.

## Gotchas (where the time goes) — all hit and solved in `build_sidecar.sh`

These appeared in order while getting Kokoro into a `--onefile` binary; the current build
script handles all of them. Listed so the fixes are traceable.

- **torch + PyInstaller `--onefile`** is large and unpacks to a temp dir each launch (slow
  first start). If it breaks or the start is unacceptable, use the fallback below.
- **`language_tags` data** (`FileNotFoundError: .../language_tags/data/json/index.json`): its
  loader reads data by path and `--collect-all` mis-places it. Fix: explicit `--add-data` for
  the package's `data` dir (also done for `csvw`, `segments`).
- **`espeakng_loader` data + library** (`RuntimeError: data path not exists .../espeak-ng-data`):
  this package bundles espeak-ng's data dir *and* its shared library inside itself. Fix:
  `--add-data` its `get_data_path()` and `--add-binary` its `get_library_path()`. No Homebrew
  espeak-ng needed — the loader ships its own.
- **spaCy model `en_core_web_sm`** (`SystemExit: 2`, a runtime `spacy download` attempt):
  misaki's English G2P downloads the model at runtime, which is fatal when frozen. Fix:
  `python -m spacy download en_core_web_sm` at build time, then `--collect-all en_core_web_sm
  --collect-all spacy --copy-metadata en_core_web_sm`.
- **CORS** (webview shows "sidecar did not start" but `curl` to it works): the webview calls
  the sidecar cross-origin; without `CORSMiddleware(allow_origins=["*"])` the response is
  unreadable and fails silently. `curl` working while the app fails is the diagnostic tell.
- **espeak-ng (GPLv3):** for *distribution*, keep espeak-ng as a separate bundled executable
  (mere aggregation) — personal installers carry no obligation; distributing to others requires
  providing espeak-ng's source/offer.
- **HF weights on first run:** Kokoro pulls its model weights from Hugging Face on first
  `/speak` (needs network). For true offline use, bundle the weights in the real build.
- **Signing nested binary:** notarization scans the sidecar too; the entitlements above are
  what let a hardened-runtime'd Python pass. Missing them is the usual cause of a C failure.

### Fallback: onedir + resources

If `--onefile` is too painful, build with `--onedir` (reliable for torch), ship the
`dist/teachme-sidecar/` folder via `bundle.resources`, and spawn the inner binary with
`std::process::Command` using a path resolved from `app.path().resource_dir()` instead of the
sidecar API. More moving parts, but far fewer torch surprises.

## When this passes

You'll have proven the entire risky spine of the player — a signed, notarized Tauri app with a
bundled local Kokoro voice — and can build the real player UI against the beat format with the
hard packaging questions already answered.
