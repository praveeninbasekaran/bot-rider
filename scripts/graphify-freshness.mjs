import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const stampPath = path.join(root, 'graphify-out', '.source-fingerprint');
const inputs = ['src', 'media', 'docs', 'openspec', '.github', 'package.json', 'package-lock.json'];
const files = [];
for (const input of inputs) {
  const absolute = path.join(root, input);
  if (input.endsWith('.json')) {
    files.push(absolute);
  } else {
    await collect(absolute, files);
  }
}
files.sort();
const hash = createHash('sha256');
for (const file of files) {
  hash.update(path.relative(root, file).replace(/\\/g, '/'));
  hash.update('\0');
  hash.update(await readFile(file));
  hash.update('\0');
}
const fingerprint = `${hash.digest('hex')}\n`;
if (process.argv.includes('--write')) {
  await writeFile(stampPath, fingerprint, 'utf8');
  console.log(`Wrote ${path.relative(root, stampPath)}.`);
} else {
  let stored = '';
  try {
    stored = await readFile(stampPath, 'utf8');
  } catch {
    // Report the same actionable stale error below.
  }
  if (stored !== fingerprint) {
    throw new Error('Graphify artifacts are stale. Run Graphify update/injection, then npm run graphify:stamp.');
  }
  console.log('Graphify source fingerprint is current.');
}

async function collect(directory, output) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collect(absolute, output);
    } else if (/\.(?:ts|js|css|json|md|yml|yaml)$/.test(entry.name)) {
      output.push(absolute);
    }
  }
}
