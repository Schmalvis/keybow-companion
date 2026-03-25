import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutoSwitcher } from '../src/main/auto-switch';

describe('AutoSwitcher', () => {
  let autoSwitcher: AutoSwitcher;
  let mockAppSwitcher: any;
  let mockProfileEngine: any;
  let onProfileSwitch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockAppSwitcher = { getForegroundProcess: vi.fn().mockResolvedValue('slack.exe') };
    mockProfileEngine = {
      getAutoSwitchProfile: vi.fn().mockReturnValue('Work'),
      getActiveProfileName: vi.fn().mockReturnValue('Dev'),
      switchToProfile: vi.fn(),
    };
    onProfileSwitch = vi.fn();
    autoSwitcher = new AutoSwitcher(mockAppSwitcher, mockProfileEngine, onProfileSwitch);
  });

  afterEach(() => {
    autoSwitcher.stop();
    vi.useRealTimers();
  });

  it('switches profile when foreground matches autoSwitch', async () => {
    await autoSwitcher.poll();
    expect(mockProfileEngine.switchToProfile).toHaveBeenCalledWith('Work');
    expect(onProfileSwitch).toHaveBeenCalled();
  });

  it('does not switch if already on correct profile', async () => {
    mockProfileEngine.getActiveProfileName.mockReturnValue('Work');
    await autoSwitcher.poll();
    expect(mockProfileEngine.switchToProfile).not.toHaveBeenCalled();
  });

  it('does not switch if process has no autoSwitch mapping', async () => {
    mockProfileEngine.getAutoSwitchProfile.mockReturnValue(undefined);
    await autoSwitcher.poll();
    expect(mockProfileEngine.switchToProfile).not.toHaveBeenCalled();
  });

  it('respects manual override until foreground changes', async () => {
    autoSwitcher.setManualOverride();
    await autoSwitcher.poll();
    expect(mockProfileEngine.switchToProfile).not.toHaveBeenCalled();
  });

  it('clears manual override when foreground process changes', async () => {
    autoSwitcher.setManualOverride();
    await autoSwitcher.poll();
    expect(mockProfileEngine.switchToProfile).not.toHaveBeenCalled();

    mockAppSwitcher.getForegroundProcess.mockResolvedValue('code.exe');
    mockProfileEngine.getAutoSwitchProfile.mockReturnValue('Dev');
    mockProfileEngine.getActiveProfileName.mockReturnValue('Work');
    await autoSwitcher.poll();
    expect(mockProfileEngine.switchToProfile).toHaveBeenCalledWith('Dev');
  });
});
