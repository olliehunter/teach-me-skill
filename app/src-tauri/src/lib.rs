use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

// Dev fallback locations (repo-root /models/). Used when running `tauri dev`,
// where the model files are not bundled as resources. In a bundled `.app`
// (Checkpoint B) the models ship as Tauri resources — see `resolve_model_paths`
// and `bundle.resources` in tauri.conf.json.
const KOKORO_MODEL_DEV: &str =
    "/Users/ollie/development/teachmeplayer/models/kokoro-v1.0.onnx";
const KOKORO_VOICES_DEV: &str =
    "/Users/ollie/development/teachmeplayer/models/voices-v1.0.bin";

/// Resolve the ONNX model + voices file paths the sidecar should load.
///
/// Bundled build: the files ship under `<resource_dir>/models/` (declared in
/// tauri.conf.json `bundle.resources`), so a packaged `.app` is fully offline
/// and needs no dev tree. Dev build: fall back to the repo-root `/models/`.
fn resolve_model_paths(app: &tauri::App) -> (String, String) {
    if let Ok(res) = app.path().resource_dir() {
        let model = res.join("models").join("kokoro-v1.0.onnx");
        let voices = res.join("models").join("voices-v1.0.bin");
        if model.exists() && voices.exists() {
            return (
                model.to_string_lossy().into_owned(),
                voices.to_string_lossy().into_owned(),
            );
        }
    }
    (KOKORO_MODEL_DEV.to_string(), KOKORO_VOICES_DEV.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let (model_path, voices_path) = resolve_model_paths(app);

            let sidecar = app
                .shell()
                .sidecar("teachme-sidecar")
                .expect("failed to create sidecar command")
                .env("KOKORO_MODEL", &model_path)
                .env("KOKORO_VOICES", &voices_path);

            let (mut rx, child) = sidecar.spawn().expect("failed to spawn sidecar");

            // Move `child` into the task so the process lives as long as the app does.
            tauri::async_runtime::spawn(async move {
                let _child = child;
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stderr(bytes) => {
                            eprintln!("[sidecar] {}", String::from_utf8_lossy(&bytes));
                        }
                        CommandEvent::Stdout(bytes) => {
                            eprintln!("[sidecar stdout] {}", String::from_utf8_lossy(&bytes));
                        }
                        CommandEvent::Error(e) => {
                            eprintln!("[sidecar error] {e}");
                        }
                        CommandEvent::Terminated(status) => {
                            eprintln!("[sidecar] terminated: {:?}", status);
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
