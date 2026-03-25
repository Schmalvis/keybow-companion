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
