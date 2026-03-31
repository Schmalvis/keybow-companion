# Tauri Migration Plan C: App Shell + Frontend + Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Rust backend into a working Tauri app with tray, commands, and the React frontend. Delete the Electron directory when complete.

**Architecture:** main.rs initializes all Rust modules and registers Tauri commands. commands.rs exposes the backend to the frontend via `#[tauri::command]`. The React frontend is moved from `electron/src/renderer/` to `src/`, with a new `api.ts` adapter replacing `window.keybow`. Vite replaces webpack.

**Tech Stack:** Tauri 2.x, React 19, Vite, TypeScript

**Prerequisites:** Plans A and B complete (44 Rust tests passing, all modules compiling).

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src-tauri/src/main.rs` | Full app entry — init modules, tray, window, command registration |
| `src-tauri/src/commands.rs` | Tauri command handlers (get_config, save_config, etc.) |
| `src-tauri/src/lib.rs` | Add commands module |
| `package.json` | Root package.json for Vite + React |
| `vite.config.ts` | Vite configuration |
| `tsconfig.json` | TypeScript config |
| `index.html` | Vite entry HTML |
| `src/main.tsx` | React entry point |
| `src/api.ts` | Tauri invoke/listen adapter |
| `src/app.tsx` | Main App component (from electron) |
| `src/components/` | All React components (from electron) |
| `src/styles/` | CSS files (from electron) |
| `src/data/` | templates.json + suggestions.json (from electron) |

---

### Task 1: Tauri Commands

**Files:**
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create commands.rs**

Create `src-tauri/src/commands.rs`:

```rust
use std::sync::Mutex;

use tauri::State;

use crate::app_detector::AppDetector;
use crate::profiles::ProfileEngine;
use crate::serial::SerialManager;
use crate::types::ProfileConfig;

pub struct AppState {
    pub profiles: Mutex<ProfileEngine>,
    pub serial: Mutex<SerialManager>,
    pub app_detector: Mutex<AppDetector>,
    pub templates: String,
    pub suggestions: String,
}

#[tauri::command]
pub fn get_config(state: State<AppState>) -> Result<ProfileConfig, String> {
    let profiles = state.profiles.lock().map_err(|e| e.to_string())?;
    Ok(profiles.get_config().clone())
}

#[tauri::command]
pub fn save_config(config: ProfileConfig, state: State<AppState>) -> Result<bool, String> {
    let mut profiles = state.profiles.lock().map_err(|e| e.to_string())?;
    profiles.set_config(config);
    profiles.save().map_err(|e| e.to_string())?;

    // Update LEDs to reflect new config
    let serial = state.serial.lock().map_err(|e| e.to_string())?;
    let colors = profiles.get_all_key_colors();
    for (key, color) in &colors {
        serial.send_led(key, color);
    }

    Ok(true)
}

#[tauri::command]
pub fn get_installed_apps(state: State<AppState>) -> Result<Vec<crate::app_detector::DetectedApp>, String> {
    let detector = state.app_detector.lock().map_err(|e| e.to_string())?;
    Ok(detector.get_apps())
}

#[tauri::command]
pub async fn browse_for_app(window: tauri::Window) -> Result<Option<crate::app_detector::DetectedApp>, String> {
    use tauri::api::dialog::FileDialogBuilder;

    let (tx, rx) = std::sync::mpsc::channel();

    FileDialogBuilder::new()
        .add_filter("Executables", &["exe"])
        .set_title("Select Application")
        .pick_file(move |path| {
            let result = path.map(|p| {
                let path_str = p.to_string_lossy().to_string();
                let process = p.file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                let name = process.clone();
                crate::app_detector::DetectedApp { name, process, path: path_str }
            });
            let _ = tx.send(result);
        });

    rx.recv().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_templates(state: State<AppState>) -> Result<serde_json::Value, String> {
    serde_json::from_str(&state.templates).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_suggestions(state: State<AppState>) -> Result<serde_json::Value, String> {
    serde_json::from_str(&state.suggestions).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn preview_led(key: String, color: String, state: State<AppState>) -> Result<(), String> {
    let serial = state.serial.lock().map_err(|e| e.to_string())?;
    serial.send_led(&key, &color);
    Ok(())
}
```

- [ ] **Step 2: Update lib.rs**

Add `pub mod commands;` to `src-tauri/src/lib.rs`.

- [ ] **Step 3: Verify it compiles**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo build
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add Tauri command handlers for frontend IPC"
```

---

### Task 2: Main.rs — Full App Entry

**Files:**
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Implement full main.rs**

Replace `src-tauri/src/main.rs` with:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use keybow_companion::app_detector::AppDetector;
use keybow_companion::auto_switch::AutoSwitch;
use keybow_companion::commands::{self, AppState};
use keybow_companion::ipc_server::IpcServer;
use keybow_companion::profiles::ProfileEngine;
use keybow_companion::serial::{SerialEvent, SerialManager};

fn main() {
    env_logger::init();

    // Resolve config path
    let config_dir = dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("keybow-companion");
    let config_path = config_dir.join("profiles.json");

    // Initialize modules
    let profiles = ProfileEngine::load(config_path);
    let serial = SerialManager::new();
    let app_detector = AppDetector::new();

    // Scan for installed apps in background
    let detector_ref = &app_detector;
    thread::spawn(move || {
        // Small delay to not block startup
        thread::sleep(Duration::from_millis(500));
    });

    // Try initial serial connection
    if let Err(e) = serial.connect() {
        log::warn!("Initial serial connection failed: {}", e);
    }

    let app_state = AppState {
        profiles: Mutex::new(profiles),
        serial: Mutex::new(serial),
        app_detector: Mutex::new(app_detector),
        templates: include_str!("../../electron/src/data/templates.json").to_string(),
        suggestions: include_str!("../../electron/src/data/suggestions.json").to_string(),
    };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::get_installed_apps,
            commands::browse_for_app,
            commands::get_templates,
            commands::get_suggestions,
            commands::preview_led,
        ])
        .setup(|app| {
            // Start serial polling in background
            let app_handle = app.handle().clone();
            thread::spawn(move || {
                serial_poll_loop(app_handle);
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running Keybow Companion");
}

fn serial_poll_loop(app: tauri::AppHandle) {
    let mut reconnect_delay = Duration::from_secs(3);

    loop {
        // Get serial manager from state
        let state = app.state::<AppState>();
        let serial = state.serial.lock().unwrap();

        if !serial.is_connected() {
            drop(serial);
            // Try to reconnect
            let serial = state.serial.lock().unwrap();
            match SerialManager::auto_detect() {
                Some(_) => {
                    drop(serial);
                    let mut serial = state.serial.lock().unwrap();
                    // Disconnect old, try fresh connect
                    serial.disconnect();
                    drop(serial);
                    let serial_new = state.serial.lock().unwrap();
                    if serial_new.connect().is_ok() {
                        let _ = app.emit("device-status", true);
                        reconnect_delay = Duration::from_secs(3);
                    }
                    drop(serial_new);
                }
                None => {
                    drop(serial);
                    let _ = app.emit("device-status", false);
                }
            }
            thread::sleep(reconnect_delay);
            continue;
        }

        // Read a line if available
        if let Some(data) = serial.read_line() {
            for line in data.lines() {
                if let Some(event) = serial.handle_line(line) {
                    match event {
                        SerialEvent::KeyEvent(ke) => {
                            let _ = app.emit("key-event", &ke);
                        }
                        SerialEvent::Ready => {
                            let _ = app.emit("device-status", true);
                            // Send all LED colors
                            let profiles = state.profiles.lock().unwrap();
                            let colors = profiles.get_all_key_colors();
                            for (key, color) in &colors {
                                serial.send_led(key, color);
                            }
                        }
                        SerialEvent::Pong => {
                            // Connection alive
                        }
                        SerialEvent::Connected | SerialEvent::Disconnected => {}
                    }
                }
            }
        }

        drop(serial);
        thread::sleep(Duration::from_millis(10));
    }
}
```

- [ ] **Step 2: Add `dirs` crate to Cargo.toml**

Add `dirs = "6"` to the `[dependencies]` section.

- [ ] **Step 3: Verify it compiles**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo build
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/main.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat: wire full main.rs with serial polling, commands, and app state"
```

---

### Task 3: Vite + React Frontend Setup

**Files:**
- Create: `package.json` (root)
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `src/main.tsx`

- [ ] **Step 1: Create root package.json**

Create `package.json` in the project root (NOT inside electron/):

```json
{
  "name": "keybow-companion",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^2",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4",
    "typescript": "^5.7.0",
    "vite": "^6"
  }
}
```

- [ ] **Step 2: Create vite.config.ts**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "esnext",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    outDir: "dist",
  },
});
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "useDefineForClassFields": true,
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create index.html**

Create `index.html` in the project root:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Keybow Companion</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create src/main.tsx**

```typescript
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./styles/app.css";
import "./styles/wizard.css";

createRoot(document.getElementById("root")!).render(<App />);
```

- [ ] **Step 6: Install npm dependencies**

```bash
npm install
```

- [ ] **Step 7: Commit**

```bash
git add package.json vite.config.ts tsconfig.json index.html src/main.tsx package-lock.json
git commit -m "feat: set up Vite + React frontend build"
```

---

### Task 4: Move React Frontend

**Files:**
- Create: `src/api.ts`
- Copy: `src/app.tsx` (from electron, modified)
- Copy: `src/components/` (from electron)
- Copy: `src/styles/` (from electron)
- Copy: `src/data/` (from electron)

- [ ] **Step 1: Create the Tauri API adapter**

Create `src/api.ts`:

```typescript
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ProfileConfig } from "./types";

interface DetectedApp {
  name: string;
  process: string;
  path: string;
}

export const keybow = {
  getConfig: () => invoke<ProfileConfig>("get_config"),
  saveConfig: (config: ProfileConfig) =>
    invoke<boolean>("save_config", { config }),
  getInstalledApps: () => invoke<DetectedApp[]>("get_installed_apps"),
  browseForApp: () => invoke<DetectedApp | null>("browse_for_app"),
  getTemplates: () => invoke<any>("get_templates"),
  getSuggestions: () => invoke<any>("get_suggestions"),
  previewLed: (key: string, color: string) =>
    invoke("preview_led", { key, color }),
  onProfileChanged: (cb: (name: string) => void) => {
    listen<string>("profile-changed", (e) => cb(e.payload));
  },
  onDeviceStatus: (cb: (connected: boolean) => void) => {
    listen<boolean>("device-status", (e) => cb(e.payload));
  },
  onKeyEvent: (cb: (key: string, event: string) => void) => {
    listen<{ key: string; event: string }>("key-event", (e) =>
      cb(e.payload.key, e.payload.event),
    );
  },
};
```

- [ ] **Step 2: Copy shared types**

```bash
cp electron/src/shared/types.ts src/types.ts
```

- [ ] **Step 3: Copy components**

```bash
mkdir -p src/components/wizard
cp electron/src/renderer/components/KeyGrid.tsx src/components/
cp electron/src/renderer/components/ProfileBar.tsx src/components/
cp electron/src/renderer/components/TemplatePicker.tsx src/components/
cp electron/src/renderer/components/wizard/*.tsx src/components/wizard/
```

- [ ] **Step 4: Copy styles**

```bash
mkdir -p src/styles
cp electron/src/renderer/styles/app.css src/styles/
cp electron/src/renderer/styles/wizard.css src/styles/
```

- [ ] **Step 5: Copy data files**

```bash
mkdir -p src/data
cp electron/src/data/templates.json src/data/
cp electron/src/data/suggestions.json src/data/
```

- [ ] **Step 6: Create app.tsx with Tauri API adapter**

Create `src/app.tsx` — this is the Electron app.tsx rewritten to use the Tauri API:

```typescript
import React, { useState, useEffect } from "react";
import { KeyGrid } from "./components/KeyGrid";
import { ProfileBar } from "./components/ProfileBar";
import { TemplatePicker } from "./components/TemplatePicker";
import { WizardPanel } from "./components/wizard/WizardPanel";
import { keybow } from "./api";
import type { ProfileConfig, GridKey, KeyAction } from "./types";

export function App() {
  const [config, setConfig] = useState<ProfileConfig | null>(null);
  const [selectedKey, setSelectedKey] = useState<GridKey | null>(null);
  const [connected, setConnected] = useState(false);
  const [pressedKey, setPressedKey] = useState<GridKey | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [suggestions, setSuggestions] = useState<any>(null);
  const [installedApps, setInstalledApps] = useState<
    Array<{ name: string; process: string; path: string }>
  >([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedKey(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    keybow.getConfig().then(setConfig);
    keybow.getSuggestions().then(setSuggestions);
    keybow.getInstalledApps().then(setInstalledApps);
    keybow.onProfileChanged((name) => {
      setConfig((prev) => (prev ? { ...prev, activeProfile: name } : prev));
    });
    keybow.onDeviceStatus(setConnected);
    keybow.onKeyEvent((key, event) => {
      if (event === "PRESS") {
        setPressedKey(key as GridKey);
      } else if (event === "RELEASE") {
        setPressedKey(null);
      }
    });
  }, []);

  if (!config) return <div className="loading">Loading...</div>;

  const activeProfile = config.profiles[config.activeProfile];

  const handleSave = async (updated: ProfileConfig) => {
    setConfig(updated);
    await keybow.saveConfig(updated);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Keybow Companion</h1>
        <span
          className={`status ${connected ? "connected" : "disconnected"}`}
        >
          {connected ? "Connected" : "Disconnected"}
        </span>
      </header>
      <ProfileBar
        config={config}
        onSave={handleSave}
        onOpenTemplates={() => setShowTemplates(true)}
      />
      <div className="main-content">
        <KeyGrid
          profile={activeProfile}
          selectedKey={selectedKey}
          pressedKey={pressedKey}
          onSelectKey={setSelectedKey}
        />
        {selectedKey ? (
          <WizardPanel
            gridKey={selectedKey}
            existingAction={activeProfile.keys[selectedKey]}
            defaultColor={activeProfile.defaultColor}
            profileNames={config.profileOrder}
            suggestions={suggestions}
            installedApps={installedApps}
            onSave={(key: GridKey, action: KeyAction) => {
              const updated = { ...config };
              updated.profiles[config.activeProfile] = {
                ...activeProfile,
                keys: { ...activeProfile.keys, [key]: action },
              };
              handleSave(updated);
            }}
            onRemove={(key: GridKey) => {
              const updated = { ...config };
              const newKeys = { ...activeProfile.keys };
              delete newKeys[key];
              updated.profiles[config.activeProfile] = {
                ...activeProfile,
                keys: newKeys,
              };
              handleSave(updated);
              setSelectedKey(null);
            }}
            onCancel={() => setSelectedKey(null)}
          />
        ) : (
          <div className="wizard-empty">
            <div className="wizard-empty-icon">👈</div>
            <p>Click a key to configure it</p>
            <p className="hint">
              or use <strong>Templates</strong> to set up the whole grid
            </p>
          </div>
        )}
      </div>
      {showTemplates && (
        <TemplatePicker
          config={config}
          onApply={handleSave}
          onClose={() => setShowTemplates(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Fix component imports**

The copied components import types from `../../shared/types` or `../../../shared/types`. These paths need updating. Run these replacements:

In `src/components/KeyGrid.tsx`, `src/components/ProfileBar.tsx`, `src/components/TemplatePicker.tsx`:
- Change `from '../../shared/types'` to `from '../types'`

In `src/components/wizard/*.tsx`:
- Change `from '../../../shared/types'` to `from '../../types'`

Also, the wizard components reference `window.keybow` — these need to import from `api.ts` instead:

In `src/components/wizard/ConfigureApp.tsx` and `src/components/wizard/ConfigureUrl.tsx`:
- Remove any `window.keybow` calls (these should already be removed since we lifted data to props in the perf optimization)

In `src/components/wizard/LabelColors.tsx`:
- Change `window.keybow.previewLed(...)` to import and use `keybow` from `../../api`

In `src/components/TemplatePicker.tsx`:
- Change `window.keybow.getTemplates()` to import from `../api` — but actually templates are passed as props now, so check if this still exists

- [ ] **Step 8: Update tauri.conf.json**

Update `src-tauri/tauri.conf.json` build commands now that Vite is set up:

```json
"build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
}
```

- [ ] **Step 9: Verify the frontend builds**

```bash
npm run build
```

Expected: Vite builds to `dist/`.

- [ ] **Step 10: Commit**

```bash
git add src/ src-tauri/tauri.conf.json
git commit -m "feat: migrate React frontend to Tauri with api.ts adapter"
```

---

### Task 5: Integration Test — Run the App

- [ ] **Step 1: Start the Tauri dev server**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cargo tauri dev
```

Expected: Vite dev server starts, Rust backend compiles, app window opens with the wizard UI.

- [ ] **Step 2: Verify basic functionality**

- App window opens with KeyGrid and empty state
- Clicking a key opens the wizard
- Templates button opens modal
- If Keybow is connected directly, shows "Connected"

- [ ] **Step 3: Fix any issues found**

- [ ] **Step 4: Commit fixes**

```bash
git add -A
git commit -m "fix: integration fixes from Tauri dev testing"
```

---

### Task 6: Run All Tests

- [ ] **Step 1: Run Rust tests**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo test --lib
```

Expected: All 44+ tests pass.

- [ ] **Step 2: Commit if any test fixes needed**

---

### Task 7: Delete Electron Directory

- [ ] **Step 1: Remove Electron directory**

```bash
rm -rf electron/
```

- [ ] **Step 2: Move data files if main.rs references them from electron/**

Check if `main.rs` uses `include_str!("../../electron/src/data/...")`. If so, update to reference `../../src/data/...` instead.

- [ ] **Step 3: Update CLAUDE.md**

Update the project's CLAUDE.md to reflect the new tech stack:

Replace the Tech Stack and Commands sections with Tauri equivalents.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete Tauri migration — remove Electron directory"
```

---

## Plan C Complete

At this point:
- Tauri app runs with full UI (wizard, templates, key grid)
- Serial communication works
- Windows app detection/switching works
- Browser extension TCP bridge works
- Electron directory deleted
- Packaged app will be ~10MB instead of ~200MB
