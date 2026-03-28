use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const ALL_KEYS: [&str; 16] = [
    "A1", "A2", "A3", "A4",
    "B1", "B2", "B3", "B4",
    "C1", "C2", "C3", "C4",
    "D1", "D2", "D3", "D4",
];

pub type GridKey = String;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum KeyEventType {
    PRESS,
    RELEASE,
    HOLD,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct KeyEvent {
    pub key: GridKey,
    pub event: KeyEventType,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ActionTarget {
    Url(String),
    App(AppTarget),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AppTarget {
    pub process: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ActionType {
    #[serde(rename = "app")]
    App,
    #[serde(rename = "url")]
    Url,
    #[serde(rename = "profile_cycle")]
    ProfileCycle,
    #[serde(rename = "profile_set")]
    ProfileSet,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyAction {
    pub action: ActionType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<ActionTarget>,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none", rename = "pressColor")]
    pub press_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "activeColor")]
    pub active_color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(rename = "defaultColor")]
    pub default_color: String,
    pub keys: HashMap<GridKey, KeyAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileConfig {
    pub version: u32,
    #[serde(rename = "activeProfile")]
    pub active_profile: String,
    #[serde(rename = "profileSwitchKey")]
    pub profile_switch_key: GridKey,
    #[serde(rename = "profileOrder")]
    pub profile_order: Vec<String>,
    #[serde(rename = "autoSwitch")]
    pub auto_switch: HashMap<String, String>,
    pub profiles: HashMap<String, Profile>,
}
