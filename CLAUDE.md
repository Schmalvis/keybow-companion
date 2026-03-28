# Keybow Companion

Configurable macro keyboard companion app for the Pimoroni Keybow 2040.

## Tech Stack
- **Firmware:** CircuitPython + PMK library
- **Companion App:** Tauri 2 (Rust backend + React frontend)
- **Config UI:** React 19 + Vite
- **Browser Extension:** Vanilla JS, Manifest V3
- **Serial:** serialport-rs crate (pure Rust)
- **Window Management:** Win32 APIs via windows crate (no PowerShell)

## Commands
- `cargo tauri dev` — run app in dev mode (Vite + Rust)
- `cargo tauri build` — package the app (~10MB installer)
- `cd src-tauri && cargo test` — run Rust tests
- `npm run build` — build frontend only

## Project Structure
- `src/` — React frontend (components, styles, api.ts)
- `src-tauri/` — Rust backend (serial, profiles, app switching, IPC)
- `extension/` — Chrome browser extension
- `firmware/` — CircuitPython firmware

## Conventions
- Serial protocol: UTF-8, \n terminated, 115200 baud, 64 byte max
- Key grid: A1-D4 (rows A-D, columns 1-4)
- Config stored in %APPDATA%/keybow-companion/profiles.json
- Keybow must be connected directly to laptop USB (Thunderbolt docks don't pass CDC serial)
