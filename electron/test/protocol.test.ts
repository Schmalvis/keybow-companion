// electron/test/protocol.test.ts
import { describe, it, expect } from 'vitest';
import { parseKeyEvent, buildLedCommand, buildLedAllCommand, isValidGridKey } from '../src/shared/protocol';

describe('protocol parser', () => {
  describe('parseKeyEvent', () => {
    it('parses a PRESS event', () => {
      expect(parseKeyEvent('KEY:A1:PRESS')).toEqual({ key: 'A1', event: 'PRESS' });
    });
    it('parses a RELEASE event', () => {
      expect(parseKeyEvent('KEY:D4:RELEASE')).toEqual({ key: 'D4', event: 'RELEASE' });
    });
    it('parses a HOLD event', () => {
      expect(parseKeyEvent('KEY:B3:HOLD')).toEqual({ key: 'B3', event: 'HOLD' });
    });
    it('returns null for READY message', () => {
      expect(parseKeyEvent('READY')).toBeNull();
    });
    it('returns null for PONG message', () => {
      expect(parseKeyEvent('PONG')).toBeNull();
    });
    it('returns null for malformed messages', () => {
      expect(parseKeyEvent('GARBAGE')).toBeNull();
      expect(parseKeyEvent('KEY:Z9:PRESS')).toBeNull();
      expect(parseKeyEvent('KEY:A1:JUMP')).toBeNull();
      expect(parseKeyEvent('')).toBeNull();
    });
  });

  describe('buildLedCommand', () => {
    it('builds a single key LED command', () => {
      expect(buildLedCommand('A1', 'FF5500')).toBe('LED:A1:FF5500\n');
    });
    it('builds an OFF command', () => {
      expect(buildLedCommand('A1', 'OFF')).toBe('LED:A1:OFF\n');
    });
  });

  describe('buildLedAllCommand', () => {
    it('builds an all-keys command', () => {
      expect(buildLedAllCommand('000000')).toBe('LED:ALL:000000\n');
    });
    it('builds an all-off command', () => {
      expect(buildLedAllCommand('OFF')).toBe('LED:ALL:OFF\n');
    });
  });

  describe('isValidGridKey', () => {
    it('accepts valid grid keys', () => {
      expect(isValidGridKey('A1')).toBe(true);
      expect(isValidGridKey('D4')).toBe(true);
    });
    it('rejects invalid grid keys', () => {
      expect(isValidGridKey('Z9')).toBe(false);
      expect(isValidGridKey('A5')).toBe(false);
      expect(isValidGridKey('')).toBe(false);
    });
  });
});
