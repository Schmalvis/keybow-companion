// electron/src/main/serial.ts
import { EventEmitter } from 'events';
import { SerialPort, ReadlineParser } from 'serialport';
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
    const path = portPath ?? await this.autoDetect();
    if (!path) {
      this.scheduleReconnect();
      return;
    }

    try {
      this.port = new SerialPort({ path, baudRate: 115200 });
      const parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));

      parser.on('data', (line: string) => {
        this.handleLine(line.trim());
      });

      this.port.on('close', () => {
        this.emit('disconnected');
        this.stopPing();
        this.scheduleReconnect();
      });

      this.port.on('error', () => {
        this.emit('disconnected');
        this.stopPing();
        this.scheduleReconnect();
      });

      this.emit('connected');
      this.startPing();
    } catch {
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
    const ports = await SerialPort.list();
    const match = ports.find(p => p.vendorId?.toUpperCase() === '2E8A');
    return match?.path ?? null;
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
