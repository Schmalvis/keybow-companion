import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { KeyGrid } from './components/KeyGrid';
import { WizardPanel } from './components/wizard/WizardPanel';
import { TemplatePicker } from './components/TemplatePicker';
import { ProfileBar } from './components/ProfileBar';
import type { ProfileConfig, GridKey, KeyAction } from '../shared/types';
import './styles/app.css';
import './styles/wizard.css';

declare global {
  interface Window {
    keybow: {
      getConfig: () => Promise<ProfileConfig>;
      saveConfig: (config: ProfileConfig) => Promise<boolean>;
      onProfileChanged: (callback: (name: string) => void) => void;
      onDeviceStatus: (callback: (connected: boolean) => void) => void;
      onKeyEvent: (callback: (key: string, event: string) => void) => void;
      getInstalledApps: () => Promise<Array<{ name: string; process: string; path: string }>>;
      browseForApp: () => Promise<{ name: string; process: string; path: string } | null>;
      getTemplates: () => Promise<any>;
      getSuggestions: () => Promise<any>;
      previewLed: (key: string, color: string) => void;
    };
  }
}

function App() {
  const [config, setConfig] = useState<ProfileConfig | null>(null);
  const [selectedKey, setSelectedKey] = useState<GridKey | null>(null);
  const [connected, setConnected] = useState(false);
  const [pressedKey, setPressedKey] = useState<GridKey | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedKey(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    window.keybow.getConfig().then(setConfig);
    window.keybow.onProfileChanged((name) => {
      setConfig((prev) => prev ? { ...prev, activeProfile: name } : prev);
    });
    window.keybow.onDeviceStatus(setConnected);
    window.keybow.onKeyEvent((key, event) => {
      if (event === 'PRESS') {
        setPressedKey(key as GridKey);
      } else if (event === 'RELEASE') {
        setPressedKey(null);
      }
    });
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
      <ProfileBar config={config} onSave={handleSave} onOpenTemplates={() => setShowTemplates(true)} />
      <div className="main-content">
        <KeyGrid profile={activeProfile} selectedKey={selectedKey} pressedKey={pressedKey} onSelectKey={setSelectedKey} />
        {selectedKey ? (
          <WizardPanel
            gridKey={selectedKey}
            existingAction={activeProfile.keys[selectedKey]}
            defaultColor={activeProfile.defaultColor}
            profileNames={config.profileOrder}
            onSave={(key: GridKey, action: KeyAction) => {
              const updated = { ...config };
              updated.profiles[config.activeProfile] = {
                ...activeProfile,
                keys: { ...activeProfile.keys, [key]: action },
              };
              handleSave(updated);
            }}
            onRemove={(key: GridKey) => {
              const updated = { ...config };
              const newKeys = { ...activeProfile.keys };
              delete newKeys[key];
              updated.profiles[config.activeProfile] = { ...activeProfile, keys: newKeys };
              handleSave(updated);
              setSelectedKey(null);
            }}
            onCancel={() => setSelectedKey(null)}
          />
        ) : (
          <div className="wizard-empty">
            <div className="wizard-empty-icon">👈</div>
            <p>Click a key to configure it</p>
            <p className="hint">or use <strong>Templates</strong> to set up the whole grid</p>
          </div>
        )}
      </div>
      {showTemplates && (
        <TemplatePicker
          config={config}
          onApply={handleSave}
          onClose={() => setShowTemplates(false)}
        />
      )}
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
