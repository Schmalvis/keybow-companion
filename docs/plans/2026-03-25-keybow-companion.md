# Keybow Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a configurable macro keyboard system: Keybow 2040 firmware (serial relay), Electron companion app (tray + config UI), and browser extension (tab management).

**Architecture:** Four components communicating via serial (firmware-to-Electron) and native messaging (Electron-to-browser extension). The Keybow sends key events over serial; the Electron app executes actions (launch/switch apps, manage browser tabs) and sends LED commands back. Config is stored in a JSON file and edited via a React UI in the Electron renderer.

**Tech Stack:** CircuitPython (firmware), Electron + TypeScript + electron-forge (companion app), React + Radix UI (config UI), Vanilla JS Manifest V3 (browser extension), serialport (npm), Win32 API via PowerShell/execFile (window management).

**Spec:** `docs/superpowers/specs/2026-03-25-keybow-companion-design.md`

---

## File Structure

```
keybow-companion/                     # new git repo inside pmk-circuitpython/
├── firmware/
│   ├── code.py                       # main firmware: serial relay + LED control
│   └── lib/pmk/                      # PMK library (copied from parent repo)
├── electron/
│   ├── package.json
│   ├── tsconfig.json
│   ├── forge.config.ts               # electron-forge packaging config
│   ├── src/
│   │   ├── main/
│   │   │   ├── index.ts              # app entry: tray, window, module init
│   │   │   ├── serial.ts             # serial port: auto-detect, read/write, reconnect
│   │   │   ├── profiles.ts           # profile engine: load/save/cycle/switch
│   │   │   ├── app-switcher.ts       # find/focus/launch Windows apps via execFile
│   │   │   ├── auto-switch.ts        # poll foreground window, auto-switch profiles
│   │   │   ├── native-host.ts        # IPC bridge to native-host.js
│   │   │   ├── ipc-server.ts         # local IPC server for native host comms
│   │   │   └── action-executor.ts    # dispatch key actions to correct handler
│   │   ├── renderer/
│   │   │   ├── index.html
│   │   │   ├── app.tsx               # React root
│   │   │   ├── components/
│   │   │   │   ├── KeyGrid.tsx       # visual 4x4 grid
│   │   │   │   ├── KeyConfig.tsx     # per-key action/color editor
│   │   │   │   └── ProfileBar.tsx    # profile tabs + management
│   │   │   └── styles/
│   │   │       └── app.css
│   │   ├── preload/
│   │   │   └── index.ts              # preload script for IPC bridge
│   │   └── shared/
│   │       ├── types.ts              # shared TypeScript types
│   │       └── protocol.ts           # serial protocol constants and parsers
│   ├── test/
│   │   ├── serial.test.ts
│   │   ├── profiles.test.ts
│   │   ├── app-switcher.test.ts
│   │   ├── auto-switch.test.ts
│   │   ├── protocol.test.ts
│   │   └── action-executor.test.ts
├── extension/
│   ├── manifest.json                 # Manifest V3
│   ├── background.js                 # service worker
│   ├── native-host.js                # launched by Chrome, talks to Electron via IPC
│   └── native-messaging.json         # host manifest for registry
└── README.md
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `keybow-companion/` directory with git repo
- Create: `keybow-companion/electron/package.json`
- Create: `keybow-companion/electron/tsconfig.json`
- Create: `keybow-companion/electron/forge.config.ts`
- Create: `keybow-companion/CLAUDE.md`

- [ ] **Step 1: Create the keybow-companion directory and initialize git**

```bash
cd c:/Users/malvis/ws/pmk-circuitpython
mkdir -p keybow-companion
cd keybow-companion
git init
```

- [ ] **Step 2: Scaffold Electron app with electron-forge**

```bash
cd keybow-companion/electron
npm init electron-app@latest . -- --template=webpack-typescript
```

This creates the base Electron + TypeScript + Webpack project with:
- `package.json` with electron-forge scripts
- `tsconfig.json`
- `forge.config.ts`
- `src/` scaffold

- [ ] **Step 3: Install additional dependencies**

```bash
cd keybow-companion/electron
npm install serialport react react-dom @radix-ui/react-select @radix-ui/react-popover @radix-ui/react-dialog
npm install -D @types/react @types/react-dom vitest
```

- [ ] **Step 4: Verify the scaffold runs**

```bash
cd keybow-companion/electron
npm start
```

Expected: An Electron window opens with the default forge template. Close it.

- [ ] **Step 5: Create CLAUDE.md**

Create `keybow-companion/CLAUDE.md` with:

```markdown
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
```

- [ ] **Step 6: Commit**

```bash
cd keybow-companion
git add -A
git commit -m "feat: scaffold Electron + TypeScript project with electron-forge"
```

---

## Task 2: Shared Types and Protocol Parser

**Files:**
- Create: `electron/src/shared/types.ts`
- Create: `electron/src/shared/protocol.ts`
- Create: `electron/test/protocol.test.ts`

- [ ] **Step 1: Write types.ts**

```typescript
// electron/src/shared/types.ts

export type GridKey =
  | 'A1' | 'A2' | 'A3' | 'A4'
  | 'B1' | 'B2' | 'B3' | 'B4'
  | 'C1' | 'C2' | 'C3' | 'C4'
  | 'D1' | 'D2' | 'D3' | 'D4';

export type ActionType = 'app' | 'url' | 'profile_cycle' | 'profile_set';

export interface AppTarget {
  process: string;
  path: string;
}

export interface KeyAction {
  action: ActionType;
  target?: string | AppTarget;
  label: string;
  pressColor?: string;
  activeColor?: string;
}

export interface Profile {
  name: string;
  icon?: string;
  defaultColor: string;
  keys: Partial<Record<GridKey, KeyAction>>;
}

export interface ProfileConfig {
  version: number;
  activeProfile: string;
  profileSwitchKey: GridKey;
  profileOrder: string[];
  autoSwitch: Record<string, string>;
  profiles: Record<string, Profile>;
}

export type KeyEventType = 'PRESS' | 'RELEASE' | 'HOLD';

export interface KeyEvent {
  key: GridKey;
  event: KeyEventType;
}
```

- [ ] **Step 2: Write failing tests for protocol parser**

```typescript
// electron/test/protocol.test.ts
import { describe, it, expect } from 'vitest';
import { parseKeyEvent, buildLedCommand, buildLedAllCommand, isValidGridKey } from '../src/shared/protocol';

describe('protocol parser', () => {
  describe('parseKeyEvent', () => {
    it('parses a PRESS event', () => {
      expect(parseKeyEvent('KEY:A1:PRESS')).toEqual({ key: 'A1', event: 'PRESS' });
    });

    it('parses a RELEASE event', () => {
      expect(parseKeyEvent('KEY:D4:RELEASE')).toEqual({ key: 'D4', event: 'RELEASE' });
    });

    it('parses a HOLD event', () => {
      expect(parseKeyEvent('KEY:B3:HOLD')).toEqual({ key: 'B3', event: 'HOLD' });
    });

    it('returns null for READY message', () => {
      expect(parseKeyEvent('READY')).toBeNull();
    });

    it('returns null for PONG message', () => {
      expect(parseKeyEvent('PONG')).toBeNull();
    });

    it('returns null for malformed messages', () => {
      expect(parseKeyEvent('GARBAGE')).toBeNull();
      expect(parseKeyEvent('KEY:Z9:PRESS')).toBeNull();
      expect(parseKeyEvent('KEY:A1:JUMP')).toBeNull();
      expect(parseKeyEvent('')).toBeNull();
    });
  });

  describe('buildLedCommand', () => {
    it('builds a single key LED command', () => {
      expect(buildLedCommand('A1', 'FF5500')).toBe('LED:A1:FF5500\n');
    });

    it('builds an OFF command', () => {
      expect(buildLedCommand('A1', 'OFF')).toBe('LED:A1:OFF\n');
    });
  });

  describe('buildLedAllCommand', () => {
    it('builds an all-keys command', () => {
      expect(buildLedAllCommand('000000')).toBe('LED:ALL:000000\n');
    });

    it('builds an all-off command', () => {
      expect(buildLedAllCommand('OFF')).toBe('LED:ALL:OFF\n');
    });
  });

  describe('isValidGridKey', () => {
    it('accepts valid grid keys', () => {
      expect(isValidGridKey('A1')).toBe(true);
      expect(isValidGridKey('D4')).toBe(true);
    });

    it('rejects invalid grid keys', () => {
      expect(isValidGridKey('Z9')).toBe(false);
      expect(isValidGridKey('A5')).toBe(false);
      expect(isValidGridKey('')).toBe(false);
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd keybow-companion/electron
npx vitest run test/protocol.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement protocol.ts**

```typescript
// electron/src/shared/protocol.ts
import { GridKey, KeyEvent, KeyEventType } from './types';

const VALID_ROWS = ['A', 'B', 'C', 'D'] as const;
const VALID_COLS = ['1', '2', '3', '4'] as const;
const VALID_EVENTS: KeyEventType[] = ['PRESS', 'RELEASE', 'HOLD'];

const VALID_GRID_KEYS = new Set<string>();
for (const row of VALID_ROWS) {
  for (const col of VALID_COLS) {
    VALID_GRID_KEYS.add(`${row}${col}`);
  }
}

export function isValidGridKey(key: string): key is GridKey {
  return VALID_GRID_KEYS.has(key);
}

export function parseKeyEvent(message: string): KeyEvent | null {
  if (!message.startsWith('KEY:')) return null;

  const parts = message.split(':');
  if (parts.length !== 3) return null;

  const [, key, event] = parts;
  if (!isValidGridKey(key)) return null;
  if (!VALID_EVENTS.includes(event as KeyEventType)) return null;

  return { key: key as GridKey, event: event as KeyEventType };
}

export function buildLedCommand(key: GridKey, colorOrOff: string): string {
  return `LED:${key}:${colorOrOff}\n`;
}

export function buildLedAllCommand(colorOrOff: string): string {
  return `LED:ALL:${colorOrOff}\n`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd keybow-companion/electron
npx vitest run test/protocol.test.ts
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
cd keybow-companion
git add electron/src/shared/ electron/test/protocol.test.ts
git commit -m "feat: add shared types and serial protocol parser with tests"
```

---

## Task 3: Profile Engine

**Files:**
- Create: `electron/src/main/profiles.ts`
- Create: `electron/test/profiles.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// electron/test/profiles.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ProfileEngine } from '../src/main/profiles';
import type { ProfileConfig } from '../src/shared/types';

function makeTestConfig(): ProfileConfig {
  return {
    version: 1,
    activeProfile: 'Work',
    profileSwitchKey: 'D4',
    profileOrder: ['Work', 'Dev'],
    autoSwitch: { 'slack.exe': 'Work' },
    profiles: {
      Work: {
        name: 'Work',
        defaultColor: '004488',
        keys: {
          A1: { action: 'app', target: { process: 'slack.exe', path: 'C:\\slack.exe' }, label: 'Slack', activeColor: '4A154B' },
          D4: { action: 'profile_cycle', label: 'Next Profile', activeColor: 'FF8800' },
        },
      },
      Dev: {
        name: 'Dev',
        defaultColor: '008844',
        keys: {
          A1: { action: 'app', target: { process: 'code.exe', path: 'C:\\code.exe' }, label: 'VS Code', activeColor: '007ACC' },
          D4: { action: 'profile_cycle', label: 'Next Profile', activeColor: 'FF8800' },
        },
      },
    },
  };
}

describe('ProfileEngine', () => {
  let engine: ProfileEngine;

  beforeEach(() => {
    engine = new ProfileEngine(makeTestConfig());
  });

  it('returns the active profile', () => {
    expect(engine.getActiveProfile().name).toBe('Work');
  });

  it('returns key action for active profile', () => {
    const action = engine.getKeyAction('A1');
    expect(action?.label).toBe('Slack');
  });

  it('returns undefined for unconfigured key', () => {
    expect(engine.getKeyAction('C3')).toBeUndefined();
  });

  it('cycles to next profile', () => {
    engine.cycleProfile();
    expect(engine.getActiveProfile().name).toBe('Dev');
  });

  it('cycles back to first profile after last', () => {
    engine.cycleProfile();
    engine.cycleProfile();
    expect(engine.getActiveProfile().name).toBe('Work');
  });

  it('switches to a named profile', () => {
    engine.switchToProfile('Dev');
    expect(engine.getActiveProfile().name).toBe('Dev');
  });

  it('ignores switch to non-existent profile', () => {
    engine.switchToProfile('Gaming');
    expect(engine.getActiveProfile().name).toBe('Work');
  });

  it('resolves autoSwitch process to profile', () => {
    expect(engine.getAutoSwitchProfile('slack.exe')).toBe('Work');
  });

  it('returns undefined for unknown process', () => {
    expect(engine.getAutoSwitchProfile('notepad.exe')).toBeUndefined();
  });

  it('returns resolved color for key (activeColor)', () => {
    expect(engine.getKeyColor('A1')).toBe('4A154B');
  });

  it('falls back to profile defaultColor', () => {
    const config = makeTestConfig();
    delete config.profiles.Work.keys.A1!.activeColor;
    const e = new ProfileEngine(config);
    expect(e.getKeyColor('A1')).toBe('004488');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd keybow-companion/electron
npx vitest run test/profiles.test.ts
```

Expected: FAIL — ProfileEngine not found.

- [ ] **Step 3: Implement profiles.ts**

```typescript
// electron/src/main/profiles.ts
import { ProfileConfig, Profile, KeyAction, GridKey } from '../shared/types';

const ALL_KEYS: GridKey[] = [
  'A1','A2','A3','A4','B1','B2','B3','B4',
  'C1','C2','C3','C4','D1','D2','D3','D4',
];

export class ProfileEngine {
  private config: ProfileConfig;

  constructor(config: ProfileConfig) {
    this.config = config;
  }

  getActiveProfile(): Profile {
    return this.config.profiles[this.config.activeProfile];
  }

  getActiveProfileName(): string {
    return this.config.activeProfile;
  }

  getKeyAction(key: GridKey): KeyAction | undefined {
    return this.getActiveProfile().keys[key];
  }

  getKeyColor(key: GridKey): string {
    const action = this.getKeyAction(key);
    return action?.activeColor ?? this.getActiveProfile().defaultColor;
  }

  cycleProfile(): void {
    const order = this.config.profileOrder;
    const currentIndex = order.indexOf(this.config.activeProfile);
    const nextIndex = (currentIndex + 1) % order.length;
    this.config.activeProfile = order[nextIndex];
  }

  switchToProfile(name: string): void {
    if (this.config.profiles[name]) {
      this.config.activeProfile = name;
    }
  }

  getAutoSwitchProfile(processName: string): string | undefined {
    const profileName = this.config.autoSwitch[processName];
    if (profileName && this.config.profiles[profileName]) {
      return profileName;
    }
    return undefined;
  }

  getProfileOrder(): string[] {
    return this.config.profileOrder;
  }

  getConfig(): ProfileConfig {
    return this.config;
  }

  getAllKeyColors(): Record<GridKey, string> {
    const profile = this.getActiveProfile();
    const colors: Partial<Record<GridKey, string>> = {};
    for (const key of ALL_KEYS) {
      colors[key] = profile.keys[key]?.activeColor ?? profile.defaultColor;
    }
    return colors as Record<GridKey, string>;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd keybow-companion/electron
npx vitest run test/profiles.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd keybow-companion
git add electron/src/main/profiles.ts electron/test/profiles.test.ts
git commit -m "feat: add profile engine with cycling, switching, and color resolution"
```

---

## Task 4: Serial Communication Module

**Files:**
- Create: `electron/src/main/serial.ts`
- Create: `electron/test/serial.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// electron/test/serial.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SerialManager } from '../src/main/serial';
import { EventEmitter } from 'events';

class MockPort extends EventEmitter {
  isOpen = true;
  write = vi.fn((_data: string, cb?: (err?: Error) => void) => { cb?.(); });
  close = vi.fn((cb?: (err?: Error) => void) => { cb?.(); });
}

describe('SerialManager', () => {
  let manager: SerialManager;
  let mockPort: MockPort;

  beforeEach(() => {
    mockPort = new MockPort();
    manager = new SerialManager();
    manager.setPort(mockPort as any);
  });

  it('emits keyEvent when receiving KEY message', () => {
    const handler = vi.fn();
    manager.on('keyEvent', handler);
    manager.handleLine('KEY:A1:PRESS');
    expect(handler).toHaveBeenCalledWith({ key: 'A1', event: 'PRESS' });
  });

  it('emits ready when receiving READY message', () => {
    const handler = vi.fn();
    manager.on('ready', handler);
    manager.handleLine('READY');
    expect(handler).toHaveBeenCalled();
  });

  it('ignores malformed messages', () => {
    const handler = vi.fn();
    manager.on('keyEvent', handler);
    manager.handleLine('GARBAGE');
    expect(handler).not.toHaveBeenCalled();
  });

  it('sends LED command to port', () => {
    manager.sendLed('A1', 'FF5500');
    expect(mockPort.write).toHaveBeenCalledWith('LED:A1:FF5500\n', expect.any(Function));
  });

  it('sends LED ALL command', () => {
    manager.sendLedAll('000000');
    expect(mockPort.write).toHaveBeenCalledWith('LED:ALL:000000\n', expect.any(Function));
  });

  it('sends PING command', () => {
    manager.sendPing();
    expect(mockPort.write).toHaveBeenCalledWith('PING\n', expect.any(Function));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd keybow-companion/electron
npx vitest run test/serial.test.ts
```

Expected: FAIL — SerialManager not found.

- [ ] **Step 3: Implement serial.ts**

```typescript
// electron/src/main/serial.ts
import { EventEmitter } from 'events';
import { SerialPort, ReadlineParser } from 'serialport';
import { parseKeyEvent, buildLedCommand, buildLedAllCommand } from '../shared/protocol';
import type { GridKey, KeyEvent } from '../shared/types';

export class SerialManager extends EventEmitter {
  private port: SerialPort | null = null;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private awaitingPong = false;

  setPort(port: any): void {
    this.port = port;
  }

  async connect(portPath?: string): Promise<void> {
    const path = portPath ?? await this.autoDetect();
    if (!path) {
      this.scheduleReconnect();
      return;
    }

    try {
      this.port = new SerialPort({ path, baudRate: 115200 });
      const parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));

      parser.on('data', (line: string) => {
        this.handleLine(line.trim());
      });

      this.port.on('close', () => {
        this.emit('disconnected');
        this.stopPing();
        this.scheduleReconnect();
      });

      this.port.on('error', () => {
        this.emit('disconnected');
        this.stopPing();
        this.scheduleReconnect();
      });

      this.emit('connected');
      this.startPing();
    } catch {
      this.scheduleReconnect();
    }
  }

  handleLine(line: string): void {
    if (line === 'READY') {
      this.emit('ready');
      return;
    }
    if (line === 'PONG') {
      this.awaitingPong = false;
      this.emit('pong');
      return;
    }
    const event = parseKeyEvent(line);
    if (event) {
      this.emit('keyEvent', event);
    }
  }

  sendLed(key: GridKey, colorOrOff: string): void {
    this.write(buildLedCommand(key, colorOrOff));
  }

  sendLedAll(colorOrOff: string): void {
    this.write(buildLedAllCommand(colorOrOff));
  }

  sendPing(): void {
    this.write('PING\n');
  }

  private write(data: string): void {
    if (this.port?.isOpen) {
      this.port.write(data, (err) => {
        if (err) console.error('Serial write error:', err.message);
      });
    }
  }

  private async autoDetect(): Promise<string | null> {
    const ports = await SerialPort.list();
    const match = ports.find(p => p.vendorId?.toUpperCase() === '2E8A');
    return match?.path ?? null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setInterval(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.awaitingPong) {
        this.port?.close();
        return;
      }
      this.awaitingPong = true;
      this.sendPing();
    }, 5000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.awaitingPong = false;
  }

  disconnect(): void {
    this.stopPing();
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.port?.close();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd keybow-companion/electron
npx vitest run test/serial.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd keybow-companion
git add electron/src/main/serial.ts electron/test/serial.test.ts
git commit -m "feat: add serial communication with auto-detect, reconnect, and keepalive"
```

---

## Task 5: App Switcher (Windows Window Management)

**SECURITY NOTE:** This module uses `execFile` (not `exec`) to prevent command injection. All arguments are passed as arrays, never interpolated into shell strings.

**Files:**
- Create: `electron/src/main/app-switcher.ts`
- Create: `electron/test/app-switcher.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// electron/test/app-switcher.test.ts
import { describe, it, expect, vi } from 'vitest';
import { AppSwitcher } from '../src/main/app-switcher';

describe('AppSwitcher', () => {
  it('constructs without error', () => {
    const switcher = new AppSwitcher();
    expect(switcher).toBeDefined();
  });

  it('buildFindScript generates valid PowerShell', () => {
    const script = AppSwitcher.buildFindScript('slack');
    expect(script).toContain('Get-Process');
    expect(script).toContain('slack');
  });

  it('buildFocusScript generates valid PowerShell', () => {
    const script = AppSwitcher.buildFocusScript(1234);
    expect(script).toContain('1234');
    expect(script).toContain('SetForegroundWindow');
  });

  it('sanitizes process names to alphanumeric and hyphens only', () => {
    expect(AppSwitcher.sanitizeProcessName('slack; rm -rf /')).toBe('slackrm-rf');
    expect(AppSwitcher.sanitizeProcessName('normal-app')).toBe('normal-app');
    expect(AppSwitcher.sanitizeProcessName("app'name")).toBe('appname');
    expect(AppSwitcher.sanitizeProcessName('path.traversal')).toBe('pathtraversal');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd keybow-companion/electron
npx vitest run test/app-switcher.test.ts
```

Expected: FAIL — AppSwitcher not found.

- [ ] **Step 3: Implement app-switcher.ts**

```typescript
// electron/src/main/app-switcher.ts
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { AppTarget } from '../shared/types';

const execFileAsync = promisify(execFile);

export class AppSwitcher {
  /**
   * Strip all characters except alphanumeric, hyphens, and dots.
   * Prevents any form of injection when passed as a PowerShell argument.
   */
  static sanitizeProcessName(input: string): string {
    return input.replace(/[^a-zA-Z0-9\-]/g, '');
  }

  /** Build PowerShell script to find a process window handle. */
  static buildFindScript(processName: string): string {
    const safe = AppSwitcher.sanitizeProcessName(processName);
    return `Get-Process -Name '${safe}' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1 -ExpandProperty MainWindowHandle`;
  }

  /** Build PowerShell script to focus a window by handle. */
  static buildFocusScript(windowHandle: number): string {
    return [
      "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Win32 { [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd); [DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); }'",
      `[Win32]::ShowWindow([IntPtr]${windowHandle}, 9)`,
      `[Win32]::SetForegroundWindow([IntPtr]${windowHandle})`,
    ].join('; ');
  }

  async focusOrLaunch(target: AppTarget): Promise<boolean> {
    // Strip .exe before sanitizing (dots are removed by sanitize)
    const rawName = target.process.replace(/\.exe$/i, '');
    const processName = AppSwitcher.sanitizeProcessName(rawName);

    try {
      // Use execFile with arguments array — no shell interpolation
      const { stdout } = await execFileAsync('powershell', [
        '-NoProfile',
        '-Command',
        AppSwitcher.buildFindScript(processName),
      ]);

      const handle = parseInt(stdout.trim(), 10);
      if (handle && handle !== 0) {
        await execFileAsync('powershell', [
          '-NoProfile',
          '-Command',
          AppSwitcher.buildFocusScript(handle),
        ]);
        return true;
      }
    } catch {
      // Process not running — fall through to launch
    }

    // Launch the app using execFile — path is passed as argument, not shell-interpolated
    try {
      execFile('cmd', ['/c', 'start', '', target.path]);
      return true;
    } catch {
      return false;
    }
  }

  async getForegroundProcess(): Promise<string | null> {
    try {
      const script = [
        "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class FG { [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId); }'",
        '$h = [FG]::GetForegroundWindow()',
        '$pid = 0',
        '[FG]::GetWindowThreadProcessId($h, [ref]$pid) | Out-Null',
        "(Get-Process -Id $pid -ErrorAction SilentlyContinue).ProcessName + '.exe'",
      ].join('; ');

      const { stdout } = await execFileAsync('powershell', [
        '-NoProfile',
        '-Command',
        script,
      ]);
      const name = stdout.trim();
      return name && name !== '.exe' ? name : null;
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd keybow-companion/electron
npx vitest run test/app-switcher.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd keybow-companion
git add electron/src/main/app-switcher.ts electron/test/app-switcher.test.ts
git commit -m "feat: add Windows app switcher using execFile for safe process management"
```

---

## Task 6: Action Executor

**Files:**
- Create: `electron/src/main/action-executor.ts`
- Create: `electron/test/action-executor.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// electron/test/action-executor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActionExecutor } from '../src/main/action-executor';

describe('ActionExecutor', () => {
  let executor: ActionExecutor;
  let mockAppSwitcher: any;
  let mockSerial: any;
  let mockProfileEngine: any;
  let mockNativeHost: any;

  beforeEach(() => {
    mockAppSwitcher = { focusOrLaunch: vi.fn().mockResolvedValue(true) };
    mockSerial = { sendLed: vi.fn(), sendLedAll: vi.fn() };
    mockNativeHost = { focusOrOpen: vi.fn().mockResolvedValue(true) };
    mockProfileEngine = {
      getKeyAction: vi.fn(),
      getKeyColor: vi.fn().mockReturnValue('004488'),
      cycleProfile: vi.fn(),
      switchToProfile: vi.fn(),
      getActiveProfile: vi.fn().mockReturnValue({ name: 'Work', defaultColor: '004488', keys: {} }),
      getAllKeyColors: vi.fn().mockReturnValue({}),
      getConfig: vi.fn().mockReturnValue({ profiles: {} }),
    };
    executor = new ActionExecutor(mockAppSwitcher, mockSerial, mockProfileEngine, mockNativeHost);
  });

  it('executes app action', async () => {
    mockProfileEngine.getKeyAction.mockReturnValue({
      action: 'app',
      target: { process: 'slack.exe', path: 'C:\\slack.exe' },
      label: 'Slack',
      activeColor: '4A154B',
    });

    await executor.handleKeyEvent({ key: 'A1', event: 'PRESS' });

    expect(mockAppSwitcher.focusOrLaunch).toHaveBeenCalledWith({ process: 'slack.exe', path: 'C:\\slack.exe' });
    expect(mockSerial.sendLed).toHaveBeenCalledWith('A1', '4A154B');
  });

  it('executes url action', async () => {
    mockProfileEngine.getKeyAction.mockReturnValue({
      action: 'url',
      target: 'https://calendar.google.com',
      label: 'Calendar',
      activeColor: '4285F4',
    });

    await executor.handleKeyEvent({ key: 'A2', event: 'PRESS' });

    expect(mockNativeHost.focusOrOpen).toHaveBeenCalledWith('https://calendar.google.com');
    expect(mockSerial.sendLed).toHaveBeenCalledWith('A2', '4285F4');
  });

  it('executes profile_cycle action', async () => {
    mockProfileEngine.getKeyAction.mockReturnValue({
      action: 'profile_cycle',
      label: 'Next Profile',
      activeColor: 'FF8800',
    });

    await executor.handleKeyEvent({ key: 'D4', event: 'PRESS' });

    expect(mockProfileEngine.cycleProfile).toHaveBeenCalled();
  });

  it('sends red flash on app switch failure', async () => {
    mockAppSwitcher.focusOrLaunch.mockResolvedValue(false);
    mockProfileEngine.getKeyAction.mockReturnValue({
      action: 'app',
      target: { process: 'missing.exe', path: 'C:\\missing.exe' },
      label: 'Missing',
      activeColor: '004488',
    });

    await executor.handleKeyEvent({ key: 'A1', event: 'PRESS' });

    expect(mockSerial.sendLed).toHaveBeenCalledWith('A1', 'FF0000');
  });

  it('ignores RELEASE events', async () => {
    await executor.handleKeyEvent({ key: 'A1', event: 'RELEASE' });
    expect(mockProfileEngine.getKeyAction).not.toHaveBeenCalled();
  });

  it('ignores HOLD events (no hold actions configured yet)', async () => {
    await executor.handleKeyEvent({ key: 'A1', event: 'HOLD' });
    expect(mockProfileEngine.getKeyAction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd keybow-companion/electron
npx vitest run test/action-executor.test.ts
```

Expected: FAIL — ActionExecutor not found.

- [ ] **Step 3: Implement action-executor.ts**

```typescript
// electron/src/main/action-executor.ts
import type { AppSwitcher } from './app-switcher';
import type { SerialManager } from './serial';
import type { ProfileEngine } from './profiles';
import type { KeyEvent, GridKey, AppTarget } from '../shared/types';

export interface NativeHostBridge {
  focusOrOpen(url: string): Promise<boolean>;
}

export class ActionExecutor {
  constructor(
    private appSwitcher: AppSwitcher,
    private serial: SerialManager,
    private profiles: ProfileEngine,
    private nativeHost: NativeHostBridge,
  ) {}

  async handleKeyEvent(event: KeyEvent): Promise<void> {
    if (event.event !== 'PRESS') return;

    const action = this.profiles.getKeyAction(event.key);
    if (!action) return;

    let success = true;

    switch (action.action) {
      case 'app':
        success = await this.appSwitcher.focusOrLaunch(action.target as AppTarget);
        break;
      case 'url':
        success = await this.nativeHost.focusOrOpen(action.target as string);
        break;
      case 'profile_cycle':
        this.profiles.cycleProfile();
        this.sendAllLeds();
        return;
      case 'profile_set':
        this.profiles.switchToProfile(action.target as string);
        this.sendAllLeds();
        return;
    }

    if (success) {
      const color = this.profiles.getKeyColor(event.key);
      this.serial.sendLed(event.key, color);
    } else {
      this.flashError(event.key);
    }
  }

  private sendAllLeds(): void {
    const colors = this.profiles.getAllKeyColors();
    for (const [key, color] of Object.entries(colors)) {
      this.serial.sendLed(key as GridKey, color);
    }
  }

  private flashError(key: GridKey): void {
    this.serial.sendLed(key, 'FF0000');
    setTimeout(() => {
      const color = this.profiles.getKeyColor(key);
      this.serial.sendLed(key, color);
    }, 500);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd keybow-companion/electron
npx vitest run test/action-executor.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd keybow-companion
git add electron/src/main/action-executor.ts electron/test/action-executor.test.ts
git commit -m "feat: add action executor dispatching key events to app/url/profile handlers"
```

---

## Task 7: Auto-Switch Module

**Files:**
- Create: `electron/src/main/auto-switch.ts`
- Create: `electron/test/auto-switch.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// electron/test/auto-switch.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutoSwitcher } from '../src/main/auto-switch';

describe('AutoSwitcher', () => {
  let autoSwitcher: AutoSwitcher;
  let mockAppSwitcher: any;
  let mockProfileEngine: any;
  let onProfileSwitch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockAppSwitcher = { getForegroundProcess: vi.fn().mockResolvedValue('slack.exe') };
    mockProfileEngine = {
      getAutoSwitchProfile: vi.fn().mockReturnValue('Work'),
      getActiveProfileName: vi.fn().mockReturnValue('Dev'),
      switchToProfile: vi.fn(),
    };
    onProfileSwitch = vi.fn();
    autoSwitcher = new AutoSwitcher(mockAppSwitcher, mockProfileEngine, onProfileSwitch);
  });

  afterEach(() => {
    autoSwitcher.stop();
    vi.useRealTimers();
  });

  it('switches profile when foreground matches autoSwitch', async () => {
    await autoSwitcher.poll();
    expect(mockProfileEngine.switchToProfile).toHaveBeenCalledWith('Work');
    expect(onProfileSwitch).toHaveBeenCalled();
  });

  it('does not switch if already on correct profile', async () => {
    mockProfileEngine.getActiveProfileName.mockReturnValue('Work');
    await autoSwitcher.poll();
    expect(mockProfileEngine.switchToProfile).not.toHaveBeenCalled();
  });

  it('does not switch if process has no autoSwitch mapping', async () => {
    mockProfileEngine.getAutoSwitchProfile.mockReturnValue(undefined);
    await autoSwitcher.poll();
    expect(mockProfileEngine.switchToProfile).not.toHaveBeenCalled();
  });

  it('respects manual override until foreground changes', async () => {
    autoSwitcher.setManualOverride();
    await autoSwitcher.poll();
    expect(mockProfileEngine.switchToProfile).not.toHaveBeenCalled();
  });

  it('clears manual override when foreground process changes', async () => {
    autoSwitcher.setManualOverride();
    await autoSwitcher.poll();
    expect(mockProfileEngine.switchToProfile).not.toHaveBeenCalled();

    mockAppSwitcher.getForegroundProcess.mockResolvedValue('code.exe');
    mockProfileEngine.getAutoSwitchProfile.mockReturnValue('Dev');
    mockProfileEngine.getActiveProfileName.mockReturnValue('Work');
    await autoSwitcher.poll();
    expect(mockProfileEngine.switchToProfile).toHaveBeenCalledWith('Dev');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd keybow-companion/electron
npx vitest run test/auto-switch.test.ts
```

Expected: FAIL — AutoSwitcher not found.

- [ ] **Step 3: Implement auto-switch.ts**

```typescript
// electron/src/main/auto-switch.ts
import type { AppSwitcher } from './app-switcher';
import type { ProfileEngine } from './profiles';

export class AutoSwitcher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private manualOverride = false;
  private lastForegroundProcess: string | null = null;

  constructor(
    private appSwitcher: AppSwitcher,
    private profileEngine: ProfileEngine,
    private onProfileSwitch: () => void,
  ) {}

  start(intervalMs = 500): void {
    this.timer = setInterval(() => this.poll(), intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setManualOverride(): void {
    this.manualOverride = true;
  }

  async poll(): Promise<void> {
    const current = await this.appSwitcher.getForegroundProcess();
    if (!current) return;

    if (this.manualOverride && current !== this.lastForegroundProcess) {
      this.manualOverride = false;
    }
    this.lastForegroundProcess = current;

    if (this.manualOverride) return;

    const targetProfile = this.profileEngine.getAutoSwitchProfile(current);
    if (!targetProfile) return;
    if (this.profileEngine.getActiveProfileName() === targetProfile) return;

    this.profileEngine.switchToProfile(targetProfile);
    this.onProfileSwitch();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd keybow-companion/electron
npx vitest run test/auto-switch.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd keybow-companion
git add electron/src/main/auto-switch.ts electron/test/auto-switch.test.ts
git commit -m "feat: add auto-switch with foreground polling and manual override"
```

---

## Task 8: Keybow Firmware

**Files:**
- Create: `firmware/code.py`
- Copy: `lib/pmk/` to `firmware/lib/pmk/` (from parent repo)

- [ ] **Step 1: Copy the PMK library**

```bash
cd keybow-companion
mkdir -p firmware/lib
cp -r ../lib/pmk firmware/lib/pmk
```

- [ ] **Step 2: Write firmware code.py**

```python
# firmware/code.py
import supervisor
from pmk import PMK
from pmk.platform.keybow2040 import Keybow2040 as Hardware

keybow = PMK(Hardware())
keys = keybow.keys

ROWS = 'ABCD'

def num_to_grid(n):
    row = ROWS[n // 4]
    col = (n % 4) + 1
    return f"{row}{col}"

def grid_to_num(grid):
    row = ROWS.index(grid[0])
    col = int(grid[1]) - 1
    return row * 4 + col

led_colors = {}

def is_valid_hex(s):
    if len(s) != 6:
        return False
    try:
        int(s, 16)
        return True
    except ValueError:
        return False

def send(msg):
    print(msg)

def parse_command(line):
    line = line.strip()
    if not line or len(line) > 64:
        return

    if line == 'PING':
        send('PONG')
        return

    if line.startswith('LED:'):
        parts = line.split(':')
        if len(parts) != 3:
            return
        target = parts[1]
        value = parts[2]

        if target == 'ALL':
            if value == 'OFF':
                keybow.set_all(0, 0, 0)
                led_colors.clear()
            elif is_valid_hex(value):
                r, g, b = int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)
                keybow.set_all(r, g, b)
                for i in range(16):
                    led_colors[i] = (r, g, b)
        else:
            try:
                key_num = grid_to_num(target)
            except (ValueError, IndexError):
                return
            if value == 'OFF':
                keys[key_num].set_led(0, 0, 0)
                led_colors.pop(key_num, None)
            elif is_valid_hex(value):
                r, g, b = int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)
                keys[key_num].set_led(r, g, b)
                led_colors[key_num] = (r, g, b)
        return

    if line.startswith('PROFILE:'):
        return

for key in keys:
    @keybow.on_press(key)
    def press_handler(key):
        grid = num_to_grid(key.number)
        key.set_led(255, 255, 255)
        send(f"KEY:{grid}:PRESS")

    @keybow.on_release(key)
    def release_handler(key):
        if key.number in led_colors:
            r, g, b = led_colors[key.number]
            key.set_led(r, g, b)
        else:
            key.set_led(0, 0, 0)
        grid = num_to_grid(key.number)
        send(f"KEY:{grid}:RELEASE")

    @keybow.on_hold(key)
    def hold_handler(key):
        grid = num_to_grid(key.number)
        send(f"KEY:{grid}:HOLD")

send("READY")

while True:
    keybow.update()
    if supervisor.runtime.serial_bytes_available:
        line = input()
        parse_command(line)
```

- [ ] **Step 3: Test on hardware**

```bash
cp firmware/code.py /d/code.py    # adjust drive letter to CIRCUITPY
cp -r firmware/lib/pmk /d/lib/pmk
```

Open serial terminal at 115200 baud. Verify:
- `READY` on connect
- `KEY:A1:PRESS` / `KEY:A1:RELEASE` on key press
- `PONG` response to `PING`
- `LED:A1:FF0000` lights key red

- [ ] **Step 4: Commit**

```bash
cd keybow-companion
git add firmware/
git commit -m "feat: add Keybow firmware — serial relay with LED control and grid mapping"
```

---

## Task 9: Electron Main Process — App Entry, Tray, Window

**Files:**
- Modify: `electron/src/main/index.ts`
- Create: `electron/src/preload/index.ts`
- Modify: `electron/src/renderer/index.html`

- [ ] **Step 1: Write the preload script**

```typescript
// electron/src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('keybow', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: any) => ipcRenderer.invoke('save-config', config),
  onProfileChanged: (callback: (name: string) => void) => {
    ipcRenderer.on('profile-changed', (_event, name) => callback(name));
  },
  onDeviceStatus: (callback: (connected: boolean) => void) => {
    ipcRenderer.on('device-status', (_event, connected) => callback(connected));
  },
});
```

- [ ] **Step 2: Write the main process entry**

```typescript
// electron/src/main/index.ts
import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { SerialManager } from './serial';
import { ProfileEngine } from './profiles';
import { AppSwitcher } from './app-switcher';
import { AutoSwitcher } from './auto-switch';
import { ActionExecutor } from './action-executor';
import type { ProfileConfig, GridKey } from '../shared/types';

const CONFIG_DIR = path.join(app.getPath('userData'));
const CONFIG_PATH = path.join(CONFIG_DIR, 'profiles.json');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serial: SerialManager;
let profiles: ProfileEngine;
let appSwitcher: AppSwitcher;
let autoSwitcher: AutoSwitcher;
let actionExecutor: ActionExecutor;

function loadConfig(): ProfileConfig {
  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      version: 1,
      activeProfile: 'Default',
      profileSwitchKey: 'D4' as GridKey,
      profileOrder: ['Default'],
      autoSwitch: {},
      profiles: {
        Default: {
          name: 'Default',
          defaultColor: '004488',
          keys: {
            D4: { action: 'profile_cycle', label: 'Next Profile', activeColor: 'FF8800' },
          },
        },
      },
    };
  }
}

function saveConfig(config: ProfileConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
    },
  });

  if (MAIN_WINDOW_WEBPACK_ENTRY) {
    mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  }

  mainWindow.on('close', (event) => {
    event.preventDefault();
    mainWindow?.hide();
  });
}

function createTray(): void {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('Keybow Companion');
  tray.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
  updateTrayMenu();
}

function updateTrayMenu(): void {
  const profileItems = profiles.getProfileOrder().map((name) => ({
    label: name,
    type: 'radio' as const,
    checked: name === profiles.getActiveProfileName(),
    click: () => {
      profiles.switchToProfile(name);
      autoSwitcher.setManualOverride();
      onProfileSwitch();
    },
  }));

  const menu = Menu.buildFromTemplate([
    ...profileItems,
    { type: 'separator' },
    { label: 'Open Config', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: 'Reconnect Device', click: () => serial.connect() },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quit(); } },
  ]);
  tray?.setContextMenu(menu);
}

function onProfileSwitch(): void {
  const colors = profiles.getAllKeyColors();
  for (const [key, color] of Object.entries(colors)) {
    serial.sendLed(key as GridKey, color);
  }
  updateTrayMenu();
  mainWindow?.webContents.send('profile-changed', profiles.getActiveProfileName());
}

// Stub native host bridge until Task 11
const nativeHostStub = {
  async focusOrOpen(url: string): Promise<boolean> {
    console.log('Native host stub: focusOrOpen', url);
    return false;
  },
};

app.whenReady().then(() => {
  const config = loadConfig();
  profiles = new ProfileEngine(config);
  serial = new SerialManager();
  appSwitcher = new AppSwitcher();
  autoSwitcher = new AutoSwitcher(appSwitcher, profiles, onProfileSwitch);
  actionExecutor = new ActionExecutor(appSwitcher, serial as any, profiles, nativeHostStub);

  serial.on('keyEvent', (event) => actionExecutor.handleKeyEvent(event));
  serial.on('ready', () => {
    mainWindow?.webContents.send('device-status', true);
    onProfileSwitch();
  });
  serial.on('disconnected', () => {
    mainWindow?.webContents.send('device-status', false);
  });

  ipcMain.handle('get-config', () => profiles.getConfig());
  ipcMain.handle('save-config', (_event, config: ProfileConfig) => {
    profiles = new ProfileEngine(config);
    saveConfig(config);
    onProfileSwitch();
    return true;
  });

  createWindow();
  createTray();
  serial.connect();
  autoSwitcher.start();
});

app.on('window-all-closed', (e: Event) => {
  e.preventDefault();
});

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
```

- [ ] **Step 3: Update index.html**

```html
<!-- electron/src/renderer/index.html -->
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Keybow Companion</title>
    <link rel="stylesheet" href="app.css" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

- [ ] **Step 4: Verify Electron starts with tray**

```bash
cd keybow-companion/electron
npm start
```

Expected: Electron starts, tray icon appears, clicking shows window.

- [ ] **Step 5: Commit**

```bash
cd keybow-companion
git add electron/src/main/index.ts electron/src/preload/index.ts electron/src/renderer/index.html
git commit -m "feat: add Electron main process with tray, config loading, and module wiring"
```

---

## Task 10: Config UI — React Components

**Files:**
- Create: `electron/src/renderer/app.tsx`
- Create: `electron/src/renderer/components/KeyGrid.tsx`
- Create: `electron/src/renderer/components/KeyConfig.tsx`
- Create: `electron/src/renderer/components/ProfileBar.tsx`
- Create: `electron/src/renderer/styles/app.css`

- [ ] **Step 1: Create React entry point (app.tsx)**

```typescript
// electron/src/renderer/app.tsx
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { KeyGrid } from './components/KeyGrid';
import { KeyConfig } from './components/KeyConfig';
import { ProfileBar } from './components/ProfileBar';
import type { ProfileConfig, GridKey } from '../shared/types';

declare global {
  interface Window {
    keybow: {
      getConfig: () => Promise<ProfileConfig>;
      saveConfig: (config: ProfileConfig) => Promise<boolean>;
      onProfileChanged: (callback: (name: string) => void) => void;
      onDeviceStatus: (callback: (connected: boolean) => void) => void;
    };
  }
}

function App() {
  const [config, setConfig] = useState<ProfileConfig | null>(null);
  const [selectedKey, setSelectedKey] = useState<GridKey | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    window.keybow.getConfig().then(setConfig);
    window.keybow.onProfileChanged((name) => {
      setConfig((prev) => prev ? { ...prev, activeProfile: name } : prev);
    });
    window.keybow.onDeviceStatus(setConnected);
  }, []);

  if (!config) return <div className="loading">Loading...</div>;

  const activeProfile = config.profiles[config.activeProfile];

  const handleSave = async (updated: ProfileConfig) => {
    setConfig(updated);
    await window.keybow.saveConfig(updated);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Keybow Companion</h1>
        <span className={`status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </header>
      <ProfileBar config={config} onSave={handleSave} />
      <div className="main-content">
        <KeyGrid profile={activeProfile} selectedKey={selectedKey} onSelectKey={setSelectedKey} />
        {selectedKey && (
          <KeyConfig
            gridKey={selectedKey}
            action={activeProfile.keys[selectedKey]}
            defaultColor={activeProfile.defaultColor}
            onSave={(key, action) => {
              const updated = { ...config };
              updated.profiles[config.activeProfile] = {
                ...activeProfile,
                keys: { ...activeProfile.keys, [key]: action },
              };
              handleSave(updated);
            }}
            onRemove={(key) => {
              const updated = { ...config };
              const newKeys = { ...activeProfile.keys };
              delete newKeys[key];
              updated.profiles[config.activeProfile] = { ...activeProfile, keys: newKeys };
              handleSave(updated);
            }}
          />
        )}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
```

- [ ] **Step 2: Create KeyGrid.tsx**

```typescript
// electron/src/renderer/components/KeyGrid.tsx
import React from 'react';
import type { Profile, GridKey } from '../../shared/types';

const ROWS = ['A', 'B', 'C', 'D'] as const;
const COLS = ['1', '2', '3', '4'] as const;

interface KeyGridProps {
  profile: Profile;
  selectedKey: GridKey | null;
  onSelectKey: (key: GridKey) => void;
}

export function KeyGrid({ profile, selectedKey, onSelectKey }: KeyGridProps) {
  return (
    <div className="key-grid">
      {ROWS.map((row) => (
        <div key={row} className="key-row">
          {COLS.map((col) => {
            const gridKey = `${row}${col}` as GridKey;
            const action = profile.keys[gridKey];
            const color = action?.activeColor ?? profile.defaultColor;
            const isSelected = selectedKey === gridKey;
            return (
              <button
                key={gridKey}
                className={`key-button ${isSelected ? 'selected' : ''}`}
                style={{ backgroundColor: `#${color}` }}
                onClick={() => onSelectKey(gridKey)}
                title={action?.label ?? gridKey}
              >
                <span className="key-label">{action?.label ?? ''}</span>
                <span className="key-id">{gridKey}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create KeyConfig.tsx**

```typescript
// electron/src/renderer/components/KeyConfig.tsx
import React, { useState, useEffect } from 'react';
import type { GridKey, KeyAction, ActionType } from '../../shared/types';

interface KeyConfigProps {
  gridKey: GridKey;
  action?: KeyAction;
  defaultColor: string;
  onSave: (key: GridKey, action: KeyAction) => void;
  onRemove: (key: GridKey) => void;
}

const ACTION_TYPES: { value: ActionType; label: string }[] = [
  { value: 'app', label: 'Launch/Focus App' },
  { value: 'url', label: 'Open/Focus URL' },
  { value: 'profile_cycle', label: 'Cycle Profile' },
  { value: 'profile_set', label: 'Switch to Profile' },
];

export function KeyConfig({ gridKey, action, defaultColor, onSave, onRemove }: KeyConfigProps) {
  const [actionType, setActionType] = useState<ActionType>(action?.action ?? 'app');
  const [label, setLabel] = useState(action?.label ?? '');
  const [target, setTarget] = useState('');
  const [processName, setProcessName] = useState('');
  const [activeColor, setActiveColor] = useState(action?.activeColor ?? defaultColor);
  const [pressColor, setPressColor] = useState(action?.pressColor ?? 'FFFFFF');

  useEffect(() => {
    setActionType(action?.action ?? 'app');
    setLabel(action?.label ?? '');
    setActiveColor(action?.activeColor ?? defaultColor);
    setPressColor(action?.pressColor ?? 'FFFFFF');
    if (action?.action === 'app' && typeof action.target === 'object') {
      setProcessName(action.target.process);
      setTarget(action.target.path);
    } else {
      setProcessName('');
      setTarget(typeof action?.target === 'string' ? action.target : '');
    }
  }, [gridKey, action, defaultColor]);

  const handleSave = () => {
    const newAction: KeyAction = { action: actionType, label, activeColor, pressColor };
    if (actionType === 'app') {
      newAction.target = { process: processName, path: target };
    } else if (actionType === 'url' || actionType === 'profile_set') {
      newAction.target = target;
    }
    onSave(gridKey, newAction);
  };

  return (
    <div className="key-config">
      <h3>Configure {gridKey}</h3>
      <div className="field">
        <label>Action Type</label>
        <select value={actionType} onChange={(e) => setActionType(e.target.value as ActionType)}>
          {ACTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Label</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g., Slack" />
      </div>
      {actionType === 'app' && (
        <>
          <div className="field">
            <label>Process Name</label>
            <input value={processName} onChange={(e) => setProcessName(e.target.value)} placeholder="e.g., slack.exe" />
          </div>
          <div className="field">
            <label>Executable Path</label>
            <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g., C:\...\slack.exe" />
          </div>
        </>
      )}
      {actionType === 'url' && (
        <div className="field">
          <label>URL</label>
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="https://..." />
        </div>
      )}
      {actionType === 'profile_set' && (
        <div className="field">
          <label>Profile Name</label>
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g., Dev" />
        </div>
      )}
      <div className="color-fields">
        <div className="field">
          <label>Active Color</label>
          <input type="color" value={`#${activeColor}`} onChange={(e) => setActiveColor(e.target.value.slice(1))} />
        </div>
        <div className="field">
          <label>Press Color</label>
          <input type="color" value={`#${pressColor}`} onChange={(e) => setPressColor(e.target.value.slice(1))} />
        </div>
      </div>
      <div className="actions">
        <button className="save-btn" onClick={handleSave}>Save</button>
        <button className="remove-btn" onClick={() => onRemove(gridKey)}>Remove</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create ProfileBar.tsx**

```typescript
// electron/src/renderer/components/ProfileBar.tsx
import React, { useState } from 'react';
import type { ProfileConfig } from '../../shared/types';

interface ProfileBarProps {
  config: ProfileConfig;
  onSave: (config: ProfileConfig) => void;
}

export function ProfileBar({ config, onSave }: ProfileBarProps) {
  const [newName, setNewName] = useState('');

  const switchProfile = (name: string) => {
    onSave({ ...config, activeProfile: name });
  };

  const addProfile = () => {
    if (!newName.trim() || config.profiles[newName]) return;
    const updated = { ...config };
    updated.profiles[newName] = {
      name: newName,
      defaultColor: '004488',
      keys: {
        [config.profileSwitchKey]: {
          action: 'profile_cycle' as const,
          label: 'Next Profile',
          activeColor: 'FF8800',
        },
      },
    };
    updated.profileOrder = [...updated.profileOrder, newName];
    onSave(updated);
    setNewName('');
  };

  const deleteProfile = (name: string) => {
    if (config.profileOrder.length <= 1) return;
    const updated = { ...config };
    delete updated.profiles[name];
    updated.profileOrder = updated.profileOrder.filter((n) => n !== name);
    if (updated.activeProfile === name) {
      updated.activeProfile = updated.profileOrder[0];
    }
    onSave(updated);
  };

  return (
    <div className="profile-bar">
      {config.profileOrder.map((name) => (
        <div key={name} className={`profile-tab ${name === config.activeProfile ? 'active' : ''}`}>
          <button className="profile-name" onClick={() => switchProfile(name)}>{name}</button>
          {config.profileOrder.length > 1 && (
            <button className="profile-delete" onClick={() => deleteProfile(name)} title="Delete profile">x</button>
          )}
        </div>
      ))}
      <div className="profile-add">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New profile" onKeyDown={(e) => e.key === 'Enter' && addProfile()} />
        <button onClick={addProfile}>+</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create app.css**

```css
/* electron/src/renderer/styles/app.css */
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #e0e0e0; }
.app { padding: 20px; }
.app-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.status { font-size: 14px; padding: 4px 12px; border-radius: 12px; }
.status.connected { background: #00442244; color: #00cc66; }
.status.disconnected { background: #44000044; color: #cc4444; }
.profile-bar { display: flex; gap: 8px; margin-bottom: 20px; align-items: center; flex-wrap: wrap; }
.profile-tab { display: flex; align-items: center; background: #16213e; border-radius: 8px; overflow: hidden; }
.profile-tab.active { background: #0f3460; }
.profile-name { background: none; border: none; color: #e0e0e0; padding: 8px 12px; cursor: pointer; }
.profile-delete { background: none; border: none; color: #666; padding: 8px; cursor: pointer; }
.profile-delete:hover { color: #cc4444; }
.profile-add { display: flex; gap: 4px; }
.profile-add input { background: #16213e; border: 1px solid #333; color: #e0e0e0; padding: 6px 10px; border-radius: 6px; width: 120px; }
.profile-add button { background: #0f3460; border: none; color: #e0e0e0; padding: 6px 12px; border-radius: 6px; cursor: pointer; }
.main-content { display: flex; gap: 24px; }
.key-grid { display: flex; flex-direction: column; gap: 8px; }
.key-row { display: flex; gap: 8px; }
.key-button { width: 80px; height: 80px; border: 2px solid #333; border-radius: 10px; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; transition: border-color 0.2s; }
.key-button.selected { border-color: #fff; }
.key-button:hover { border-color: #888; }
.key-label { font-size: 12px; font-weight: 600; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.8); }
.key-id { font-size: 10px; color: rgba(255,255,255,0.6); margin-top: 4px; }
.key-config { background: #16213e; padding: 20px; border-radius: 12px; min-width: 300px; }
.key-config h3 { margin-bottom: 16px; }
.field { margin-bottom: 12px; }
.field label { display: block; font-size: 12px; color: #888; margin-bottom: 4px; }
.field input, .field select { width: 100%; background: #1a1a2e; border: 1px solid #333; color: #e0e0e0; padding: 8px; border-radius: 6px; }
.color-fields { display: flex; gap: 12px; }
.color-fields .field { flex: 1; }
.color-fields input[type="color"] { height: 40px; padding: 2px; cursor: pointer; }
.actions { display: flex; gap: 8px; margin-top: 16px; }
.save-btn { background: #0f3460; border: none; color: #e0e0e0; padding: 8px 20px; border-radius: 6px; cursor: pointer; }
.save-btn:hover { background: #1a4a80; }
.remove-btn { background: none; border: 1px solid #333; color: #888; padding: 8px 20px; border-radius: 6px; cursor: pointer; }
.remove-btn:hover { border-color: #cc4444; color: #cc4444; }
.loading { padding: 40px; text-align: center; color: #888; }
```

- [ ] **Step 6: Verify UI renders in Electron**

```bash
cd keybow-companion/electron
npm start
```

Expected: Config UI with 4x4 key grid, profile bar, and status indicator.

- [ ] **Step 7: Commit**

```bash
cd keybow-companion
git add electron/src/renderer/
git commit -m "feat: add React config UI with KeyGrid, KeyConfig, and ProfileBar"
```

---

## Task 11: Browser Extension + Native Messaging

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/background.js`
- Create: `extension/native-host.js`
- Create: `extension/native-messaging.json`
- Create: `electron/src/main/ipc-server.ts`
- Create: `electron/src/main/native-host.ts`

- [ ] **Step 1: Create extension/manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Keybow Companion",
  "version": "1.0.0",
  "description": "Tab management for Keybow Companion",
  "permissions": ["tabs", "nativeMessaging"],
  "background": { "service_worker": "background.js" },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

- [ ] **Step 2: Create extension/background.js**

```javascript
let port = null;

function connectToHost() {
  port = chrome.runtime.connectNative('com.keybow.companion');

  port.onMessage.addListener(async (message) => {
    if (message.action === 'focusOrOpen' && typeof message.url === 'string') {
      if (!message.url.startsWith('https://')) {
        port.postMessage({ success: false, error: 'Only https:// URLs allowed' });
        return;
      }
      try {
        const result = await focusOrOpenTab(message.url);
        port.postMessage(result);
      } catch (err) {
        port.postMessage({ success: false, error: err.message });
      }
    }
  });

  port.onDisconnect.addListener(() => {
    port = null;
    setTimeout(connectToHost, 3000);
  });
}

async function focusOrOpenTab(targetUrl) {
  const url = new URL(targetUrl);
  const tabs = await chrome.tabs.query({});
  const match = tabs.find((tab) => {
    try {
      const tabUrl = new URL(tab.url);
      return tabUrl.origin === url.origin &&
        tabUrl.pathname.startsWith(url.pathname === '/' ? '/' : url.pathname);
    } catch { return false; }
  });

  if (match) {
    await chrome.tabs.update(match.id, { active: true });
    await chrome.windows.update(match.windowId, { focused: true });
    return { success: true, action: 'focused', tabId: match.id };
  } else {
    const tab = await chrome.tabs.create({ url: targetUrl });
    return { success: true, action: 'opened', tabId: tab.id };
  }
}

connectToHost();
```

- [ ] **Step 3: Create extension/native-messaging.json**

```json
{
  "name": "com.keybow.companion",
  "description": "Keybow Companion native messaging host",
  "path": "native-host.js",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://EXTENSION_ID_HERE/"]
}
```

Note: Replace `EXTENSION_ID_HERE` after loading the extension in Chrome. The `path` must be absolute when registered.

- [ ] **Step 4: Create extension/native-host.js**

```javascript
const net = require('net');
const IPC_PORT = 23847;

function readMessage(buffer) {
  if (buffer.length < 4) return null;
  const length = buffer.readUInt32LE(0);
  if (buffer.length < 4 + length) return null;
  const json = buffer.slice(4, 4 + length).toString('utf-8');
  try {
    return { message: JSON.parse(json), bytesConsumed: 4 + length };
  } catch {
    return { message: null, bytesConsumed: 4 + length };
  }
}

function writeMessage(message) {
  const json = JSON.stringify(message);
  const buffer = Buffer.alloc(4 + json.length);
  buffer.writeUInt32LE(json.length, 0);
  buffer.write(json, 4);
  process.stdout.write(buffer);
}

const client = net.createConnection({ port: IPC_PORT }, () => {
  let inputBuffer = Buffer.alloc(0);
  process.stdin.on('data', (chunk) => {
    inputBuffer = Buffer.concat([inputBuffer, chunk]);
    let parsed;
    while ((parsed = readMessage(inputBuffer)) !== null) {
      inputBuffer = inputBuffer.slice(parsed.bytesConsumed);
      if (parsed.message) {
        client.write(JSON.stringify(parsed.message) + '\n');
      }
    }
  });
});

let tcpBuffer = '';
client.on('data', (chunk) => {
  tcpBuffer += chunk.toString();
  const lines = tcpBuffer.split('\n');
  tcpBuffer = lines.pop();
  for (const line of lines) {
    if (line.trim()) writeMessage(JSON.parse(line));
  }
});

client.on('error', () => process.exit(1));
process.stdin.on('end', () => process.exit(0));
```

- [ ] **Step 5: Create electron/src/main/ipc-server.ts**

```typescript
import * as net from 'net';

const IPC_PORT = 23847;

export class IpcServer {
  private server: net.Server | null = null;

  start(onRequest: (message: any) => Promise<any>): void {
    this.server = net.createServer((socket) => {
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop()!;
        for (const line of lines) {
          if (!line.trim()) continue;
          let message: any;
          try {
            message = JSON.parse(line);
          } catch {
            continue; // Skip malformed JSON
          }
          onRequest(message).then((response) => {
            socket.write(JSON.stringify(response) + '\n');
          });
        }
      });
    });
    // Bind to localhost only — prevent external access
    this.server.listen(IPC_PORT, '127.0.0.1');
  }

  stop(): void {
    this.server?.close();
  }
}
```

- [ ] **Step 6: Create electron/src/main/native-host.ts**

```typescript
import { IpcServer } from './ipc-server';
import type { ProfileEngine } from './profiles';
import type { NativeHostBridge } from './action-executor';

export class NativeHost implements NativeHostBridge {
  private ipcServer: IpcServer;
  private profiles: ProfileEngine;

  constructor(profiles: ProfileEngine) {
    this.profiles = profiles;
    this.ipcServer = new IpcServer();
  }

  start(): void {
    this.ipcServer.start(async (message) => {
      return { success: true };
    });
  }

  async focusOrOpen(url: string): Promise<boolean> {
    if (!this.isUrlAllowed(url)) {
      console.warn('URL not in profile allowlist:', url);
      return false;
    }
    if (!url.startsWith('https://')) {
      console.warn('Only https:// URLs allowed:', url);
      return false;
    }

    // Fallback: open in default browser (full IPC integration is future work)
    const { shell } = require('electron');
    await shell.openExternal(url);
    return true;
  }

  private isUrlAllowed(url: string): boolean {
    const config = this.profiles.getConfig();
    for (const profile of Object.values(config.profiles)) {
      for (const keyAction of Object.values(profile.keys)) {
        if (keyAction.action === 'url' && keyAction.target === url) return true;
      }
    }
    return false;
  }

  stop(): void {
    this.ipcServer.stop();
  }
}
```

- [ ] **Step 7: Test extension manually**

1. `chrome://extensions/` → Developer Mode → Load unpacked → select `extension/`
2. Note extension ID, update `native-messaging.json`
3. Register native host:
   ```bash
   reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.keybow.companion" /ve /d "C:\Users\malvis\ws\pmk-circuitpython\keybow-companion\extension\native-messaging.json" /f
   ```
4. Start Electron, press a URL-configured key, verify tab opens/focuses.

- [ ] **Step 8: Commit**

```bash
cd keybow-companion
git add extension/ electron/src/main/ipc-server.ts electron/src/main/native-host.ts
git commit -m "feat: add browser extension with native messaging for tab management"
```

---

## Task 12: Integration — Wire Everything Together

**Files:**
- Modify: `electron/src/main/index.ts`

- [ ] **Step 1: Replace native host stub with real implementation**

In `electron/src/main/index.ts`, replace the `nativeHostStub` block with:

```typescript
import { NativeHost } from './native-host';

// In app.whenReady(), replace nativeHostStub usage:
const nativeHost = new NativeHost(profiles);
nativeHost.start();
actionExecutor = new ActionExecutor(appSwitcher, serial as any, profiles, nativeHost);
```

- [ ] **Step 2: End-to-end test**

1. Copy firmware to Keybow CIRCUITPY drive
2. `cd electron && npm start`
3. Verify tray icon appears
4. Configure A1 = Slack (app), A2 = Google Calendar (url)
5. Press A1 → Slack focuses/launches, key lights up
6. Press A2 → Calendar tab opens/focuses, key lights up
7. Press D4 → profile cycles, all LEDs update
8. Change foreground app → verify auto-switch

- [ ] **Step 3: Commit**

```bash
cd keybow-companion
git add electron/src/main/index.ts
git commit -m "feat: wire native host into main process, complete integration"
```

---

## Task 13: Final Polish and README

**Files:**
- Create: `keybow-companion/README.md`

- [ ] **Step 1: Write README**

Document: what this project is, setup steps (firmware, Electron, extension), configuration guide, development commands.

- [ ] **Step 2: Run all tests**

```bash
cd keybow-companion/electron
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 3: Final commit**

```bash
cd keybow-companion
git add -A
git commit -m "docs: add README and finalize project setup"
```
