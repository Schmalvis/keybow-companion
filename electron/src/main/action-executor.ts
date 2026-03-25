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
      const color = action.activeColor ?? this.profiles.getKeyColor(event.key);
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
