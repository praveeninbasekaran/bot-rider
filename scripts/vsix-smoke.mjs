import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const vsix = process.argv[2] ?? path.join(root, 'artifacts', `${pkg.name}-${pkg.version}.vsix`);
const executable = await downloadAndUnzipVSCode('1.99.3');
const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(executable);
await run(cli, [...cliArgs, '--install-extension', vsix, '--force'], root);
console.log(`Installed ${path.basename(vsix)} into the isolated VS Code test profile.`);

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}
