import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { KeyGrid } from './components/KeyGrid';
import { KeyConfig } from './components/KeyConfig';
import { ProfileBar } from './components/ProfileBar';
import type { ProfileConfig, GridKey } from '../shared/types';
import './styles/app.css';

declare global {
  interface Window {
    keybow: {
      getConfig: () => Promise<ProfileConfig>;
      saveConfig: (config: ProfileConfig) => Promise<boolean>;
      onProfileChanged: (callback: (name: string) => void) => void;
      onDeviceStatus: (callback: (connected: boolean) => void) => void;
    };
  }
}

function App() {
  const [config, setConfig] = useState<ProfileConfig | null>(null);
  const [selectedKey, setSelectedKey] = useState<GridKey | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    window.keybow.getConfig().then(setConfig);
    window.keybow.onProfileChanged((name) => {
      setConfig((prev) => prev ? { ...prev, activeProfile: name } : prev);
    });
    window.keybow.onDeviceStatus(setConnected);
  }, []);

  if (!config) return <div className="loading">Loading...</div>;

  const activeProfile = config.profiles[config.activeProfile];

  const handleSave = async (updated: ProfileConfig) => {
    setConfig(updated);
    await window.keybow.saveConfig(updated);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Keybow Companion</h1>
        <span className={`status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </header>
      <ProfileBar config={config} onSave={handleSave} />
      <div className="main-content">
        <KeyGrid profile={activeProfile} selectedKey={selectedKey} onSelectKey={setSelectedKey} />
        {selectedKey && (
          <KeyConfig
            gridKey={selectedKey}
            action={activeProfile.keys[selectedKey]}
            defaultColor={activeProfile.defaultColor}
            onSave={(key, action) => {
              const updated = { ...config };
              updated.profiles[config.activeProfile] = {
                ...activeProfile,
                keys: { ...activeProfile.keys, [key]: action },
              };
              handleSave(updated);
            }}
            onRemove={(key) => {
              const updated = { ...config };
              const newKeys = { ...activeProfile.keys };
              delete newKeys[key];
              updated.profiles[config.activeProfile] = { ...activeProfile, keys: newKeys };
              handleSave(updated);
            }}
          />
        )}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
