// electron/src/shared/protocol.ts
import { GridKey, KeyEvent, KeyEventType } from './types';

const VALID_ROWS = ['A', 'B', 'C', 'D'] as const;
const VALID_COLS = ['1', '2', '3', '4'] as const;
const VALID_EVENTS: KeyEventType[] = ['PRESS', 'RELEASE', 'HOLD'];

const VALID_GRID_KEYS = new Set<string>();
for (const row of VALID_ROWS) {
  for (const col of VALID_COLS) {
    VALID_GRID_KEYS.add(`${row}${col}`);
  }
}

export function isValidGridKey(key: string): key is GridKey {
  return VALID_GRID_KEYS.has(key);
}

export function parseKeyEvent(message: string): KeyEvent | null {
  if (!message.startsWith('KEY:')) return null;

  const parts = message.split(':');
  if (parts.length !== 3) return null;

  const [, key, event] = parts;
  if (!isValidGridKey(key)) return null;
  if (!VALID_EVENTS.includes(event as KeyEventType)) return null;

  return { key: key as GridKey, event: event as KeyEventType };
}

export function buildLedCommand(key: GridKey, colorOrOff: string): string {
  return `LED:${key}:${colorOrOff}\n`;
}

export function buildLedAllCommand(colorOrOff: string): string {
  return `LED:ALL:${colorOrOff}\n`;
}
