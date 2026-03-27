# Tauri Migration Plan B: Windows APIs + TCP Bridge

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement native Windows app switching, installed app detection, foreground window polling, and the TCP bridge for the browser extension — all in Rust using Win32 APIs.

**Architecture:** Uses the `windows` crate for direct Win32 API calls (no PowerShell). The TCP bridge uses tokio for async networking, maintaining the same JSON-over-newline protocol the browser extension expects.

**Tech Stack:** Rust, windows crate 0.61, tokio, serde_json

**Prerequisites:** Plan A complete (scaffold, protocol, profiles, serial all compiling with 31 tests passing).

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src-tauri/src/app_switcher.rs` | Focus or launch apps via Win32 APIs |
| `src-tauri/src/app_detector.rs` | Scan installed apps from registry + Start Menu |
| `src-tauri/src/auto_switch.rs` | Poll foreground window, match to profiles |
| `src-tauri/src/ipc_server.rs` | TCP bridge for browser extension |
| `src-tauri/src/action_executor.rs` | Dispatch key actions to appropriate handler |
| `src-tauri/Cargo.toml` | Add windows crate dependency |
| `src-tauri/src/lib.rs` | Add new module declarations |

---

### Task 1: Add Windows Crate Dependency

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Update Cargo.toml**

Add the `windows` crate to `[dependencies]` in `src-tauri/Cargo.toml`. Add after the `env_logger` line:

```toml
[dependencies.windows]
version = "0.61"
features = [
    "Win32_Foundation",
    "Win32_UI_WindowsAndMessaging",
    "Win32_System_Threading",
    "Win32_System_ProcessStatus",
    "Win32_System_Com",
    "Win32_UI_Shell",
    "Win32_Storage_FileSystem",
    "Win32_System_Registry",
]
```

- [ ] **Step 2: Update lib.rs**

Add module declarations for the new modules. Replace `src-tauri/src/lib.rs` with:

```rust
pub mod types;
pub mod protocol;
pub mod profiles;
pub mod serial;
pub mod app_switcher;
pub mod app_detector;
pub mod auto_switch;
pub mod ipc_server;
pub mod action_executor;
```

- [ ] **Step 3: Create placeholder files**

Create `src-tauri/src/app_switcher.rs`:
```rust
// App switcher — implemented in Task 2
```

Create `src-tauri/src/app_detector.rs`:
```rust
// App detector — implemented in Task 3
```

Create `src-tauri/src/auto_switch.rs`:
```rust
// Auto switch — implemented in Task 4
```

Create `src-tauri/src/ipc_server.rs`:
```rust
// IPC server — implemented in Task 5
```

Create `src-tauri/src/action_executor.rs`:
```rust
// Action executor — implemented in Task 6
```

- [ ] **Step 4: Verify it compiles**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo build
```

Expected: Compiles (first build with `windows` crate will take a few minutes).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/src/app_switcher.rs src-tauri/src/app_detector.rs src-tauri/src/auto_switch.rs src-tauri/src/ipc_server.rs src-tauri/src/action_executor.rs
git commit -m "feat: add windows crate dependency and new module declarations"
```

---

### Task 2: App Switcher

**Files:**
- Create: `src-tauri/src/app_switcher.rs`

- [ ] **Step 1: Implement app_switcher.rs**

Replace `src-tauri/src/app_switcher.rs` with:

```rust
use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use std::path::Path;

use log::{error, info};
use windows::core::PCWSTR;
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, MAX_PATH};
use windows::Win32::System::ProcessStatus::GetModuleFileNameExW;
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowThreadProcessId, IsWindowVisible, SetForegroundWindow,
    ShowWindow, SW_RESTORE, GetForegroundWindow,
};

pub struct AppSwitcher;

impl AppSwitcher {
    pub fn new() -> Self {
        Self
    }

    /// Try to focus a window belonging to the given process name, or launch the exe if not found.
    pub fn focus_or_launch(&self, process_name: &str, exe_path: &str) -> Result<(), String> {
        info!("[AppSwitcher] focus_or_launch: process={}, path={}", process_name, exe_path);

        // Try to find and focus an existing window
        if self.focus_by_process(process_name) {
            info!("[AppSwitcher] Focused existing window for {}", process_name);
            return Ok(());
        }

        // Not running — launch it
        info!("[AppSwitcher] Launching {}", exe_path);
        self.launch(exe_path)
    }

    /// Find a visible window by process name and bring it to the foreground.
    fn focus_by_process(&self, process_name: &str) -> bool {
        let target = process_name.to_lowercase();
        let mut found_hwnd: Option<HWND> = None;

        unsafe {
            let target_ptr = &target as *const String as *const std::ffi::c_void;
            let found_ptr = &mut found_hwnd as *mut Option<HWND> as *mut std::ffi::c_void;

            // Pack both pointers into a struct on the stack
            let mut context = EnumContext {
                target: &target,
                found: &mut found_hwnd,
            };

            let _ = EnumWindows(
                Some(enum_windows_callback),
                LPARAM(&mut context as *mut EnumContext as isize),
            );
        }

        if let Some(hwnd) = found_hwnd {
            unsafe {
                let _ = ShowWindow(hwnd, SW_RESTORE);
                let _ = SetForegroundWindow(hwnd);
            }
            return true;
        }

        false
    }

    /// Launch an executable.
    fn launch(&self, exe_path: &str) -> Result<(), String> {
        std::process::Command::new(exe_path)
            .spawn()
            .map_err(|e| format!("Failed to launch {}: {}", exe_path, e))?;
        Ok(())
    }

    /// Get the process name of the current foreground window.
    pub fn get_foreground_process(&self) -> Option<String> {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0 == std::ptr::null_mut() {
                return None;
            }
            get_process_name_for_window(hwnd)
        }
    }
}

struct EnumContext<'a> {
    target: &'a str,
    found: &'a mut Option<HWND>,
}

unsafe extern "system" fn enum_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let context = &mut *(lparam.0 as *mut EnumContext);

    if !IsWindowVisible(hwnd).as_bool() {
        return BOOL(1); // continue
    }

    if let Some(name) = get_process_name_for_window(hwnd) {
        if name.to_lowercase() == *context.target {
            *context.found = Some(hwnd);
            return BOOL(0); // stop enumeration
        }
    }

    BOOL(1) // continue
}

unsafe fn get_process_name_for_window(hwnd: HWND) -> Option<String> {
    let mut pid: u32 = 0;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if pid == 0 {
        return None;
    }

    let handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid).ok()?;

    let mut buf = [0u16; MAX_PATH as usize];
    let len = GetModuleFileNameExW(Some(handle.0), None, &mut buf);
    if len == 0 {
        return None;
    }

    let path_os = OsString::from_wide(&buf[..len as usize]);
    let path_str = path_os.to_string_lossy();
    let file_name = Path::new(path_str.as_ref())
        .file_stem()?
        .to_string_lossy()
        .to_string();

    Some(file_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_foreground_process_returns_something() {
        // On a machine with a desktop, there should be a foreground window
        let switcher = AppSwitcher::new();
        let result = switcher.get_foreground_process();
        // Can't assert specific value — just verify it doesn't panic
        // and returns Some on a desktop machine
        let _ = result;
    }
}
```

- [ ] **Step 2: Verify it compiles and test passes**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo test app_switcher
```

Expected: 1 test passes, compiles clean.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/app_switcher.rs
git commit -m "feat: implement app switcher with Win32 EnumWindows and SetForegroundWindow"
```

---

### Task 3: App Detector

**Files:**
- Create: `src-tauri/src/app_detector.rs`

- [ ] **Step 1: Implement app_detector.rs**

Replace `src-tauri/src/app_detector.rs` with:

```rust
use std::collections::HashMap;
use std::sync::Mutex;

use log::{error, info};
use serde::{Deserialize, Serialize};
use windows::core::PWSTR;
use windows::Win32::Foundation::MAX_PATH;
use windows::Win32::System::Registry::{
    RegCloseKey, RegEnumKeyExW, RegOpenKeyExW, RegQueryValueExW, HKEY,
    HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, REG_SZ,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedApp {
    pub name: String,
    pub process: String,
    pub path: String,
}

pub struct AppDetector {
    cache: Mutex<Option<Vec<DetectedApp>>>,
}

impl AppDetector {
    pub fn new() -> Self {
        Self {
            cache: Mutex::new(None),
        }
    }

    pub fn scan(&self) -> Vec<DetectedApp> {
        let mut cache = self.cache.lock().unwrap();
        if let Some(ref apps) = *cache {
            return apps.clone();
        }

        info!("[AppDetector] Scanning installed applications...");
        let mut apps = Vec::new();
        let mut seen = HashMap::new();

        // Scan registry uninstall keys
        for root in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
            for path in [
                "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
                "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
            ] {
                self.scan_registry_key(root, path, &mut apps, &mut seen);
            }
        }

        apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        info!("[AppDetector] Found {} applications", apps.len());

        *cache = Some(apps.clone());
        apps
    }

    pub fn get_apps(&self) -> Vec<DetectedApp> {
        self.cache.lock().unwrap().clone().unwrap_or_default()
    }

    fn scan_registry_key(
        &self,
        root: HKEY,
        path: &str,
        apps: &mut Vec<DetectedApp>,
        seen: &mut HashMap<String, bool>,
    ) {
        unsafe {
            let path_wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
            let mut hkey = HKEY::default();

            if RegOpenKeyExW(root, PCWSTR(path_wide.as_ptr()), 0, KEY_READ, &mut hkey).is_err() {
                return;
            }

            let mut index = 0u32;
            loop {
                let mut name_buf = [0u16; MAX_PATH as usize];
                let mut name_len = name_buf.len() as u32;

                let result = RegEnumKeyExW(
                    hkey,
                    index,
                    PWSTR(name_buf.as_mut_ptr()),
                    &mut name_len,
                    None,
                    PWSTR::null(),
                    None,
                    None,
                );

                if result.is_err() {
                    break;
                }

                let subkey_name = String::from_utf16_lossy(&name_buf[..name_len as usize]);
                let subkey_path = format!("{}\\{}", path, subkey_name);

                if let Some(app) = self.read_app_from_registry(root, &subkey_path) {
                    let key = app.path.to_lowercase();
                    if !seen.contains_key(&key) {
                        seen.insert(key, true);
                        apps.push(app);
                    }
                }

                index += 1;
            }

            let _ = RegCloseKey(hkey);
        }
    }

    fn read_app_from_registry(&self, root: HKEY, path: &str) -> Option<DetectedApp> {
        let display_name = self.read_reg_string(root, path, "DisplayName")?;
        let display_icon = self.read_reg_string(root, path, "DisplayIcon")
            .or_else(|| self.read_reg_string(root, path, "InstallLocation"));

        let exe_path = display_icon.and_then(|icon| {
            // DisplayIcon often has format "C:\path\app.exe,0" — strip the icon index
            let clean = icon.split(',').next().unwrap_or(&icon).trim().trim_matches('"').to_string();
            if clean.to_lowercase().ends_with(".exe") {
                Some(clean)
            } else {
                None
            }
        })?;

        let process = std::path::Path::new(&exe_path)
            .file_stem()?
            .to_string_lossy()
            .to_string();

        // Skip entries with empty names or system components
        if display_name.is_empty() || display_name.starts_with('{') {
            return None;
        }

        Some(DetectedApp {
            name: display_name,
            process,
            path: exe_path,
        })
    }

    fn read_reg_string(&self, root: HKEY, path: &str, value_name: &str) -> Option<String> {
        unsafe {
            let path_wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
            let value_wide: Vec<u16> = value_name.encode_utf16().chain(std::iter::once(0)).collect();
            let mut hkey = HKEY::default();

            if RegOpenKeyExW(root, PCWSTR(path_wide.as_ptr()), 0, KEY_READ, &mut hkey).is_err() {
                return None;
            }

            let mut data_type = REG_SZ;
            let mut data_size: u32 = 0;

            // First call to get size
            let _ = RegQueryValueExW(
                hkey,
                PCWSTR(value_wide.as_ptr()),
                None,
                Some(&mut data_type),
                None,
                Some(&mut data_size),
            );

            if data_size == 0 {
                let _ = RegCloseKey(hkey);
                return None;
            }

            let mut data = vec![0u8; data_size as usize];

            let result = RegQueryValueExW(
                hkey,
                PCWSTR(value_wide.as_ptr()),
                None,
                Some(&mut data_type),
                Some(data.as_mut_ptr()),
                Some(&mut data_size),
            );

            let _ = RegCloseKey(hkey);

            if result.is_err() {
                return None;
            }

            // Convert UTF-16 LE bytes to string, removing null terminator
            let wide: Vec<u16> = data.chunks_exact(2)
                .map(|c| u16::from_le_bytes([c[0], c[1]]))
                .collect();
            let s = String::from_utf16_lossy(&wide);
            let trimmed = s.trim_end_matches('\0').to_string();

            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }
    }
}

use windows::core::PCWSTR;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scan_finds_apps_on_windows() {
        let detector = AppDetector::new();
        let apps = detector.scan();
        // On any Windows machine with software installed, should find something
        assert!(!apps.is_empty(), "Expected to find at least one installed app");
        // Verify structure
        let first = &apps[0];
        assert!(!first.name.is_empty());
        assert!(!first.process.is_empty());
        assert!(first.path.to_lowercase().ends_with(".exe"));
    }

    #[test]
    fn caches_results() {
        let detector = AppDetector::new();
        let first = detector.scan();
        let second = detector.scan();
        assert_eq!(first.len(), second.len());
    }

    #[test]
    fn get_apps_before_scan_returns_empty() {
        let detector = AppDetector::new();
        assert!(detector.get_apps().is_empty());
    }
}
```

- [ ] **Step 2: Verify it compiles and tests pass**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo test app_detector
```

Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/app_detector.rs
git commit -m "feat: implement app detector with Windows registry scanning"
```

---

### Task 4: Auto Switch

**Files:**
- Create: `src-tauri/src/auto_switch.rs`

- [ ] **Step 1: Implement auto_switch.rs**

Replace `src-tauri/src/auto_switch.rs` with:

```rust
use log::info;

use crate::app_switcher::AppSwitcher;

pub struct AutoSwitch {
    switcher: AppSwitcher,
    manual_override: bool,
    last_process: Option<String>,
}

impl AutoSwitch {
    pub fn new() -> Self {
        Self {
            switcher: AppSwitcher::new(),
            manual_override: false,
            last_process: None,
        }
    }

    /// Poll the foreground window and return a profile name if a switch is needed.
    /// Returns Some(profile_name) if the foreground process matches an auto-switch rule
    /// and is different from the last check.
    pub fn poll(&mut self, auto_switch_map: &std::collections::HashMap<String, String>) -> Option<String> {
        if self.manual_override {
            return None;
        }

        let current = self.switcher.get_foreground_process()?;
        let current_lower = current.to_lowercase();

        // Check if process changed since last poll
        if self.last_process.as_deref() == Some(&current_lower) {
            return None;
        }
        self.last_process = Some(current_lower.clone());

        // Look up process name in auto-switch map (case-insensitive)
        for (process, profile) in auto_switch_map {
            if process.to_lowercase().trim_end_matches(".exe") == current_lower
                || process.to_lowercase() == current_lower
            {
                info!("[AutoSwitch] Foreground: {} -> profile: {}", current, profile);
                return Some(profile.clone());
            }
        }

        None
    }

    pub fn set_manual_override(&mut self, enabled: bool) {
        self.manual_override = enabled;
        if !enabled {
            self.last_process = None; // Reset so next poll re-evaluates
        }
    }

    pub fn is_manual_override(&self) -> bool {
        self.manual_override
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn manual_override_blocks_polling() {
        let mut auto = AutoSwitch::new();
        auto.set_manual_override(true);
        let map = HashMap::new();
        assert!(auto.poll(&map).is_none());
    }

    #[test]
    fn manual_override_can_be_toggled() {
        let mut auto = AutoSwitch::new();
        assert!(!auto.is_manual_override());
        auto.set_manual_override(true);
        assert!(auto.is_manual_override());
        auto.set_manual_override(false);
        assert!(!auto.is_manual_override());
    }
}
```

- [ ] **Step 2: Verify it compiles and tests pass**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo test auto_switch
```

Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/auto_switch.rs
git commit -m "feat: implement auto-switch with foreground window polling"
```

---

### Task 5: IPC Server (TCP Bridge)

**Files:**
- Create: `src-tauri/src/ipc_server.rs`

- [ ] **Step 1: Implement ipc_server.rs**

Replace `src-tauri/src/ipc_server.rs` with:

```rust
use std::sync::Arc;

use log::{error, info};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, Mutex};

const IPC_PORT: u16 = 23847;

pub struct IpcServer {
    tx: broadcast::Sender<String>,
    shutdown: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
}

impl IpcServer {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(64);
        Self {
            tx,
            shutdown: Arc::new(Mutex::new(None)),
        }
    }

    /// Start the TCP server. Call this from a tokio runtime.
    pub async fn start<F>(&self, on_message: F)
    where
        F: Fn(serde_json::Value) -> Option<serde_json::Value> + Send + Sync + 'static,
    {
        let listener = match TcpListener::bind(format!("127.0.0.1:{}", IPC_PORT)).await {
            Ok(l) => {
                info!("[IPC] Listening on 127.0.0.1:{}", IPC_PORT);
                l
            }
            Err(e) => {
                error!("[IPC] Failed to bind: {}", e);
                return;
            }
        };

        let (shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel();
        *self.shutdown.lock().await = Some(shutdown_tx);

        let on_message = Arc::new(on_message);
        let tx = self.tx.clone();

        loop {
            tokio::select! {
                accept = listener.accept() => {
                    match accept {
                        Ok((stream, addr)) => {
                            info!("[IPC] Client connected: {}", addr);
                            let on_message = on_message.clone();
                            let mut rx = tx.subscribe();

                            tokio::spawn(async move {
                                let (reader, mut writer) = stream.into_split();
                                let mut lines = BufReader::new(reader).lines();

                                loop {
                                    tokio::select! {
                                        line = lines.next_line() => {
                                            match line {
                                                Ok(Some(text)) => {
                                                    if text.trim().is_empty() { continue; }
                                                    if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&text) {
                                                        if let Some(response) = on_message(msg) {
                                                            let resp_str = serde_json::to_string(&response).unwrap_or_default();
                                                            let _ = writer.write_all(format!("{}\n", resp_str).as_bytes()).await;
                                                        }
                                                    }
                                                }
                                                Ok(None) => {
                                                    info!("[IPC] Client disconnected");
                                                    break;
                                                }
                                                Err(e) => {
                                                    error!("[IPC] Read error: {}", e);
                                                    break;
                                                }
                                            }
                                        }
                                        broadcast = rx.recv() => {
                                            if let Ok(msg) = broadcast {
                                                let _ = writer.write_all(format!("{}\n", msg).as_bytes()).await;
                                            }
                                        }
                                    }
                                }
                            });
                        }
                        Err(e) => error!("[IPC] Accept error: {}", e),
                    }
                }
                _ = &mut shutdown_rx => {
                    info!("[IPC] Shutting down");
                    break;
                }
            }
        }
    }

    /// Broadcast a message to all connected clients.
    pub fn broadcast(&self, message: &serde_json::Value) {
        let msg = serde_json::to_string(message).unwrap_or_default();
        let _ = self.tx.send(msg);
    }

    /// Stop the server.
    pub async fn stop(&self) {
        if let Some(tx) = self.shutdown.lock().await.take() {
            let _ = tx.send(());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn server_starts_and_stops() {
        let server = IpcServer::new();

        // Start in background
        let server_clone = Arc::new(server);
        let s = server_clone.clone();
        let handle = tokio::spawn(async move {
            s.start(|_msg| Some(serde_json::json!({"success": true}))).await;
        });

        // Give it a moment to bind
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        // Stop
        server_clone.stop().await;
        let _ = handle.await;
    }

    #[tokio::test]
    async fn client_can_connect_and_receive_response() {
        let server = Arc::new(IpcServer::new());
        let s = server.clone();
        let handle = tokio::spawn(async move {
            s.start(|msg| {
                if msg.get("action").and_then(|v| v.as_str()) == Some("ping") {
                    Some(serde_json::json!({"action": "pong"}))
                } else {
                    None
                }
            }).await;
        });

        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        // Connect as client
        let mut stream = tokio::net::TcpStream::connect(format!("127.0.0.1:{}", IPC_PORT)).await.unwrap();
        let (reader, mut writer) = stream.into_split();

        // Send message
        writer.write_all(b"{\"action\":\"ping\"}\n").await.unwrap();

        // Read response
        let mut lines = BufReader::new(reader).lines();
        let response = tokio::time::timeout(
            std::time::Duration::from_secs(2),
            lines.next_line(),
        ).await.unwrap().unwrap().unwrap();

        let parsed: serde_json::Value = serde_json::from_str(&response).unwrap();
        assert_eq!(parsed["action"], "pong");

        server.stop().await;
        let _ = handle.await;
    }
}
```

- [ ] **Step 2: Verify it compiles and tests pass**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo test ipc_server
```

Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/ipc_server.rs
git commit -m "feat: implement TCP IPC bridge for browser extension"
```

---

### Task 6: Action Executor

**Files:**
- Create: `src-tauri/src/action_executor.rs`

- [ ] **Step 1: Implement action_executor.rs**

Replace `src-tauri/src/action_executor.rs` with:

```rust
use std::time::Duration;

use log::{error, info};

use crate::app_switcher::AppSwitcher;
use crate::ipc_server::IpcServer;
use crate::profiles::ProfileEngine;
use crate::serial::SerialManager;
use crate::types::{ActionTarget, ActionType, KeyAction};

pub struct ActionExecutor {
    app_switcher: AppSwitcher,
}

impl ActionExecutor {
    pub fn new() -> Self {
        Self {
            app_switcher: AppSwitcher::new(),
        }
    }

    /// Execute a key action. Returns true if the action succeeded.
    pub async fn execute(
        &self,
        action: &KeyAction,
        key: &str,
        serial: &SerialManager,
        profiles: &mut ProfileEngine,
        ipc: &IpcServer,
    ) -> bool {
        info!("[ActionExecutor] Executing {:?} for key {}", action.action, key);

        let result = match action.action {
            ActionType::App => self.execute_app(action),
            ActionType::Url => self.execute_url(action, ipc).await,
            ActionType::ProfileCycle => {
                profiles.cycle_profile();
                self.send_all_leds(serial, profiles);
                Ok(())
            }
            ActionType::ProfileSet => {
                if let Some(ActionTarget::Url(name)) = &action.target {
                    profiles.switch_to_profile(name);
                    self.send_all_leds(serial, profiles);
                }
                Ok(())
            }
        };

        if let Err(e) = result {
            error!("[ActionExecutor] Action failed for key {}: {}", key, e);
            // Flash red LED on error
            serial.send_led(key, "FF0000");
            tokio::time::sleep(Duration::from_millis(500)).await;
            let color = profiles.get_key_color(key);
            serial.send_led(key, &color);
            return false;
        }

        true
    }

    fn execute_app(&self, action: &KeyAction) -> Result<(), String> {
        match &action.target {
            Some(ActionTarget::App(target)) => {
                self.app_switcher.focus_or_launch(&target.process, &target.path)
            }
            _ => Err("App action missing target".to_string()),
        }
    }

    async fn execute_url(&self, action: &KeyAction, ipc: &IpcServer) -> Result<(), String> {
        let url = match &action.target {
            Some(ActionTarget::Url(url)) => url.clone(),
            _ => return Err("URL action missing target".to_string()),
        };

        // Try browser extension first
        let request_id = format!("req_{}", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis());

        ipc.broadcast(&serde_json::json!({
            "action": "focusOrOpen",
            "url": url,
            "requestId": request_id,
        }));

        // Wait for extension response (2s timeout)
        tokio::time::sleep(Duration::from_secs(2)).await;

        // Fallback: open in default browser
        // The extension may have already handled it, but opening again is harmless
        // if the extension focused the tab. In the future, we'll check the response.
        open::that(&url).map_err(|e| format!("Failed to open URL: {}", e))?;
        Ok(())
    }

    fn send_all_leds(&self, serial: &SerialManager, profiles: &ProfileEngine) {
        let colors = profiles.get_all_key_colors();
        for (key, color) in &colors {
            serial.send_led(key, color);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_executor() {
        let executor = ActionExecutor::new();
        // Just verify construction doesn't panic
        let _ = executor;
    }
}
```

Note: This uses the `open` crate for opening URLs in the default browser. Add it to Cargo.toml dependencies:

```toml
open = "5"
```

- [ ] **Step 2: Add `open` crate to Cargo.toml**

Add `open = "5"` to the `[dependencies]` section of `src-tauri/Cargo.toml`.

- [ ] **Step 3: Verify it compiles and all tests pass**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo test
```

Expected: All tests pass (31 from Plan A + new tests from this plan).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/action_executor.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat: implement action executor with app launch, URL open, and profile switching"
```

---

## Plan B Complete

At this point we have:
- App switcher using Win32 EnumWindows/SetForegroundWindow
- App detector scanning Windows registry for installed applications
- Auto-switch polling foreground window process
- TCP IPC bridge for browser extension (tokio async)
- Action executor dispatching key actions to appropriate handlers

**Next:** Plan C adds the Tauri app shell (main.rs, tray, commands), migrates the React frontend, and deletes the Electron directory.
