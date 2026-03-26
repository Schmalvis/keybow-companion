import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { SerialManager } from './main/serial';
import { ProfileEngine } from './main/profiles';
import { AppSwitcher } from './main/app-switcher';
import { AutoSwitcher } from './main/auto-switch';
import { ActionExecutor } from './main/action-executor';
import type { ProfileConfig, GridKey } from './shared/types';
import { NativeHost } from './main/native-host';

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

function createTrayIcon(): Electron.NativeImage {
  // 16x16 RGBA icon: dark background with a 4x4 grid of colored key dots
  const size = 16;
  const buf = Buffer.alloc(size * size * 4, 0); // fill with transparent black

  // Background: dark grey (R=30, G=30, B=30, A=255)
  for (let i = 0; i < size * size; i++) {
    buf[i * 4 + 0] = 30;
    buf[i * 4 + 1] = 30;
    buf[i * 4 + 2] = 30;
    buf[i * 4 + 3] = 255;
  }

  // 4x4 grid of key dots — each dot is a 2x2 block of blue-green pixels
  // Grid starts at pixel (2,2) with 3px spacing between dot origins
  const dotColor = { r: 0, g: 180, b: 220 }; // cyan-blue
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const originX = 2 + col * 3;
      const originY = 2 + row * 3;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const px = originX + dx;
          const py = originY + dy;
          if (px < size && py < size) {
            const idx = (py * size + px) * 4;
            buf[idx + 0] = dotColor.r;
            buf[idx + 1] = dotColor.g;
            buf[idx + 2] = dotColor.b;
            buf[idx + 3] = 255;
          }
        }
      }
    }
  }

  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

function createTray(): void {
  tray = new Tray(createTrayIcon());
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

app.whenReady().then(() => {
  const config = loadConfig();
  profiles = new ProfileEngine(config);
  serial = new SerialManager();
  appSwitcher = new AppSwitcher();
  autoSwitcher = new AutoSwitcher(appSwitcher, profiles, onProfileSwitch);
  const nativeHost = new NativeHost(profiles);
  nativeHost.start();
  actionExecutor = new ActionExecutor(appSwitcher, serial as any, profiles, nativeHost);

  serial.on('keyEvent', (event) => {
    actionExecutor.handleKeyEvent(event);
    mainWindow?.webContents.send('key-event', event.key, event.event);
  });
  serial.on('ready', () => {
    mainWindow?.webContents.send('device-status', true);
    onProfileSwitch();
  });
  serial.on('connected', () => {
    // Device connected — also mark as connected and send LED state
    // (READY may have been sent before we connected)
    mainWindow?.webContents.send('device-status', true);
    onProfileSwitch();
  });
  serial.on('pong', () => {
    // Receiving PONGs confirms connection is alive
    mainWindow?.webContents.send('device-status', true);
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

app.on('window-all-closed', () => {
  // Don't quit — keep running in tray
});

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
