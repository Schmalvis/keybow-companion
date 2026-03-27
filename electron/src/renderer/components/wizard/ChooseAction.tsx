import React from 'react';
import type { ActionType } from '../../../shared/types';

const ACTION_CARDS: { type: ActionType; icon: string; title: string; desc: string }[] = [
  { type: 'app', icon: '🖥️', title: 'Launch App', desc: 'Open or focus an application' },
  { type: 'url', icon: '🌐', title: 'Open URL', desc: 'Open or focus a web page' },
  { type: 'profile_set', icon: '📁', title: 'Switch Profile', desc: 'Jump to a specific profile' },
  { type: 'profile_cycle', icon: '🔄', title: 'Cycle Profiles', desc: 'Step through profiles in order' },
];

interface ChooseActionProps {
  selected: ActionType | null;
  onSelect: (type: ActionType) => void;
}

export function ChooseAction({ selected, onSelect }: ChooseActionProps) {
  return (
    <div>
      <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
        What should this key do?
      </p>
      <div className="action-cards">
        {ACTION_CARDS.map((card) => (
          <div
            key={card.type}
            className={`action-card ${selected === card.type ? 'selected' : ''}`}
            onClick={() => onSelect(card.type)}
          >
            <div className="action-card-icon">{card.icon}</div>
            <div className="action-card-title">{card.title}</div>
            <div className="action-card-desc">{card.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
