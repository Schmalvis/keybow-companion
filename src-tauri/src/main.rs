#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    env_logger::init();

    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error running Keybow Companion");
}
