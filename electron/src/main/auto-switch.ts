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

    if (this.manualOverride && this.lastForegroundProcess !== null && current !== this.lastForegroundProcess) {
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
