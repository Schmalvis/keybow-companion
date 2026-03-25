# Keybow Companion

A desktop companion app for the Pimoroni Keybow 2040 macro pad. It manages key profiles, drives LED colors over USB serial, and integrates with Chrome/Edge via a browser extension to support browser-tab–focused actions.

## Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Firmware | `firmware/` | CircuitPython code running on the Keybow 2040 |
| Electron app | `electron/` | Main process: serial comms, profile engine, system tray |
| Browser extension | `extension/` | Detects active tab URL and relays focus/open requests |

## Prerequisites

- **Node.js** 18 or later
- **Chrome or Edge** (for the browser extension)
- **Pimoroni Keybow 2040** hardware flashed with CircuitPython

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd keybow-companion/electron
npm install
```

### 2. Flash the firmware

Copy the firmware files to the CIRCUITPY drive that appears when you plug in the Keybow 2040:

```
firmware/code.py        → CIRCUITPY/code.py
firmware/lib/           → CIRCUITPY/lib/
```

The device will reboot and begin sending key events over USB serial.

### 3. Install the browser extension

1. Open Chrome or Edge and navigate to `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder.
4. Register the native messaging host so the extension can talk to the Electron app:

```bash
# Copy the manifest to the correct platform location, e.g. on Windows:
# HKCU\Software\Google\Chrome\NativeMessagingHosts\com.keybow.companion
# pointing at extension/native-host.js
#
# See extension/native-messaging.json for the host manifest.
```

### 4. Run the app

```bash
cd electron
npm start
```

The app starts minimised to the system tray. Click the tray icon to open the config UI.

## Configuration

Open the config window from the system tray icon. The UI lets you:

- Create and reorder **profiles** (each profile defines key colors and actions).
- Assign **actions** to individual keys: launch URL, focus app, send keystrokes, switch profile, or cycle profiles.
- Set an **auto-switch** rule per profile so the active profile changes automatically when a matching application gains focus.
- Choose the **profile-cycle key** (default: D4, the bottom-right key).

Changes are saved immediately to `%APPDATA%\keybow-companion\profiles.json` (or the platform equivalent).

## Development

```bash
cd electron

# Start in dev mode (hot-reloads renderer)
npm start

# Run unit tests
npx vitest run

# Build distributable
npm run build
```

## Project Structure

```
keybow-companion/
├── firmware/
│   ├── code.py               # CircuitPython main loop (reads keys, drives LEDs)
│   └── lib/pmk/              # PMK platform library for Keybow 2040
├── extension/
│   ├── manifest.json         # Chrome extension manifest
│   ├── background.js         # Service worker: tab tracking, native messaging client
│   ├── native-host.js        # Node.js native messaging host shim
│   └── native-messaging.json # Native messaging host manifest
└── electron/
    └── src/
        ├── index.ts           # Main process entry point
        ├── shared/
        │   ├── types.ts       # Shared TypeScript types (ProfileConfig, GridKey, …)
        │   └── protocol.ts    # Serial wire protocol helpers
        └── main/
            ├── profiles.ts    # Profile engine (CRUD, active profile, key colors)
            ├── serial.ts      # USB serial manager (connect, LED, key events)
            ├── app-switcher.ts# Active-window detection (Windows/macOS/Linux)
            ├── auto-switch.ts # Auto-switches profile on app-focus change
            ├── action-executor.ts # Dispatches key actions
            ├── ipc-server.ts  # Electron IPC handlers for the renderer
            └── native-host.ts # Bridge to browser extension native messaging host
```
