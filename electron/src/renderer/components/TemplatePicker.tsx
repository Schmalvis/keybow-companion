import React, { useState, useEffect } from 'react';
import type { ProfileConfig, Profile, KeyAction, GridKey } from '../../shared/types';

interface Template {
  name: string;
  icon: string;
  description: string;
  defaultColor: string;
  keys: Record<string, KeyAction>;
}

interface TemplatePickerProps {
  config: ProfileConfig;
  onApply: (config: ProfileConfig) => void;
  onClose: () => void;
}

export function TemplatePicker({ config, onApply, onClose }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    window.keybow.getTemplates().then((data) => setTemplates(data.templates ?? []));
  }, []);

  const handleApply = (template: Template) => {
    const profileName = template.name;
    let finalName = profileName;
    let counter = 1;
    while (config.profiles[finalName]) {
      finalName = `${profileName} ${counter}`;
      counter++;
    }

    const newProfile: Profile = {
      name: finalName,
      defaultColor: template.defaultColor,
      keys: template.keys as Partial<Record<GridKey, KeyAction>>,
    };

    const updated: ProfileConfig = {
      ...config,
      profiles: { ...config.profiles, [finalName]: newProfile },
      profileOrder: [...config.profileOrder, finalName],
      activeProfile: finalName,
    };

    onApply(updated);
    onClose();
  };

  return (
    <div className="template-overlay" onClick={onClose}>
      <div className="template-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Quick Start Templates</h2>
        <p className="subtitle">Choose a template to create a new pre-configured profile</p>
        <div className="template-grid">
          {templates.map((t) => (
            <div key={t.name} className="template-card" onClick={() => handleApply(t)}>
              <div className="template-card-icon">{t.icon}</div>
              <div className="template-card-name">{t.name}</div>
              <div className="template-card-desc">{t.description}</div>
            </div>
          ))}
        </div>
        <div className="template-close">
          <button className="wizard-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
