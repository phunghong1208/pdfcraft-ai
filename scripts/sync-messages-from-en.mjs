#!/usr/bin/env node
/**
 * Ensure every locale has the same key structure as messages/en.json.
 * Preserves existing locale translations; fills missing keys from English.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const messagesDir = path.join(root, 'messages');

const LOCALES = [
  'vi', 'ja', 'ko', 'es', 'fr', 'de', 'zh', 'zh-TW', 'pt', 'ar', 'it', 'id', 'ro',
];

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

/** English base, overridden by locale where defined. */
function mergeFromEn(enNode, localeNode) {
  if (!isPlainObject(enNode)) {
    return localeNode !== undefined ? localeNode : enNode;
  }

  const localeObj = isPlainObject(localeNode) ? localeNode : {};
  const result = {};

  for (const key of Object.keys(enNode)) {
    result[key] = mergeFromEn(enNode[key], localeObj[key]);
  }

  for (const key of Object.keys(localeObj)) {
    if (!(key in result)) {
      result[key] = localeObj[key];
    }
  }

  return result;
}

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v)) Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

const en = JSON.parse(fs.readFileSync(path.join(messagesDir, 'en.json'), 'utf8'));
const enFlat = flatten(en);

for (const locale of LOCALES) {
  const filePath = path.join(messagesDir, `${locale}.json`);
  const localeData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const beforeFlat = flatten(localeData);
  const merged = mergeFromEn(en, localeData);
  const afterFlat = flatten(merged);

  const filled = Object.keys(enFlat).filter((k) => beforeFlat[k] === undefined).length;
  const stillMissing = Object.keys(enFlat).filter((k) => afterFlat[k] === undefined).length;

  fs.writeFileSync(filePath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  console.log(`${locale}.json: filled ${filled} keys, still missing ${stillMissing}`);
}

console.log('Done. Keys without locale translation now use English text.');
