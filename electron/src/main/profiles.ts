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
