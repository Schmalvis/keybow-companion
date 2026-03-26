import React, { useState, useEffect } from 'react';
import type { GridKey, ActionType, KeyAction, AppTarget } from '../../../shared/types';
import { ChooseAction } from './ChooseAction';
import { ConfigureApp } from './ConfigureApp';
import { ConfigureUrl } from './ConfigureUrl';
import { ConfigureProfile } from './ConfigureProfile';
import { LabelColors } from './LabelColors';
import { ReviewSave } from './ReviewSave';

interface WizardPanelProps {
  gridKey: GridKey;
  existingAction?: KeyAction;
  defaultColor: string;
  profileNames: string[];
  onSave: (key: GridKey, action: KeyAction) => void;
  onRemove: (key: GridKey) => void;
  onCancel: () => void;
}

const STEP_COUNT = 4;

export function WizardPanel({
  gridKey,
  existingAction,
  defaultColor,
  profileNames,
  onSave,
  onRemove,
  onCancel,
}: WizardPanelProps) {
  const [step, setStep] = useState(existingAction ? 3 : 0);
  const [actionType, setActionType] = useState<ActionType | null>(existingAction?.action ?? null);
  const [appTarget, setAppTarget] = useState<AppTarget | null>(
    existingAction?.action === 'app' && typeof existingAction.target === 'object'
      ? (existingAction.target as AppTarget)
      : null,
  );
  const [urlTarget, setUrlTarget] = useState(
    existingAction?.action === 'url' && typeof existingAction.target === 'string'
      ? existingAction.target
      : '',
  );
  const [profileTarget, setProfileTarget] = useState(
    existingAction?.action === 'profile_set' && typeof existingAction.target === 'string'
      ? existingAction.target
      : '',
  );
  const [label, setLabel] = useState(existingAction?.label ?? '');
  const [activeColor, setActiveColor] = useState(existingAction?.activeColor ?? defaultColor);
  const [pressColor, setPressColor] = useState(existingAction?.pressColor ?? 'FFFFFF');

  // Reset wizard when key changes
  useEffect(() => {
    if (existingAction) {
      setStep(3);
      setActionType(existingAction.action);
      setLabel(existingAction.label);
      setActiveColor(existingAction.activeColor ?? defaultColor);
      setPressColor(existingAction.pressColor ?? 'FFFFFF');
      if (existingAction.action === 'app' && typeof existingAction.target === 'object') {
        setAppTarget(existingAction.target as AppTarget);
      } else {
        setAppTarget(null);
      }
      if (existingAction.action === 'url' && typeof existingAction.target === 'string') {
        setUrlTarget(existingAction.target);
      } else {
        setUrlTarget('');
      }
      if (existingAction.action === 'profile_set' && typeof existingAction.target === 'string') {
        setProfileTarget(existingAction.target);
      } else {
        setProfileTarget('');
      }
    } else {
      setStep(0);
      setActionType(null);
      setAppTarget(null);
      setUrlTarget('');
      setProfileTarget('');
      setLabel('');
      setActiveColor(defaultColor);
      setPressColor('FFFFFF');
    }
  }, [gridKey, existingAction, defaultColor]);

  const handleActionSelect = (type: ActionType) => {
    setActionType(type);
    if (type === 'profile_cycle') {
      setStep(2); // Skip target step
    } else {
      setStep(1);
    }
  };

  const suggestedLabel = (() => {
    if (actionType === 'app' && appTarget) return appTarget.process;
    if (actionType === 'url' && urlTarget) {
      try { return new URL(urlTarget).hostname.replace('www.', ''); } catch { return ''; }
    }
    if (actionType === 'profile_set' && profileTarget) return profileTarget;
    if (actionType === 'profile_cycle') return 'Next Profile';
    return '';
  })();

  const currentTarget = (() => {
    if (actionType === 'app') return appTarget ?? undefined;
    if (actionType === 'url') return urlTarget || undefined;
    if (actionType === 'profile_set') return profileTarget || undefined;
    return undefined;
  })();

  const canAdvance = (() => {
    if (step === 0) return actionType !== null;
    if (step === 1) {
      if (actionType === 'app') return appTarget !== null;
      if (actionType === 'url') return urlTarget.length > 0;
      if (actionType === 'profile_set') return profileTarget.length > 0;
      return true;
    }
    return true;
  })();

  const handleNext = () => {
    if (step < STEP_COUNT - 1) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) {
      if (step === 2 && actionType === 'profile_cycle') {
        setStep(0);
      } else {
        setStep(step - 1);
      }
    }
  };

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
  };

  const handleEditStep = (targetStep: number) => {
    setStep(targetStep);
  };

  const stepTitles = ['Choose Action', 'Configure Target', 'Label & Colors', 'Review & Save'];

  return (
    <div className="wizard-panel">
      <div className="wizard-header">
        <h3>Setup Key {gridKey}</h3>
        <span className="wizard-step-label">Step {step + 1} of {STEP_COUNT}</span>
      </div>

      <div className="wizard-body">
        {step === 0 && (
          <ChooseAction selected={actionType} onSelect={handleActionSelect} />
        )}
        {step === 1 && actionType === 'app' && (
          <ConfigureApp value={appTarget} onChange={setAppTarget} />
        )}
        {step === 1 && actionType === 'url' && (
          <ConfigureUrl value={urlTarget} onChange={setUrlTarget} />
        )}
        {step === 1 && actionType === 'profile_set' && (
          <ConfigureProfile value={profileTarget} profileNames={profileNames} onChange={setProfileTarget} />
        )}
        {step === 2 && (
          <LabelColors
            gridKey={gridKey}
            label={label}
            activeColor={activeColor}
            pressColor={pressColor}
            suggestedLabel={suggestedLabel}
            onLabelChange={setLabel}
            onActiveColorChange={setActiveColor}
            onPressColorChange={setPressColor}
          />
        )}
        {step === 3 && actionType && (
          <ReviewSave
            actionType={actionType}
            target={currentTarget}
            label={label || suggestedLabel}
            activeColor={activeColor}
            pressColor={pressColor}
            hasExisting={!!existingAction}
            onSave={handleSave}
            onRemove={() => onRemove(gridKey)}
            onEditStep={handleEditStep}
          />
        )}
      </div>

      <div className="wizard-nav">
        <button className="wizard-btn" onClick={step === 0 ? onCancel : handleBack}>
          {step === 0 ? 'Cancel' : '← Back'}
        </button>
        <div className="wizard-dots">
          {Array.from({ length: STEP_COUNT }).map((_, i) => (
            <button
              key={i}
              className={`wizard-dot ${i === step ? 'active' : ''} ${i < step ? 'completed' : ''}`}
              onClick={() => i < step && setStep(i)}
              title={stepTitles[i]}
            />
          ))}
        </div>
        {step < STEP_COUNT - 1 ? (
          <button className="wizard-btn primary" disabled={!canAdvance} onClick={handleNext}>
            Next →
          </button>
        ) : (
          <button className="wizard-btn primary" onClick={handleSave}>
            Save
          </button>
        )}
      </div>
    </div>
  );
}
