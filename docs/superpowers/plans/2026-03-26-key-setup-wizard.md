# Key Setup Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat key configuration form with a step-by-step wizard, add grid-level templates, and per-key suggestions with installed app detection.

**Architecture:** The wizard is a multi-step React component that replaces KeyConfig in the right panel. App detection runs in the main process via PowerShell and is exposed through IPC. Suggestion data (templates, popular apps/URLs) ships as bundled JSON files.

**Tech Stack:** React 19, TypeScript, Vitest, Electron IPC, PowerShell (execFile — never exec), Radix UI (dialog)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `electron/src/data/templates.json` | Grid-level template definitions (4 templates) |
| `electron/src/data/suggestions.json` | Popular apps and URLs for per-key suggestions |
| `electron/src/main/app-detector.ts` | PowerShell Start Menu scan, caches detected apps |
| `electron/test/app-detector.test.ts` | Tests for app detection module |
| `electron/src/preload.ts` | Extended with getInstalledApps, browseForApp IPC |
| `electron/src/main/index.ts` | Extended with new IPC handlers |
| `electron/src/renderer/components/wizard/WizardPanel.tsx` | Wizard container with navigation and step routing |
| `electron/src/renderer/components/wizard/ChooseAction.tsx` | Step 1 — action type cards |
| `electron/src/renderer/components/wizard/ConfigureApp.tsx` | Step 2 variant — app picker with search + suggestions |
| `electron/src/renderer/components/wizard/ConfigureUrl.tsx` | Step 2 variant — URL picker with categories |
| `electron/src/renderer/components/wizard/ConfigureProfile.tsx` | Step 2 variant — profile dropdown |
| `electron/src/renderer/components/wizard/LabelColors.tsx` | Step 3 — label + color pickers with preview |
| `electron/src/renderer/components/wizard/ReviewSave.tsx` | Step 4 — summary card + save/remove |
| `electron/src/renderer/components/TemplatePicker.tsx` | Template modal overlay |
| `electron/src/renderer/styles/wizard.css` | All wizard styling |
| `electron/src/renderer/app.tsx` | Modified — replace KeyConfig with WizardPanel, add empty state |
| `electron/src/renderer/components/ProfileBar.tsx` | Modified — add Templates button |
| `electron/src/renderer/components/KeyGrid.tsx` | Modified — add highlight ring for key being configured |

---

### Task 1: Bundled Suggestion Data

**Files:**
- Create: `electron/src/data/suggestions.json`
- Create: `electron/src/data/templates.json`

- [ ] **Step 1: Create suggestions.json**

```json
{
  "apps": [
    { "name": "Visual Studio Code", "process": "Code", "path": "C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe", "icon": "code" },
    { "name": "Slack", "process": "slack", "path": "C:\\Users\\%USERNAME%\\AppData\\Local\\slack\\slack.exe", "icon": "slack" },
    { "name": "Spotify", "process": "Spotify", "path": "C:\\Users\\%USERNAME%\\AppData\\Roaming\\Spotify\\Spotify.exe", "icon": "spotify" },
    { "name": "Discord", "process": "Discord", "path": "C:\\Users\\%USERNAME%\\AppData\\Local\\Discord\\Update.exe --processStart Discord.exe", "icon": "discord" },
    { "name": "Windows Terminal", "process": "WindowsTerminal", "path": "wt.exe", "icon": "terminal" },
    { "name": "File Explorer", "process": "explorer", "path": "C:\\Windows\\explorer.exe", "icon": "folder" },
    { "name": "Notepad", "process": "Notepad", "path": "C:\\Windows\\System32\\notepad.exe", "icon": "notepad" },
    { "name": "Google Chrome", "process": "chrome", "path": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "icon": "chrome" },
    { "name": "Firefox", "process": "firefox", "path": "C:\\Program Files\\Mozilla Firefox\\firefox.exe", "icon": "firefox" },
    { "name": "OBS Studio", "process": "obs64", "path": "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe", "icon": "obs" }
  ],
  "urls": {
    "Work": [
      { "name": "Gmail", "url": "https://mail.google.com" },
      { "name": "Google Calendar", "url": "https://calendar.google.com" },
      { "name": "Slack Web", "url": "https://app.slack.com" },
      { "name": "Microsoft Teams", "url": "https://teams.microsoft.com" },
      { "name": "Notion", "url": "https://notion.so" },
      { "name": "Google Drive", "url": "https://drive.google.com" }
    ],
    "Dev Tools": [
      { "name": "GitHub", "url": "https://github.com" },
      { "name": "GitLab", "url": "https://gitlab.com" },
      { "name": "Stack Overflow", "url": "https://stackoverflow.com" },
      { "name": "ChatGPT", "url": "https://chat.openai.com" },
      { "name": "Claude", "url": "https://claude.ai" },
      { "name": "npm", "url": "https://npmjs.com" }
    ],
    "Social": [
      { "name": "YouTube", "url": "https://youtube.com" },
      { "name": "Reddit", "url": "https://reddit.com" },
      { "name": "Twitter / X", "url": "https://x.com" },
      { "name": "LinkedIn", "url": "https://linkedin.com" }
    ],
    "Entertainment": [
      { "name": "Netflix", "url": "https://netflix.com" },
      { "name": "Twitch", "url": "https://twitch.tv" },
      { "name": "Spotify Web", "url": "https://open.spotify.com" }
    ]
  }
}
```

- [ ] **Step 2: Create templates.json**

```json
{
  "templates": [
    {
      "name": "Developer",
      "icon": "💻",
      "description": "VS Code, Terminal, Browser, GitHub, Docker, DB client + build/deploy shortcuts",
      "defaultColor": "1E3A5F",
      "keys": {
        "A1": { "action": "app", "target": { "process": "Code", "path": "code" }, "label": "VS Code", "activeColor": "2563EB" },
        "A2": { "action": "app", "target": { "process": "WindowsTerminal", "path": "wt.exe" }, "label": "Terminal", "activeColor": "4B5563" },
        "A3": { "action": "app", "target": { "process": "chrome", "path": "chrome" }, "label": "Browser", "activeColor": "F59E0B" },
        "A4": { "action": "url", "target": "https://github.com", "label": "GitHub", "activeColor": "6E40C9" },
        "B1": { "action": "url", "target": "https://chat.openai.com", "label": "ChatGPT", "activeColor": "10A37F" },
        "B2": { "action": "url", "target": "https://claude.ai", "label": "Claude", "activeColor": "D97706" },
        "B3": { "action": "url", "target": "https://stackoverflow.com", "label": "SO", "activeColor": "F48024" },
        "B4": { "action": "url", "target": "https://npmjs.com", "label": "npm", "activeColor": "CB3837" },
        "D4": { "action": "profile_cycle", "label": "Next Profile", "activeColor": "FF8800" }
      }
    },
    {
      "name": "Productivity",
      "icon": "📋",
      "description": "Email, Calendar, Slack, Teams, Notes, File Manager + common URLs",
      "defaultColor": "1B4332",
      "keys": {
        "A1": { "action": "url", "target": "https://mail.google.com", "label": "Gmail", "activeColor": "DC2626" },
        "A2": { "action": "url", "target": "https://calendar.google.com", "label": "Calendar", "activeColor": "2563EB" },
        "A3": { "action": "app", "target": { "process": "slack", "path": "slack" }, "label": "Slack", "activeColor": "4A154B" },
        "A4": { "action": "url", "target": "https://teams.microsoft.com", "label": "Teams", "activeColor": "5B5FC7" },
        "B1": { "action": "url", "target": "https://notion.so", "label": "Notion", "activeColor": "E0E0E0" },
        "B2": { "action": "url", "target": "https://drive.google.com", "label": "Drive", "activeColor": "F4B400" },
        "B3": { "action": "app", "target": { "process": "Notepad", "path": "C:\\Windows\\System32\\notepad.exe" }, "label": "Notes", "activeColor": "FDE68A" },
        "B4": { "action": "app", "target": { "process": "explorer", "path": "C:\\Windows\\explorer.exe" }, "label": "Files", "activeColor": "F59E0B" },
        "D4": { "action": "profile_cycle", "label": "Next Profile", "activeColor": "FF8800" }
      }
    },
    {
      "name": "Creative",
      "icon": "🎨",
      "description": "Photoshop, Figma, Premiere, Blender, Spotify + reference URLs",
      "defaultColor": "4A1942",
      "keys": {
        "A1": { "action": "url", "target": "https://figma.com", "label": "Figma", "activeColor": "A259FF" },
        "A2": { "action": "url", "target": "https://dribbble.com", "label": "Dribbble", "activeColor": "EA4C89" },
        "A3": { "action": "url", "target": "https://behance.net", "label": "Behance", "activeColor": "1769FF" },
        "A4": { "action": "app", "target": { "process": "Spotify", "path": "spotify" }, "label": "Spotify", "activeColor": "1DB954" },
        "D4": { "action": "profile_cycle", "label": "Next Profile", "activeColor": "FF8800" }
      }
    },
    {
      "name": "Gaming",
      "icon": "🎮",
      "description": "Steam, Discord, OBS, Twitch + streaming URLs",
      "defaultColor": "1A0A2E",
      "keys": {
        "A1": { "action": "app", "target": { "process": "steam", "path": "steam" }, "label": "Steam", "activeColor": "1B2838" },
        "A2": { "action": "app", "target": { "process": "Discord", "path": "discord" }, "label": "Discord", "activeColor": "5865F2" },
        "A3": { "action": "app", "target": { "process": "obs64", "path": "obs64" }, "label": "OBS", "activeColor": "302E2D" },
        "A4": { "action": "url", "target": "https://twitch.tv", "label": "Twitch", "activeColor": "9146FF" },
        "B1": { "action": "url", "target": "https://youtube.com", "label": "YouTube", "activeColor": "FF0000" },
        "D4": { "action": "profile_cycle", "label": "Next Profile", "activeColor": "FF8800" }
      }
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/src/data/suggestions.json electron/src/data/templates.json
git commit -m "feat: add bundled suggestion and template data files"
```

---

### Task 2: App Detection Module

**Files:**
- Create: `electron/src/main/app-detector.ts`
- Create: `electron/test/app-detector.test.ts`

- [ ] **Step 1: Write the failing test**

Create `electron/test/app-detector.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppDetector } from '../src/main/app-detector';
import type { DetectedApp } from '../src/main/app-detector';

// Mock child_process.execFile
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'child_process';

const mockExecFile = vi.mocked(execFile);

describe('AppDetector', () => {
  let detector: AppDetector;

  beforeEach(() => {
    detector = new AppDetector();
    vi.clearAllMocks();
  });

  describe('scan', () => {
    it('parses PowerShell output into DetectedApp list', async () => {
      const psOutput = [
        'Visual Studio Code\tC:\\Users\\test\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
        'Slack\tC:\\Users\\test\\AppData\\Local\\slack\\slack.exe',
        '',
      ].join('\n');

      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, psOutput, '');
        return {} as any;
      });

      const apps = await detector.scan();

      expect(apps).toHaveLength(2);
      expect(apps[0]).toEqual({
        name: 'Visual Studio Code',
        process: 'Code',
        path: 'C:\\Users\\test\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
      });
      expect(apps[1]).toEqual({
        name: 'Slack',
        process: 'slack',
        path: 'C:\\Users\\test\\AppData\\Local\\slack\\slack.exe',
      });
    });

    it('returns empty array on PowerShell error', async () => {
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(new Error('PowerShell not found'), '', '');
        return {} as any;
      });

      const apps = await detector.scan();
      expect(apps).toEqual([]);
    });

    it('caches results after first scan', async () => {
      const psOutput = 'Notepad\tC:\\Windows\\System32\\notepad.exe\n';
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, psOutput, '');
        return {} as any;
      });

      await detector.scan();
      await detector.scan();

      expect(mockExecFile).toHaveBeenCalledTimes(1);
    });

    it('filters out entries with missing fields', async () => {
      const psOutput = [
        'Good App\tC:\\good.exe',
        'Bad App',
        '\tC:\\no-name.exe',
        '',
      ].join('\n');

      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, psOutput, '');
        return {} as any;
      });

      const apps = await detector.scan();
      expect(apps).toHaveLength(1);
      expect(apps[0].name).toBe('Good App');
    });
  });

  describe('getApps', () => {
    it('returns cached apps without scanning', () => {
      expect(detector.getApps()).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd electron && npx vitest run test/app-detector.test.ts`
Expected: FAIL — `Cannot find module '../src/main/app-detector'`

- [ ] **Step 3: Implement app-detector.ts**

Create `electron/src/main/app-detector.ts`. Note: uses `execFile` (never `exec`) per project security conventions.

```typescript
import { execFile } from 'child_process';

export interface DetectedApp {
  name: string;
  process: string;
  path: string;
}

const PS_SCRIPT = `
Get-ChildItem "$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\*.lnk" -Recurse |
  ForEach-Object {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($_.FullName)
    if ($shortcut.TargetPath -match '\\.exe$') {
      $name = $_.BaseName
      $target = $shortcut.TargetPath
      "$name\t$target"
    }
  }
Get-ChildItem "$env:AppData\\Microsoft\\Windows\\Start Menu\\Programs\\*.lnk" -Recurse |
  ForEach-Object {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($_.FullName)
    if ($shortcut.TargetPath -match '\\.exe$') {
      $name = $_.BaseName
      $target = $shortcut.TargetPath
      "$name\t$target"
    }
  }
`.trim();

export class AppDetector {
  private cache: DetectedApp[] | null = null;

  async scan(): Promise<DetectedApp[]> {
    if (this.cache) return this.cache;

    try {
      const output = await this.runPowerShell();
      this.cache = this.parseOutput(output);
    } catch {
      this.cache = [];
    }

    return this.cache;
  }

  getApps(): DetectedApp[] {
    return this.cache ?? [];
  }

  private parseOutput(output: string): DetectedApp[] {
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const [name, path] = line.split('\t');
        if (!name || !path) return null;
        const exe = path.split('\\').pop() ?? '';
        const process = exe.replace(/\.exe$/i, '');
        return { name, process, path };
      })
      .filter((app): app is DetectedApp => app !== null);
  }

  private runPowerShell(): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPT],
        { timeout: 10000 },
        (error, stdout) => {
          if (error) reject(error);
          else resolve(stdout);
        },
      );
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd electron && npx vitest run test/app-detector.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add electron/src/main/app-detector.ts electron/test/app-detector.test.ts
git commit -m "feat: add app detection module with PowerShell Start Menu scan"
```

---

### Task 3: IPC Extensions

**Files:**
- Modify: `electron/src/preload.ts`
- Modify: `electron/src/main/index.ts`

- [ ] **Step 1: Extend the preload API**

Add five new methods to the `keybow` object in `electron/src/preload.ts`. The existing methods stay unchanged. Add these after the existing `onKeyEvent` line:

```typescript
getInstalledApps: () => ipcRenderer.invoke('get-installed-apps'),
browseForApp: () => ipcRenderer.invoke('browse-for-app'),
getTemplates: () => ipcRenderer.invoke('get-templates'),
getSuggestions: () => ipcRenderer.invoke('get-suggestions'),
previewLed: (key: string, color: string) => ipcRenderer.send('preview-led', key, color),
```

- [ ] **Step 2: Update the Window type declaration**

In `electron/src/renderer/app.tsx`, extend the `Window` interface inside the `declare global` block. Add after the existing `onKeyEvent` line:

```typescript
getInstalledApps: () => Promise<Array<{ name: string; process: string; path: string }>>;
browseForApp: () => Promise<{ name: string; process: string; path: string } | null>;
getTemplates: () => Promise<any>;
getSuggestions: () => Promise<any>;
previewLed: (key: string, color: string) => void;
```

- [ ] **Step 3: Add IPC handlers in main/index.ts**

In the main process `index.ts`, after the existing IPC handler registrations, add:

```typescript
import { AppDetector } from './app-detector';
import templates from '../data/templates.json';
import suggestions from '../data/suggestions.json';

const appDetector = new AppDetector();

// Scan for installed apps at startup (non-blocking)
appDetector.scan();

ipcMain.handle('get-installed-apps', async () => {
  return appDetector.getApps();
});

ipcMain.handle('browse-for-app', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select Application',
    filters: [{ name: 'Executables', extensions: ['exe'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const exe = filePath.split('\\').pop() ?? '';
  const process = exe.replace(/\.exe$/i, '');
  const name = process;
  return { name, process, path: filePath };
});

ipcMain.handle('get-templates', () => templates);
ipcMain.handle('get-suggestions', () => suggestions);

ipcMain.on('preview-led', (_event, key: string, color: string) => {
  // Send LED command to Keybow if connected
  serial.send(`LED:${key}:${color}`);
});
```

Add `dialog` to the Electron import at the top of index.ts:

```typescript
import { app, BrowserWindow, Tray, Menu, ipcMain, dialog } from 'electron';
```

- [ ] **Step 4: Verify the app starts**

Run: `cd electron && npm start`
Expected: App launches without errors. Close it manually.

- [ ] **Step 5: Commit**

```bash
git add electron/src/preload.ts electron/src/main/index.ts electron/src/renderer/app.tsx
git commit -m "feat: add IPC handlers for app detection, file picker, templates, and LED preview"
```

---

### Task 4: Wizard CSS

**Files:**
- Create: `electron/src/renderer/styles/wizard.css`

- [ ] **Step 1: Create wizard.css**

```css
/* Wizard Panel */
.wizard-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1rem;
}

.wizard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.wizard-header h3 {
  margin: 0;
  font-size: 1rem;
}

.wizard-step-label {
  font-size: 0.8rem;
  color: #888;
}

.wizard-body {
  flex: 1;
  overflow-y: auto;
}

.wizard-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.75rem;
  margin-top: auto;
  border-top: 1px solid #333;
}

.wizard-dots {
  display: flex;
  gap: 0.4rem;
}

.wizard-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #444;
  border: none;
  padding: 0;
  cursor: default;
}

.wizard-dot.active {
  background: #7c6ef0;
}

.wizard-dot.completed {
  background: #5b52cc;
  cursor: pointer;
}

.wizard-btn {
  background: #333;
  color: #e0e0e0;
  border: none;
  padding: 0.4rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
}

.wizard-btn:hover:not(:disabled) {
  background: #444;
}

.wizard-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.wizard-btn.primary {
  background: #7c6ef0;
  color: white;
}

.wizard-btn.primary:hover:not(:disabled) {
  background: #6b5ce0;
}

.wizard-btn.danger {
  background: #991b1b;
  color: white;
}

.wizard-btn.danger:hover {
  background: #b91c1c;
}

/* Step 1: Action Cards */
.action-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.action-card {
  background: #1e293b;
  border: 2px solid #333;
  border-radius: 8px;
  padding: 0.75rem;
  cursor: pointer;
  transition: border-color 0.15s;
}

.action-card:hover {
  border-color: #7c6ef0;
}

.action-card.selected {
  border-color: #7c6ef0;
  background: #1e1b4b;
}

.action-card-icon {
  font-size: 1.2rem;
  margin-bottom: 0.25rem;
}

.action-card-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #e2e8f0;
}

.action-card-desc {
  font-size: 0.7rem;
  color: #888;
  margin-top: 0.15rem;
}

/* Step 2: Configure Target */
.target-section h4 {
  font-size: 0.85rem;
  color: #aaa;
  margin: 0.75rem 0 0.5rem;
}

.target-section h4:first-child {
  margin-top: 0;
}

.app-search {
  width: 100%;
  background: #1e293b;
  border: 1px solid #333;
  color: #e0e0e0;
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
  box-sizing: border-box;
}

.app-list {
  max-height: 180px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}

.app-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #1e293b;
  border: 1px solid #333;
  border-radius: 4px;
  padding: 0.4rem 0.6rem;
  cursor: pointer;
  font-size: 0.8rem;
  color: #e0e0e0;
}

.app-item:hover {
  border-color: #7c6ef0;
  background: #1e1b4b;
}

.app-item-path {
  font-size: 0.65rem;
  color: #666;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.browse-btn {
  width: 100%;
  background: #1e293b;
  border: 1px dashed #555;
  color: #aaa;
  padding: 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

.browse-btn:hover {
  border-color: #7c6ef0;
  color: #e0e0e0;
}

/* URL categories */
.url-categories {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
  flex-wrap: wrap;
}

.url-category-tab {
  background: #333;
  border: none;
  color: #aaa;
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
}

.url-category-tab.active {
  background: #7c6ef0;
  color: white;
}

.url-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}

.url-item {
  background: #1e293b;
  border: 1px solid #333;
  border-radius: 4px;
  padding: 0.4rem 0.6rem;
  cursor: pointer;
  font-size: 0.8rem;
  color: #e0e0e0;
}

.url-item:hover {
  border-color: #7c6ef0;
  background: #1e1b4b;
}

.url-item-url {
  font-size: 0.65rem;
  color: #666;
}

.custom-url-input {
  width: 100%;
  background: #1e293b;
  border: 1px solid #333;
  color: #e0e0e0;
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  font-size: 0.85rem;
  box-sizing: border-box;
}

.custom-url-input.invalid {
  border-color: #dc2626;
}

.url-error {
  color: #dc2626;
  font-size: 0.7rem;
  margin-top: 0.25rem;
}

/* Profile dropdown */
.profile-select {
  width: 100%;
  background: #1e293b;
  border: 1px solid #333;
  color: #e0e0e0;
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  font-size: 0.85rem;
}

/* Step 3: Label & Colors */
.label-colors-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.label-colors-form .field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.label-colors-form .field label {
  font-size: 0.8rem;
  color: #aaa;
}

.label-colors-form .field input[type="text"] {
  background: #1e293b;
  border: 1px solid #333;
  color: #e0e0e0;
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  font-size: 0.85rem;
}

.color-row {
  display: flex;
  gap: 1rem;
}

.color-row .field {
  flex: 1;
}

/* Step 4: Review */
.review-card {
  background: #1e293b;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 1rem;
}

.review-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.4rem 0;
}

.review-row:not(:last-child) {
  border-bottom: 1px solid #2a2a3e;
}

.review-label {
  font-size: 0.8rem;
  color: #888;
}

.review-value {
  font-size: 0.85rem;
  color: #e0e0e0;
}

.review-color-swatch {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid #555;
  display: inline-block;
}

.review-colors {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.review-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

/* Empty state */
.wizard-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
  text-align: center;
}

.wizard-empty-icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.wizard-empty p {
  margin: 0.25rem 0;
  font-size: 0.85rem;
}

.wizard-empty .hint {
  font-size: 0.75rem;
  color: #555;
}

.wizard-empty .hint strong {
  color: #7c6ef0;
}

/* Template picker modal */
.template-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.template-modal {
  background: #1a1a2e;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 1.5rem;
  max-width: 500px;
  width: 90%;
}

.template-modal h2 {
  margin: 0 0 0.25rem;
  font-size: 1.1rem;
}

.template-modal .subtitle {
  color: #888;
  font-size: 0.8rem;
  margin: 0 0 1rem;
}

.template-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.template-card {
  background: #111827;
  border: 2px solid #333;
  border-radius: 8px;
  padding: 0.75rem;
  cursor: pointer;
  transition: border-color 0.15s;
}

.template-card:hover {
  border-color: #7c6ef0;
}

.template-card-icon {
  font-size: 1.2rem;
  margin-bottom: 0.25rem;
}

.template-card-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: #c4b5fd;
}

.template-card-desc {
  font-size: 0.7rem;
  color: #888;
  margin-top: 0.25rem;
}

.template-close {
  margin-top: 1rem;
  text-align: right;
}

/* Key highlight ring */
.key-button.configuring {
  box-shadow: 0 0 0 2px #7c6ef0, 0 0 8px rgba(124, 110, 240, 0.4);
}
```

- [ ] **Step 2: Import wizard.css in app.tsx**

Add this import to the top of `electron/src/renderer/app.tsx`, after the existing `app.css` import:

```typescript
import './styles/wizard.css';
```

- [ ] **Step 3: Commit**

```bash
git add electron/src/renderer/styles/wizard.css electron/src/renderer/app.tsx
git commit -m "feat: add wizard CSS styles"
```

---

### Task 5: Step 1 — ChooseAction Component

**Files:**
- Create: `electron/src/renderer/components/wizard/ChooseAction.tsx`

- [ ] **Step 1: Create ChooseAction.tsx**

```typescript
import React from 'react';
import type { ActionType } from '../../../shared/types';

const ACTION_CARDS: { type: ActionType; icon: string; title: string; desc: string }[] = [
  { type: 'app', icon: '🖥️', title: 'Launch App', desc: 'Open or focus an application' },
  { type: 'url', icon: '🌐', title: 'Open URL', desc: 'Open or focus a web page' },
  { type: 'profile_set', icon: '📁', title: 'Switch Profile', desc: 'Jump to a specific profile' },
  { type: 'profile_cycle', icon: '🔄', title: 'Cycle Profiles', desc: 'Step through profiles in order' },
];

interface ChooseActionProps {
  selected: ActionType | null;
  onSelect: (type: ActionType) => void;
}

export function ChooseAction({ selected, onSelect }: ChooseActionProps) {
  return (
    <div>
      <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
        What should this key do?
      </p>
      <div className="action-cards">
        {ACTION_CARDS.map((card) => (
          <div
            key={card.type}
            className={`action-card ${selected === card.type ? 'selected' : ''}`}
            onClick={() => onSelect(card.type)}
          >
            <div className="action-card-icon">{card.icon}</div>
            <div className="action-card-title">{card.title}</div>
            <div className="action-card-desc">{card.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/src/renderer/components/wizard/ChooseAction.tsx
git commit -m "feat: add ChooseAction wizard step component"
```

---

### Task 6: Step 2 — ConfigureApp Component

**Files:**
- Create: `electron/src/renderer/components/wizard/ConfigureApp.tsx`

- [ ] **Step 1: Create ConfigureApp.tsx**

```typescript
import React, { useState, useEffect } from 'react';
import type { AppTarget } from '../../../shared/types';

interface AppEntry {
  name: string;
  process: string;
  path: string;
}

interface ConfigureAppProps {
  value: AppTarget | null;
  onChange: (target: AppTarget) => void;
}

export function ConfigureApp({ value, onChange }: ConfigureAppProps) {
  const [search, setSearch] = useState('');
  const [installedApps, setInstalledApps] = useState<AppEntry[]>([]);
  const [popularApps, setPopularApps] = useState<AppEntry[]>([]);

  useEffect(() => {
    window.keybow.getInstalledApps().then(setInstalledApps);
    window.keybow.getSuggestions().then((data) => setPopularApps(data.apps ?? []));
  }, []);

  const filtered = installedApps.filter(
    (app) => app.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSelect = (app: AppEntry) => {
    onChange({ process: app.process, path: app.path });
  };

  const handleBrowse = async () => {
    const result = await window.keybow.browseForApp();
    if (result) {
      onChange({ process: result.process, path: result.path });
    }
  };

  const selectedName =
    value && (installedApps.find((a) => a.path === value.path)?.name
      ?? popularApps.find((a) => a.path === value.path)?.name
      ?? value.process);

  return (
    <div className="target-section">
      {value && (
        <p style={{ color: '#7c6ef0', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          Selected: <strong>{selectedName}</strong>
        </p>
      )}

      <h4>Installed Apps</h4>
      <input
        className="app-search"
        type="text"
        placeholder="Search installed apps..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="app-list">
        {filtered.length === 0 && (
          <p style={{ color: '#666', fontSize: '0.8rem', textAlign: 'center', padding: '0.5rem' }}>
            {installedApps.length === 0 ? 'Scanning for apps...' : 'No matches'}
          </p>
        )}
        {filtered.slice(0, 20).map((app) => (
          <div
            key={app.path}
            className="app-item"
            onClick={() => handleSelect(app)}
          >
            <span>{app.name}</span>
            <span className="app-item-path">{app.path}</span>
          </div>
        ))}
      </div>

      <h4>Popular Apps</h4>
      <div className="app-list">
        {popularApps.map((app) => (
          <div
            key={app.name}
            className="app-item"
            onClick={() => handleSelect(app)}
          >
            <span>{app.name}</span>
          </div>
        ))}
      </div>

      <button className="browse-btn" onClick={handleBrowse}>
        Browse for application...
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/src/renderer/components/wizard/ConfigureApp.tsx
git commit -m "feat: add ConfigureApp wizard step with search and file picker"
```

---

### Task 7: Step 2 — ConfigureUrl Component

**Files:**
- Create: `electron/src/renderer/components/wizard/ConfigureUrl.tsx`

- [ ] **Step 1: Create ConfigureUrl.tsx**

```typescript
import React, { useState, useEffect } from 'react';

interface UrlEntry {
  name: string;
  url: string;
}

interface ConfigureUrlProps {
  value: string;
  onChange: (url: string) => void;
}

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function ConfigureUrl({ value, onChange }: ConfigureUrlProps) {
  const [categories, setCategories] = useState<Record<string, UrlEntry[]>>({});
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [customUrl, setCustomUrl] = useState(value || '');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    window.keybow.getSuggestions().then((data) => {
      const urls = data.urls ?? {};
      setCategories(urls);
      const firstCategory = Object.keys(urls)[0] ?? '';
      setActiveCategory(firstCategory);
    });
  }, []);

  useEffect(() => {
    setCustomUrl(value || '');
  }, [value]);

  const handleSelectUrl = (url: string) => {
    setCustomUrl(url);
    onChange(url);
  };

  const handleCustomChange = (text: string) => {
    setCustomUrl(text);
    setTouched(true);
    if (isValidUrl(text)) {
      onChange(text);
    }
  };

  const categoryNames = Object.keys(categories);
  const urlsInCategory = categories[activeCategory] ?? [];
  const showError = touched && customUrl.length > 0 && !isValidUrl(customUrl);

  return (
    <div className="target-section">
      {value && (
        <p style={{ color: '#7c6ef0', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          Selected: <strong>{value}</strong>
        </p>
      )}

      <h4>Popular Sites</h4>
      <div className="url-categories">
        {categoryNames.map((cat) => (
          <button
            key={cat}
            className={`url-category-tab ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="url-list">
        {urlsInCategory.map((entry) => (
          <div
            key={entry.url}
            className="url-item"
            onClick={() => handleSelectUrl(entry.url)}
          >
            <div>{entry.name}</div>
            <div className="url-item-url">{entry.url}</div>
          </div>
        ))}
      </div>

      <h4>Custom URL</h4>
      <input
        className={`custom-url-input ${showError ? 'invalid' : ''}`}
        type="text"
        placeholder="https://..."
        value={customUrl}
        onChange={(e) => handleCustomChange(e.target.value)}
      />
      {showError && <div className="url-error">Enter a valid URL (https://...)</div>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/src/renderer/components/wizard/ConfigureUrl.tsx
git commit -m "feat: add ConfigureUrl wizard step with categories and validation"
```

---

### Task 8: Step 2 — ConfigureProfile Component

**Files:**
- Create: `electron/src/renderer/components/wizard/ConfigureProfile.tsx`

- [ ] **Step 1: Create ConfigureProfile.tsx**

```typescript
import React from 'react';

interface ConfigureProfileProps {
  value: string;
  profileNames: string[];
  onChange: (profileName: string) => void;
}

export function ConfigureProfile({ value, profileNames, onChange }: ConfigureProfileProps) {
  return (
    <div className="target-section">
      <h4>Select Profile</h4>
      <select
        className="profile-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— Choose a profile —</option>
        {profileNames.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/src/renderer/components/wizard/ConfigureProfile.tsx
git commit -m "feat: add ConfigureProfile wizard step with profile dropdown"
```

---

### Task 9: Step 3 — LabelColors Component

**Files:**
- Create: `electron/src/renderer/components/wizard/LabelColors.tsx`

- [ ] **Step 1: Create LabelColors.tsx**

```typescript
import React from 'react';
import type { GridKey } from '../../../shared/types';

interface LabelColorsProps {
  gridKey: GridKey;
  label: string;
  activeColor: string;
  pressColor: string;
  suggestedLabel: string;
  onLabelChange: (label: string) => void;
  onActiveColorChange: (color: string) => void;
  onPressColorChange: (color: string) => void;
}

export function LabelColors({
  gridKey,
  label,
  activeColor,
  pressColor,
  suggestedLabel,
  onLabelChange,
  onActiveColorChange,
  onPressColorChange,
}: LabelColorsProps) {
  const handleActiveColorChange = (hex: string) => {
    const color = hex.replace('#', '');
    onActiveColorChange(color);
    window.keybow.previewLed(gridKey, color);
  };

  return (
    <div className="label-colors-form">
      <div className="field">
        <label>Label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          placeholder={suggestedLabel || 'e.g., Slack'}
        />
        {suggestedLabel && !label && (
          <button
            className="wizard-btn"
            style={{ alignSelf: 'flex-start', marginTop: '0.25rem', fontSize: '0.75rem' }}
            onClick={() => onLabelChange(suggestedLabel)}
          >
            Use "{suggestedLabel}"
          </button>
        )}
      </div>

      <div className="color-row">
        <div className="field">
          <label>Active Color</label>
          <input
            type="color"
            value={`#${activeColor}`}
            onChange={(e) => handleActiveColorChange(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Press Color</label>
          <input
            type="color"
            value={`#${pressColor}`}
            onChange={(e) => onPressColorChange(e.target.value.replace('#', ''))}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/src/renderer/components/wizard/LabelColors.tsx
git commit -m "feat: add LabelColors wizard step with live LED preview"
```

---

### Task 10: Step 4 — ReviewSave Component

**Files:**
- Create: `electron/src/renderer/components/wizard/ReviewSave.tsx`

- [ ] **Step 1: Create ReviewSave.tsx**

```typescript
import React from 'react';
import type { ActionType, AppTarget } from '../../../shared/types';

const ACTION_LABELS: Record<ActionType, { icon: string; title: string }> = {
  app: { icon: '🖥️', title: 'Launch App' },
  url: { icon: '🌐', title: 'Open URL' },
  profile_set: { icon: '📁', title: 'Switch Profile' },
  profile_cycle: { icon: '🔄', title: 'Cycle Profiles' },
};

interface ReviewSaveProps {
  actionType: ActionType;
  target: string | AppTarget | undefined;
  label: string;
  activeColor: string;
  pressColor: string;
  hasExisting: boolean;
  onSave: () => void;
  onRemove: () => void;
  onEditStep: (step: number) => void;
}

export function ReviewSave({
  actionType,
  target,
  label,
  activeColor,
  pressColor,
  hasExisting,
  onSave,
  onRemove,
  onEditStep,
}: ReviewSaveProps) {
  const actionInfo = ACTION_LABELS[actionType];

  const targetDisplay = (() => {
    if (actionType === 'profile_cycle') return '—';
    if (typeof target === 'object' && target !== null) {
      return `${(target as AppTarget).process} — ${(target as AppTarget).path}`;
    }
    return String(target ?? '');
  })();

  return (
    <div>
      <div className="review-card">
        <div className="review-row">
          <span className="review-label">Action</span>
          <span className="review-value">
            {actionInfo.icon} {actionInfo.title}
            <button
              className="wizard-btn"
              style={{ marginLeft: '0.5rem', padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}
              onClick={() => onEditStep(0)}
            >
              Edit
            </button>
          </span>
        </div>

        {actionType !== 'profile_cycle' && (
          <div className="review-row">
            <span className="review-label">Target</span>
            <span className="review-value" style={{ maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {targetDisplay}
              <button
                className="wizard-btn"
                style={{ marginLeft: '0.5rem', padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}
                onClick={() => onEditStep(1)}
              >
                Edit
              </button>
            </span>
          </div>
        )}

        <div className="review-row">
          <span className="review-label">Label</span>
          <span className="review-value">
            {label || '(none)'}
            <button
              className="wizard-btn"
              style={{ marginLeft: '0.5rem', padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}
              onClick={() => onEditStep(2)}
            >
              Edit
            </button>
          </span>
        </div>

        <div className="review-row">
          <span className="review-label">Colors</span>
          <span className="review-colors">
            <span className="review-color-swatch" style={{ backgroundColor: `#${activeColor}` }} title="Active" />
            <span className="review-color-swatch" style={{ backgroundColor: `#${pressColor}` }} title="Press" />
          </span>
        </div>
      </div>

      <div className="review-actions">
        <button className="wizard-btn primary" onClick={onSave}>Save</button>
        {hasExisting && (
          <button className="wizard-btn danger" onClick={onRemove}>Remove Key</button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/src/renderer/components/wizard/ReviewSave.tsx
git commit -m "feat: add ReviewSave wizard step with edit buttons"
```

---

### Task 11: WizardPanel Container

**Files:**
- Create: `electron/src/renderer/components/wizard/WizardPanel.tsx`

- [ ] **Step 1: Create WizardPanel.tsx**

This is the main wizard container that manages state and renders the correct step.

```typescript
import React, { useState, useEffect } from 'react';
import type { GridKey, ActionType, KeyAction, AppTarget } from '../../../shared/types';
import { ChooseAction } from './ChooseAction';
import { ConfigureApp } from './ConfigureApp';
import { ConfigureUrl } from './ConfigureUrl';
import { ConfigureProfile } from './ConfigureProfile';
import { LabelColors } from './LabelColors';
import { ReviewSave } from './ReviewSave';

interface WizardPanelProps {
  gridKey: GridKey;
  existingAction?: KeyAction;
  defaultColor: string;
  profileNames: string[];
  onSave: (key: GridKey, action: KeyAction) => void;
  onRemove: (key: GridKey) => void;
  onCancel: () => void;
}

const STEP_COUNT = 4;

export function WizardPanel({
  gridKey,
  existingAction,
  defaultColor,
  profileNames,
  onSave,
  onRemove,
  onCancel,
}: WizardPanelProps) {
  const [step, setStep] = useState(existingAction ? 3 : 0);
  const [actionType, setActionType] = useState<ActionType | null>(existingAction?.action ?? null);
  const [appTarget, setAppTarget] = useState<AppTarget | null>(
    existingAction?.action === 'app' && typeof existingAction.target === 'object'
      ? (existingAction.target as AppTarget)
      : null,
  );
  const [urlTarget, setUrlTarget] = useState(
    existingAction?.action === 'url' && typeof existingAction.target === 'string'
      ? existingAction.target
      : '',
  );
  const [profileTarget, setProfileTarget] = useState(
    existingAction?.action === 'profile_set' && typeof existingAction.target === 'string'
      ? existingAction.target
      : '',
  );
  const [label, setLabel] = useState(existingAction?.label ?? '');
  const [activeColor, setActiveColor] = useState(existingAction?.activeColor ?? defaultColor);
  const [pressColor, setPressColor] = useState(existingAction?.pressColor ?? 'FFFFFF');

  // Reset wizard when key changes
  useEffect(() => {
    if (existingAction) {
      setStep(3);
      setActionType(existingAction.action);
      setLabel(existingAction.label);
      setActiveColor(existingAction.activeColor ?? defaultColor);
      setPressColor(existingAction.pressColor ?? 'FFFFFF');
      if (existingAction.action === 'app' && typeof existingAction.target === 'object') {
        setAppTarget(existingAction.target as AppTarget);
      } else {
        setAppTarget(null);
      }
      if (existingAction.action === 'url' && typeof existingAction.target === 'string') {
        setUrlTarget(existingAction.target);
      } else {
        setUrlTarget('');
      }
      if (existingAction.action === 'profile_set' && typeof existingAction.target === 'string') {
        setProfileTarget(existingAction.target);
      } else {
        setProfileTarget('');
      }
    } else {
      setStep(0);
      setActionType(null);
      setAppTarget(null);
      setUrlTarget('');
      setProfileTarget('');
      setLabel('');
      setActiveColor(defaultColor);
      setPressColor('FFFFFF');
    }
  }, [gridKey, existingAction, defaultColor]);

  const handleActionSelect = (type: ActionType) => {
    setActionType(type);
    if (type === 'profile_cycle') {
      setStep(2); // Skip target step
    } else {
      setStep(1);
    }
  };

  const suggestedLabel = (() => {
    if (actionType === 'app' && appTarget) return appTarget.process;
    if (actionType === 'url' && urlTarget) {
      try { return new URL(urlTarget).hostname.replace('www.', ''); } catch { return ''; }
    }
    if (actionType === 'profile_set' && profileTarget) return profileTarget;
    if (actionType === 'profile_cycle') return 'Next Profile';
    return '';
  })();

  const currentTarget = (() => {
    if (actionType === 'app') return appTarget ?? undefined;
    if (actionType === 'url') return urlTarget || undefined;
    if (actionType === 'profile_set') return profileTarget || undefined;
    return undefined;
  })();

  const canAdvance = (() => {
    if (step === 0) return actionType !== null;
    if (step === 1) {
      if (actionType === 'app') return appTarget !== null;
      if (actionType === 'url') return urlTarget.length > 0;
      if (actionType === 'profile_set') return profileTarget.length > 0;
      return true;
    }
    return true;
  })();

  const handleNext = () => {
    if (step < STEP_COUNT - 1) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) {
      if (step === 2 && actionType === 'profile_cycle') {
        setStep(0);
      } else {
        setStep(step - 1);
      }
    }
  };

  const handleSave = () => {
    if (!actionType) return;
    const action: KeyAction = {
      action: actionType,
      label: label || suggestedLabel,
      activeColor,
      pressColor,
    };
    if (actionType === 'app' && appTarget) action.target = appTarget;
    if (actionType === 'url') action.target = urlTarget;
    if (actionType === 'profile_set') action.target = profileTarget;
    onSave(gridKey, action);
  };

  const handleEditStep = (targetStep: number) => {
    setStep(targetStep);
  };

  const stepTitles = ['Choose Action', 'Configure Target', 'Label & Colors', 'Review & Save'];

  return (
    <div className="wizard-panel">
      <div className="wizard-header">
        <h3>Setup Key {gridKey}</h3>
        <span className="wizard-step-label">Step {step + 1} of {STEP_COUNT}</span>
      </div>

      <div className="wizard-body">
        {step === 0 && (
          <ChooseAction selected={actionType} onSelect={handleActionSelect} />
        )}
        {step === 1 && actionType === 'app' && (
          <ConfigureApp value={appTarget} onChange={setAppTarget} />
        )}
        {step === 1 && actionType === 'url' && (
          <ConfigureUrl value={urlTarget} onChange={setUrlTarget} />
        )}
        {step === 1 && actionType === 'profile_set' && (
          <ConfigureProfile value={profileTarget} profileNames={profileNames} onChange={setProfileTarget} />
        )}
        {step === 2 && (
          <LabelColors
            gridKey={gridKey}
            label={label}
            activeColor={activeColor}
            pressColor={pressColor}
            suggestedLabel={suggestedLabel}
            onLabelChange={setLabel}
            onActiveColorChange={setActiveColor}
            onPressColorChange={setPressColor}
          />
        )}
        {step === 3 && actionType && (
          <ReviewSave
            actionType={actionType}
            target={currentTarget}
            label={label || suggestedLabel}
            activeColor={activeColor}
            pressColor={pressColor}
            hasExisting={!!existingAction}
            onSave={handleSave}
            onRemove={() => onRemove(gridKey)}
            onEditStep={handleEditStep}
          />
        )}
      </div>

      <div className="wizard-nav">
        <button className="wizard-btn" onClick={step === 0 ? onCancel : handleBack}>
          {step === 0 ? 'Cancel' : '← Back'}
        </button>
        <div className="wizard-dots">
          {Array.from({ length: STEP_COUNT }).map((_, i) => (
            <button
              key={i}
              className={`wizard-dot ${i === step ? 'active' : ''} ${i < step ? 'completed' : ''}`}
              onClick={() => i < step && setStep(i)}
              title={stepTitles[i]}
            />
          ))}
        </div>
        {step < STEP_COUNT - 1 ? (
          <button className="wizard-btn primary" disabled={!canAdvance} onClick={handleNext}>
            Next →
          </button>
        ) : (
          <button className="wizard-btn primary" onClick={handleSave}>
            Save
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/src/renderer/components/wizard/WizardPanel.tsx
git commit -m "feat: add WizardPanel container with step navigation and state management"
```

---

### Task 12: Template Picker

**Files:**
- Create: `electron/src/renderer/components/TemplatePicker.tsx`

- [ ] **Step 1: Create TemplatePicker.tsx**

```typescript
import React, { useState, useEffect } from 'react';
import type { ProfileConfig, Profile, KeyAction, GridKey } from '../../shared/types';

interface Template {
  name: string;
  icon: string;
  description: string;
  defaultColor: string;
  keys: Record<string, KeyAction>;
}

interface TemplatePickerProps {
  config: ProfileConfig;
  onApply: (config: ProfileConfig) => void;
  onClose: () => void;
}

export function TemplatePicker({ config, onApply, onClose }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    window.keybow.getTemplates().then((data) => setTemplates(data.templates ?? []));
  }, []);

  const handleApply = (template: Template) => {
    const profileName = template.name;
    let finalName = profileName;
    let counter = 1;
    while (config.profiles[finalName]) {
      finalName = `${profileName} ${counter}`;
      counter++;
    }

    const newProfile: Profile = {
      name: finalName,
      defaultColor: template.defaultColor,
      keys: template.keys as Partial<Record<GridKey, KeyAction>>,
    };

    const updated: ProfileConfig = {
      ...config,
      profiles: { ...config.profiles, [finalName]: newProfile },
      profileOrder: [...config.profileOrder, finalName],
      activeProfile: finalName,
    };

    onApply(updated);
    onClose();
  };

  return (
    <div className="template-overlay" onClick={onClose}>
      <div className="template-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Quick Start Templates</h2>
        <p className="subtitle">Choose a template to create a new pre-configured profile</p>
        <div className="template-grid">
          {templates.map((t) => (
            <div key={t.name} className="template-card" onClick={() => handleApply(t)}>
              <div className="template-card-icon">{t.icon}</div>
              <div className="template-card-name">{t.name}</div>
              <div className="template-card-desc">{t.description}</div>
            </div>
          ))}
        </div>
        <div className="template-close">
          <button className="wizard-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/src/renderer/components/TemplatePicker.tsx
git commit -m "feat: add TemplatePicker modal with template cards"
```

---

### Task 13: Integration — Update Existing Components

**Files:**
- Modify: `electron/src/renderer/app.tsx`
- Modify: `electron/src/renderer/components/ProfileBar.tsx`
- Modify: `electron/src/renderer/components/KeyGrid.tsx`

- [ ] **Step 1: Update KeyGrid to show configuring highlight**

Replace the entire content of `electron/src/renderer/components/KeyGrid.tsx` with:

```typescript
import React from 'react';
import type { Profile, GridKey } from '../../shared/types';

const ROWS = ['A', 'B', 'C', 'D'] as const;
const COLS = ['1', '2', '3', '4'] as const;

interface KeyGridProps {
  profile: Profile;
  selectedKey: GridKey | null;
  pressedKey: GridKey | null;
  previewLabel?: string;
  previewColor?: string;
  onSelectKey: (key: GridKey) => void;
}

export function KeyGrid({ profile, selectedKey, pressedKey, previewLabel, previewColor, onSelectKey }: KeyGridProps) {
  return (
    <div className="key-grid">
      {ROWS.map((row) => (
        <div key={row} className="key-row">
          {COLS.map((col) => {
            const gridKey = `${row}${col}` as GridKey;
            const action = profile.keys[gridKey];
            const isSelected = selectedKey === gridKey;
            const isPressed = pressedKey === gridKey;

            const displayColor = isSelected && previewColor ? previewColor : (action?.activeColor ?? profile.defaultColor);
            const displayLabel = isSelected && previewLabel !== undefined ? previewLabel : (action?.label ?? '');

            return (
              <button
                key={gridKey}
                className={`key-button ${isSelected ? 'selected configuring' : ''} ${isPressed ? 'pressed' : ''}`}
                style={{ backgroundColor: isPressed ? '#ffffff' : `#${displayColor}` }}
                onClick={() => onSelectKey(gridKey)}
                title={displayLabel || gridKey}
              >
                <span className="key-label" style={isPressed ? { color: '#000' } : undefined}>{displayLabel}</span>
                <span className="key-id" style={isPressed ? { color: '#333' } : undefined}>{gridKey}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Update ProfileBar with Templates button**

Replace the entire content of `electron/src/renderer/components/ProfileBar.tsx` with:

```typescript
import React, { useState } from 'react';
import type { ProfileConfig } from '../../shared/types';

interface ProfileBarProps {
  config: ProfileConfig;
  onSave: (config: ProfileConfig) => void;
  onOpenTemplates: () => void;
}

export function ProfileBar({ config, onSave, onOpenTemplates }: ProfileBarProps) {
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
      <button className="wizard-btn" style={{ marginLeft: 'auto' }} onClick={onOpenTemplates}>
        📋 Templates
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Update app.tsx — replace KeyConfig with WizardPanel, add empty state and template picker**

Replace the entire content of `electron/src/renderer/app.tsx` with:

```typescript
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { KeyGrid } from './components/KeyGrid';
import { ProfileBar } from './components/ProfileBar';
import { TemplatePicker } from './components/TemplatePicker';
import { WizardPanel } from './components/wizard/WizardPanel';
import type { ProfileConfig, GridKey } from '../shared/types';
import './styles/app.css';
import './styles/wizard.css';

declare global {
  interface Window {
    keybow: {
      getConfig: () => Promise<ProfileConfig>;
      saveConfig: (config: ProfileConfig) => Promise<boolean>;
      onProfileChanged: (callback: (name: string) => void) => void;
      onDeviceStatus: (callback: (connected: boolean) => void) => void;
      onKeyEvent: (callback: (key: string, event: string) => void) => void;
      getInstalledApps: () => Promise<Array<{ name: string; process: string; path: string }>>;
      browseForApp: () => Promise<{ name: string; process: string; path: string } | null>;
      getTemplates: () => Promise<any>;
      getSuggestions: () => Promise<any>;
      previewLed: (key: string, color: string) => void;
    };
  }
}

function App() {
  const [config, setConfig] = useState<ProfileConfig | null>(null);
  const [selectedKey, setSelectedKey] = useState<GridKey | null>(null);
  const [connected, setConnected] = useState(false);
  const [pressedKey, setPressedKey] = useState<GridKey | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    window.keybow.getConfig().then(setConfig);
    window.keybow.onProfileChanged((name) => {
      setConfig((prev) => prev ? { ...prev, activeProfile: name } : prev);
    });
    window.keybow.onDeviceStatus(setConnected);
    window.keybow.onKeyEvent((key, event) => {
      if (event === 'PRESS') {
        setPressedKey(key as GridKey);
      } else if (event === 'RELEASE') {
        setPressedKey(null);
      }
    });
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
      <ProfileBar config={config} onSave={handleSave} onOpenTemplates={() => setShowTemplates(true)} />
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
              setSelectedKey(null);
            }}
            onCancel={() => setSelectedKey(null)}
          />
        ) : (
          <div className="wizard-empty">
            <div className="wizard-empty-icon">👈</div>
            <p>Click a key to configure it</p>
            <p className="hint">or use <strong>Templates</strong> to set up the whole grid</p>
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

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
```

- [ ] **Step 4: Delete the old KeyConfig component**

```bash
rm electron/src/renderer/components/KeyConfig.tsx
```

- [ ] **Step 5: Verify the app starts and renders**

Run: `cd electron && npm start`
Expected: App launches. Grid shows on the left. Right panel shows empty state "Click a key to configure it". Clicking a key opens the wizard. Templates button visible in profile bar.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: integrate wizard panel, template picker, and empty state into app"
```

---

### Task 14: Smoke Test & Polish

- [ ] **Step 1: Run existing tests to verify no regressions**

Run: `cd electron && npx vitest run`
Expected: All existing tests pass (serial, profiles, app-switcher, auto-switch, action-executor, protocol). The new app-detector tests also pass.

- [ ] **Step 2: Manual smoke test checklist**

Test each interaction:

1. **Empty state:** Launch app → right panel shows "Click a key to configure it"
2. **New key (app):** Click empty key → Step 1 cards appear → click "Launch App" → Step 2 shows installed apps + popular + browse → select an app → Step 3 shows label (auto-suggested) + colors → Step 4 shows review → Save → key appears in grid with color and label
3. **New key (URL):** Click empty key → "Open URL" → category tabs + URL list → click a URL → label + colors → review → save
4. **New key (profile_set):** Click empty key → "Switch Profile" → profile dropdown → select → label + colors → review → save
5. **New key (profile_cycle):** Click empty key → "Cycle Profiles" → skips to label + colors (label defaults to "Next Profile") → review → save
6. **Edit existing key:** Click configured key → opens at review step → click "Edit" buttons to jump to steps → save
7. **Remove key:** Click configured key → review step → "Remove Key" → key removed from grid
8. **Cancel:** Click key → cancel → right panel returns to empty state
9. **Templates:** Click "Templates" in profile bar → modal appears → click a template → new profile created and activated → keys filled in
10. **Navigation:** Back/Next buttons work, dots show progress, completed dots are clickable

- [ ] **Step 3: Fix any issues found during smoke test**

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: wizard polish and smoke test fixes"
```
