#!/usr/bin/env node
/**
 * Translate message keys that still match English (after sync-messages-from-en).
 * Uses Google Translate public endpoint (no API key).
 *
 * Usage: node scripts/translate-missing-i18n.mjs [locale...]
 * Default: all non-en locales in messages/
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const messagesDir = path.join(root, 'messages');

const ALL_LOCALES = [
  'vi', 'ja', 'ko', 'es', 'fr', 'de', 'zh', 'zh-TW', 'pt', 'ar', 'it', 'id', 'ro',
];

const LOCALE_TO_GOOGLE = {
  vi: 'vi',
  ja: 'ja',
  ko: 'ko',
  es: 'es',
  fr: 'fr',
  de: 'de',
  zh: 'zh-CN',
  'zh-TW': 'zh-TW',
  pt: 'pt',
  ar: 'ar',
  it: 'it',
  id: 'id',
  ro: 'ro',
};

/** Keep brand / technical tokens unchanged. */
const SKIP_KEY_PATTERNS = [
  /^metadata\.keywords\./,
  /^tools\.[a-zA-Z]+\.filename$/,
  /\.serialNumber$/,
  /\.digestAlgorithm$/,
  /\.signatureAlgorithm$/,
];

const BATCH = 20;
const DELAY_MS = 400;

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
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

function setByPath(obj, pathStr, value) {
  const keys = pathStr.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!isPlainObject(cur[k])) cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}

function shouldSkipKey(key, value) {
  if (typeof value !== 'string' || !value.trim()) return true;
  if (SKIP_KEY_PATTERNS.some((re) => re.test(key))) return true;
  return false;
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'PDFCraft-i18n-sync/1.0' } }, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Translate HTTP ${res.statusCode}`));
            return;
          }
          resolve(body);
        });
      })
      .on('error', reject);
  });
}

async function googleTranslateOne(text, targetLang) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'en');
  url.searchParams.set('tl', targetLang);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);

  const body = await httpsGet(url.toString());
  const data = JSON.parse(body);
  if (!Array.isArray(data?.[0])) {
    throw new Error('Unexpected translate response');
  }
  return data[0].map((part) => part[0]).join('');
}

async function googleTranslateBatch(texts, targetLang) {
  const out = [];
  for (const text of texts) {
    out.push(await googleTranslateOne(text, targetLang));
    await sleep(120);
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function translateLocale(locale) {
  const googleLang = LOCALE_TO_GOOGLE[locale];
  if (!googleLang) {
    console.warn(`Skip ${locale}: no Google lang code`);
    return;
  }

  const en = JSON.parse(fs.readFileSync(path.join(messagesDir, 'en.json'), 'utf8'));
  const enFlat = flatten(en);
  const filePath = path.join(messagesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const localeFlat = flatten(data);

  const toTranslate = Object.keys(enFlat).filter((key) => {
    if (shouldSkipKey(key, enFlat[key])) return false;
    return localeFlat[key] === enFlat[key];
  });

  if (toTranslate.length === 0) {
    console.log(`${locale}: nothing to translate`);
    return;
  }

  console.log(`${locale}: translating ${toTranslate.length} keys → ${googleLang}`);

  let done = 0;
  for (let i = 0; i < toTranslate.length; i += BATCH) {
    const batchKeys = toTranslate.slice(i, i + BATCH);
    const batchTexts = batchKeys.map((k) => enFlat[k]);

    try {
      const translated = await googleTranslateBatch(batchTexts, googleLang);

      for (let j = 0; j < batchKeys.length; j++) {
        const out = translated[j] ?? batchTexts[j];
        setByPath(data, batchKeys[j], out);
      }
      done += batchKeys.length;
      process.stdout.write(`  ${done}/${toTranslate.length}\r`);
      await sleep(DELAY_MS);
    } catch (err) {
      console.error(`\n${locale} batch ${i} failed:`, err.message);
      await sleep(2000);
    }
  }

  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`\n${locale}: saved ${done} translations`);
}

const targets = process.argv.slice(2).length ? process.argv.slice(2) : ALL_LOCALES;

for (const locale of targets) {
  await translateLocale(locale);
}

console.log('Translation pass complete.');
