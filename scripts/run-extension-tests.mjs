import { runTests } from '@vscode/test-electron';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
await runTests({
  version: '1.99.3',
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, 'test', 'integration', 'suite', 'index.js'),
  launchArgs: [path.join(root, 'test', 'integration', 'fixture'), '--disable-extensions'],
});
