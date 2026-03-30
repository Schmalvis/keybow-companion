#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::Emitter;
use tauri::Manager;

use keybow_companion::app_switcher::AppSwitcher;
use keybow_companion::commands::{self, AppState};
use keybow_companion::profiles::ProfileEngine;
use keybow_companion::serial::{SerialEvent, SerialManager};
use keybow_companion::types::{ActionTarget, ActionType, KeyEventType};

fn debug_log(msg: &str) {
    use std::io::Write;
    let path = dirs::config_dir().unwrap().join("keybow-companion").join("tauri-debug.log");
    let _ = std::fs::create_dir_all(path.parent().unwrap());
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "{}", msg);
    }
}

fn main() {
    debug_log("[Main] Starting Keybow Companion");

    // Load config from standard location
    let config_dir = dirs::config_dir()
        .expect("Could not determine config directory")
        .join("keybow-companion");
    let config_path = config_dir.join("profiles.json");
    debug_log(&format!("[Main] Config path: {}", config_path.display()));

    let profiles = ProfileEngine::load(config_path);
    let serial = SerialManager::new();

    // Try initial connect
    match serial.connect() {
        Ok(()) => {
            debug_log("[Main] Initial serial connect: SUCCESS");
            serial.send_ping();
            debug_log("[Main] Sent initial PING");
        },
        Err(e) => debug_log(&format!("[Main] Initial serial connect failed (will retry): {}", e)),
    }

    let state = AppState {
        profiles: Mutex::new(profiles),
        serial: Mutex::new(serial),
        templates: include_str!("../../src/data/templates.json").to_string(),
        suggestions: include_str!("../../src/data/suggestions.json").to_string(),
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
            commands::get_device_status,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // Background thread for serial polling
            std::thread::spawn(move || {
                let mut reconnect_timer = Instant::now();
                let mut ping_timer = Instant::now();

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
                                    debug_log("[Serial] Reconnected!");
                                    let _ = handle.emit("device-status", true);
                                }
                                Err(e) => {
                                    debug_log(&format!("[Serial] Reconnect failed: {}", e));
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
                        debug_log(&format!("[Serial] Raw line: {:?}", line));
                        let serial = state.serial.lock().unwrap();
                        if let Some(event) = serial.handle_line(&line) {
                            match event {
                                SerialEvent::Ready => {
                                    debug_log("[Serial] Device READY — sending LED colors");
                                    let profiles = state.profiles.lock().unwrap();
                                    let colors = profiles.get_all_key_colors();
                                    for (key, color) in &colors {
                                        serial.send_led(key, color);
                                    }
                                    let _ = handle.emit("device-status", true);
                                }
                                SerialEvent::KeyEvent(ke) => {
                                    let event_str = format!("{:?}", ke.event);
                                    debug_log(&format!("[Serial] Key event: {} {}", ke.key, event_str));
                                    let _ = handle.emit(
                                        "key-event",
                                        serde_json::json!({
                                            "key": ke.key,
                                            "event": event_str
                                        }),
                                    );

                                    // Execute action on PRESS
                                    if ke.event == KeyEventType::PRESS {
                                        let profiles = state.profiles.lock().unwrap();
                                        let action_opt = profiles.get_key_action(&ke.key).cloned();
                                        debug_log(&format!("[Action] Key {} action: {:?}", ke.key, action_opt.as_ref().map(|a| &a.action)));
                                        if let Some(action) = action_opt {
                                            let key = ke.key.clone();
                                            drop(profiles);
                                            drop(serial);

                                            match action.action {
                                                ActionType::App => {
                                                    if let Some(ActionTarget::App(ref target)) = action.target {
                                                        let switcher = AppSwitcher::new();
                                                        if let Err(e) = switcher.focus_or_launch(&target.process, &target.path) {
                                                            debug_log(&format!("[Action] App launch failed: {}", e));
                                                            let s = state.serial.lock().unwrap();
                                                            s.send_led(&key, "FF0000");
                                                            drop(s);
                                                            std::thread::sleep(Duration::from_millis(500));
                                                            let s = state.serial.lock().unwrap();
                                                            let p = state.profiles.lock().unwrap();
                                                            s.send_led(&key, &p.get_key_color(&key));
                                                        }
                                                    }
                                                }
                                                ActionType::Url => {
                                                    if let Some(ActionTarget::Url(ref url)) = action.target {
                                                        debug_log(&format!("[Action] Opening URL: {}", url));
                                                        let _ = open::that(url);
                                                    }
                                                }
                                                ActionType::ProfileCycle => {
                                                    let mut profiles = state.profiles.lock().unwrap();
                                                    profiles.cycle_profile();
                                                    let colors = profiles.get_all_key_colors();
                                                    let name = profiles.get_active_profile_name().to_string();
                                                    drop(profiles);
                                                    let serial = state.serial.lock().unwrap();
                                                    for (k, c) in &colors {
                                                        serial.send_led(k, c);
                                                    }
                                                    let _ = handle.emit("profile-changed", &name);
                                                    debug_log(&format!("[Action] Cycled to profile: {}", name));
                                                }
                                                ActionType::ProfileSet => {
                                                    if let Some(ActionTarget::Url(ref name)) = action.target {
                                                        let mut profiles = state.profiles.lock().unwrap();
                                                        profiles.switch_to_profile(name);
                                                        let colors = profiles.get_all_key_colors();
                                                        drop(profiles);
                                                        let serial = state.serial.lock().unwrap();
                                                        for (k, c) in &colors {
                                                            serial.send_led(k, c);
                                                        }
                                                        let _ = handle.emit("profile-changed", name);
                                                        debug_log(&format!("[Action] Switched to profile: {}", name));
                                                    }
                                                }
                                            }
                                            // Skip the rest of the loop iteration since we dropped serial
                                            continue;
                                        }
                                    }
                                }
                                SerialEvent::Pong => {}
                                SerialEvent::Connected | SerialEvent::Disconnected => {}
                            }
                        }
                    } else {
                        // Send periodic PING to keep connection alive
                        if ping_timer.elapsed() >= Duration::from_secs(5) {
                            ping_timer = Instant::now();
                            let serial = state.serial.lock().unwrap();
                            serial.send_ping();
                        }
                        std::thread::sleep(Duration::from_millis(10));
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running Keybow Companion");
}
