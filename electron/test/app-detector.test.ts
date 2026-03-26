import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppDetector } from '../src/main/app-detector';
import type { DetectedApp } from '../src/main/app-detector';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'child_process';

const mockExecFile = vi.mocked(execFile);

describe('AppDetector', () => {
  let detector: AppDetector;

  beforeEach(() => {
    detector = new AppDetector();
    vi.clearAllMocks();
  });

  describe('scan', () => {
    it('parses PowerShell output into DetectedApp list', async () => {
      const psOutput = [
        'Visual Studio Code\tC:\\Users\\test\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
        'Slack\tC:\\Users\\test\\AppData\\Local\\slack\\slack.exe',
        '',
      ].join('\n');

      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, psOutput, '');
        return {} as any;
      });

      const apps = await detector.scan();

      expect(apps).toHaveLength(2);
      expect(apps[0]).toEqual({
        name: 'Visual Studio Code',
        process: 'Code',
        path: 'C:\\Users\\test\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
      });
      expect(apps[1]).toEqual({
        name: 'Slack',
        process: 'slack',
        path: 'C:\\Users\\test\\AppData\\Local\\slack\\slack.exe',
      });
    });

    it('returns empty array on PowerShell error', async () => {
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(new Error('PowerShell not found'), '', '');
        return {} as any;
      });

      const apps = await detector.scan();
      expect(apps).toEqual([]);
    });

    it('caches results after first scan', async () => {
      const psOutput = 'Notepad\tC:\\Windows\\System32\\notepad.exe\n';
      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, psOutput, '');
        return {} as any;
      });

      await detector.scan();
      await detector.scan();

      expect(mockExecFile).toHaveBeenCalledTimes(1);
    });

    it('filters out entries with missing fields', async () => {
      const psOutput = [
        'Good App\tC:\\good.exe',
        'Bad App',
        '\tC:\\no-name.exe',
        '',
      ].join('\n');

      mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, psOutput, '');
        return {} as any;
      });

      const apps = await detector.scan();
      expect(apps).toHaveLength(1);
      expect(apps[0].name).toBe('Good App');
    });
  });

  describe('getApps', () => {
    it('returns cached apps without scanning', () => {
      expect(detector.getApps()).toEqual([]);
    });
  });
});
