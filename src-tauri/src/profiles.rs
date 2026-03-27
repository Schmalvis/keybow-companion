use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use crate::types::{ActionType, KeyAction, Profile, ProfileConfig, ALL_KEYS};

pub struct ProfileEngine {
    config: ProfileConfig,
    config_path: PathBuf,
}

impl ProfileEngine {
    pub fn new(config: ProfileConfig, config_path: PathBuf) -> Self {
        Self { config, config_path }
    }

    pub fn load(config_path: PathBuf) -> Self {
        let config = if config_path.exists() {
            let data = fs::read_to_string(&config_path).unwrap_or_default();
            serde_json::from_str(&data).unwrap_or_else(|_| Self::default_config())
        } else {
            Self::default_config()
        };
        Self { config, config_path }
    }

    pub fn save(&self) -> Result<(), std::io::Error> {
        if let Some(parent) = self.config_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let data = serde_json::to_string_pretty(&self.config)?;
        fs::write(&self.config_path, data)?;
        Ok(())
    }

    pub fn get_config(&self) -> &ProfileConfig {
        &self.config
    }

    pub fn set_config(&mut self, config: ProfileConfig) {
        self.config = config;
    }

    pub fn get_active_profile(&self) -> &Profile {
        &self.config.profiles[&self.config.active_profile]
    }

    pub fn get_active_profile_name(&self) -> &str {
        &self.config.active_profile
    }

    pub fn get_key_action(&self, key: &str) -> Option<&KeyAction> {
        self.get_active_profile().keys.get(key)
    }

    pub fn get_key_color(&self, key: &str) -> String {
        self.get_key_action(key)
            .and_then(|a| a.active_color.clone())
            .unwrap_or_else(|| self.get_active_profile().default_color.clone())
    }

    pub fn cycle_profile(&mut self) {
        let order = &self.config.profile_order;
        let current_index = order.iter().position(|n| n == &self.config.active_profile).unwrap_or(0);
        let next_index = (current_index + 1) % order.len();
        self.config.active_profile = order[next_index].clone();
    }

    pub fn switch_to_profile(&mut self, name: &str) {
        if self.config.profiles.contains_key(name) {
            self.config.active_profile = name.to_string();
        }
    }

    pub fn get_auto_switch_profile(&self, process_name: &str) -> Option<&str> {
        self.config.auto_switch.get(process_name)
            .filter(|name| self.config.profiles.contains_key(name.as_str()))
            .map(|s| s.as_str())
    }

    pub fn get_all_key_colors(&self) -> HashMap<String, String> {
        let profile = self.get_active_profile();
        ALL_KEYS.iter().map(|&key| {
            let color = profile.keys.get(key)
                .and_then(|a| a.active_color.clone())
                .unwrap_or_else(|| profile.default_color.clone());
            (key.to_string(), color)
        }).collect()
    }

    fn default_config() -> ProfileConfig {
        let mut keys = HashMap::new();
        keys.insert("D4".to_string(), KeyAction {
            action: ActionType::ProfileCycle,
            target: None,
            label: "Next Profile".to_string(),
            press_color: None,
            active_color: Some("FF8800".to_string()),
        });

        let mut profiles = HashMap::new();
        profiles.insert("Default".to_string(), Profile {
            name: "Default".to_string(),
            icon: None,
            default_color: "004488".to_string(),
            keys,
        });

        ProfileConfig {
            version: 1,
            active_profile: "Default".to_string(),
            profile_switch_key: "D4".to_string(),
            profile_order: vec!["Default".to_string()],
            auto_switch: HashMap::new(),
            profiles,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::*;

    fn make_test_config() -> ProfileConfig {
        let mut work_keys = HashMap::new();
        work_keys.insert("A1".to_string(), KeyAction {
            action: ActionType::App,
            target: Some(ActionTarget::App(AppTarget {
                process: "slack.exe".to_string(),
                path: "C:\\slack.exe".to_string(),
            })),
            label: "Slack".to_string(),
            press_color: None,
            active_color: Some("4A154B".to_string()),
        });
        work_keys.insert("D4".to_string(), KeyAction {
            action: ActionType::ProfileCycle,
            target: None,
            label: "Next Profile".to_string(),
            press_color: None,
            active_color: Some("FF8800".to_string()),
        });

        let mut dev_keys = HashMap::new();
        dev_keys.insert("A1".to_string(), KeyAction {
            action: ActionType::App,
            target: Some(ActionTarget::App(AppTarget {
                process: "code.exe".to_string(),
                path: "C:\\code.exe".to_string(),
            })),
            label: "VS Code".to_string(),
            press_color: None,
            active_color: Some("007ACC".to_string()),
        });
        dev_keys.insert("D4".to_string(), KeyAction {
            action: ActionType::ProfileCycle,
            target: None,
            label: "Next Profile".to_string(),
            press_color: None,
            active_color: Some("FF8800".to_string()),
        });

        let mut profiles = HashMap::new();
        profiles.insert("Work".to_string(), Profile {
            name: "Work".to_string(),
            icon: None,
            default_color: "004488".to_string(),
            keys: work_keys,
        });
        profiles.insert("Dev".to_string(), Profile {
            name: "Dev".to_string(),
            icon: None,
            default_color: "008844".to_string(),
            keys: dev_keys,
        });

        let mut auto_switch = HashMap::new();
        auto_switch.insert("slack.exe".to_string(), "Work".to_string());

        ProfileConfig {
            version: 1,
            active_profile: "Work".to_string(),
            profile_switch_key: "D4".to_string(),
            profile_order: vec!["Work".to_string(), "Dev".to_string()],
            auto_switch,
            profiles,
        }
    }

    fn make_engine() -> ProfileEngine {
        ProfileEngine::new(make_test_config(), PathBuf::from("/tmp/test-profiles.json"))
    }

    #[test]
    fn returns_active_profile() {
        let engine = make_engine();
        assert_eq!(engine.get_active_profile().name, "Work");
    }

    #[test]
    fn returns_key_action() {
        let engine = make_engine();
        let action = engine.get_key_action("A1").unwrap();
        assert_eq!(action.label, "Slack");
    }

    #[test]
    fn returns_none_for_unconfigured_key() {
        let engine = make_engine();
        assert!(engine.get_key_action("C3").is_none());
    }

    #[test]
    fn cycles_to_next_profile() {
        let mut engine = make_engine();
        engine.cycle_profile();
        assert_eq!(engine.get_active_profile().name, "Dev");
    }

    #[test]
    fn cycles_back_to_first() {
        let mut engine = make_engine();
        engine.cycle_profile();
        engine.cycle_profile();
        assert_eq!(engine.get_active_profile().name, "Work");
    }

    #[test]
    fn switches_to_named_profile() {
        let mut engine = make_engine();
        engine.switch_to_profile("Dev");
        assert_eq!(engine.get_active_profile().name, "Dev");
    }

    #[test]
    fn ignores_nonexistent_profile() {
        let mut engine = make_engine();
        engine.switch_to_profile("Gaming");
        assert_eq!(engine.get_active_profile().name, "Work");
    }

    #[test]
    fn resolves_auto_switch() {
        let engine = make_engine();
        assert_eq!(engine.get_auto_switch_profile("slack.exe"), Some("Work"));
    }

    #[test]
    fn returns_none_for_unknown_process() {
        let engine = make_engine();
        assert_eq!(engine.get_auto_switch_profile("notepad.exe"), None);
    }

    #[test]
    fn returns_key_active_color() {
        let engine = make_engine();
        assert_eq!(engine.get_key_color("A1"), "4A154B");
    }

    #[test]
    fn falls_back_to_default_color() {
        let engine = make_engine();
        assert_eq!(engine.get_key_color("C3"), "004488");
    }

    #[test]
    fn saves_and_loads_config() {
        let dir = std::env::temp_dir().join("keybow-test");
        let path = dir.join("profiles.json");
        let _ = fs::remove_file(&path);

        let engine = ProfileEngine::new(make_test_config(), path.clone());
        engine.save().unwrap();

        let loaded = ProfileEngine::load(path.clone());
        assert_eq!(loaded.get_active_profile().name, "Work");
        assert_eq!(loaded.get_key_action("A1").unwrap().label, "Slack");

        let _ = fs::remove_file(&path);
        let _ = fs::remove_dir(&dir);
    }
}
