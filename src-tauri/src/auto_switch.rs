use std::collections::HashMap;

use crate::app_switcher::AppSwitcher;

pub struct AutoSwitch {
    manual_override: bool,
    last_process: Option<String>,
}

impl AutoSwitch {
    pub fn new() -> Self {
        Self {
            manual_override: false,
            last_process: None,
        }
    }

    /// Poll the foreground window and return the profile name to switch to, if any.
    /// Returns None if manual override is active or no matching process is found.
    pub fn poll(&mut self, auto_switch_map: &HashMap<String, String>) -> Option<String> {
        if self.manual_override {
            return None;
        }

        let current_process = AppSwitcher::get_foreground_process()?;

        // Only trigger if process changed
        if self.last_process.as_deref() == Some(&current_process) {
            return None;
        }

        self.last_process = Some(current_process.clone());

        // Look up the process name (case-insensitive) in the auto-switch map
        let process_lower = current_process.to_lowercase();
        for (key, profile) in auto_switch_map {
            if key.to_lowercase() == process_lower {
                return Some(profile.clone());
            }
        }

        None
    }

    pub fn set_manual_override(&mut self, active: bool) {
        self.manual_override = active;
    }

    pub fn is_manual_override(&self) -> bool {
        self.manual_override
    }
}

impl Default for AutoSwitch {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manual_override_blocks_poll() {
        let mut auto_switch = AutoSwitch::new();
        auto_switch.set_manual_override(true);

        let mut map = HashMap::new();
        map.insert("explorer.exe".to_string(), "Default".to_string());

        // With manual override active, poll should always return None
        assert!(auto_switch.poll(&map).is_none());
        assert!(auto_switch.is_manual_override());
    }

    #[test]
    fn empty_map_returns_none() {
        let mut auto_switch = AutoSwitch::new();
        let map = HashMap::new();

        // Even if there's a foreground process, empty map means no match
        let _ = auto_switch.poll(&map);
        // Just checking it doesn't panic
    }

    #[test]
    fn set_and_clear_manual_override() {
        let mut auto_switch = AutoSwitch::new();
        assert!(!auto_switch.is_manual_override());

        auto_switch.set_manual_override(true);
        assert!(auto_switch.is_manual_override());

        auto_switch.set_manual_override(false);
        assert!(!auto_switch.is_manual_override());
    }
}
