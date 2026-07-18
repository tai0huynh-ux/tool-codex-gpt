import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';

const executable = path.resolve(process.argv[2] ?? '');
if (!existsSync(executable)) throw new Error('PACKAGED_NATIVE_HOST_NOT_FOUND');

function encode(input) {
  const payload = Buffer.from(JSON.stringify(input), 'utf8');
  const frame = Buffer.allocUnsafe(payload.length + 4);
  frame.writeUInt32LE(payload.length, 0);
  payload.copy(frame, 4);
  return frame;
}

function frameReader(stream) {
  let buffered = Buffer.alloc(0);
  const values = [];
  const waiters = [];
  stream.on('data', (chunk) => {
    buffered = Buffer.concat([buffered, Buffer.from(chunk)]);
    while (buffered.length >= 4) {
      const length = buffered.readUInt32LE(0);
      if (buffered.length < length + 4) return;
      const value = JSON.parse(buffered.subarray(4, length + 4).toString('utf8'));
      buffered = buffered.subarray(length + 4);
      const waiter = waiters.shift();
      if (waiter) waiter.resolve(value);
      else values.push(value);
    }
  });
  return () =>
    new Promise((resolve, reject) => {
      if (values.length > 0) {
        resolve(values.shift());
        return;
      }
      const timer = setTimeout(() => reject(new Error('NATIVE_SMOKE_FRAME_TIMEOUT')), 10_000);
      waiters.push({
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
      });
    });
}

async function connectWithRetry(pipePath, child) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`NATIVE_HOST_EXITED_${child.exitCode}`);
    const socket = await new Promise((resolve) => {
      const candidate = net.createConnection(pipePath);
      candidate.once('connect', () => resolve(candidate));
      candidate.once('error', () => {
        candidate.destroy();
        resolve(undefined);
      });
    });
    if (socket) return socket;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('NATIVE_HOST_PIPE_TIMEOUT');
}

const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'context-bridge-host-smoke-'));
const applicationDataRoot = path.join(temporaryRoot, 'AppData', 'Roaming');
const dataDirectory = path.join(applicationDataRoot, 'Codex Context Bridge');
const capability = randomBytes(32).toString('hex');
mkdirSync(dataDirectory, { recursive: true });
writeFileSync(path.join(dataDirectory, 'native-transport-capability'), capability, {
  encoding: 'utf8',
  mode: 0o600,
});
const identity = createHash('sha256')
  .update(dataDirectory.toLowerCase())
  .digest('hex')
  .slice(0, 24);
const pipePath = `\\\\.\\pipe\\codex-context-bridge-${identity}`;
const environment = {
  ...process.env,
  APPDATA: applicationDataRoot,
  CODEX_CONTEXT_BRIDGE_NATIVE_DEBUG: '1',
  CODEX_CONTEXT_BRIDGE_NATIVE_DEBUG_FILE: path.join(temporaryRoot, 'native-debug.log'),
};
delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(executable, ['--native-messaging-host'], {
  env: environment,
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
});
let childError = '';
child.stderr.on('data', (chunk) => {
  childError = `${childError}${String(chunk)}`.slice(-2_000);
});
let socket;
try {
  const readExtensionFrame = frameReader(child.stdout);
  try {
    socket = await connectWithRetry(pipePath, child);
  } catch (error) {
    const visiblePipes = readdirSync('\\\\.\\pipe\\')
      .filter((name) => name.includes('codex-context-bridge'))
      .join(',');
    const debugPath = environment.CODEX_CONTEXT_BRIDGE_NATIVE_DEBUG_FILE;
    const debug = existsSync(debugPath) ? readFileSync(debugPath, 'utf8').trim() : '';
    throw new Error(
      `${error instanceof Error ? error.message : 'NATIVE_HOST_START_FAILED'} expected=${pipePath} visible=${visiblePipes || 'none'}${debug ? ` debug=${debug}` : ''}${childError ? ` stderr=${childError.trim()}` : ''}`,
    );
  }
  const readDesktopFrame = frameReader(socket);
  const requestId = randomUUID();
  const now = Date.now();
  socket.write(
    encode({
      protocolVersion: '1.0',
      requestId,
      nonce: randomUUID(),
      capability,
      sentAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 10_000).toISOString(),
      operation: { type: 'bridge.health' },
    }),
  );
  const desktopResponse = readDesktopFrame();
  const first = await Promise.race([
    readExtensionFrame().then((value) => ({ source: 'extension', value })),
    desktopResponse.then((value) => ({ source: 'desktop', value })),
  ]);
  if (first.source === 'desktop') {
    throw new Error(`NATIVE_HOST_EARLY_DESKTOP_RESPONSE ${JSON.stringify(first.value)}`);
  }
  const forwarded = first.value;
  if (forwarded.requestId !== requestId || JSON.stringify(forwarded).includes('capability')) {
    throw new Error('NATIVE_HOST_FORWARDING_INVALID');
  }
  child.stdin.write(
    encode({
      protocolVersion: '1.0',
      requestId,
      ok: true,
      result: { type: 'bridge.health.result', status: 'ready' },
    }),
  );
  const response = await desktopResponse;
  if (!response.ok || response.result?.status !== 'ready') {
    throw new Error('NATIVE_HOST_RESPONSE_INVALID');
  }
  process.stdout.write(`NATIVE_HOST_SMOKE_PASS requestId=${requestId}\n`);
} catch (error) {
  throw new Error(
    `${error instanceof Error ? error.message : 'NATIVE_HOST_SMOKE_FAILED'}${childError ? ` stderr=${childError.trim()}` : ''}`,
  );
} finally {
  socket?.destroy();
  child.stdin.end();
  child.kill();
  rmSync(temporaryRoot, { recursive: true, force: true });
}
