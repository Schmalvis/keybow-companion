import React from 'react';
import type { Profile, GridKey } from '../../shared/types';

const ROWS = ['A', 'B', 'C', 'D'] as const;
const COLS = ['1', '2', '3', '4'] as const;

interface KeyGridProps {
  profile: Profile;
  selectedKey: GridKey | null;
  onSelectKey: (key: GridKey) => void;
}

export function KeyGrid({ profile, selectedKey, onSelectKey }: KeyGridProps) {
  return (
    <div className="key-grid">
      {ROWS.map((row) => (
        <div key={row} className="key-row">
          {COLS.map((col) => {
            const gridKey = `${row}${col}` as GridKey;
            const action = profile.keys[gridKey];
            const color = action?.activeColor ?? profile.defaultColor;
            const isSelected = selectedKey === gridKey;
            return (
              <button
                key={gridKey}
                className={`key-button ${isSelected ? 'selected' : ''}`}
                style={{ backgroundColor: `#${color}` }}
                onClick={() => onSelectKey(gridKey)}
                title={action?.label ?? gridKey}
              >
                <span className="key-label">{action?.label ?? ''}</span>
                <span className="key-id">{gridKey}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
