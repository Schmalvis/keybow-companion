import React from 'react';

interface ConfigureProfileProps {
  value: string;
  profileNames: string[];
  onChange: (profileName: string) => void;
}

export function ConfigureProfile({ value, profileNames, onChange }: ConfigureProfileProps) {
  return (
    <div className="target-section">
      <h4>Select Profile</h4>
      <select
        className="profile-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— Choose a profile —</option>
        {profileNames.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>
    </div>
  );
}
