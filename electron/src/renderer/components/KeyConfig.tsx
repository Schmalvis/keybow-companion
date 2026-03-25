import React, { useState, useEffect } from 'react';
import type { GridKey, KeyAction, ActionType } from '../../shared/types';

interface KeyConfigProps {
  gridKey: GridKey;
  action?: KeyAction;
  defaultColor: string;
  onSave: (key: GridKey, action: KeyAction) => void;
  onRemove: (key: GridKey) => void;
}

const ACTION_TYPES: { value: ActionType; label: string }[] = [
  { value: 'app', label: 'Launch/Focus App' },
  { value: 'url', label: 'Open/Focus URL' },
  { value: 'profile_cycle', label: 'Cycle Profile' },
  { value: 'profile_set', label: 'Switch to Profile' },
];

export function KeyConfig({ gridKey, action, defaultColor, onSave, onRemove }: KeyConfigProps) {
  const [actionType, setActionType] = useState<ActionType>(action?.action ?? 'app');
  const [label, setLabel] = useState(action?.label ?? '');
  const [target, setTarget] = useState('');
  const [processName, setProcessName] = useState('');
  const [activeColor, setActiveColor] = useState(action?.activeColor ?? defaultColor);
  const [pressColor, setPressColor] = useState(action?.pressColor ?? 'FFFFFF');

  useEffect(() => {
    setActionType(action?.action ?? 'app');
    setLabel(action?.label ?? '');
    setActiveColor(action?.activeColor ?? defaultColor);
    setPressColor(action?.pressColor ?? 'FFFFFF');
    if (action?.action === 'app' && typeof action.target === 'object') {
      setProcessName((action.target as { process: string; path: string }).process);
      setTarget((action.target as { process: string; path: string }).path);
    } else {
      setProcessName('');
      setTarget(typeof action?.target === 'string' ? action.target : '');
    }
  }, [gridKey, action, defaultColor]);

  const handleSave = () => {
    const newAction: KeyAction = { action: actionType, label, activeColor, pressColor };
    if (actionType === 'app') {
      newAction.target = { process: processName, path: target };
    } else if (actionType === 'url' || actionType === 'profile_set') {
      newAction.target = target;
    }
    onSave(gridKey, newAction);
  };

  return (
    <div className="key-config">
      <h3>Configure {gridKey}</h3>
      <div className="field">
        <label>Action Type</label>
        <select value={actionType} onChange={(e) => setActionType(e.target.value as ActionType)}>
          {ACTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Label</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g., Slack" />
      </div>
      {actionType === 'app' && (
        <>
          <div className="field">
            <label>Process Name</label>
            <input value={processName} onChange={(e) => setProcessName(e.target.value)} placeholder="e.g., slack.exe" />
          </div>
          <div className="field">
            <label>Executable Path</label>
            <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g., C:\...\slack.exe" />
          </div>
        </>
      )}
      {actionType === 'url' && (
        <div className="field">
          <label>URL</label>
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="https://..." />
        </div>
      )}
      {actionType === 'profile_set' && (
        <div className="field">
          <label>Profile Name</label>
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g., Dev" />
        </div>
      )}
      <div className="color-fields">
        <div className="field">
          <label>Active Color</label>
          <input type="color" value={`#${activeColor}`} onChange={(e) => setActiveColor(e.target.value.slice(1))} />
        </div>
        <div className="field">
          <label>Press Color</label>
          <input type="color" value={`#${pressColor}`} onChange={(e) => setPressColor(e.target.value.slice(1))} />
        </div>
      </div>
      <div className="actions">
        <button className="save-btn" onClick={handleSave}>Save</button>
        <button className="remove-btn" onClick={() => onRemove(gridKey)}>Remove</button>
      </div>
    </div>
  );
}
