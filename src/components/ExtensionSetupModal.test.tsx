import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExtensionSetupModal } from './ExtensionSetupModal';

describe('ExtensionSetupModal', () => {
  it('renders setup steps when open', () => {
    render(<ExtensionSetupModal open={true} onClose={() => {}} />);
    expect(screen.getByText(/chrome:\/\/extensions/i)).toBeInTheDocument();
    expect(screen.getByText(/developer mode/i)).toBeInTheDocument();
    expect(screen.getByText(/load unpacked/i)).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<ExtensionSetupModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<ExtensionSetupModal open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
