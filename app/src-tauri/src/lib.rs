use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

// TODO (issue-011): switch KOKORO_MODEL and KOKORO_VOICES to bundled Tauri resource paths
// once the model/voices files are included in the bundle via tauri.conf.json `resources`.
// For now they point at the shared models directory in the dev tree.
const KOKORO_MODEL_DEV: &str =
    "/Users/ollie/development/teachmeplayer/models/kokoro-v1.0.onnx";
const KOKORO_VOICES_DEV: &str =
    "/Users/ollie/development/teachmeplayer/models/voices-v1.0.bin";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let sidecar = app
                .shell()
                .sidecar("teachme-sidecar")
                .expect("failed to create sidecar command")
                .env("KOKORO_MODEL", KOKORO_MODEL_DEV)
                .env("KOKORO_VOICES", KOKORO_VOICES_DEV);

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
