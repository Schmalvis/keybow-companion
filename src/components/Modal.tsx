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
          {buttons.map((btn, i) => (
            <button
              key={`${btn.label}-${i}`}
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
