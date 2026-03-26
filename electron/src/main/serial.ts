// electron/src/main/serial.ts
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { SerialPort, ReadlineParser } from 'serialport';

const logFile = path.join(process.env.USERPROFILE || '.', 'keybow-serial.log');
function log(...args: any[]) {
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  const line = `${new Date().toISOString()} ${msg}\n`;
  fs.appendFileSync(logFile, line);
  console.log(msg);
}
import { parseKeyEvent, buildLedCommand, buildLedAllCommand } from '../shared/protocol';
import type { GridKey } from '../shared/types';

export class SerialManager extends EventEmitter {
  private port: SerialPort | null = null;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private awaitingPong = false;

  setPort(port: any): void {
    this.port = port;
  }

  async connect(portPath?: string): Promise<void> {
    log('[Serial] connect() called, portPath:', portPath);
    const path = portPath ?? await this.autoDetect();
    log('[Serial] autoDetect returned:', path);
    if (!path) {
      log('[Serial] No port found, scheduling reconnect');
      this.scheduleReconnect();
      return;
    }

    try {
      log('[Serial] Opening port:', path);
      this.port = new SerialPort({ path, baudRate: 115200 });
      const parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));

      parser.on('data', (line: string) => {
        log('[Serial] RX:', line.trim());
        this.handleLine(line.trim());
      });

      this.port.on('close', () => {
        log('[Serial] Port closed');
        this.emit('disconnected');
        this.stopPing();
        this.scheduleReconnect();
      });

      this.port.on('error', (err) => {
        log('[Serial] Port error:', err);
        this.emit('disconnected');
        this.stopPing();
        this.scheduleReconnect();
      });

      this.port.on('open', () => {
        log('[Serial] Port opened successfully');
      });

      this.emit('connected');
      this.startPing();
    } catch (err) {
      log('[Serial] connect() caught error:', err);
      this.scheduleReconnect();
    }
  }

  handleLine(line: string): void {
    if (line === 'READY') {
      this.emit('ready');
      return;
    }
    if (line === 'PONG') {
      this.awaitingPong = false;
      this.emit('pong');
      return;
    }
    const event = parseKeyEvent(line);
    if (event) {
      this.emit('keyEvent', event);
    }
  }

  sendLed(key: GridKey, colorOrOff: string): void {
    this.write(buildLedCommand(key, colorOrOff));
  }

  sendLedAll(colorOrOff: string): void {
    this.write(buildLedAllCommand(colorOrOff));
  }

  sendPing(): void {
    this.write('PING\n');
  }

  private write(data: string): void {
    if (this.port?.isOpen) {
      this.port.write(data, (err) => {
        if (err) console.error('Serial write error:', err.message);
      });
    }
  }

  private async autoDetect(): Promise<string | null> {
    try {
      const ports = await SerialPort.list();
      log('[Serial] All ports:', ports.map(p => `${p.path} VID:${p.vendorId} PID:${p.productId}`));
      const matches = ports.filter(p => {
        const vid = p.vendorId?.toUpperCase();
        return vid === '16D0' || vid === '2E8A';
      });
      log('[Serial] Matches:', matches.map(p => p.path));
      // Pick the last (highest COM number) = data port
      return matches.length > 0 ? matches[matches.length - 1].path : null;
    } catch (err) {
      log('[Serial] autoDetect error:', err);
      return null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setInterval(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.awaitingPong) {
        this.port?.close();
        return;
      }
      this.awaitingPong = true;
      this.sendPing();
    }, 5000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.awaitingPong = false;
  }

  disconnect(): void {
    this.stopPing();
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.port?.close();
  }
}
