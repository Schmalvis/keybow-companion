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

    // Fallback: open in default browser (full IPC round-trip is future work)
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
