use std::collections::HashMap;

use crate::app_switcher::AppSwitcher;
use crate::ipc_server::IpcServer;
use crate::profiles::ProfileEngine;
use crate::types::{ActionTarget, ActionType, KeyAction};

/// Execute a key action and return the updated LED colors if the profile changed.
pub fn execute_action(
    action: &KeyAction,
    app_switcher: &AppSwitcher,
    ipc_server: &IpcServer,
    profiles: &mut ProfileEngine,
) -> Result<Option<HashMap<String, String>>, String> {
    match action.action {
        ActionType::App => execute_app(action, app_switcher),
        ActionType::Url => execute_url(action, ipc_server),
        ActionType::ProfileCycle => execute_profile_cycle(profiles),
        ActionType::ProfileSet => execute_profile_set(action, profiles),
    }
}

fn execute_app(
    action: &KeyAction,
    app_switcher: &AppSwitcher,
) -> Result<Option<HashMap<String, String>>, String> {
    match &action.target {
        Some(ActionTarget::App(target)) => {
            app_switcher.focus_or_launch(&target.process, &target.path)?;
            Ok(None)
        }
        _ => Err("App action missing AppTarget".to_string()),
    }
}

fn execute_url(
    action: &KeyAction,
    ipc_server: &IpcServer,
) -> Result<Option<HashMap<String, String>>, String> {
    match &action.target {
        Some(ActionTarget::Url(url)) => {
            // Try to broadcast to connected browser extension first
            let msg = serde_json::json!({
                "type": "openUrl",
                "url": url
            });
            ipc_server.broadcast(&msg);

            // Fallback: open in default browser
            if let Err(e) = open::that(url) {
                log::warn!("Failed to open URL '{}': {}", url, e);
            }
            Ok(None)
        }
        _ => Err("Url action missing URL target".to_string()),
    }
}

fn execute_profile_cycle(
    profiles: &mut ProfileEngine,
) -> Result<Option<HashMap<String, String>>, String> {
    profiles.cycle_profile();
    Ok(Some(profiles.get_all_key_colors()))
}

fn execute_profile_set(
    action: &KeyAction,
    profiles: &mut ProfileEngine,
) -> Result<Option<HashMap<String, String>>, String> {
    // The target for ProfileSet is a Url variant containing the profile name
    match &action.target {
        Some(ActionTarget::Url(profile_name)) => {
            profiles.switch_to_profile(profile_name);
            Ok(Some(profiles.get_all_key_colors()))
        }
        _ => Err("ProfileSet action missing profile name target".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::*;
    use std::path::PathBuf;

    fn make_test_engine() -> ProfileEngine {
        let mut keys = HashMap::new();
        keys.insert(
            "A1".to_string(),
            KeyAction {
                action: ActionType::App,
                target: Some(ActionTarget::App(AppTarget {
                    process: "notepad.exe".to_string(),
                    path: "C:\\Windows\\notepad.exe".to_string(),
                })),
                label: "Notepad".to_string(),
                press_color: None,
                active_color: Some("FFFFFF".to_string()),
            },
        );
        keys.insert(
            "B1".to_string(),
            KeyAction {
                action: ActionType::Url,
                target: Some(ActionTarget::Url("https://example.com".to_string())),
                label: "Example".to_string(),
                press_color: None,
                active_color: Some("00FF00".to_string()),
            },
        );
        keys.insert(
            "D4".to_string(),
            KeyAction {
                action: ActionType::ProfileCycle,
                target: None,
                label: "Next Profile".to_string(),
                press_color: None,
                active_color: Some("FF8800".to_string()),
            },
        );

        let mut profiles = HashMap::new();
        profiles.insert(
            "Default".to_string(),
            Profile {
                name: "Default".to_string(),
                icon: None,
                default_color: "004488".to_string(),
                keys,
            },
        );
        profiles.insert(
            "Gaming".to_string(),
            Profile {
                name: "Gaming".to_string(),
                icon: None,
                default_color: "880000".to_string(),
                keys: HashMap::new(),
            },
        );

        let config = ProfileConfig {
            version: 1,
            active_profile: "Default".to_string(),
            profile_switch_key: "D4".to_string(),
            profile_order: vec!["Default".to_string(), "Gaming".to_string()],
            auto_switch: HashMap::new(),
            profiles,
        };

        ProfileEngine::new(config, PathBuf::from("/tmp/test-action-profiles.json"))
    }

    #[test]
    fn profile_cycle_returns_colors() {
        let mut engine = make_test_engine();
        let ipc = IpcServer::new();
        let switcher = AppSwitcher::new();

        let action = KeyAction {
            action: ActionType::ProfileCycle,
            target: None,
            label: "Next".to_string(),
            press_color: None,
            active_color: None,
        };

        let result = execute_action(&action, &switcher, &ipc, &mut engine);
        assert!(result.is_ok());
        let colors = result.unwrap();
        assert!(colors.is_some());
        // After cycling, should be on "Gaming" profile
        assert_eq!(engine.get_active_profile_name(), "Gaming");
    }

    #[test]
    fn url_action_does_not_error() {
        let mut engine = make_test_engine();
        let ipc = IpcServer::new();
        let switcher = AppSwitcher::new();

        let action = KeyAction {
            action: ActionType::Url,
            target: Some(ActionTarget::Url("https://example.com".to_string())),
            label: "Test".to_string(),
            press_color: None,
            active_color: None,
        };

        let result = execute_action(&action, &switcher, &ipc, &mut engine);
        assert!(result.is_ok());
        assert!(result.unwrap().is_none()); // URL actions don't change profile
    }

    #[test]
    fn app_action_missing_target_returns_error() {
        let mut engine = make_test_engine();
        let ipc = IpcServer::new();
        let switcher = AppSwitcher::new();

        let action = KeyAction {
            action: ActionType::App,
            target: None,
            label: "Bad".to_string(),
            press_color: None,
            active_color: None,
        };

        let result = execute_action(&action, &switcher, &ipc, &mut engine);
        assert!(result.is_err());
    }
}
