# Keybow Companion

Configurable macro keyboard companion app for the Pimoroni Keybow 2040.

## Tech Stack
- **Firmware:** CircuitPython + PMK library
- **Companion App:** Electron + TypeScript + electron-forge
- **Config UI:** React + Radix UI
- **Browser Extension:** Vanilla JS, Manifest V3
- **Serial:** serialport npm package
- **Window Management:** PowerShell via execFile (never exec)

## Commands
- `cd electron && npm start` — run Electron in dev mode
- `cd electron && npm run build` — package the app
- `cd electron && npx vitest` — run tests

## Conventions
- Serial protocol: UTF-8, \n terminated, 115200 baud, 64 byte max
- Key grid: A1-D4 (rows A-D, columns 1-4)
- Config stored in %APPDATA%/keybow-companion/profiles.json
- SECURITY: Always use execFile, never exec, to prevent command injection
