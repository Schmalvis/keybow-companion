import { IpcServer } from './ipc-server';
import type { ProfileEngine } from './profiles';
import type { NativeHostBridge } from './action-executor';

export class NativeHost implements NativeHostBridge {
  private ipcServer: IpcServer;
  private profiles: ProfileEngine;
  private pendingRequests = new Map<string, { resolve: (value: any) => void; timer: ReturnType<typeof setTimeout> }>();

  constructor(profiles: ProfileEngine) {
    this.profiles = profiles;
    this.ipcServer = new IpcServer();
  }

  start(): void {
    this.ipcServer.start(async (message) => {
      // Handle responses from the browser extension
      if (message.requestId && this.pendingRequests.has(message.requestId)) {
        const pending = this.pendingRequests.get(message.requestId)!;
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.requestId);
        pending.resolve(message);
      }
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

    // Try the browser extension first (has smart tab matching)
    const extensionResult = await this.sendToExtension({ action: 'focusOrOpen', url });
    if (extensionResult?.success) {
      return true;
    }

    // Fallback: open in default browser
    const { shell } = require('electron');
    await shell.openExternal(url);
    return true;
  }

  private sendToExtension(message: any): Promise<any | null> {
    return new Promise((resolve) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Timeout after 2 seconds — extension not connected or not responding
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve(null);
      }, 2000);

      this.pendingRequests.set(requestId, { resolve, timer });

      // Send through IPC server to native host → extension
      this.ipcServer.broadcast({ ...message, requestId });
    });
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
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
    }
    this.pendingRequests.clear();
    this.ipcServer.stop();
  }
}
