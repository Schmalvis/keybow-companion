const net = require('net');
const IPC_PORT = 23847;

function readMessage(buffer) {
  if (buffer.length < 4) return null;
  const length = buffer.readUInt32LE(0);
  if (buffer.length < 4 + length) return null;
  const json = buffer.slice(4, 4 + length).toString('utf-8');
  try {
    return { message: JSON.parse(json), bytesConsumed: 4 + length };
  } catch {
    return { message: null, bytesConsumed: 4 + length };
  }
}

function writeMessage(message) {
  const json = JSON.stringify(message);
  const buffer = Buffer.alloc(4 + json.length);
  buffer.writeUInt32LE(json.length, 0);
  buffer.write(json, 4);
  process.stdout.write(buffer);
}

const client = net.createConnection({ port: IPC_PORT }, () => {
  let inputBuffer = Buffer.alloc(0);
  process.stdin.on('data', (chunk) => {
    inputBuffer = Buffer.concat([inputBuffer, chunk]);
    let parsed;
    while ((parsed = readMessage(inputBuffer)) !== null) {
      inputBuffer = inputBuffer.slice(parsed.bytesConsumed);
      if (parsed.message) {
        client.write(JSON.stringify(parsed.message) + '\n');
      }
    }
  });
});

let tcpBuffer = '';
client.on('data', (chunk) => {
  tcpBuffer += chunk.toString();
  const lines = tcpBuffer.split('\n');
  tcpBuffer = lines.pop();
  for (const line of lines) {
    if (line.trim()) writeMessage(JSON.parse(line));
  }
});

client.on('error', () => process.exit(1));
process.stdin.on('end', () => process.exit(0));
