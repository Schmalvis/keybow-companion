use std::sync::Mutex;
use tauri::State;
use crate::app_detector::{detect_installed_apps, DetectedApp};
use crate::profiles::ProfileEngine;
use crate::serial::SerialManager;
use crate::types::ProfileConfig;

pub struct AppState {
    pub profiles: Mutex<ProfileEngine>,
    pub serial: Mutex<SerialManager>,
    pub templates: String,
    pub suggestions: String,
}

#[tauri::command]
pub fn get_config(state: State<AppState>) -> Result<ProfileConfig, String> {
    let profiles = state.profiles.lock().map_err(|e| e.to_string())?;
    Ok(profiles.get_config().clone())
}

#[tauri::command]
pub fn save_config(config: ProfileConfig, state: State<AppState>) -> Result<bool, String> {
    let mut profiles = state.profiles.lock().map_err(|e| e.to_string())?;
    profiles.set_config(config);
    profiles.save().map_err(|e| e.to_string())?;
    let serial = state.serial.lock().map_err(|e| e.to_string())?;
    let colors = profiles.get_all_key_colors();
    for (key, color) in &colors {
        serial.send_led(key, color);
    }
    Ok(true)
}

#[tauri::command]
pub fn get_installed_apps() -> Result<Vec<DetectedApp>, String> {
    Ok(detect_installed_apps())
}

#[tauri::command]
pub fn browse_for_app() -> Result<Option<DetectedApp>, String> {
    // Will be wired with tauri dialog plugin later
    Ok(None)
}

#[tauri::command]
pub fn get_templates(state: State<AppState>) -> Result<serde_json::Value, String> {
    serde_json::from_str(&state.templates).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_suggestions(state: State<AppState>) -> Result<serde_json::Value, String> {
    serde_json::from_str(&state.suggestions).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn preview_led(key: String, color: String, state: State<AppState>) -> Result<(), String> {
    let serial = state.serial.lock().map_err(|e| e.to_string())?;
    serial.send_led(&key, &color);
    Ok(())
}
