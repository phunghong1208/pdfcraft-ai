#!/usr/bin/env node
/**
 * Sync LibreOffice WASM assets from @matbee/libreoffice-converter into public/.
 *
 * public/libreoffice-wasm/ can drift from the installed npm package after upgrades,
 * causing "WASM initialization timeout" / ConversionError at runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgRoot = path.join(root, 'node_modules', '@matbee', 'libreoffice-converter');
const wasmSrc = path.join(pkgRoot, 'wasm');
const distSrc = path.join(pkgRoot, 'dist');
const dest = path.join(root, 'public', 'libreoffice-wasm');

const FROM_WASM = ['soffice.js', 'soffice.worker.js', 'soffice.wasm', 'soffice.data'];
const FROM_DIST = ['browser.worker.global.js'];

function formatMb(filePath) {
  const bytes = fs.statSync(filePath).size;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function fileHash(filePath) {
  const hash = crypto.createHash('md5');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function needsCopy(src, out) {
  if (!fs.existsSync(out)) return true;
  if (fs.statSync(src).size !== fs.statSync(out).size) return true;
  return fileHash(src) !== fileHash(out);
}

function main() {
  if (!fs.existsSync(pkgRoot)) {
    console.log('[sync-libreoffice] @matbee/libreoffice-converter not installed, skipping.');
    return;
  }

  fs.mkdirSync(dest, { recursive: true });

  let synced = 0;

  for (const file of FROM_WASM) {
    const src = path.join(wasmSrc, file);
    const out = path.join(dest, file);
    if (!fs.existsSync(src)) {
      console.warn(`[sync-libreoffice] Missing ${src}`);
      continue;
    }
    if (needsCopy(src, out)) {
      fs.copyFileSync(src, out);
      console.log(`[sync-libreoffice] ${file} → public/libreoffice-wasm/ (${formatMb(out)})`);
      synced++;
    }
  }

  for (const file of FROM_DIST) {
    const src = path.join(distSrc, file);
    const out = path.join(dest, file);
    if (!fs.existsSync(src)) {
      console.warn(`[sync-libreoffice] Missing ${src}`);
      continue;
    }
    if (needsCopy(src, out)) {
      fs.copyFileSync(src, out);
      console.log(`[sync-libreoffice] ${file} → public/libreoffice-wasm/ (${formatMb(out)})`);
      synced++;
    }
  }

  if (synced === 0) {
    console.log('[sync-libreoffice] Assets already up to date.');
  } else {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));
    console.log(`[sync-libreoffice] Synced ${synced} file(s) from @matbee/libreoffice-converter@${pkg.version}.`);
  }
}

main();
