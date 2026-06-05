import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildStampGuardBootstrapScript } from '../src/lib/pdf/stamp-url-guard.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public/pdfjs-annotation-viewer/web/pdfcraft-stamp-guard.js');
const banner = '/* Auto-generated — run: npx tsx scripts/generate-stamp-guard.mjs */\n';
writeFileSync(out, banner + buildStampGuardBootstrapScript() + '\n', 'utf8');
console.log('Wrote', out);
