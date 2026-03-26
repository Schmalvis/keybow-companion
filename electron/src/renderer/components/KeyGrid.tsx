import React from 'react';
import type { Profile, GridKey } from '../../shared/types';

const ROWS = ['A', 'B', 'C', 'D'] as const;
const COLS = ['1', '2', '3', '4'] as const;

interface KeyGridProps {
  profile: Profile;
  selectedKey: GridKey | null;
  pressedKey: GridKey | null;
  onSelectKey: (key: GridKey) => void;
}

export function KeyGrid({ profile, selectedKey, pressedKey, onSelectKey }: KeyGridProps) {
  return (
    <div className="key-grid">
      {ROWS.map((row) => (
        <div key={row} className="key-row">
          {COLS.map((col) => {
            const gridKey = `${row}${col}` as GridKey;
            const action = profile.keys[gridKey];
            const color = action?.activeColor ?? profile.defaultColor;
            const isSelected = selectedKey === gridKey;
            const isPressed = pressedKey === gridKey;
            return (
              <button
                key={gridKey}
                className={`key-button ${isSelected ? 'selected' : ''} ${isPressed ? 'pressed' : ''}`}
                style={{ backgroundColor: isPressed ? '#ffffff' : `#${color}` }}
                onClick={() => onSelectKey(gridKey)}
                title={action?.label ?? gridKey}
              >
                <span className="key-label" style={isPressed ? { color: '#000' } : undefined}>{action?.label ?? ''}</span>
                <span className="key-id" style={isPressed ? { color: '#333' } : undefined}>{gridKey}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
