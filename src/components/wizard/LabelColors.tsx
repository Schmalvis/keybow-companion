import React, { useRef, useState } from 'react';
import { keybow } from '../../api';
import type { GridKey } from '../../types';

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

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value);

  const handleTextChange = (raw: string) => {
    const cleaned = raw.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
    setText(cleaned);
    if (cleaned.length === 6) {
      onChange(cleaned.toUpperCase());
    }
  };

  const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value.replace('#', '').toUpperCase();
    setText(hex);
    onChange(hex);
  };

  // Sync when parent value changes (e.g. on key switch)
  if (value !== text && value.length === 6 && text.length !== 6) {
    setText(value);
  }

  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 4,
            border: '1px solid #555',
            backgroundColor: `#${value}`,
            cursor: 'pointer',
            flexShrink: 0,
          }}
          onClick={() => inputRef.current?.click()}
          title="Click to open color picker"
        />
        <input
          ref={inputRef}
          type="color"
          value={`#${value}`}
          onChange={handlePickerChange}
          style={{ width: 0, height: 0, padding: 0, border: 'none', opacity: 0, position: 'absolute' }}
        />
        <input
          type="text"
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="FF0000"
          maxLength={6}
          style={{
            fontFamily: 'monospace',
            width: '5.5rem',
          }}
        />
      </div>
    </div>
  );
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
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleActiveColorChange = (hex: string) => {
    onActiveColorChange(hex);

    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      keybow.previewLed(gridKey, hex);
    }, 50);
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
        <ColorField label="Active Color" value={activeColor} onChange={handleActiveColorChange} />
        <ColorField label="Press Color" value={pressColor} onChange={onPressColorChange} />
      </div>
    </div>
  );
}
