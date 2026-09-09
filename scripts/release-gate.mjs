import { spawn } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
for (const script of ['compile', 'test', 'graphify:check', 'package:vsix', 'test:extension', 'test:vsix']) {
  console.log(`\nRelease gate: npm run ${script}`);
  await run(npm, ['run', script], root);
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited ${code}`)));
  });
}
