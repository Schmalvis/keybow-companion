use crate::types::{KeyEvent, KeyEventType};

const VALID_ROWS: [char; 4] = ['A', 'B', 'C', 'D'];
const VALID_COLS: [char; 4] = ['1', '2', '3', '4'];

pub fn is_valid_grid_key(key: &str) -> bool {
    if key.len() != 2 {
        return false;
    }
    let mut chars = key.chars();
    let row = chars.next().unwrap();
    let col = chars.next().unwrap();
    VALID_ROWS.contains(&row) && VALID_COLS.contains(&col)
}

pub fn parse_key_event(message: &str) -> Option<KeyEvent> {
    if !message.starts_with("KEY:") {
        return None;
    }
    let parts: Vec<&str> = message.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let key = parts[1];
    let event_str = parts[2];

    if !is_valid_grid_key(key) {
        return None;
    }

    let event = match event_str {
        "PRESS" => KeyEventType::PRESS,
        "RELEASE" => KeyEventType::RELEASE,
        "HOLD" => KeyEventType::HOLD,
        _ => return None,
    };

    Some(KeyEvent {
        key: key.to_string(),
        event,
    })
}

pub fn build_led_command(key: &str, color_or_off: &str) -> String {
    format!("LED:{}:{}\n", key, color_or_off)
}

pub fn build_led_all_command(color_or_off: &str) -> String {
    format!("LED:ALL:{}\n", color_or_off)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_press_event() {
        assert_eq!(
            parse_key_event("KEY:A1:PRESS"),
            Some(KeyEvent { key: "A1".to_string(), event: KeyEventType::PRESS })
        );
    }

    #[test]
    fn parses_release_event() {
        assert_eq!(
            parse_key_event("KEY:D4:RELEASE"),
            Some(KeyEvent { key: "D4".to_string(), event: KeyEventType::RELEASE })
        );
    }

    #[test]
    fn parses_hold_event() {
        assert_eq!(
            parse_key_event("KEY:B3:HOLD"),
            Some(KeyEvent { key: "B3".to_string(), event: KeyEventType::HOLD })
        );
    }

    #[test]
    fn returns_none_for_ready() {
        assert_eq!(parse_key_event("READY"), None);
    }

    #[test]
    fn returns_none_for_pong() {
        assert_eq!(parse_key_event("PONG"), None);
    }

    #[test]
    fn returns_none_for_malformed() {
        assert_eq!(parse_key_event("GARBAGE"), None);
        assert_eq!(parse_key_event("KEY:Z9:PRESS"), None);
        assert_eq!(parse_key_event("KEY:A1:JUMP"), None);
        assert_eq!(parse_key_event(""), None);
    }

    #[test]
    fn builds_led_command() {
        assert_eq!(build_led_command("A1", "FF5500"), "LED:A1:FF5500\n");
    }

    #[test]
    fn builds_led_off_command() {
        assert_eq!(build_led_command("A1", "OFF"), "LED:A1:OFF\n");
    }

    #[test]
    fn builds_led_all_command() {
        assert_eq!(build_led_all_command("000000"), "LED:ALL:000000\n");
    }

    #[test]
    fn builds_led_all_off_command() {
        assert_eq!(build_led_all_command("OFF"), "LED:ALL:OFF\n");
    }

    #[test]
    fn validates_grid_keys() {
        assert!(is_valid_grid_key("A1"));
        assert!(is_valid_grid_key("D4"));
        assert!(!is_valid_grid_key("Z9"));
        assert!(!is_valid_grid_key("A5"));
        assert!(!is_valid_grid_key(""));
    }
}
