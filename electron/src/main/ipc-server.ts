import * as net from 'net';

const IPC_PORT = 23847;

export class IpcServer {
  private server: net.Server | null = null;
  private clients: Set<net.Socket> = new Set();

  start(onRequest: (message: any) => Promise<any>): void {
    this.server = net.createServer((socket) => {
      this.clients.add(socket);

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
            if (socket.writable) {
              socket.write(JSON.stringify(response) + '\n');
            }
          });
        }
      });

      socket.on('close', () => this.clients.delete(socket));
      socket.on('error', () => this.clients.delete(socket));
    });
    // Bind to localhost only — prevent external access
    this.server.listen(IPC_PORT, '127.0.0.1');
  }

  broadcast(message: any): void {
    const data = JSON.stringify(message) + '\n';
    for (const client of this.clients) {
      if (client.writable) {
        client.write(data);
      }
    }
  }

  stop(): void {
    for (const client of this.clients) {
      client.destroy();
    }
    this.clients.clear();
    this.server?.close();
  }
}
