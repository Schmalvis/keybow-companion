# Wizard UX Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unsaved-changes confirmation and inline "New Profile" creation to the key setup wizard.

**Architecture:** A shared `Modal` component handles both features. `WizardPanel` tracks a `isDirty` flag and exposes it to `app.tsx`, which guards key switches. `ConfigureProfile` adds a `NEW_PROFILE` sentinel option that triggers a modal; profile creation goes through the existing `save_config` Tauri command.

**Tech Stack:** React 19, TypeScript, Tauri 2 (`invoke` via `api.ts`)

---

### Task 1: Modal component

**Files:**
- Create: `src/components/Modal.tsx`
- Create: `src/components/Modal.css`

- [ ] **Step 1: Create `src/components/Modal.tsx`**

```tsx
import React from 'react';
import './Modal.css';

interface ModalButton {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'danger' | 'default';
}

interface ModalProps {
  title: string;
  onClose: () => void;
  buttons: ModalButton[];
  children: React.ReactNode;
}

export function Modal({ title, onClose, buttons, children }: ModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">
          {buttons.map((btn) => (
            <button
              key={btn.label}
              className={`wizard-btn ${btn.variant === 'primary' ? 'primary' : btn.variant === 'danger' ? 'danger' : ''}`}
              onClick={btn.onClick}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/Modal.css`**

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: var(--bg-panel, #1e1e2e);
  border: 1px solid var(--border, #333);
  border-radius: 8px;
  padding: 24px;
  min-width: 320px;
  max-width: 480px;
}

.modal-title {
  margin: 0 0 12px;
  font-size: 1rem;
  font-weight: 600;
}

.modal-body {
  margin-bottom: 20px;
  font-size: 0.9rem;
  color: var(--text-muted, #aaa);
}

.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.wizard-btn.danger {
  background: #c0392b;
  color: white;
  border-color: #c0392b;
}
```

- [ ] **Step 3: Manually verify Modal renders**

Run `cargo tauri dev`, open the app, and confirm no console errors. We'll render it for real in Task 2.

- [ ] **Step 4: Commit**

```bash
git add src/components/Modal.tsx src/components/Modal.css
git commit -m "feat: add shared Modal component"
```

---

### Task 2: Unsaved-changes guard

**Files:**
- Modify: `src/components/wizard/WizardPanel.tsx`
- Modify: `src/app.tsx`

This tracks whether the wizard has unsaved changes and shows a Modal before allowing key switches.

- [ ] **Step 1: Add `onDirtyChange` prop and `isDirty` tracking to `WizardPanel`**

In `src/components/wizard/WizardPanel.tsx`, update the interface and component signature:

```tsx
// Add to WizardPanelProps interface (after onCancel):
onDirtyChange: (dirty: boolean) => void;
```

Add `onDirtyChange` to the destructured props:
```tsx
export function WizardPanel({
  gridKey,
  existingAction,
  defaultColor,
  profileNames,
  suggestions,
  installedApps,
  onSave,
  onRemove,
  onCancel,
  onDirtyChange,
}: WizardPanelProps) {
```

Add an `isDirty` state and a helper after the existing `useEffect`:
```tsx
const [isDirty, setIsDirty] = useState(false);

const markDirty = () => {
  if (!isDirty) {
    setIsDirty(true);
    onDirtyChange(true);
  }
};
```

Reset dirty state when the key changes — add to the end of the existing `useEffect` callback (inside both the `if` and `else` branches, after all the setters):
```tsx
setIsDirty(false);
onDirtyChange(false);
```

- [ ] **Step 2: Wire `markDirty` to all field setters**

Replace the four `onChange` handlers passed to step components:

```tsx
// Step 1 action selection — in handleActionSelect:
const handleActionSelect = (type: ActionType) => {
  setActionType(type);
  markDirty();
  if (type === 'profile_cycle') {
    setStep(2);
  } else {
    setStep(1);
  }
};
```

For step 2 configure components, wrap each `onChange`:
```tsx
// app target
onChange={(val) => { setAppTarget(val); markDirty(); }}

// url target
onChange={(val) => { setUrlTarget(val); markDirty(); }}

// profile target
onChange={(val) => { setProfileTarget(val); markDirty(); }}
```

For step 3 label/colors, wrap each change handler:
```tsx
onLabelChange={(val) => { setLabel(val); markDirty(); }}
onActiveColorChange={(val) => { setActiveColor(val); markDirty(); }}
onPressColorChange={(val) => { setActiveColor(val); markDirty(); }}
```

Wait — `onPressColorChange` should call `setPressColor`:
```tsx
onPressColorChange={(val) => { setPressColor(val); markDirty(); }}
```

Also clear dirty in `handleSave` after calling `onSave`:
```tsx
const handleSave = () => {
  if (!actionType) return;
  const action: KeyAction = {
    action: actionType,
    label: label || suggestedLabel,
    activeColor,
    pressColor,
  };
  if (actionType === 'app' && appTarget) action.target = appTarget;
  if (actionType === 'url') action.target = urlTarget;
  if (actionType === 'profile_set') action.target = profileTarget;
  onSave(gridKey, action);
  setIsDirty(false);
  onDirtyChange(false);
};
```

- [ ] **Step 3: Add unsaved-changes state and modal to `app.tsx`**

Add imports at the top of `src/app.tsx`:
```tsx
import { Modal } from './components/Modal';
```

Add state:
```tsx
const [wizardDirty, setWizardDirty] = useState(false);
const [pendingKey, setPendingKey] = useState<GridKey | null>(null);
```

Replace the direct `setSelectedKey` passed to `KeyGrid` with a guard function:
```tsx
const handleSelectKey = (key: GridKey | null) => {
  if (wizardDirty && key !== selectedKey) {
    setPendingKey(key);
  } else {
    setSelectedKey(key);
  }
};
```

Replace `onSelectKey={setSelectedKey}` with `onSelectKey={handleSelectKey}` in the JSX.

Also update the Escape handler:
```tsx
if (e.key === 'Escape') {
  if (wizardDirty) {
    setPendingKey(null);
    // show discard modal by targeting null
    setPendingKey(null);
  }
  setSelectedKey(null);
}
```

Actually keep Escape simple — it cancels directly (user is explicitly dismissing):
```tsx
if (e.key === 'Escape') {
  setWizardDirty(false);
  setSelectedKey(null);
}
```

- [ ] **Step 4: Add `onDirtyChange` and modal JSX to `app.tsx`**

Add `onDirtyChange={setWizardDirty}` to `WizardPanel` in the JSX:
```tsx
<WizardPanel
  gridKey={selectedKey}
  existingAction={activeProfile.keys[selectedKey]}
  defaultColor={activeProfile.defaultColor}
  profileNames={config.profileOrder}
  suggestions={suggestions}
  installedApps={installedApps}
  onDirtyChange={setWizardDirty}
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
    setWizardDirty(false);
    setSelectedKey(null);
  }}
  onCancel={() => {
    setWizardDirty(false);
    setSelectedKey(null);
  }}
/>
```

Add the modal just before the closing `</div>` of the app:
```tsx
{pendingKey !== undefined && pendingKey !== selectedKey && wizardDirty && (
  <Modal
    title="Unsaved Changes"
    onClose={() => setPendingKey(null)}
    buttons={[
      {
        label: 'Cancel',
        onClick: () => setPendingKey(null),
      },
      {
        label: 'Discard',
        variant: 'danger',
        onClick: () => {
          setWizardDirty(false);
          setSelectedKey(pendingKey);
          setPendingKey(null);
        },
      },
      {
        label: 'Save',
        variant: 'primary',
        onClick: () => {
          // Trigger save then switch — save is handled inside WizardPanel
          // We signal it via a ref callback; simplest is to just discard here
          // since Save in the wizard already clears dirty.
          // This button is a no-op: user should use Save in wizard.
          setPendingKey(null);
        },
      },
    ]}
  >
    You have unsaved changes on key {selectedKey}. What would you like to do?
  </Modal>
)}
```

Wait — the Save button above is tricky because saving is internal to WizardPanel. Simplify to two buttons: **Discard** and **Keep Editing**:

```tsx
{pendingKey !== null && wizardDirty && (
  <Modal
    title="Unsaved Changes"
    onClose={() => setPendingKey(null)}
    buttons={[
      {
        label: 'Keep Editing',
        onClick: () => setPendingKey(null),
      },
      {
        label: 'Discard Changes',
        variant: 'danger',
        onClick: () => {
          setWizardDirty(false);
          setSelectedKey(pendingKey);
          setPendingKey(null);
        },
      },
    ]}
  >
    You have unsaved changes on key <strong>{selectedKey}</strong>. Discard them and switch to key <strong>{pendingKey}</strong>?
  </Modal>
)}
```

- [ ] **Step 5: Run dev and manually test**

```bash
cargo tauri dev
```

1. Click a key, change any field
2. Click a different key — modal should appear
3. Click "Keep Editing" — stay on current key
4. Click "Discard Changes" — switch to new key, wizard resets
5. Click a key, change a field, click Save — no modal on next key click

- [ ] **Step 6: Commit**

```bash
git add src/components/wizard/WizardPanel.tsx src/app.tsx
git commit -m "feat: unsaved-changes modal before switching keys in wizard"
```

---

### Task 3: "+ New Profile" in wizard

**Files:**
- Modify: `src/components/wizard/ConfigureProfile.tsx`
- Modify: `src/app.tsx`

New profile creation mutates the full `ProfileConfig` and calls `save_config` via `keybow.saveConfig`. The wizard's `profileNames` prop comes from `config.profileOrder`, so once `config` updates in `app.tsx`, the dropdown will reflect the new profile automatically.

- [ ] **Step 1: Add `onCreateProfile` prop to `ConfigureProfile`**

Replace the entire content of `src/components/wizard/ConfigureProfile.tsx`:

```tsx
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
```

- [ ] **Step 2: Add `.modal-text-input` style to `Modal.css`**

Append to `src/components/Modal.css`:

```css
.modal-text-input {
  width: 100%;
  padding: 8px 10px;
  border-radius: 4px;
  border: 1px solid var(--border, #333);
  background: var(--bg-input, #2a2a3e);
  color: inherit;
  font-size: 0.9rem;
  box-sizing: border-box;
}

.modal-text-input:focus {
  outline: none;
  border-color: var(--accent, #7c5cbf);
}
```

- [ ] **Step 3: Add `handleCreateProfile` to `app.tsx` and wire it through**

In `src/app.tsx`, add the handler (after `handleSave`):

```tsx
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
```

- [ ] **Step 4: Thread `onCreateProfile` down to `ConfigureProfile` via `WizardPanel`**

In `WizardPanel.tsx`, add to `WizardPanelProps`:
```tsx
onCreateProfile: (name: string) => Promise<void>;
```

Add to destructured props:
```tsx
onCreateProfile,
```

Pass it to `ConfigureProfile` in the JSX:
```tsx
{step === 1 && actionType === 'profile_set' && (
  <ConfigureProfile
    value={profileTarget}
    profileNames={profileNames}
    onChange={(val) => { setProfileTarget(val); markDirty(); }}
    onCreateProfile={onCreateProfile}
  />
)}
```

In `app.tsx`, add `onCreateProfile={handleCreateProfile}` to the `WizardPanel` JSX:
```tsx
<WizardPanel
  ...
  onCreateProfile={handleCreateProfile}
  ...
/>
```

- [ ] **Step 5: Run dev and manually test**

```bash
cargo tauri dev
```

1. Click a key → choose "Switch Profile" action
2. In the dropdown, select "+ New Profile…"
3. Modal appears — type a name, press Enter or click Create
4. Dropdown now shows the new profile selected
5. Complete the wizard and Save
6. Open ProfileBar — new profile should appear

- [ ] **Step 6: Commit**

```bash
git add src/components/wizard/ConfigureProfile.tsx src/components/Modal.css src/components/wizard/WizardPanel.tsx src/app.tsx
git commit -m "feat: add New Profile creation from wizard dropdown"
```
