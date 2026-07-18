import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const outputDirectory = path.join(root, 'artifacts/internal-beta');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

const options = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, value] = argument.replace(/^--/, '').split('=', 2);
    return [key, value];
  }),
);
const result = (name, fallback) => options.get(name) ?? fallback;

const artifactDefinitions = [
  ['desktop/Codex-Context-Bridge-0.1.0-x64-setup.exe', 'Windows installer'],
  ['desktop/win-unpacked/CodexContextBridge.exe', 'Unpacked desktop executable'],
  [
    'desktop/win-unpacked/resources/CodexContextBridgeNativeHost.exe',
    'Native Messaging host launcher',
  ],
  ['extension/codex-context-bridge-extension-0.1.0.zip', 'Edge extension archive'],
  ['release-manifest.json', 'Windows release manifest'],
];

const artifacts = [];
for (const [relativePath, purpose] of artifactDefinitions) {
  const absolutePath = path.join(root, 'artifacts', relativePath);
  const content = await readFile(absolutePath);
  artifacts.push({
    name: path.basename(relativePath),
    path: `../${relativePath.replaceAll('\\', '/')}`,
    sha256: createHash('sha256').update(content).digest('hex'),
    size: (await stat(absolutePath)).size,
    purpose,
  });
}

const manifest = {
  releaseType: 'internal-beta',
  version: packageJson.version,
  commit,
  builtAt: new Date().toISOString(),
  signed: false,
  artifacts,
  documentation: 'docs/user/INSTALL_WINDOWS.md',
  verification: {
    verify: result('verify', 'pending'),
    internalBetaUat: result('uat', 'pending'),
    packageSmoke: result('package-smoke', 'pending'),
    nativeHostRelay: result('native-relay', 'pending'),
    liveEdgeSmoke: result('live-edge', 'not-rerun'),
    cleanInstall: result('clean-install', 'not-rerun'),
  },
  knownLimitations: [
    'Windows artifacts are unsigned.',
    'The extension is distributed as an internal unpacked/ZIP build, not through a public store.',
    'Composer insertion never submits automatically.',
  ],
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
await writeFile(
  path.join(outputDirectory, 'SHA256SUMS.txt'),
  `${artifacts.map((artifact) => `${artifact.sha256}  ${artifact.path}`).join('\n')}\n`,
);
await writeFile(
  path.join(outputDirectory, 'README.txt'),
  'Start with docs/user/INSTALL_WINDOWS.md. This staging directory is internal-only and is not a public GitHub Release.\n',
);

process.stdout.write(`${path.join(outputDirectory, 'manifest.json')}\n`);
