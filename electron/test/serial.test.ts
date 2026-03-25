// electron/test/serial.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SerialManager } from '../src/main/serial';
import { EventEmitter } from 'events';

class MockPort extends EventEmitter {
  isOpen = true;
  write = vi.fn((_data: string, cb?: (err?: Error) => void) => { cb?.(); });
  close = vi.fn((cb?: (err?: Error) => void) => { cb?.(); });
}

describe('SerialManager', () => {
  let manager: SerialManager;
  let mockPort: MockPort;

  beforeEach(() => {
    mockPort = new MockPort();
    manager = new SerialManager();
    manager.setPort(mockPort as any);
  });

  it('emits keyEvent when receiving KEY message', () => {
    const handler = vi.fn();
    manager.on('keyEvent', handler);
    manager.handleLine('KEY:A1:PRESS');
    expect(handler).toHaveBeenCalledWith({ key: 'A1', event: 'PRESS' });
  });

  it('emits ready when receiving READY message', () => {
    const handler = vi.fn();
    manager.on('ready', handler);
    manager.handleLine('READY');
    expect(handler).toHaveBeenCalled();
  });

  it('ignores malformed messages', () => {
    const handler = vi.fn();
    manager.on('keyEvent', handler);
    manager.handleLine('GARBAGE');
    expect(handler).not.toHaveBeenCalled();
  });

  it('sends LED command to port', () => {
    manager.sendLed('A1', 'FF5500');
    expect(mockPort.write).toHaveBeenCalledWith('LED:A1:FF5500\n', expect.any(Function));
  });

  it('sends LED ALL command', () => {
    manager.sendLedAll('000000');
    expect(mockPort.write).toHaveBeenCalledWith('LED:ALL:000000\n', expect.any(Function));
  });

  it('sends PING command', () => {
    manager.sendPing();
    expect(mockPort.write).toHaveBeenCalledWith('PING\n', expect.any(Function));
  });
});
