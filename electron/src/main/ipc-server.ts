import * as net from 'net';

const IPC_PORT = 23847;

export class IpcServer {
  private server: net.Server | null = null;

  start(onRequest: (message: any) => Promise<any>): void {
    this.server = net.createServer((socket) => {
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop()!;
        for (const line of lines) {
          if (!line.trim()) continue;
          let message: any;
          try {
            message = JSON.parse(line);
          } catch {
            continue;
          }
          onRequest(message).then((response) => {
            socket.write(JSON.stringify(response) + '\n');
          });
        }
      });
    });
    // Bind to localhost only — prevent external access
    this.server.listen(IPC_PORT, '127.0.0.1');
  }

  stop(): void {
    this.server?.close();
  }
}
