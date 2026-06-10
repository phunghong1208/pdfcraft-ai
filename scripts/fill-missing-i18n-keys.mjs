#!/usr/bin/env node
/** Copy missing keys from en.json into locale message files (English placeholder). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const messagesDir = path.join(root, 'messages');
const locales = ['ja', 'ko', 'es', 'fr', 'de', 'zh', 'zh-TW', 'pt', 'ar', 'it', 'id', 'vi', 'ro'];

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function fillMissing(base, target) {
  for (const [key, value] of Object.entries(base)) {
    if (isPlainObject(value)) {
      if (!isPlainObject(target[key])) target[key] = {};
      fillMissing(value, target[key]);
    } else if (!(key in target)) {
      target[key] = value;
    }
  }
}

const en = JSON.parse(fs.readFileSync(path.join(messagesDir, 'en.json'), 'utf8'));

for (const locale of locales) {
  const filePath = path.join(messagesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  fillMissing(en, data);
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`filled missing keys → ${locale}.json`);
}
