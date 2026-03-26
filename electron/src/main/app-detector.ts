import { execFile } from 'child_process';

export interface DetectedApp {
  name: string;
  process: string;
  path: string;
}

const PS_SCRIPT = `
$shell = New-Object -ComObject WScript.Shell
Get-ChildItem "$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\*.lnk" -Recurse |
  ForEach-Object {
    $shortcut = $shell.CreateShortcut($_.FullName)
    if ($shortcut.TargetPath -match '\\.exe$') {
      $name = $_.BaseName
      $target = $shortcut.TargetPath
      "$name\t$target"
    }
  }
$shell = New-Object -ComObject WScript.Shell
Get-ChildItem "$env:AppData\\Microsoft\\Windows\\Start Menu\\Programs\\*.lnk" -Recurse |
  ForEach-Object {
    $shortcut = $shell.CreateShortcut($_.FullName)
    if ($shortcut.TargetPath -match '\\.exe$') {
      $name = $_.BaseName
      $target = $shortcut.TargetPath
      "$name\t$target"
    }
  }
`.trim();

export class AppDetector {
  private cache: DetectedApp[] | null = null;

  async scan(): Promise<DetectedApp[]> {
    if (this.cache) return this.cache;

    try {
      const output = await this.runPowerShell();
      this.cache = this.parseOutput(output);
    } catch (error) {
      console.error('AppDetector: failed to scan Start Menu:', error);
      this.cache = [];
    }

    return this.cache;
  }

  getApps(): DetectedApp[] {
    return this.cache ?? [];
  }

  private parseOutput(output: string): DetectedApp[] {
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const [name, path] = line.split('\t');
        if (!name || !path) return null;
        const exe = path.split('\\').pop() ?? '';
        const process = exe.replace(/\.exe$/i, '');
        return { name, process, path };
      })
      .filter((app): app is DetectedApp => app !== null);
  }

  private runPowerShell(): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPT],
        { timeout: 10000 },
        (error, stdout) => {
          if (error) reject(error);
          else resolve(stdout);
        },
      );
    });
  }
}
