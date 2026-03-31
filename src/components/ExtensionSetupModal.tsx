import './ExtensionSetupModal.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ExtensionSetupModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Set up the browser extension</h3>
          <button aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <ol className="setup-steps">
          <li>Open Chrome and go to <code>chrome://extensions</code></li>
          <li>Enable <strong>Developer mode</strong> (toggle in top-right)</li>
          <li>Click <strong>Load unpacked</strong></li>
          <li>
            Navigate to{' '}
            <code>%LocalAppData%\com.keybow.companion\extension</code>{' '}
            and click <strong>Select Folder</strong>
          </li>
          <li>Done — the banner will disappear automatically once connected</li>
        </ol>
      </div>
    </div>
  );
}
