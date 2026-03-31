# Design: System Tray + Browser Extension Distribution

**Date:** 2026-03-31  
**Status:** Approved

---

## Overview

Two UX polish features for v0.2.0:

1. **System tray** — close button minimizes to tray; app runs persistently in the background
2. **Browser extension distribution** — extension bundled with NSIS installer, native messaging host auto-registered, in-app setup guide on first launch

---

## Feature 1: System Tray

### Behaviour

- Closing the main window (✕ button) **hides** the window — the app keeps running
- The app appears in the Windows system tray with a Keybow icon
- **Left-click** tray icon → show and focus the window
- **Right-click** tray icon → context menu:
  - "Open" — show and focus the window
  - "Keybow: Connected" / "Keybow: Disconnected" — non-clickable status label, updates dynamically
  - "Quit" — exits the app cleanly
- On first launch the window is shown normally (no tray-only start)

### Implementation

**Dependencies:**
- Add `tauri-plugin-tray` to `src-tauri/Cargo.toml`
- Add `tray-icon` plugin to `tauri.conf.json` capabilities

**`main.rs` changes:**
1. Build `SystemTray` with menu items at startup
2. Register `on_window_event` handler — intercept `CloseRequested`, call `window.hide()`, set `api.prevent_close()`
3. Register tray menu event handler — "open" → `window.show()` + `window.set_focus()`; "quit" → `app.exit(0)`
4. Subscribe to existing `device-status` bool event; update the status menu item label accordingly

**No frontend changes required.**

---

## Feature 2: Browser Extension Distribution

### Problem: Stable Extension ID

Unpacked Chrome extensions get a randomly-generated ID per machine. Native messaging `allowed_origins` requires an exact ID. Fix: add a static RSA `key` field to `extension/manifest.json` — Chrome derives the extension ID from this key, making it stable across all installs.

Steps:
1. Generate RSA key pair (`openssl genrsa` + extract public key)
2. Base64-encode the DER-format public key, add as `"key": "<value>"` to `extension/manifest.json`
3. Derive the resulting stable extension ID (SHA256 of the public key, first 32 hex chars mapped a-p)
4. Set `allowed_origins` in `native-messaging.json` to `["chrome-extension://<stable-id>/"]`

### Installer Changes (NSIS)

In `src-tauri/tauri.conf.json` bundle config, add NSIS hooks to:

1. Copy `extension/` folder to `$LOCALAPPDATA\Keybow Companion\extension\`
2. Copy `native-messaging.json` to `$LOCALAPPDATA\Keybow Companion\native-messaging.json`
3. Write registry key:
   ```
   HKCU\Software\Google\Chrome\NativeMessagingHosts\com.keybow.companion
   (Default) = "$LOCALAPPDATA\Keybow Companion\native-messaging.json"
   ```
4. On uninstall: remove the registry key and the installed files

The `native-messaging.json` `path` field must point to the installed `native-host.js` location (not the source path).

### In-App Setup Banner

**Backend (`ipc_server.rs`):**
- Already tracks connected IPC clients
- Emit `extension-status` event (bool) when a client connects or disconnects
- Expose `get_extension_status` Tauri command for initial state on app load

**Frontend:**
- `App.tsx` listens for `extension-status` event and `get_extension_status` on mount
- Shows a dismissible yellow banner at the top of the app when `extensionConnected === false`:
  > "Browser extension not set up — [View setup instructions]"
- "View setup instructions" opens a small modal with steps:
  1. Open Chrome and go to `chrome://extensions`
  2. Enable **Developer mode** (top-right toggle)
  3. Click **Load unpacked**
  4. Navigate to `%LocalAppData%\Keybow Companion\extension` and click Select Folder
  5. Done — the banner will disappear automatically once connected
- Dismissing the banner hides it for the session (does not persist across restarts — the banner returns if the extension is still not connected next launch)

---

## Out of Scope

- Chrome Web Store publishing
- Edge / Firefox support
- Tray-only startup (window always shown on launch)
- Persisting banner dismissal across restarts

---

## Files Affected

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add `tauri-plugin-tray` |
| `src-tauri/tauri.conf.json` | Add tray capability, NSIS hooks |
| `src-tauri/src/main.rs` | Tray setup, close-to-tray handler |
| `src-tauri/src/ipc_server.rs` | Emit `extension-status` event |
| `src-tauri/src/commands.rs` | Add `get_extension_status` command |
| `extension/manifest.json` | Add `key` field for stable ID |
| `extension/native-messaging.json` | Update `allowed_origins` with stable ID, update `path` |
| `src/app.tsx` | Extension status banner |
| `src/components/ExtensionSetupModal.tsx` | New — setup guide modal |
