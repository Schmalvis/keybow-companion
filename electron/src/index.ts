import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { SerialManager } from './main/serial';
import { ProfileEngine } from './main/profiles';
import { AppSwitcher } from './main/app-switcher';
import { AutoSwitcher } from './main/auto-switch';
import { ActionExecutor } from './main/action-executor';
import type { ProfileConfig, GridKey } from './shared/types';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

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
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

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
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
