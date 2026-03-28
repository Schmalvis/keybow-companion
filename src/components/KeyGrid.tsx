import React from 'react';
import type { Profile, GridKey } from '../types';

const ROWS = ['A', 'B', 'C', 'D'] as const;
const COLS = ['1', '2', '3', '4'] as const;

interface KeyGridProps {
  profile: Profile;
  selectedKey: GridKey | null;
  pressedKey: GridKey | null;
  onSelectKey: (key: GridKey) => void;
  previewLabel?: string;
  previewColor?: string;
}

export const KeyGrid = React.memo(function KeyGrid({ profile, selectedKey, pressedKey, onSelectKey, previewLabel, previewColor }: KeyGridProps) {
  return (
    <div className="key-grid">
      {ROWS.map((row) => (
        <div key={row} className="key-row">
          {COLS.map((col) => {
            const gridKey = `${row}${col}` as GridKey;
            const action = profile.keys[gridKey];
            const storedColor = action?.activeColor ?? profile.defaultColor;
            const isSelected = selectedKey === gridKey;
            const isPressed = pressedKey === gridKey;
            const displayColor = isSelected && previewColor ? previewColor : storedColor;
            const displayLabel = isSelected && previewLabel !== undefined ? previewLabel : (action?.label ?? '');
            return (
              <button
                key={gridKey}
                className={`key-button ${isSelected ? 'selected configuring' : ''} ${isPressed ? 'pressed' : ''}`}
                style={{ backgroundColor: isPressed ? '#ffffff' : `#${displayColor}` }}
                onClick={() => onSelectKey(gridKey)}
                title={action?.label ?? gridKey}
              >
                <span className="key-label" style={isPressed ? { color: '#000' } : undefined}>{displayLabel}</span>
                <span className="key-id" style={isPressed ? { color: '#333' } : undefined}>{gridKey}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
});
