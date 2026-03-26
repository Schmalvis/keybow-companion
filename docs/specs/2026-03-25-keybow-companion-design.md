# Keybow Companion — Design Spec

**Date:** 2026-03-25
**Status:** Draft

## Overview

A configurable macro keyboard system built around the Pimoroni Keybow 2040 (4x4 mechanical RGB keypad). The system consists of four components: device firmware, an Electron companion app (system tray), a browser extension for tab management, and a visual config UI. The companion app handles all intelligence — app switching, URL management, profile logic — while the Keybow acts as a thin serial relay with LED control.

## Goals

- **Easy reconfiguration** via a visual config UI inside the Electron app
- **Profile support** with manual cycling (dedicated key + tray menu) and auto-switching based on foreground app
- **App switching** — focus a running app or launch it if not running
- **Browser tab switching** — focus an existing tab or open a new one (via browser extension)
- **Visual feedback** — per-key RGB colors: flash on press, configurable active color

## Non-Goals

- HID keyboard output (all actions delegated to companion app)
- Cross-platform support (Windows only for now)
- Multi-device support (single Keybow)

---

## Architecture

```
┌─────────────┐   Serial (COM)   ┌───────────────────────────┐
│  Keybow 2040 │ ◄──────────────► │     Electron App          │
│  (firmware)  │   key events +   │  ┌─────────────────────┐  │
│              │   LED commands    │  │ Main Process        │  │
└─────────────┘                   │  │  - Serial comms     │  │
                                  │  │  - Window manager    │  │
                                  │  │  - Profile engine    │  │
                                  │  │  - Native msg host   │  │
                                  │  │  - System tray       │  │
                                  │  └──────────┬──────────┘  │
                                  │             │              │
                                  │  ┌──────────▼──────────┐  │
                                  │  │ Renderer (Config UI) │  │
                                  │  │  - Visual key grid   │  │
                                  │  │  - Profile editor    │  │
                                  │  │  - Color picker      │  │
                                  │  └─────────────────────┘  │
                                  └─────────────┬─────────────┘
                                                │
                                          Native Messaging
                                                │
                                        ┌───────▼───────┐
                                        │   Browser     │
                                        │   Extension   │
                                        └───────────────┘
```

### Data Flow

1. User presses key A1 on the Keybow
2. Keybow sends `KEY:A1:PRESS` over serial
3. Companion app looks up A1 in the active profile
4. Action is "switch to Slack" → companion finds the Slack window via Win32 API and brings it to foreground, or launches it if not running
5. Companion sends `LED:A1:4A154B` back over serial to set the key's active color
6. For URL actions: companion sends a native message to the browser extension, which finds or opens the tab

---

## Component 1: Keybow Firmware

### Responsibilities

- Translate physical key presses into serial messages
- Receive and apply LED color commands
- Map PMK numeric key IDs (0–15) to grid labels (A1–D4)
- Respond to `PING` with `PONG` (keepalive)

### Key Grid Mapping

```
A1  A2  A3  A4     (row A = keys 0-3)
B1  B2  B3  B4     (row B = keys 4-7)
C1  C2  C3  C4     (row C = keys 8-11)
D1  D2  D3  D4     (row D = keys 12-15)
```

### Serial Protocol

**Baud rate:** 115200. **Framing:** All messages are UTF-8 encoded, terminated by `\n` (newline). Max message length: 64 bytes. Both sides read line-by-line; partial reads are buffered until a `\n` is received. Malformed or oversized messages are silently discarded.

**Keybow → Electron:**

| Message | Description |
|---|---|
| `KEY:<grid>:PRESS` | Key pressed (e.g., `KEY:A1:PRESS`) |
| `KEY:<grid>:RELEASE` | Key released |
| `KEY:<grid>:HOLD` | Key held past threshold (0.75s) |
| `READY` | Sent on boot/reconnect |
| `PONG` | Response to `PING` (keepalive) |

**Electron → Keybow:**

| Message | Description |
|---|---|
| `LED:<grid>:<RRGGBB>` | Set key color (hex RGB, e.g., `LED:A1:FF5500`) |
| `LED:<grid>:OFF` | Turn off single key LED |
| `LED:ALL:<RRGGBB>` | Set all keys to one color |
| `LED:ALL:OFF` | Turn off all LEDs |
| `PROFILE:<name>` | Inform firmware of profile switch (informational) |
| `PING` | Keepalive request; firmware responds with `PONG` |

**Keepalive:** Electron sends `PING` every 5 seconds. If no `PONG` is received within 3 seconds, the connection is considered stale and reconnection is initiated.

**Error feedback convention:** The companion app owns all visual error feedback. If an action fails (e.g., app not found, extension unreachable), the companion sends `LED:<grid>:FF0000` (red flash) followed by a 500ms delay and then restores the key's previous color.

### LED Behavior

- **On boot:** All LEDs off, send `READY`
- **On key press:** Brief white flash (tactile feedback), then send event to companion
- **On `LED:` command:** Set key to specified color, persist until changed
- **LED state** persists until overwritten by a new command

### Hold Detection

Uses the PMK library's built-in hold detection (0.75s default). `HOLD` events are sent separately from `PRESS`, enabling the companion app to assign different actions to press vs. hold in the future. If the companion receives a `HOLD` event for a key with no hold action configured, it is silently ignored.

---

## Component 2: Electron Companion App

### Main Process Modules

#### serial.ts — Serial Communication
- Auto-detect Keybow on USB serial ports (by VID/PID or port name)
- Parse incoming key events, dispatch to profile engine
- Send LED commands back to device
- Handle reconnection on disconnect (retry every 3 seconds, no max retries)
- On reconnect: re-send all LED colors for the active profile to restore key state

#### profiles.ts — Profile Engine
- Load/save profiles from `profiles.json` in `%APPDATA%/keybow-companion/`
- Track active profile
- Cycle profiles on profile-switch key press
- Emit profile-change events to update LEDs and UI

#### app-switcher.ts — Window Management
- Find a running process by name using Win32 API (`ffi-napi` or PowerShell)
- Bring matching window to foreground
- If not running, launch the process
- Report success/failure back to caller

#### auto-switch.ts — Foreground Polling
- Poll the foreground window's process name every ~500ms
- If process matches an `autoSwitch` mapping, trigger profile switch
- Manual profile switch (via key or tray) temporarily overrides auto-switch until the foreground changes again

#### native-host.ts — Native Messaging Handler
- Communicate with browser extension via Chrome Native Messaging protocol
- Send `focusOrOpen` requests with a target URL
- Receive responses (tab found/opened, errors)

#### index.ts — App Entry
- Initialize all modules
- Create system tray icon with menu (profile list, open config, quit)
- Create hidden BrowserWindow for config UI (shown on tray click or menu)

### Renderer (Config UI)

A React application rendered in a BrowserWindow.

#### Components

- **KeyGrid** — Visual 4x4 grid representing the Keybow. Click a key to select and configure it. Shows current color and label for each key.
- **KeyConfig** — Editor panel for the selected key: action type dropdown, target input (app path or URL), label, press color picker, active color picker.
- **ProfileBar** — Tabs for switching between profiles. Add/rename/delete profiles. Configure auto-switch rules per profile.

### System Tray

- Left-click: Open/toggle config window
- Right-click: Context menu with:
  - Profile list (radio selection)
  - "Open Config"
  - "Reconnect Device"
  - "Quit"

---

## Component 3: Browser Extension

### Purpose

Find an existing browser tab by URL and focus it, or open a new tab if not found.

### Manifest (V3)

- **Permissions:** `tabs`, `nativeMessaging`
- **Background:** Service worker only (no popup, no UI)
- **Supported browsers:** Chrome, Edge (both Chromium-based, same extension)

### Message Protocol

**Electron → Extension:**

```json
{
  "action": "focusOrOpen",
  "url": "https://calendar.google.com"
}
```

**Extension → Electron:**

```json
{
  "success": true,
  "action": "focused",
  "tabId": 42
}
```

or

```json
{
  "success": true,
  "action": "opened",
  "tabId": 43
}
```

### URL Matching Strategy

Match by **origin + pathname prefix**, ignoring query parameters and fragments. A request for `https://calendar.google.com` matches a tab at `https://calendar.google.com/calendar/u/0/r?tab=rc`.

### Native Messaging Host

The Electron app includes a **separate lightweight Node.js script** (`native-host.js`) that Chrome launches as the native messaging host process. This script communicates with Chrome via stdin/stdout (Chrome's native messaging protocol) and with the running Electron app via a local IPC mechanism (localhost TCP socket or named pipe). This separation is required because Chrome launches native messaging hosts as independent processes — the Electron app cannot serve as the host directly.

The host manifest (JSON) is registered in the Windows registry at `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.keybow.companion` on first run. The manifest points to the `native-host.js` script and pins the allowed extension ID.

---

## Component 4: Security Mitigations

The browser extension + native messaging pattern has known attack surfaces. The following mitigations are **hard requirements**:

### 1. Strict Message Validation
The native messaging handler only accepts messages matching a known schema:
- `action` must be one of: `focusOrOpen`
- `url` must be a valid URL with `https://` scheme (reject `http://`, `file://`, `javascript:`, `data:`, etc.)

### 2. URL Allowlist
The native host only processes URLs that exist in the currently loaded `profiles.json`. Any URL not present in any profile's key configuration is rejected. This prevents a compromised extension from opening arbitrary URLs.

### 3. Extension ID Pinning
The native messaging host manifest specifies the exact extension ID in `allowed_origins`. No other extension can communicate with the host.

### 4. No Remote Code
The browser extension loads no external scripts, stylesheets, or resources. All code is local and bundled. Content Security Policy in the manifest enforces this.

### 5. Input Sanitization in Firmware
The firmware only accepts serial messages matching the `LED:` and `PROFILE:` prefixes with validated payloads. Malformed messages are silently dropped.

---

## Profile Configuration Schema

```json
{
  "version": 1,
  "activeProfile": "Work",
  "profileSwitchKey": "D4",
  "profileOrder": ["Work", "Dev", "Creative"],
  "autoSwitch": {
    "slack.exe": "Work",
    "devenv.exe": "Dev",
    "photoshop.exe": "Creative"
  },
  "profiles": {
    "Work": {
      "name": "Work",
      "icon": "briefcase",
      "defaultColor": "004488",
      "keys": {
        "A1": {
          "action": "app",
          "target": { "process": "slack.exe", "path": "C:\\Users\\malvis\\AppData\\Local\\slack\\slack.exe" },
          "label": "Slack",
          "pressColor": "FFFFFF",
          "activeColor": "4A154B"
        },
        "A2": {
          "action": "url",
          "target": "https://calendar.google.com",
          "label": "Calendar",
          "pressColor": "FFFFFF",
          "activeColor": "4285F4"
        },
        "D4": {
          "action": "profile_cycle",
          "label": "Next Profile",
          "activeColor": "FF8800"
        }
      }
    }
  }
}
```

### Action Types

| Type | `target` | Behavior |
|---|---|---|
| `app` | Object: `{ "process": "slack.exe", "path": "C:\\...\\slack.exe" }` | Match running window by `process` name; if not running, launch via `path` |
| `url` | URL string (`https://` only) | Switch to tab via extension if open, else open new tab |
| `profile_cycle` | — | Cycle to next profile |
| `profile_set` | Profile name | Switch to a specific profile |

### Color Fields

| Field | Scope | Description |
|---|---|---|
| `defaultColor` | Profile | Fallback color for keys without explicit colors |
| `pressColor` | Key | Brief flash color on physical press |
| `activeColor` | Key | Color the key stays lit after press |

---

## Project Structure

```
keybow-companion/
├── firmware/
│   ├── code.py                  # main firmware entry point
│   └── lib/                     # PMK library (copied or symlinked)
├── electron/
│   ├── package.json
│   ├── forge.config.ts          # electron-forge config
│   ├── src/
│   │   ├── main/
│   │   │   ├── index.ts         # app entry, tray, window
│   │   │   ├── serial.ts        # serial port communication
│   │   │   ├── profiles.ts      # profile loading/switching/saving
│   │   │   ├── app-switcher.ts  # window focus/launch logic
│   │   │   ├── auto-switch.ts   # foreground polling + auto profile
│   │   │   ├── native-host.ts    # IPC bridge to native-host.js
│   │   │   └── ipc-server.ts    # local IPC server for native host communication
│   │   └── renderer/
│   │       ├── index.html
│   │       ├── app.tsx          # config UI root
│   │       ├── components/
│   │       │   ├── KeyGrid.tsx  # visual 4x4 grid editor
│   │       │   ├── KeyConfig.tsx# per-key action/color editor
│   │       │   └── ProfileBar.tsx# profile tabs + management
│   │       └── styles/
├── extension/
│   ├── manifest.json            # Manifest V3
│   ├── background.js            # service worker
│   ├── native-host.js           # native messaging host (lives here because Chrome launches it; communicates with Electron via IPC)
│   └── native-messaging.json    # host manifest (registered in Windows registry)
├── README.md
└── CLAUDE.md
```

### Tech Stack

| Component | Technology |
|---|---|
| Firmware | CircuitPython + PMK library |
| Electron | TypeScript, electron-forge for packaging |
| Renderer UI | React + Radix UI components |
| Serial | `serialport` npm package |
| Window management | `ffi-napi` + Win32 API or PowerShell |
| Browser extension | Vanilla JS, Manifest V3 |

### Development Commands

| Command | Description |
|---|---|
| `npm run dev` | Start Electron in dev mode with hot reload |
| `npm run build` | Package the app via electron-forge |
| `npm run lint` | Lint TypeScript and React code |

Firmware is copied manually to the CIRCUITPY drive (deploy script can be added later).

---

## Additional Design Notes

### autoSwitch Constraints
The `autoSwitch` map is global (not per-profile). Each process name maps to exactly one profile. If a process name references a profile that has been deleted, the mapping is ignored (no error, no auto-switch for that process). The config UI should warn when deleting a profile that is referenced by autoSwitch entries.

### Profile Cycle Order
`profile_cycle` uses the `profileOrder` array to determine sequence. This array is the source of truth for ordering. When a profile is added, it is appended to `profileOrder`. When deleted, it is removed.

### Schema Versioning
The `version` field starts at `1`. On load, the companion app checks the version:
- If `version` matches current: load normally
- If `version` is older: run migration functions sequentially (v1→v2, v2→v3, etc.)
- If `version` is newer (unknown): refuse to load, show error asking user to update the app

---

## Open Questions

- Should hold actions be configurable from the start, or deferred to a later iteration?
- Should the config UI support importing/exporting profiles for backup/sharing?
- Should the extension support Firefox in addition to Chrome/Edge?
