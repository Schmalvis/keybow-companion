#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use std::time::{Duration, Instant};

use log::info;
use tauri::Emitter;
use tauri::Manager;

use keybow_companion::commands::{self, AppState};
use keybow_companion::profiles::ProfileEngine;
use keybow_companion::serial::{SerialEvent, SerialManager};

fn main() {
    env_logger::init();

    // Load config from standard location
    let config_dir = dirs::config_dir()
        .expect("Could not determine config directory")
        .join("keybow-companion");
    let config_path = config_dir.join("profiles.json");
    info!("[Main] Config path: {}", config_path.display());

    let profiles = ProfileEngine::load(config_path);
    let serial = SerialManager::new();

    // Try initial connect
    if let Err(e) = serial.connect() {
        info!("[Main] Initial serial connect failed (will retry): {}", e);
    }

    let state = AppState {
        profiles: Mutex::new(profiles),
        serial: Mutex::new(serial),
        templates: include_str!("../../electron/src/data/templates.json").to_string(),
        suggestions: include_str!("../../electron/src/data/suggestions.json").to_string(),
    };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::get_installed_apps,
            commands::browse_for_app,
            commands::get_templates,
            commands::get_suggestions,
            commands::preview_led,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // Background thread for serial polling
            std::thread::spawn(move || {
                let mut reconnect_timer = Instant::now();

                loop {
                    let state = handle.state::<AppState>();

                    let is_connected = {
                        let serial = state.serial.lock().unwrap();
                        serial.is_connected()
                    };

                    if !is_connected {
                        if reconnect_timer.elapsed() >= Duration::from_secs(3) {
                            reconnect_timer = Instant::now();
                            let serial = state.serial.lock().unwrap();
                            match serial.connect() {
                                Ok(()) => {
                                    info!("[Serial] Reconnected");
                                    let _ = handle.emit("device-status", true);
                                }
                                Err(_) => {
                                    let _ = handle.emit("device-status", false);
                                }
                            }
                        }
                        std::thread::sleep(Duration::from_millis(200));
                        continue;
                    }

                    // Read a line from serial
                    let line = {
                        let serial = state.serial.lock().unwrap();
                        serial.read_line()
                    };

                    if let Some(line) = line {
                        let serial = state.serial.lock().unwrap();
                        if let Some(event) = serial.handle_line(&line) {
                            match event {
                                SerialEvent::Ready => {
                                    info!("[Serial] Device READY — sending LED colors");
                                    let profiles = state.profiles.lock().unwrap();
                                    let colors = profiles.get_all_key_colors();
                                    for (key, color) in &colors {
                                        serial.send_led(key, color);
                                    }
                                    let _ = handle.emit("device-status", true);
                                }
                                SerialEvent::KeyEvent(ke) => {
                                    let event_str = format!("{:?}", ke.event);
                                    let _ = handle.emit(
                                        "key-event",
                                        serde_json::json!({
                                            "key": ke.key,
                                            "event": event_str
                                        }),
                                    );
                                }
                                SerialEvent::Pong => {
                                    // Heartbeat received — device is alive
                                }
                                SerialEvent::Connected | SerialEvent::Disconnected => {}
                            }
                        }
                    } else {
                        // No data — short sleep to avoid busy-waiting
                        std::thread::sleep(Duration::from_millis(10));
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running Keybow Companion");
}
