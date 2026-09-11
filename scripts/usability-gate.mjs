import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
let recorded = {};
try {
  recorded = JSON.parse(await readFile(path.join(root, 'docs', 'usability', 'first-task-result.json'), 'utf8'));
} catch {
  // The actionable failure below covers a missing or malformed attestation.
}
const manualInput = process.env.MANUAL_ATTESTATION === 'true';
const recordedPass =
  recorded.status === 'passed' &&
  recorded.testerType === 'non-developer' &&
  typeof recorded.testedAt === 'string' &&
  typeof recorded.notes === 'string' &&
  recorded.notes.trim().length > 0;
if (!manualInput && !recordedPass) {
  throw new Error(
    'Release blocked: run the first-task checklist with a non-developer and record a passing attestation.',
  );
}
console.log('First-task usability gate passed.');
