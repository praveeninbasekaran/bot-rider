import { mkdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const artifacts = path.join(root, 'artifacts');
const output = path.join(artifacts, `${pkg.name}-${pkg.version}.vsix`);
await mkdir(artifacts, { recursive: true });
await run(process.execPath, [path.join(root, 'node_modules', '@vscode', 'vsce', 'vsce'), 'package', '--out', output], root);
console.log(output);

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}
