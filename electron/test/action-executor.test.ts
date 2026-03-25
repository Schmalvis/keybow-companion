// electron/test/action-executor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActionExecutor } from '../src/main/action-executor';

describe('ActionExecutor', () => {
  let executor: ActionExecutor;
  let mockAppSwitcher: any;
  let mockSerial: any;
  let mockProfileEngine: any;
  let mockNativeHost: any;

  beforeEach(() => {
    mockAppSwitcher = { focusOrLaunch: vi.fn().mockResolvedValue(true) };
    mockSerial = { sendLed: vi.fn(), sendLedAll: vi.fn() };
    mockNativeHost = { focusOrOpen: vi.fn().mockResolvedValue(true) };
    mockProfileEngine = {
      getKeyAction: vi.fn(),
      getKeyColor: vi.fn().mockReturnValue('004488'),
      cycleProfile: vi.fn(),
      switchToProfile: vi.fn(),
      getActiveProfile: vi.fn().mockReturnValue({ name: 'Work', defaultColor: '004488', keys: {} }),
      getAllKeyColors: vi.fn().mockReturnValue({}),
      getConfig: vi.fn().mockReturnValue({ profiles: {} }),
    };
    executor = new ActionExecutor(mockAppSwitcher, mockSerial, mockProfileEngine, mockNativeHost);
  });

  it('executes app action', async () => {
    mockProfileEngine.getKeyAction.mockReturnValue({
      action: 'app',
      target: { process: 'slack.exe', path: 'C:\\slack.exe' },
      label: 'Slack',
      activeColor: '4A154B',
    });

    await executor.handleKeyEvent({ key: 'A1', event: 'PRESS' });

    expect(mockAppSwitcher.focusOrLaunch).toHaveBeenCalledWith({ process: 'slack.exe', path: 'C:\\slack.exe' });
    expect(mockSerial.sendLed).toHaveBeenCalledWith('A1', '4A154B');
  });

  it('executes url action', async () => {
    mockProfileEngine.getKeyAction.mockReturnValue({
      action: 'url',
      target: 'https://calendar.google.com',
      label: 'Calendar',
      activeColor: '4285F4',
    });

    await executor.handleKeyEvent({ key: 'A2', event: 'PRESS' });

    expect(mockNativeHost.focusOrOpen).toHaveBeenCalledWith('https://calendar.google.com');
    expect(mockSerial.sendLed).toHaveBeenCalledWith('A2', '4285F4');
  });

  it('executes profile_cycle action', async () => {
    mockProfileEngine.getKeyAction.mockReturnValue({
      action: 'profile_cycle',
      label: 'Next Profile',
      activeColor: 'FF8800',
    });

    await executor.handleKeyEvent({ key: 'D4', event: 'PRESS' });

    expect(mockProfileEngine.cycleProfile).toHaveBeenCalled();
  });

  it('sends red flash on app switch failure', async () => {
    mockAppSwitcher.focusOrLaunch.mockResolvedValue(false);
    mockProfileEngine.getKeyAction.mockReturnValue({
      action: 'app',
      target: { process: 'missing.exe', path: 'C:\\missing.exe' },
      label: 'Missing',
      activeColor: '004488',
    });

    await executor.handleKeyEvent({ key: 'A1', event: 'PRESS' });

    expect(mockSerial.sendLed).toHaveBeenCalledWith('A1', 'FF0000');
  });

  it('ignores RELEASE events', async () => {
    await executor.handleKeyEvent({ key: 'A1', event: 'RELEASE' });
    expect(mockProfileEngine.getKeyAction).not.toHaveBeenCalled();
  });

  it('ignores HOLD events (no hold actions configured yet)', async () => {
    await executor.handleKeyEvent({ key: 'A1', event: 'HOLD' });
    expect(mockProfileEngine.getKeyAction).not.toHaveBeenCalled();
  });
});
