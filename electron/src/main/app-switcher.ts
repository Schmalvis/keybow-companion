import { execFile } from 'child_process';
import { promisify } from 'util';
import type { AppTarget } from '../shared/types';

const execFileAsync = promisify(execFile);

export class AppSwitcher {
  /**
   * Strip all characters except alphanumeric and hyphens.
   * Prevents any form of injection when passed as a PowerShell argument.
   */
  static sanitizeProcessName(input: string): string {
    return input.replace(/[^a-zA-Z0-9\-]/g, '');
  }

  /** Build PowerShell script to find a process window handle. */
  static buildFindScript(processName: string): string {
    const safe = AppSwitcher.sanitizeProcessName(processName);
    return `Get-Process -Name '${safe}' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1 -ExpandProperty MainWindowHandle`;
  }

  /** Build PowerShell script to focus a window by handle. */
  static buildFocusScript(windowHandle: number): string {
    return [
      "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Win32 { [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd); [DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); }'",
      `[Win32]::ShowWindow([IntPtr]${windowHandle}, 9)`,
      `[Win32]::SetForegroundWindow([IntPtr]${windowHandle})`,
    ].join('; ');
  }

  async focusOrLaunch(target: AppTarget): Promise<boolean> {
    // Strip .exe before sanitizing (dots are removed by sanitize)
    const rawName = target.process.replace(/\.exe$/i, '');
    const processName = AppSwitcher.sanitizeProcessName(rawName);

    try {
      // Use execFile with arguments array — no shell interpolation
      const { stdout } = await execFileAsync('powershell', [
        '-NoProfile',
        '-Command',
        AppSwitcher.buildFindScript(processName),
      ]);

      const handle = parseInt(stdout.trim(), 10);
      if (handle && handle !== 0) {
        await execFileAsync('powershell', [
          '-NoProfile',
          '-Command',
          AppSwitcher.buildFocusScript(handle),
        ]);
        return true;
      }
    } catch {
      // Process not running — fall through to launch
    }

    // Launch the app using execFile — path is passed as argument, not shell-interpolated
    try {
      execFile('cmd', ['/c', 'start', '', target.path]);
      return true;
    } catch {
      return false;
    }
  }

  async getForegroundProcess(): Promise<string | null> {
    try {
      const script = [
        "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class FG { [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId); }'",
        '$h = [FG]::GetForegroundWindow()',
        '$pid = 0',
        '[FG]::GetWindowThreadProcessId($h, [ref]$pid) | Out-Null',
        "(Get-Process -Id $pid -ErrorAction SilentlyContinue).ProcessName + '.exe'",
      ].join('; ');

      const { stdout } = await execFileAsync('powershell', [
        '-NoProfile',
        '-Command',
        script,
      ]);
      const name = stdout.trim();
      return name && name !== '.exe' ? name : null;
    } catch {
      return null;
    }
  }
}
