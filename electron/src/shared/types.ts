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
