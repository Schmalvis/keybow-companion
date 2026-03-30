import React, { useState } from 'react';
import { Modal } from '../Modal';

const NEW_PROFILE_SENTINEL = '__new_profile__';

interface ConfigureProfileProps {
  value: string;
  profileNames: string[];
  onChange: (profileName: string) => void;
  onCreateProfile: (name: string) => Promise<void>;
}

export function ConfigureProfile({ value, profileNames, onChange, onCreateProfile }: ConfigureProfileProps) {
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === NEW_PROFILE_SENTINEL) {
      setNewName('');
      setShowModal(true);
    } else {
      onChange(e.target.value);
    }
  };

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreating(true);
    await onCreateProfile(trimmed);
    onChange(trimmed);
    setShowModal(false);
    setCreating(false);
  };

  return (
    <div className="target-section">
      <h4>Select Profile</h4>
      <select
        className="profile-select"
        value={value}
        onChange={handleSelectChange}
      >
        <option value="">— Choose a profile —</option>
        {profileNames.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
        <option value={NEW_PROFILE_SENTINEL}>+ New Profile…</option>
      </select>

      {showModal && (
        <Modal
          title="New Profile"
          onClose={() => setShowModal(false)}
          buttons={[
            {
              label: 'Cancel',
              onClick: () => setShowModal(false),
            },
            {
              label: creating ? 'Creating…' : 'Create',
              variant: 'primary',
              onClick: handleCreate,
            },
          ]}
        >
          <input
            className="modal-text-input"
            type="text"
            placeholder="Profile name"
            value={newName}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
          />
        </Modal>
      )}
    </div>
  );
}
