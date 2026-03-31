use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use log::{error, info};

use crate::protocol::{build_led_all_command, build_led_command, parse_key_event};
use crate::types::KeyEvent;

pub enum SerialEvent {
    Connected,
    Disconnected,
    Ready,
    Pong,
    KeyEvent(KeyEvent),
}

pub struct SerialManager {
    port: Arc<Mutex<Option<Box<dyn serialport::SerialPort>>>>,
    running: Arc<AtomicBool>,
}

impl SerialManager {
    pub fn new() -> Self {
        Self {
            port: Arc::new(Mutex::new(None)),
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn auto_detect() -> Option<String> {
        let ports = serialport::available_ports().ok()?;
        info!(
            "[Serial] All ports: {:?}",
            ports.iter().map(|p| {
                let (vid, pid, mfr) = match &p.port_type {
                    serialport::SerialPortType::UsbPort(usb) => (
                        Some(usb.vid),
                        Some(usb.pid),
                        usb.manufacturer.clone(),
                    ),
                    _ => (None, None, None),
                };
                format!(
                    "{} VID:{:?} PID:{:?} MFR:{}",
                    p.port_name,
                    vid,
                    pid,
                    mfr.unwrap_or_default()
                )
            }).collect::<Vec<_>>()
        );

        // Primary: match by known Keybow/RP2040 vendor IDs
        let mut matches: Vec<&serialport::SerialPortInfo> = ports.iter().filter(|p| {
            if let serialport::SerialPortType::UsbPort(usb) = &p.port_type {
                usb.vid == 0x16D0 || usb.vid == 0x2E8A
            } else {
                false
            }
        }).collect();

        // Fallback: match by RP2040 product ID or manufacturer string
        if matches.is_empty() {
            matches = ports.iter().filter(|p| {
                if let serialport::SerialPortType::UsbPort(usb) = &p.port_type {
                    usb.pid == 0x000A
                        || usb.manufacturer.as_deref().map_or(false, |m| {
                            let lower = m.to_lowercase();
                            lower.contains("raspberry pi") || lower.contains("pimoroni")
                        })
                } else {
                    false
                }
            }).collect();
        }

        info!("[Serial] Matches: {:?}", matches.iter().map(|p| &p.port_name).collect::<Vec<_>>());

        // Pick the last (highest COM number) = data port
        matches.last().map(|p| p.port_name.clone())
    }

    pub fn connect(&self) -> Result<(), String> {
        let port_name = Self::auto_detect().ok_or("No Keybow found")?;
        info!("[Serial] Opening port: {}", port_name);

        let mut port = serialport::new(&port_name, 115_200)
            .timeout(Duration::from_millis(500))
            .open()
            .map_err(|e| format!("Failed to open {}: {}", port_name, e))?;

        // Set DTR (Data Terminal Ready) — required for some USB CDC serial devices
        let _ = port.write_data_terminal_ready(true);

        *self.port.lock().unwrap() = Some(port);
        self.running.store(true, Ordering::SeqCst);
        info!("[Serial] Port opened successfully");
        Ok(())
    }

    pub fn disconnect(&self) {
        self.running.store(false, Ordering::SeqCst);
        *self.port.lock().unwrap() = None;
        info!("[Serial] Disconnected");
    }

    pub fn is_connected(&self) -> bool {
        self.port.lock().unwrap().is_some() && self.running.load(Ordering::SeqCst)
    }

    pub fn send_led(&self, key: &str, color: &str) {
        let cmd = build_led_command(key, color);
        self.write_bytes(cmd.as_bytes());
    }

    pub fn send_led_all(&self, color: &str) {
        let cmd = build_led_all_command(color);
        self.write_bytes(cmd.as_bytes());
    }

    pub fn send_ping(&self) {
        self.write_bytes(b"PING\n");
    }

    /// Read a single line from the serial port (blocking up to the port timeout).
    /// Returns None if no data available or on timeout.
    pub fn read_line(&self) -> Option<String> {
        let mut port_guard = self.port.lock().unwrap();
        let port = port_guard.as_mut()?;

        let mut buf = [0u8; 1];
        let mut line = Vec::new();

        loop {
            match std::io::Read::read(port, &mut buf) {
                Ok(0) => break,
                Ok(_) => {
                    if buf[0] == b'\n' {
                        break;
                    }
                    line.push(buf[0]);
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => break,
                Err(_) => return None,
            }
        }

        if line.is_empty() {
            return None;
        }

        String::from_utf8(line).ok()
    }

    pub fn handle_line(&self, line: &str) -> Option<SerialEvent> {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            return None;
        }
        if trimmed == "READY" {
            return Some(SerialEvent::Ready);
        }
        if trimmed == "PONG" {
            return Some(SerialEvent::Pong);
        }
        if let Some(event) = parse_key_event(trimmed) {
            return Some(SerialEvent::KeyEvent(event));
        }
        None
    }

    fn write_bytes(&self, data: &[u8]) {
        if let Some(port) = self.port.lock().unwrap().as_mut() {
            if let Err(e) = port.write_all(data) {
                error!("[Serial] Write error: {}", e);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn handle_line_parses_key_event() {
        let mgr = SerialManager::new();
        match mgr.handle_line("KEY:A1:PRESS") {
            Some(SerialEvent::KeyEvent(e)) => {
                assert_eq!(e.key, "A1");
                assert_eq!(e.event, crate::types::KeyEventType::PRESS);
            }
            _ => panic!("Expected KeyEvent"),
        }
    }

    #[test]
    fn handle_line_parses_ready() {
        let mgr = SerialManager::new();
        assert!(matches!(mgr.handle_line("READY"), Some(SerialEvent::Ready)));
    }

    #[test]
    fn handle_line_parses_pong() {
        let mgr = SerialManager::new();
        assert!(matches!(mgr.handle_line("PONG"), Some(SerialEvent::Pong)));
    }

    #[test]
    fn handle_line_returns_none_for_garbage() {
        let mgr = SerialManager::new();
        assert!(mgr.handle_line("GARBAGE").is_none());
    }

    #[test]
    fn handle_line_returns_none_for_empty() {
        let mgr = SerialManager::new();
        assert!(mgr.handle_line("").is_none());
        assert!(mgr.handle_line("  ").is_none());
    }

    #[test]
    fn starts_disconnected() {
        let mgr = SerialManager::new();
        assert!(!mgr.is_connected());
    }

    #[test]
    fn auto_detect_does_not_panic() {
        // On machines without a Keybow, should return None not panic
        let _ = SerialManager::auto_detect();
    }
}
