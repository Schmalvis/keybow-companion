import React from 'react';
import type { ActionType, AppTarget } from '../../../shared/types';

const ACTION_LABELS: Record<ActionType, { icon: string; title: string }> = {
  app: { icon: '🖥️', title: 'Launch App' },
  url: { icon: '🌐', title: 'Open URL' },
  profile_set: { icon: '📁', title: 'Switch Profile' },
  profile_cycle: { icon: '🔄', title: 'Cycle Profiles' },
};

interface ReviewSaveProps {
  actionType: ActionType;
  target: string | AppTarget | undefined;
  label: string;
  activeColor: string;
  pressColor: string;
  hasExisting: boolean;
  onSave: () => void;
  onRemove: () => void;
  onEditStep: (step: number) => void;
}

export function ReviewSave({
  actionType,
  target,
  label,
  activeColor,
  pressColor,
  hasExisting,
  onSave,
  onRemove,
  onEditStep,
}: ReviewSaveProps) {
  const actionInfo = ACTION_LABELS[actionType];

  const targetDisplay = (() => {
    if (actionType === 'profile_cycle') return '—';
    if (typeof target === 'object' && target !== null) {
      return `${(target as AppTarget).process} — ${(target as AppTarget).path}`;
    }
    return String(target ?? '');
  })();

  return (
    <div>
      <div className="review-card">
        <div className="review-row">
          <span className="review-label">Action</span>
          <span className="review-value">
            {actionInfo.icon} {actionInfo.title}
            <button
              className="wizard-btn"
              style={{ marginLeft: '0.5rem', padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}
              onClick={() => onEditStep(0)}
            >
              Edit
            </button>
          </span>
        </div>

        {actionType !== 'profile_cycle' && (
          <div className="review-row">
            <span className="review-label">Target</span>
            <span className="review-value" style={{ maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {targetDisplay}
              <button
                className="wizard-btn"
                style={{ marginLeft: '0.5rem', padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}
                onClick={() => onEditStep(1)}
              >
                Edit
              </button>
            </span>
          </div>
        )}

        <div className="review-row">
          <span className="review-label">Label</span>
          <span className="review-value">
            {label || '(none)'}
            <button
              className="wizard-btn"
              style={{ marginLeft: '0.5rem', padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}
              onClick={() => onEditStep(2)}
            >
              Edit
            </button>
          </span>
        </div>

        <div className="review-row">
          <span className="review-label">Colors</span>
          <span className="review-colors">
            <span className="review-color-swatch" style={{ backgroundColor: `#${activeColor}` }} title="Active" />
            <span className="review-color-swatch" style={{ backgroundColor: `#${pressColor}` }} title="Press" />
          </span>
        </div>
      </div>

      <div className="review-actions">
        <button className="wizard-btn primary" onClick={onSave}>Save</button>
        {hasExisting && (
          <button className="wizard-btn danger" onClick={onRemove}>Remove Key</button>
        )}
      </div>
    </div>
  );
}
