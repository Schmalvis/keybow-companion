# System Tray + Browser Extension Distribution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a system tray so the app persists when the window is closed, and bundle + auto-register the Chrome extension with a guided in-app setup flow.

**Architecture:** The tray lives entirely in Rust (`main.rs`), intercepting close events and building a dynamic context menu. The extension distribution uses a new `native-host` Rust binary bundled as a Tauri resource; a new `extension_setup` module runs on first launch to copy files and write the Chrome native messaging registry key. The in-app banner reads an `extension-status` event emitted by `ipc_server` when clients connect/disconnect.

**Tech Stack:** Tauri 2 (tray-icon feature already enabled), windows crate (registry already featured), Vitest + @testing-library/react (to be added for React tests).

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src-tauri/Cargo.toml` | Modify | Add `[[bin]]` for native-host |
| `src-tauri/tauri.conf.json` | Modify | Add bundle resources |
| `src-tauri/src/main.rs` | Modify | Tray setup, close-to-tray, wire extension events |
| `src-tauri/src/commands.rs` | Modify | Add `tray_status_item` + `extension_connected` to AppState; add `get_extension_status` command |
| `src-tauri/src/ipc_server.rs` | Modify | Add `on_client_change` callback to `start()` |
| `src-tauri/src/extension_setup.rs` | Create | First-launch setup: copy files, write registry key |
| `src-tauri/src/lib.rs` | Modify | `pub mod extension_setup` |
| `src-tauri/src/native_host/main.rs` | Create | Standalone binary: Chrome native messaging ↔ TCP bridge |
| `extension/manifest.json` | Modify | Add `key` field for stable ID |
| `extension/native-messaging.json` | Modify | Update `allowed_origins`, set `NATIVE_HOST_PATH` placeholder |
| `src/api.ts` | Modify | Add `getExtensionStatus`, `onExtensionStatus` |
| `src/components/ExtensionSetupModal.tsx` | Create | Step-by-step setup guide modal |
| `src/components/ExtensionSetupModal.css` | Create | Modal styles |
| `src/app.tsx` | Modify | Extension status banner |
| `package.json` | Modify | Add test script |
| `vitest.config.ts` | Create | Vitest config |

---

## Task 1: Add Vitest to the React project

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install test dependencies**

```bash
npm install --save-dev vitest @testing-library/react @testing-library/user-event @vitejs/plugin-react jsdom @types/testing-library__user-event
```

Expected: packages added to `node_modules`, `package.json` devDependencies updated.

- [ ] **Step 2: Create vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
});
```

- [ ] **Step 3: Add test script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run"
```

- [ ] **Step 4: Verify setup with a smoke test**

Create `src/components/ExtensionSetupModal.test.tsx` (placeholder — we'll fill it in Task 12):

```typescript
import { describe, it, expect } from 'vitest';

describe('test setup', () => {
  it('vitest is working', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: `1 passed`

- [ ] **Step 5: Commit**

```bash
git add package.json vitest.config.ts src/components/ExtensionSetupModal.test.tsx
git commit -m "chore: add vitest + testing-library for React tests"
```

---

## Task 2: Close-to-tray window behavior

**Files:**
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Add close-to-tray handler**

In `main.rs`, add `.on_window_event()` to the `tauri::Builder` chain, just before `.run()`:

```rust
.on_window_event(|window, event| {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        window.hide().unwrap();
        api.prevent_close();
    }
})
.run(tauri::generate_context!())
```

- [ ] **Step 2: Build and verify**

```bash
cd src-tauri && cargo build 2>&1 | tail -5
```

Expected: `Compiling keybow-companion` then `Finished` — no errors.

- [ ] **Step 3: Manual verification**

Run `cargo tauri dev`. Close the window with the ✕ button. The window should disappear but the process should remain running (check Task Manager). There's no way to quit yet — kill the process with Ctrl+C in the terminal. We'll add Quit in Task 3.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "feat: close window to background instead of quitting"
```

---

## Task 3: Tray icon with context menu

**Files:**
- Modify: `src-tauri/src/commands.rs` (add `tray_status_item` to AppState)
- Modify: `src-tauri/src/main.rs` (build tray in setup)

- [ ] **Step 1: Add tray_status_item to AppState**

In `src-tauri/src/commands.rs`, add the import and field:

```rust
use std::sync::Mutex;
use tauri::State;
use tauri::menu::MenuItem;
use crate::app_detector::{detect_installed_apps, DetectedApp};
use crate::profiles::ProfileEngine;
use crate::serial::SerialManager;
use crate::types::ProfileConfig;

pub struct AppState {
    pub profiles: Mutex<ProfileEngine>,
    pub serial: Mutex<SerialManager>,
    pub templates: String,
    pub suggestions: String,
    pub tray_status_item: Mutex<Option<MenuItem<tauri::Wry>>>,
}
```

- [ ] **Step 2: Update AppState construction in main.rs**

In `main.rs`, update the `AppState { ... }` literal to include the new field:

```rust
let state = AppState {
    profiles: Mutex::new(profiles),
    serial: Mutex::new(serial),
    templates: include_str!("../../src/data/templates.json").to_string(),
    suggestions: include_str!("../../src/data/suggestions.json").to_string(),
    tray_status_item: Mutex::new(None),
};
```

- [ ] **Step 3: Add tray imports to main.rs**

At the top of `main.rs`, add:

```rust
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
```

- [ ] **Step 4: Build tray in setup closure**

In `main.rs`, inside the `.setup(|app| { ... })` closure, before `Ok(())`, add:

```rust
// Build tray context menu
let status_item = MenuItem::with_id(app, "status", "Keybow: Disconnected", false, None::<&str>)?;
let open_item = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
let menu = Menu::with_items(app, &[&open_item, &status_item, &quit_item])?;

let _tray = TrayIconBuilder::new()
    .icon(app.default_window_icon().unwrap().clone())
    .menu(&menu)
    .show_menu_on_left_click(false)
    .on_menu_event(|app, event| match event.id.as_ref() {
        "open" => {
            if let Some(w) = app.get_webview_window("main") {
                w.show().unwrap();
                w.set_focus().unwrap();
            }
        }
        "quit" => app.exit(0),
        _ => {}
    })
    .on_tray_icon_event(|tray, event| {
        if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
        } = event
        {
            let app = tray.app_handle();
            if let Some(w) = app.get_webview_window("main") {
                w.show().unwrap();
                w.set_focus().unwrap();
            }
        }
    })
    .build(app)?;

// Store status_item in AppState for later updates
{
    let state = app.state::<AppState>();
    let mut item = state.tray_status_item.lock().unwrap();
    *item = Some(status_item);
}
```

- [ ] **Step 5: Build and verify**

```bash
cd src-tauri && cargo build 2>&1 | tail -5
```

Expected: `Finished` — no errors.

- [ ] **Step 6: Manual verification**

Run `cargo tauri dev`. A tray icon should appear in the system tray. Right-click: verify "Open", "Keybow: Disconnected" (greyed), "Quit" appear. Click "Quit" — app exits. Close window with ✕ — window hides, tray remains. Click tray icon — window reappears.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/main.rs src-tauri/src/commands.rs
git commit -m "feat: add system tray icon with open/status/quit menu"
```

---

## Task 4: Dynamic device status in tray menu

**Files:**
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Update tray status on device-status events**

In `main.rs`, the serial background thread already emits `device-status` and calls `handle.emit(...)`. In both the success and failure reconnect branches, after the `handle.emit(...)` call, add the tray update:

Find the reconnect success block:
```rust
Ok(()) => {
    debug_log("[Serial] Reconnected!");
    let _ = handle.emit("device-status", true);
}
```

Replace with:
```rust
Ok(()) => {
    debug_log("[Serial] Reconnected!");
    let _ = handle.emit("device-status", true);
    let state = handle.state::<AppState>();
    if let Ok(item) = state.tray_status_item.lock() {
        if let Some(ref item) = *item {
            item.set_text("Keybow: Connected").ok();
        }
    }
}
```

Find the reconnect failure block:
```rust
Err(e) => {
    debug_log(&format!("[Serial] Reconnect failed: {}", e));
    let _ = handle.emit("device-status", false);
}
```

Replace with:
```rust
Err(e) => {
    debug_log(&format!("[Serial] Reconnect failed: {}", e));
    let _ = handle.emit("device-status", false);
    let state = handle.state::<AppState>();
    if let Ok(item) = state.tray_status_item.lock() {
        if let Some(ref item) = *item {
            item.set_text("Keybow: Disconnected").ok();
        }
    }
}
```

Also update on `SerialEvent::Ready` (device was already connected at startup):
```rust
SerialEvent::Ready => {
    debug_log("[Serial] Device READY — sending LED colors");
    // ... existing LED send code ...
    let _ = handle.emit("device-status", true);
    let state = handle.state::<AppState>();
    if let Ok(item) = state.tray_status_item.lock() {
        if let Some(ref item) = *item {
            item.set_text("Keybow: Connected").ok();
        }
    }
}
```

- [ ] **Step 2: Build and verify**

```bash
cd src-tauri && cargo build 2>&1 | tail -5
```

Expected: `Finished` — no errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "feat: tray status label updates on device connect/disconnect"
```

---

## Task 5: native-host Rust binary

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/native_host/main.rs`

This binary bridges Chrome's native messaging stdio protocol to the TCP IPC server.

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/native_host/main.rs` with tests only first:

```rust
use std::io::{self, Read, Write};
use std::net::TcpStream;

const IPC_PORT: u16 = 23847;

fn read_chrome_message<R: Read>(reader: &mut R) -> io::Result<Option<Vec<u8>>> {
    todo!()
}

fn write_chrome_message<W: Write>(writer: &mut W, data: &[u8]) -> io::Result<()> {
    todo!()
}

fn main() {}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn round_trip_encodes_and_decodes() {
        let msg = b"{\"action\":\"openTab\",\"url\":\"https://example.com\"}";
        let mut buf = Vec::new();
        write_chrome_message(&mut buf, msg).unwrap();
        let mut cursor = Cursor::new(buf);
        let result = read_chrome_message(&mut cursor).unwrap();
        assert_eq!(result, Some(msg.to_vec()));
    }

    #[test]
    fn clean_eof_returns_none() {
        let mut cursor = Cursor::new(vec![]);
        let result = read_chrome_message(&mut cursor).unwrap();
        assert_eq!(result, None);
    }

    #[test]
    fn length_prefix_is_little_endian() {
        let msg = b"hello";
        let mut buf = Vec::new();
        write_chrome_message(&mut buf, msg).unwrap();
        // First 4 bytes should be 5 as little-endian u32
        assert_eq!(&buf[..4], &[5u8, 0, 0, 0]);
        assert_eq!(&buf[4..], b"hello");
    }
}
```

- [ ] **Step 2: Register the binary in Cargo.toml**

In `src-tauri/Cargo.toml`, add after the existing `[[bin]]` block:

```toml
[[bin]]
name = "native-host"
path = "src/native_host/main.rs"
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
cd src-tauri && cargo test --bin native-host 2>&1 | tail -20
```

Expected: compilation succeeds (todo!() compiles), tests panic with "not yet implemented" on the todo!() calls. If the test file doesn't compile, fix any syntax errors before continuing.

- [ ] **Step 4: Implement read_chrome_message and write_chrome_message**

Replace the `todo!()` stubs with implementations:

```rust
fn read_chrome_message<R: Read>(reader: &mut R) -> io::Result<Option<Vec<u8>>> {
    let mut first = [0u8; 1];
    match reader.read(&mut first) {
        Ok(0) => return Ok(None), // clean EOF
        Ok(_) => {}
        Err(e) => return Err(e),
    }
    let mut rest = [0u8; 3];
    reader.read_exact(&mut rest)?;
    let len = u32::from_le_bytes([first[0], rest[0], rest[1], rest[2]]) as usize;
    let mut buf = vec![0u8; len];
    reader.read_exact(&mut buf)?;
    Ok(Some(buf))
}

fn write_chrome_message<W: Write>(writer: &mut W, data: &[u8]) -> io::Result<()> {
    let len = (data.len() as u32).to_le_bytes();
    writer.write_all(&len)?;
    writer.write_all(data)?;
    writer.flush()
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd src-tauri && cargo test --bin native-host 2>&1 | tail -10
```

Expected:
```
test tests::round_trip_encodes_and_decodes ... ok
test tests::clean_eof_returns_none ... ok
test tests::length_prefix_is_little_endian ... ok
test result: ok. 3 passed; 0 failed
```

- [ ] **Step 6: Implement main()**

Replace `fn main() {}` with:

```rust
fn main() {
    let stream = TcpStream::connect(("127.0.0.1", IPC_PORT))
        .expect("native-host: failed to connect to IPC server");

    let mut read_stream = stream.try_clone().expect("native-host: stream clone failed");
    let mut write_stream = stream;

    // TCP → Chrome stdout: read newline-delimited lines, write with Chrome framing
    std::thread::spawn(move || {
        let stdout = io::stdout();
        let mut stdout = stdout.lock();
        let mut line_buf = Vec::new();
        let mut byte = [0u8; 1];
        loop {
            match read_stream.read(&mut byte) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    if byte[0] == b'\n' {
                        if !line_buf.is_empty() {
                            write_chrome_message(&mut stdout, &line_buf).ok();
                            line_buf.clear();
                        }
                    } else {
                        line_buf.push(byte[0]);
                    }
                }
            }
        }
    });

    // Chrome stdin → TCP: read Chrome framing, write as newline-delimited
    let stdin = io::stdin();
    let mut stdin = stdin.lock();
    loop {
        match read_chrome_message(&mut stdin) {
            Ok(Some(msg)) => {
                write_stream.write_all(&msg).ok();
                write_stream.write_all(b"\n").ok();
            }
            Ok(None) | Err(_) => break,
        }
    }
}
```

- [ ] **Step 7: Build the binary**

```bash
cd src-tauri && cargo build --bin native-host 2>&1 | tail -5
```

Expected: `Finished` — no errors.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/native_host/main.rs
git commit -m "feat: add native-host binary — Chrome native messaging to TCP bridge"
```

---

## Task 6: Generate stable extension key and update extension files

**Files:**
- Modify: `extension/manifest.json`
- Modify: `extension/native-messaging.json`

Chrome derives a stable extension ID from a static RSA public key in `manifest.json`. Without this key, the ID changes per machine and native messaging breaks.

- [ ] **Step 1: Generate RSA key pair**

Run in the repo root (requires OpenSSL — install via `winget install ShiningLight.OpenSSL` if needed):

```bash
openssl genrsa -out extension-key.pem 2048
openssl rsa -in extension-key.pem -pubout -outform DER -out extension-pubkey.der
```

Expected: two files created — `extension-key.pem` (keep secret, do NOT commit) and `extension-pubkey.der`.

- [ ] **Step 2: Base64-encode the public key**

```bash
openssl base64 -in extension-pubkey.der -out extension-pubkey.b64
# Remove all newlines from the output:
tr -d '\n' < extension-pubkey.b64 > extension-pubkey-oneline.b64
cat extension-pubkey-oneline.b64
```

Copy the output — this is the value for the `"key"` field.

- [ ] **Step 3: Compute the stable extension ID**

Run this PowerShell script (the ID is derived from the SHA256 of the DER public key):

```powershell
$derBytes = [System.IO.File]::ReadAllBytes("extension-pubkey.der")
$hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash($derBytes)
$id = -join ($hash[0..15] | ForEach-Object {
    [char]('a' + ($_ -shr 4))
    [char]('a' + ($_ -band 0xf))
})
Write-Host "Extension ID: $id"
```

Expected: a 32-character string like `abcdefghijklmnopabcdefghijklmnop`. Note it down.

- [ ] **Step 4: Update extension/manifest.json**

Add the `"key"` field (use the base64 value from Step 2):

```json
{
  "manifest_version": 3,
  "name": "Keybow Companion",
  "version": "1.0.0",
  "description": "Tab management for Keybow Companion",
  "key": "<paste base64 value from step 2 here>",
  "permissions": ["tabs", "nativeMessaging"],
  "background": { "service_worker": "background.js" },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

- [ ] **Step 5: Update extension/native-messaging.json**

Replace the contents entirely (substitute `<EXTENSION_ID>` with the 32-char ID from Step 3):

```json
{
  "name": "com.keybow.companion",
  "description": "Keybow Companion native messaging host",
  "path": "NATIVE_HOST_PATH",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://<EXTENSION_ID>/"]
}
```

The `NATIVE_HOST_PATH` placeholder will be substituted at first launch by `extension_setup.rs`.

- [ ] **Step 6: Add key files to .gitignore**

```bash
echo "extension-key.pem" >> .gitignore
echo "extension-pubkey.der" >> .gitignore
echo "extension-pubkey.b64" >> .gitignore
echo "extension-pubkey-oneline.b64" >> .gitignore
```

- [ ] **Step 7: Commit**

```bash
git add extension/manifest.json extension/native-messaging.json .gitignore
git commit -m "feat: add stable RSA key to extension manifest for consistent Chrome ID"
```

---

## Task 7: Bundle extension resources in tauri.conf.json

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Add resources to bundle config**

In `src-tauri/tauri.conf.json`, update the `"bundle"` section to add `"resources"`:

```json
"bundle": {
  "active": true,
  "targets": ["msi", "nsis"],
  "icon": [
    "icons/32x32.png",
    "icons/128x128.png",
    "icons/icon.ico"
  ],
  "resources": {
    "../extension/background.js": "extension/background.js",
    "../extension/manifest.json": "extension/manifest.json",
    "../extension/native-messaging.json": "native-messaging.json",
    "target/release/native-host.exe": "native-host.exe"
  }
}
```

Note: `target/release/native-host.exe` is built by `cargo tauri build` before bundling — it will exist at bundle time.

- [ ] **Step 2: Build release to verify resources are included**

```bash
cargo tauri build 2>&1 | tail -20
```

Expected: build completes. Verify the NSIS installer was created: `src-tauri/target/release/bundle/nsis/Keybow Companion_*.exe`.

If `target/release/native-host.exe` not found error: run `cd src-tauri && cargo build --release --bin native-host` first.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "feat: bundle extension files and native-host.exe with installer"
```

---

## Task 8: extension_setup.rs — first-launch file copy and registry

**Files:**
- Create: `src-tauri/src/extension_setup.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create extension_setup.rs with test stubs**

Create `src-tauri/src/extension_setup.rs`:

```rust
use std::path::{Path, PathBuf};
use tauri::AppHandle;

const NATIVE_HOST_NAME: &str = "com.keybow.companion";

/// Returns true if extension was newly set up, false if already installed.
pub fn ensure_extension_installed(app: &AppHandle) -> Result<bool, String> {
    todo!()
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    todo!()
}

fn write_registry_key(manifest_path: &str) -> Result<(), String> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn copy_dir_all_copies_files_recursively() {
        let src = TempDir::new().unwrap();
        let dst = TempDir::new().unwrap();
        fs::write(src.path().join("a.txt"), b"hello").unwrap();
        fs::create_dir(src.path().join("sub")).unwrap();
        fs::write(src.path().join("sub/b.txt"), b"world").unwrap();

        copy_dir_all(src.path(), dst.path()).unwrap();

        assert_eq!(fs::read(dst.path().join("a.txt")).unwrap(), b"hello");
        assert_eq!(fs::read(dst.path().join("sub/b.txt")).unwrap(), b"world");
    }
}
```

- [ ] **Step 2: Add tempfile dev-dependency to Cargo.toml**

In `src-tauri/Cargo.toml`, add:

```toml
[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 3: Add module to lib.rs**

In `src-tauri/src/lib.rs`, add:

```rust
pub mod extension_setup;
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd src-tauri && cargo test extension_setup 2>&1 | tail -15
```

Expected: compiles, then panics with "not yet implemented".

- [ ] **Step 5: Implement copy_dir_all**

```rust
fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let dest_path = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&entry.path(), &dest_path)?;
        } else {
            std::fs::copy(entry.path(), dest_path)?;
        }
    }
    Ok(())
}
```

- [ ] **Step 6: Run copy_dir_all test — verify it passes**

```bash
cd src-tauri && cargo test copy_dir_all 2>&1 | tail -10
```

Expected: `test tests::copy_dir_all_copies_files_recursively ... ok`

- [ ] **Step 7: Implement write_registry_key**

```rust
fn write_registry_key(manifest_path: &str) -> Result<(), String> {
    let key = format!(
        r"HKCU\Software\Google\Chrome\NativeMessagingHosts\{}",
        NATIVE_HOST_NAME
    );
    let status = std::process::Command::new("reg")
        .args(["add", &key, "/f", "/ve", "/t", "REG_SZ", "/d", manifest_path])
        .status()
        .map_err(|e| format!("reg.exe launch failed: {}", e))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("reg.exe exited with status {}", status))
    }
}
```

- [ ] **Step 8: Implement ensure_extension_installed**

```rust
pub fn ensure_extension_installed(app: &AppHandle) -> Result<bool, String> {
    let resource_dir = app.path().resource_dir()
        .map_err(|e| format!("resource_dir: {}", e))?;
    let data_dir = app.path().app_local_data_dir()
        .map_err(|e| format!("app_local_data_dir: {}", e))?;

    let manifest_dest = data_dir.join("native-messaging.json");
    let host_dest = data_dir.join("native-host.exe");

    // Already installed — skip
    if manifest_dest.exists() && host_dest.exists() {
        return Ok(false);
    }

    // Copy extension files
    let ext_src = resource_dir.join("extension");
    let ext_dst = data_dir.join("extension");
    copy_dir_all(&ext_src, &ext_dst)
        .map_err(|e| format!("copy extension: {}", e))?;

    // Copy native-host.exe
    std::fs::copy(resource_dir.join("native-host.exe"), &host_dest)
        .map_err(|e| format!("copy native-host.exe: {}", e))?;

    // Copy native-messaging.json with path substituted
    let template = std::fs::read_to_string(resource_dir.join("native-messaging.json"))
        .map_err(|e| format!("read native-messaging.json: {}", e))?;
    // Double backslashes for JSON serialization (C:\foo → C:\\foo)
    let host_path = host_dest.to_string_lossy().replace('\\', "\\\\");
    let manifest = template.replace("NATIVE_HOST_PATH", &host_path);
    std::fs::write(&manifest_dest, manifest)
        .map_err(|e| format!("write native-messaging.json: {}", e))?;

    // Write Chrome registry key
    write_registry_key(&manifest_dest.to_string_lossy())?;

    Ok(true)
}
```

- [ ] **Step 9: Build to verify**

```bash
cd src-tauri && cargo build 2>&1 | tail -5
```

Expected: `Finished` — no errors.

- [ ] **Step 10: Commit**

```bash
git add src-tauri/src/extension_setup.rs src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat: extension_setup — copy extension files and register native messaging host on first launch"
```

---

## Task 9: Add client connect/disconnect events to IpcServer

**Files:**
- Modify: `src-tauri/src/ipc_server.rs`

The goal is to emit a callback when the client count changes (0→1 on connect, 1→0 on disconnect).

- [ ] **Step 1: Add a test for the connect/disconnect callback**

In `ipc_server.rs`, add this test to the existing `tests` module:

```rust
#[tokio::test]
async fn client_change_callback_fires_on_connect_and_disconnect() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let connect_count = Arc::new(AtomicUsize::new(0));
    let disconnect_count = Arc::new(AtomicUsize::new(0));
    let cc = connect_count.clone();
    let dc = disconnect_count.clone();

    let server = IpcServer::new();
    let addr = server
        .start_on("127.0.0.1:0", |_| {}, move |connected| {
            if connected {
                cc.fetch_add(1, Ordering::SeqCst);
            } else {
                dc.fetch_add(1, Ordering::SeqCst);
            }
        })
        .await
        .unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;

    let stream = TcpStream::connect(addr).await.unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    assert_eq!(connect_count.load(Ordering::SeqCst), 1);

    drop(stream);
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    assert_eq!(disconnect_count.load(Ordering::SeqCst), 1);

    server.stop().await;
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src-tauri && cargo test client_change_callback 2>&1 | tail -10
```

Expected: compile error — `start_on` doesn't accept 3 arguments yet.

- [ ] **Step 3: Update IpcServer to accept on_client_change callback**

In `ipc_server.rs`, update the `start` and `start_on` signatures:

```rust
pub async fn start<F, G>(&self, on_message: F, on_client_change: G) -> Result<std::net::SocketAddr, String>
where
    F: Fn(serde_json::Value) + Send + Sync + 'static,
    G: Fn(bool) + Send + Sync + 'static,
{
    self.start_on(IPC_ADDR, on_message, on_client_change).await
}

pub async fn start_on<F, G>(&self, addr: &str, on_message: F, on_client_change: G) -> Result<std::net::SocketAddr, String>
where
    F: Fn(serde_json::Value) + Send + Sync + 'static,
    G: Fn(bool) + Send + Sync + 'static,
{
```

Inside `start_on`, wrap `on_client_change` in an Arc just like `on_message`:

```rust
let on_client_change = Arc::new(on_client_change);
```

In the accept branch, after logging the connection, call it:
```rust
Ok((stream, addr)) => {
    log::info!("IPC client connected: {}", addr);
    on_client_change(true);  // add this line
    let tx = tx.clone();
    // ... rest unchanged
```

At the end of the per-client `tokio::spawn`, after `write_task.abort()`, add:
```rust
write_task.abort();
log::info!("IPC client disconnected: {}", addr);
let on_cc = on_client_change.clone();
on_cc(false);  // add this line
```

Make sure `on_client_change` is cloned into the per-client spawn:
```rust
let on_client_change = on_client_change.clone();
tokio::spawn(async move {
    // ... existing code
```

- [ ] **Step 4: Update existing tests that call start_on with 2 args**

The existing tests call `server.start_on("127.0.0.1:0", |_| {})`. Update them all to pass a no-op third arg:

```rust
server.start_on("127.0.0.1:0", |_| {}, |_| {}).await
```

There are three such calls in the test module — update all three.

- [ ] **Step 5: Run all IpcServer tests**

```bash
cd src-tauri && cargo test ipc_server 2>&1 | tail -15
```

Expected: all 4 tests pass including `client_change_callback_fires_on_connect_and_disconnect`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/ipc_server.rs
git commit -m "feat: ipc_server emits connect/disconnect callbacks"
```

---

## Task 10: Extension status command and AppState field

**Files:**
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Add extension_connected to AppState**

In `commands.rs`, add to `AppState`:

```rust
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub struct AppState {
    pub profiles: Mutex<ProfileEngine>,
    pub serial: Mutex<SerialManager>,
    pub templates: String,
    pub suggestions: String,
    pub tray_status_item: Mutex<Option<MenuItem<tauri::Wry>>>,
    pub extension_connected: Arc<AtomicBool>,
}
```

- [ ] **Step 2: Add get_extension_status command**

```rust
#[tauri::command]
pub fn get_extension_status(state: State<AppState>) -> bool {
    state.extension_connected.load(Ordering::Relaxed)
}
```

- [ ] **Step 3: Update AppState construction in main.rs**

In `main.rs`, update the `AppState { ... }` literal:

```rust
let state = AppState {
    profiles: Mutex::new(profiles),
    serial: Mutex::new(serial),
    templates: include_str!("../../src/data/templates.json").to_string(),
    suggestions: include_str!("../../src/data/suggestions.json").to_string(),
    tray_status_item: Mutex::new(None),
    extension_connected: Arc::new(AtomicBool::new(false)),
};
```

- [ ] **Step 4: Register the new command in main.rs invoke_handler**

```rust
.invoke_handler(tauri::generate_handler![
    commands::get_config,
    commands::save_config,
    commands::get_installed_apps,
    commands::browse_for_app,
    commands::get_templates,
    commands::get_suggestions,
    commands::preview_led,
    commands::get_device_status,
    commands::get_extension_status,  // add this
])
```

- [ ] **Step 5: Build to verify**

```bash
cd src-tauri && cargo build 2>&1 | tail -5
```

Expected: `Finished` — no errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/main.rs
git commit -m "feat: add get_extension_status command and AppState field"
```

---

## Task 11: Wire extension setup and status events in main.rs

**Files:**
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Add extension_setup import**

At the top of `main.rs`, add:

```rust
use keybow_companion::extension_setup::ensure_extension_installed;
```

- [ ] **Step 2: Call ensure_extension_installed in setup**

Inside the `.setup(|app| { ... })` closure, after the tray setup block and before `Ok(())`:

```rust
// First-launch extension setup (non-fatal — log and continue if it fails)
match ensure_extension_installed(&app.handle()) {
    Ok(true) => debug_log("[Setup] Extension installed for first time"),
    Ok(false) => debug_log("[Setup] Extension already installed"),
    Err(e) => debug_log(&format!("[Setup] Extension install failed: {}", e)),
}
```

- [ ] **Step 3: Wire on_client_change to emit extension-status events**

In `main.rs`, inside `.setup()`, find where the IPC server is started. It currently calls `server.start(on_message, ...)` or similar. Update it to pass the connect/disconnect callback.

The IPC server start call should look like:

```rust
let handle_for_ipc = app.handle().clone();
ipc_server.start(
    move |msg| {
        // existing on_message handler
    },
    move |connected| {
        let state = handle_for_ipc.state::<AppState>();
        state.extension_connected.store(connected, std::sync::atomic::Ordering::Relaxed);
        let _ = handle_for_ipc.emit("extension-status", connected);
    },
).await...
```

**Note:** The IPC server startup lives on `feature/tauri-migration` — check whether that PR has been merged before this task runs.

- **If the PR is merged:** find the existing `ipc_server.start(...)` call in `main.rs` and add the `on_client_change` closure as the second argument.
- **If the PR is not yet merged:** add the following IPC startup block inside `.setup(|app| { ... })`, before `Ok(())`:

```rust
use keybow_companion::ipc_server::IpcServer;
// ... (add IpcServer to AppState or store in a local Arc if needed)
let ipc = IpcServer::new();
let handle_for_ipc = app.handle().clone();
tokio::spawn(async move {
    ipc.start(
        |_msg| { /* URL open messages handled by action_executor on feature branch */ },
        move |connected| {
            let state = handle_for_ipc.state::<AppState>();
            state.extension_connected.store(connected, std::sync::atomic::Ordering::Relaxed);
            let _ = handle_for_ipc.emit("extension-status", connected);
        },
    ).await.ok();
});
```

The `handle_for_ipc` must be cloned before the closure.

- [ ] **Step 4: Build and verify**

```bash
cd src-tauri && cargo build 2>&1 | tail -5
```

Expected: `Finished` — no errors. Fix any borrow/move errors from the closure captures.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "feat: wire extension setup and status events in main"
```

---

## Task 12: ExtensionSetupModal and setup banner in App.tsx

**Files:**
- Modify: `src/api.ts`
- Create: `src/components/ExtensionSetupModal.tsx`
- Create: `src/components/ExtensionSetupModal.css`
- Modify: `src/app.tsx`
- Modify: `src/components/ExtensionSetupModal.test.tsx` (replace smoke test)

- [ ] **Step 1: Write the failing tests**

Replace `src/components/ExtensionSetupModal.test.tsx` with:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExtensionSetupModal } from './ExtensionSetupModal';

describe('ExtensionSetupModal', () => {
  it('renders setup steps when open', () => {
    render(<ExtensionSetupModal open={true} onClose={() => {}} />);
    expect(screen.getByText(/chrome:\/\/extensions/i)).toBeInTheDocument();
    expect(screen.getByText(/developer mode/i)).toBeInTheDocument();
    expect(screen.getByText(/load unpacked/i)).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<ExtensionSetupModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<ExtensionSetupModal open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: compile/import error — `ExtensionSetupModal` doesn't exist yet.

- [ ] **Step 3: Create ExtensionSetupModal.tsx**

```typescript
import './ExtensionSetupModal.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ExtensionSetupModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Set up the browser extension</h3>
          <button aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <ol className="setup-steps">
          <li>Open Chrome and go to <code>chrome://extensions</code></li>
          <li>Enable <strong>Developer mode</strong> (toggle in top-right)</li>
          <li>Click <strong>Load unpacked</strong></li>
          <li>
            Navigate to{' '}
            <code>%LocalAppData%\Keybow Companion\extension</code>{' '}
            and click <strong>Select Folder</strong>
          </li>
          <li>Done — the banner will disappear automatically once connected</li>
        </ol>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create ExtensionSetupModal.css**

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-box {
  background: var(--bg, #1e1e2e);
  border: 1px solid var(--border, #444);
  border-radius: 8px;
  padding: 24px;
  max-width: 480px;
  width: 90%;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.modal-header h3 {
  margin: 0;
  font-size: 1rem;
}

.modal-header button {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.1rem;
  color: inherit;
  padding: 4px 8px;
}

.setup-steps {
  margin: 0;
  padding-left: 20px;
  line-height: 2;
}

.setup-steps code {
  background: var(--code-bg, #2a2a3e);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.85em;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test
```

Expected: all 3 `ExtensionSetupModal` tests pass.

- [ ] **Step 6: Add extension status to api.ts**

In `src/api.ts`, add two entries to the `keybow` object:

```typescript
getExtensionStatus: () => invoke<boolean>("get_extension_status"),
onExtensionStatus: (cb: (connected: boolean) => void) => {
  listen<boolean>("extension-status", (e) => cb(e.payload));
},
```

- [ ] **Step 7: Add extension banner to App.tsx**

In `src/app.tsx`, add state and effects for extension status. After the existing `const [connected, setConnected] = useState(false);` line, add:

```typescript
const [extensionConnected, setExtensionConnected] = useState(true); // true hides banner on load
const [showExtensionModal, setShowExtensionModal] = useState(false);
const [extensionBannerDismissed, setExtensionBannerDismissed] = useState(false);
```

In the main `useEffect` where other `keybow.*` calls are made, add:

```typescript
keybow.getExtensionStatus().then(setExtensionConnected);
keybow.onExtensionStatus(setExtensionConnected);
```

Add the import at the top of the file:

```typescript
import { ExtensionSetupModal } from './components/ExtensionSetupModal';
```

In the JSX return, add the banner and modal just inside the outermost wrapper element, before other children:

```tsx
{!extensionConnected && !extensionBannerDismissed && (
  <div className="extension-banner">
    Browser extension not set up —{' '}
    <button onClick={() => setShowExtensionModal(true)}>View setup instructions</button>
    <button aria-label="Dismiss banner" onClick={() => setExtensionBannerDismissed(true)}>✕</button>
  </div>
)}
<ExtensionSetupModal
  open={showExtensionModal}
  onClose={() => setShowExtensionModal(false)}
/>
```

- [ ] **Step 8: Add banner styles to the existing app CSS**

In `src/app.css` (or wherever global styles live), add:

```css
.extension-banner {
  background: #7c6600;
  color: #ffe88a;
  padding: 6px 12px;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 8px;
}

.extension-banner button {
  background: none;
  border: 1px solid currentColor;
  color: inherit;
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 0.8rem;
}
```

- [ ] **Step 9: Build to verify**

```bash
npm run build 2>&1 | tail -10
```

Expected: `✓ built in Xs` — no TypeScript or build errors.

- [ ] **Step 10: Run all tests**

```bash
npm test && cd src-tauri && cargo test
```

Expected: all tests pass.

- [ ] **Step 11: Commit**

```bash
git add src/api.ts src/components/ExtensionSetupModal.tsx src/components/ExtensionSetupModal.css src/components/ExtensionSetupModal.test.tsx src/app.tsx src/app.css
git commit -m "feat: extension setup banner and guided modal"
```

---

## Final verification

- [ ] Run `cargo tauri dev` — app starts with tray icon
- [ ] Close window — window hides, tray remains
- [ ] Right-click tray — Open / Keybow: Disconnected / Quit menu visible
- [ ] Click Quit — app exits cleanly
- [ ] Check for extension banner on first launch (extension not yet loaded)
- [ ] Follow banner instructions to load extension in Chrome — banner disappears automatically
- [ ] Run `cargo tauri build` — both NSIS and MSI installers produced
- [ ] Verify `native-host.exe` is included in the install directory after running NSIS installer
- [ ] Verify registry key exists: `reg query "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.keybow.companion"`
