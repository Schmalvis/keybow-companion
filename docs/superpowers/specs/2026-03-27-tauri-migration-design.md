# Tauri Migration — Design Spec

Migrate the Keybow Companion app from Electron to Tauri to reduce packaged size from ~200MB to ~10MB and eliminate Chromium bundling.

## Context

The Electron app works but is impractically heavy — 200MB+ packaged, 672MB node_modules, high RAM usage. Tauri uses the system's built-in WebView (WebView2 on Windows) and a Rust backend, producing a ~10MB installer.

## Decisions

- **Big bang migration** — build Tauri app from scratch, delete Electron directory when complete
- **Native Rust for Windows APIs** — no PowerShell dependency, use `windows` crate for app switching, foreground detection, and installed app scanning
- **Keep browser extension** — native messaging for smart tab switching, TCP bridge rebuilt in Rust
- **Vite replaces webpack** — Tauri default, faster builds
- **No Rust experience assumed** — plan includes environment setup

## Project Structure

```
keybow-companion/
├── src-tauri/                    # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── icons/
│   └── src/
│       ├── main.rs               # Entry point, app setup, tray
│       ├── serial.rs             # Serial port via serialport-rs crate
│       ├── profiles.rs           # Config load/save via serde
│       ├── app_switcher.rs       # Focus/launch apps via win32 APIs
│       ├── app_detector.rs       # Scan installed apps via registry + Start Menu
│       ├── auto_switch.rs        # Foreground window polling via win32
│       ├── action_executor.rs    # Dispatch key actions
│       ├── ipc_server.rs         # TCP bridge for browser extension via tokio
│       ├── commands.rs           # Tauri command handlers
│       └── protocol.rs           # Serial protocol parsing (ported from TS)
├── src/                          # React frontend (from electron/src/renderer/)
│   ├── api.ts                    # Tauri invoke/listen adapter
│   ├── app.tsx
│   ├── components/
│   │   ├── KeyGrid.tsx
│   │   ├── ProfileBar.tsx
│   │   ├── TemplatePicker.tsx
│   │   └── wizard/
│   │       ├── WizardPanel.tsx
│   │       ├── ChooseAction.tsx
│   │       ├── ConfigureApp.tsx
│   │       ├── ConfigureUrl.tsx
│   │       ├── ConfigureProfile.tsx
│   │       ├── LabelColors.tsx
│   │       └── ReviewSave.tsx
│   ├── styles/
│   │   ├── app.css
│   │   └── wizard.css
│   └── data/
│       ├── templates.json
│       └── suggestions.json
├── extension/                    # Browser extension (unchanged)
└── firmware/                     # CircuitPython firmware (unchanged)
```

## Rust Backend Modules

### Crate Dependencies

| Crate | Version | Purpose |
|-------|---------|---------|
| `tauri` | 2.x | App framework, window, tray, commands |
| `serialport` | 4.x | Serial communication (pure Rust) |
| `tokio` | 1.x | Async runtime, TCP server, timers |
| `serde` + `serde_json` | 1.x | Profile config serialization |
| `windows` | 0.61 | Win32 APIs for app/window management |

### serial.rs

Manages the Keybow serial connection. Same behavior as current implementation:

- Auto-detect by filtering `serialport::available_ports()` for VID `16D0` or `2E8A`
- Fallback: match by PID `000A` or manufacturer containing "Raspberry Pi" / "Pimoroni"
- Connect at 115200 baud, UTF-8, newline-delimited
- Parse incoming: `KEY:{key}:{event}`, `READY`, `PONG`
- Send outgoing: `LED:{key}:{color}`, `LED:ALL:{color}`, `PING`
- Reconnect via `tokio::time::sleep(Duration::from_secs(3))` — single attempt, not interval
- Keepalive: PING every 5s, close if no PONG within next cycle
- Emit events to frontend: `key-event`, `device-status`, `ready`

### protocol.rs

Port of `shared/protocol.ts` to Rust. Parsing and building serial protocol messages:

- `parse_key_event(line: &str) -> Option<KeyEvent>`
- `build_led_command(key: &str, color: &str) -> String`
- `build_led_all_command(color: &str) -> String`

### profiles.rs

Profile configuration management:

- Load/save `profiles.json` from `tauri::api::path::app_data_dir()` (resolves to `%APPDATA%/keybow-companion/`)
- Serde structs matching the existing JSON schema: `ProfileConfig`, `Profile`, `KeyAction`, `AppTarget`
- Methods: `load()`, `save()`, `cycle_profile()`, `set_profile(name)`
- Create default config if file doesn't exist

### app_switcher.rs

Focus or launch applications using Win32 APIs:

- `EnumWindows` + `GetWindowThreadProcessId` to find windows by process name
- `SetForegroundWindow` to focus (with `AllowSetForegroundWindow` workaround)
- `CreateProcessW` to launch if not running
- No shell injection risk — pure API calls, no string interpolation

### app_detector.rs

Scan installed applications:

- Read Windows Registry `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall` and `HKCU\...` for installed programs (DisplayName, InstallLocation, DisplayIcon)
- Scan Start Menu shortcuts via `IShellLinkW` COM interface to extract target exe paths
- Derive process name from exe filename (strip `.exe`)
- Cache results in memory after first scan
- Return `Vec<DetectedApp>` with `{ name, process, path }`

### auto_switch.rs

Foreground window polling for automatic profile switching:

- Poll `GetForegroundWindow()` + `GetWindowThreadProcessId()` every 1 second via `tokio::time::interval`
- Get process name from PID via `OpenProcess` + `QueryFullProcessImageNameW`
- Match against `autoSwitch` config map (process name → profile name)
- Skip if manual override is active
- Emit `profile-changed` event when switching

### action_executor.rs

Dispatch key press actions:

- `app` → `app_switcher.focus_or_launch(target)`
- `url` → send `focusOrOpen` to IPC server (browser extension), fall back to `tauri::shell::open` after 2s
- `profile_cycle` → `profiles.cycle_profile()`
- `profile_set` → `profiles.set_profile(name)`
- On error: send red LED flash (`LED:{key}:FF0000`, wait 500ms, restore)

### ipc_server.rs

TCP bridge for browser extension native messaging:

- `tokio::net::TcpListener` bound to `127.0.0.1:23847`
- JSON-over-newline protocol (same as current)
- Track connected clients for broadcast
- Browser extension's `native-host.js` connects identically — no extension changes needed

### commands.rs

Tauri command handlers invoked by the frontend:

| Command | Maps to |
|---------|---------|
| `get_config` | `profiles.load()` |
| `save_config` | `profiles.save(config)` |
| `get_installed_apps` | `app_detector.get_apps()` |
| `browse_for_app` | `tauri::api::dialog::FileDialogBuilder` with `.exe` filter |
| `get_templates` | Return embedded `templates.json` via `include_str!` |
| `get_suggestions` | Return embedded `suggestions.json` via `include_str!` |
| `preview_led` | `serial.send_led(key, color)` |

### main.rs

Application entry point:

- Initialize all modules (serial, profiles, app_detector, auto_switch, action_executor, ipc_server)
- Configure system tray with menu (profile list, reconnect, quit)
- Set up Tauri app with commands and event handlers
- Start serial connection and app detection scan
- Window: single config window, show/hide from tray

## Frontend Migration

### api.ts — Tauri adapter

New file that wraps `@tauri-apps/api` calls, matching the current `window.keybow` shape:

```typescript
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export const keybow = {
  getConfig: () => invoke<ProfileConfig>('get_config'),
  saveConfig: (config: ProfileConfig) => invoke<boolean>('save_config', { config }),
  getInstalledApps: () => invoke<DetectedApp[]>('get_installed_apps'),
  browseForApp: () => invoke<DetectedApp | null>('browse_for_app'),
  getTemplates: () => invoke<any>('get_templates'),
  getSuggestions: () => invoke<any>('get_suggestions'),
  previewLed: (key: string, color: string) => invoke('preview_led', { key, color }),
  onProfileChanged: (cb: (name: string) => void) => {
    listen<string>('profile-changed', (e) => cb(e.payload));
  },
  onDeviceStatus: (cb: (connected: boolean) => void) => {
    listen<boolean>('device-status', (e) => cb(e.payload));
  },
  onKeyEvent: (cb: (key: string, event: string) => void) => {
    listen<{ key: string; event: string }>('key-event', (e) => cb(e.payload.key, e.payload.event));
  },
};
```

### Component changes

- `app.tsx` — Replace `window.keybow` usage with `import { keybow } from './api'`. Remove `declare global Window` block. Remove `import './styles/wizard.css'` duplication if present.
- All other components — **no changes**. They receive data via props from `app.tsx`.

### Build tooling

- **Vite** with `@vitejs/plugin-react` (Tauri default)
- **TypeScript** config simplified (no webpack loaders)
- **vitest** stays as test runner

## Testing

### Rust tests (`cargo test`)

- **protocol.rs** — Port existing protocol.test.ts assertions (parse key events, build LED commands)
- **serial.rs** — Unit tests with mock serial port trait for parsing and reconnect logic
- **profiles.rs** — Unit tests for load/save/cycle with temp directory
- **app_detector.rs** — Integration test on Windows (reads real registry)
- **commands.rs** — Test handlers with mocked dependencies

### Frontend tests (`npx vitest`)

- Existing shared type tests stay unchanged
- No new component tests (none existed before)

## Migration Sequence

1. Install Rust + Tauri CLI
2. Scaffold Tauri project alongside Electron
3. Port protocol.rs + profiles.rs (no platform deps, easy to test)
4. Port serial.rs (critical path, unblocks LED and key events)
5. Port app_switcher.rs + app_detector.rs (win32 APIs)
6. Port auto_switch.rs + action_executor.rs
7. Port ipc_server.rs (browser extension bridge)
8. Set up main.rs (tray, window, command registration)
9. Move React frontend, create api.ts adapter, set up Vite
10. Integration testing + smoke test
11. Delete Electron directory

## Out of Scope

- macOS/Linux support (Windows-only, same as current)
- Auto-updater (future feature)
- Installer customization beyond default Tauri MSI/NSIS
- New features — this is a 1:1 migration of existing functionality
