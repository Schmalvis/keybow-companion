import React, { useState } from 'react';
import type { AppTarget } from '../../../shared/types';

interface AppEntry {
  name: string;
  process: string;
  path: string;
}

interface ConfigureAppProps {
  value: AppTarget | null;
  onChange: (target: AppTarget) => void;
  installedApps: AppEntry[];
  popularApps: AppEntry[];
}

export function ConfigureApp({ value, onChange, installedApps, popularApps }: ConfigureAppProps) {
  const [search, setSearch] = useState('');

  const filtered = installedApps.filter(
    (app) => app.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSelect = (app: AppEntry) => {
    onChange({ process: app.process, path: app.path });
  };

  const handleBrowse = async () => {
    const result = await window.keybow.browseForApp();
    if (result) {
      onChange({ process: result.process, path: result.path });
    }
  };

  const selectedName =
    value && (installedApps.find((a) => a.path === value.path)?.name
      ?? popularApps.find((a) => a.path === value.path)?.name
      ?? value.process);

  return (
    <div className="target-section">
      {value && (
        <p style={{ color: '#7c6ef0', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          Selected: <strong>{selectedName}</strong>
        </p>
      )}

      <h4>Installed Apps</h4>
      <input
        className="app-search"
        type="text"
        placeholder="Search installed apps..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="app-list">
        {filtered.length === 0 && (
          <p style={{ color: '#666', fontSize: '0.8rem', textAlign: 'center', padding: '0.5rem' }}>
            {installedApps.length === 0 ? 'Scanning for apps...' : 'No matches'}
          </p>
        )}
        {filtered.slice(0, 20).map((app) => (
          <div key={app.path} className="app-item" onClick={() => handleSelect(app)}>
            <span>{app.name}</span>
            <span className="app-item-path">{app.path}</span>
          </div>
        ))}
      </div>

      <h4>Popular Apps</h4>
      <div className="app-list">
        {popularApps.map((app) => (
          <div key={app.name} className="app-item" onClick={() => handleSelect(app)}>
            <span>{app.name}</span>
          </div>
        ))}
      </div>

      <button className="browse-btn" onClick={handleBrowse}>
        Browse for application...
      </button>
    </div>
  );
}
