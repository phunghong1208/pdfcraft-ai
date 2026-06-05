import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const extPath = join(
  root,
  'public/pdfjs-annotation-viewer/web/pdfjs-annotation-extension/pdfjs-annotation-extension.js',
);
const outPath = join(root, 'public/pdfjs-annotation-viewer/web/stamp-presets.json');

const source = readFileSync(extPath, 'utf8');
const match = source.match(/DEFAULT_STAMP:(\[[\s\S]*?\]),/);
if (!match) {
  console.error('DEFAULT_STAMP not found in extension bundle');
  process.exit(1);
}

// eslint-disable-next-line no-eval
const presets = eval(match[1]);
if (!Array.isArray(presets) || presets.length === 0) {
  console.error('Invalid DEFAULT_STAMP array');
  process.exit(1);
}

writeFileSync(outPath, JSON.stringify(presets), 'utf8');
console.log(`Wrote ${presets.length} stamp presets → ${outPath}`);
