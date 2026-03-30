import React, { useState, useEffect, useCallback } from 'react';
import { KeyGrid } from './components/KeyGrid';
import { WizardPanel } from './components/wizard/WizardPanel';
import { TemplatePicker } from './components/TemplatePicker';
import { ProfileBar } from './components/ProfileBar';
import { Modal } from './components/Modal';
import { keybow } from './api';
import type { ProfileConfig, GridKey, KeyAction } from './types';

export function App() {
  const [config, setConfig] = useState<ProfileConfig | null>(null);
  const [selectedKey, setSelectedKey] = useState<GridKey | null>(null);
  const [connected, setConnected] = useState(false);
  const [pressedKey, setPressedKey] = useState<GridKey | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [suggestions, setSuggestions] = useState<any>(null);
  const [installedApps, setInstalledApps] = useState<Array<{ name: string; process: string; path: string }>>([]);
  const [wizardDirty, setWizardDirty] = useState(false);
  const [pendingKey, setPendingKey] = useState<GridKey | null | undefined>(undefined);

  const handleSelectKey = useCallback((key: GridKey | null) => {
    if (wizardDirty && key !== selectedKey) {
      setPendingKey(key);  // null means "close panel", a GridKey means "switch to key"
    } else {
      setSelectedKey(key);
    }
  }, [wizardDirty, selectedKey]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleSelectKey(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSelectKey]);

  useEffect(() => {
    keybow.getConfig().then(setConfig as any);
    keybow.getSuggestions().then(setSuggestions);
    keybow.getInstalledApps().then(setInstalledApps as any);
    keybow.getDeviceStatus().then(setConnected);
    keybow.onProfileChanged((name) => {
      setConfig((prev) => prev ? { ...prev, activeProfile: name } : prev);
    });
    keybow.onDeviceStatus(setConnected);
    keybow.onKeyEvent((key, event) => {
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
    await keybow.saveConfig(updated);
  };

  const handleCreateProfile = async (name: string) => {
    const updated: ProfileConfig = {
      ...config!,
      profileOrder: [...config!.profileOrder, name],
      profiles: {
        ...config!.profiles,
        [name]: {
          name,
          defaultColor: '0000FF',
          keys: {},
        },
      },
    };
    setConfig(updated);
    await keybow.saveConfig(updated);
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
        <KeyGrid profile={activeProfile} selectedKey={selectedKey} pressedKey={pressedKey} onSelectKey={handleSelectKey} />
        {selectedKey ? (
          <WizardPanel
            gridKey={selectedKey}
            existingAction={activeProfile.keys[selectedKey]}
            defaultColor={activeProfile.defaultColor}
            profileNames={config.profileOrder}
            suggestions={suggestions}
            installedApps={installedApps}
            onSave={(key: GridKey, action: KeyAction) => {
              const updated = { ...config };
              updated.profiles[config.activeProfile] = {
                ...activeProfile,
                keys: { ...activeProfile.keys, [key]: action },
              };
              handleSave(updated);
            }}
            onDirtyChange={setWizardDirty}
            onCreateProfile={handleCreateProfile}
            onRemove={(key: GridKey) => {
              const updated = { ...config };
              const newKeys = { ...activeProfile.keys };
              delete newKeys[key];
              updated.profiles[config.activeProfile] = { ...activeProfile, keys: newKeys };
              handleSave(updated);
              setWizardDirty(false);
              setSelectedKey(null);
            }}
            onCancel={() => {
              setWizardDirty(false);
              setSelectedKey(null);
            }}
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
      {pendingKey !== undefined && wizardDirty && (
        <Modal
          title="Unsaved Changes"
          onClose={() => setPendingKey(undefined)}
          buttons={[
            {
              label: 'Keep Editing',
              onClick: () => setPendingKey(undefined),
            },
            {
              label: 'Discard Changes',
              variant: 'danger',
              onClick: () => {
                setWizardDirty(false);
                setSelectedKey(pendingKey);  // null closes panel, GridKey switches to it
                setPendingKey(undefined);
              },
            },
          ]}
        >
          {pendingKey
            ? <>You have unsaved changes on key <strong>{selectedKey}</strong>. Discard them and switch to key <strong>{pendingKey}</strong>?</>
            : <>You have unsaved changes on key <strong>{selectedKey}</strong>. Discard them and close the panel?</>
          }
        </Modal>
      )}
    </div>
  );
}
