import { describe, it, expect, vi } from 'vitest';
import { AppSwitcher } from '../src/main/app-switcher';

describe('AppSwitcher', () => {
  it('constructs without error', () => {
    const switcher = new AppSwitcher();
    expect(switcher).toBeDefined();
  });

  it('buildFindScript generates valid PowerShell', () => {
    const script = AppSwitcher.buildFindScript('slack');
    expect(script).toContain('Get-Process');
    expect(script).toContain('slack');
  });

  it('buildFocusScript generates valid PowerShell', () => {
    const script = AppSwitcher.buildFocusScript(1234);
    expect(script).toContain('1234');
    expect(script).toContain('SetForegroundWindow');
  });

  it('sanitizes process names to alphanumeric and hyphens only', () => {
    expect(AppSwitcher.sanitizeProcessName('slack; rm -rf /')).toBe('slackrm-rf');
    expect(AppSwitcher.sanitizeProcessName('normal-app')).toBe('normal-app');
    expect(AppSwitcher.sanitizeProcessName("app'name")).toBe('appname');
    expect(AppSwitcher.sanitizeProcessName('path.traversal')).toBe('pathtraversal');
  });
});
