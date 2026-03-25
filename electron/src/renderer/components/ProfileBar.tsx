import React, { useState } from 'react';
import type { ProfileConfig } from '../../shared/types';

interface ProfileBarProps {
  config: ProfileConfig;
  onSave: (config: ProfileConfig) => void;
}

export function ProfileBar({ config, onSave }: ProfileBarProps) {
  const [newName, setNewName] = useState('');

  const switchProfile = (name: string) => {
    onSave({ ...config, activeProfile: name });
  };

  const addProfile = () => {
    if (!newName.trim() || config.profiles[newName]) return;
    const updated = { ...config };
    updated.profiles[newName] = {
      name: newName,
      defaultColor: '004488',
      keys: {
        [config.profileSwitchKey]: {
          action: 'profile_cycle' as const,
          label: 'Next Profile',
          activeColor: 'FF8800',
        },
      },
    };
    updated.profileOrder = [...updated.profileOrder, newName];
    onSave(updated);
    setNewName('');
  };

  const deleteProfile = (name: string) => {
    if (config.profileOrder.length <= 1) return;
    const updated = { ...config };
    delete updated.profiles[name];
    updated.profileOrder = updated.profileOrder.filter((n) => n !== name);
    if (updated.activeProfile === name) {
      updated.activeProfile = updated.profileOrder[0];
    }
    onSave(updated);
  };

  return (
    <div className="profile-bar">
      {config.profileOrder.map((name) => (
        <div key={name} className={`profile-tab ${name === config.activeProfile ? 'active' : ''}`}>
          <button className="profile-name" onClick={() => switchProfile(name)}>{name}</button>
          {config.profileOrder.length > 1 && (
            <button className="profile-delete" onClick={() => deleteProfile(name)} title="Delete profile">x</button>
          )}
        </div>
      ))}
      <div className="profile-add">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New profile" onKeyDown={(e) => e.key === 'Enter' && addProfile()} />
        <button onClick={addProfile}>+</button>
      </div>
    </div>
  );
}
