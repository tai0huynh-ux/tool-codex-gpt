import process from 'node:process';
import { nativeTransportPaths, startNativeHostServer } from './native-transport';

async function run(): Promise<void> {
  const applicationDataRoot = process.env.APPDATA;
  if (!applicationDataRoot) throw new Error('NATIVE_APP_DATA_UNAVAILABLE');
  const host = await startNativeHostServer({
    ...nativeTransportPaths(applicationDataRoot),
    extensionInput: process.stdin,
    extensionOutput: process.stdout,
    ...(process.env.CODEX_CONTEXT_BRIDGE_NATIVE_DEBUG === '1'
      ? { debug: (event: string) => process.stderr.write(`${event}\n`) }
      : {}),
  });
  if (process.env.CODEX_CONTEXT_BRIDGE_NATIVE_DEBUG === '1') {
    process.stderr.write('host.ready\n');
  }
  process.stdin.once('end', () => {
    void host.close().finally(() => process.exit(0));
  });
  process.stdin.resume();
}

void run().catch(() => {
  process.stderr.write('NATIVE_HOST_START_FAILED\n');
  process.exitCode = 1;
});
