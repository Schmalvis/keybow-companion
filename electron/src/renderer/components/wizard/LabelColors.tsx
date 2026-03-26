import React from 'react';
import type { GridKey } from '../../../shared/types';

interface LabelColorsProps {
  gridKey: GridKey;
  label: string;
  activeColor: string;
  pressColor: string;
  suggestedLabel: string;
  onLabelChange: (label: string) => void;
  onActiveColorChange: (color: string) => void;
  onPressColorChange: (color: string) => void;
}

export function LabelColors({
  gridKey,
  label,
  activeColor,
  pressColor,
  suggestedLabel,
  onLabelChange,
  onActiveColorChange,
  onPressColorChange,
}: LabelColorsProps) {
  const handleActiveColorChange = (hex: string) => {
    const color = hex.replace('#', '');
    onActiveColorChange(color);
    window.keybow.previewLed(gridKey, color);
  };

  return (
    <div className="label-colors-form">
      <div className="field">
        <label>Label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          placeholder={suggestedLabel || 'e.g., Slack'}
        />
        {suggestedLabel && !label && (
          <button
            className="wizard-btn"
            style={{ alignSelf: 'flex-start', marginTop: '0.25rem', fontSize: '0.75rem' }}
            onClick={() => onLabelChange(suggestedLabel)}
          >
            Use "{suggestedLabel}"
          </button>
        )}
      </div>

      <div className="color-row">
        <div className="field">
          <label>Active Color</label>
          <input
            type="color"
            value={`#${activeColor}`}
            onChange={(e) => handleActiveColorChange(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Press Color</label>
          <input
            type="color"
            value={`#${pressColor}`}
            onChange={(e) => onPressColorChange(e.target.value.replace('#', ''))}
          />
        </div>
      </div>
    </div>
  );
}
