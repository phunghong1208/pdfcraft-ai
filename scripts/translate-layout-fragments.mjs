#!/usr/bin/env node
/**
 * Translate layout fragment keys that still match English.
 * Run before sync-layout-i18n.mjs to keep fragments in sync.
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fragmentsDir = path.join(root, 'messages', 'fragments');

const LOCALES = ['ja', 'ko', 'es', 'fr', 'de', 'zh', 'zh-TW', 'pt', 'ar', 'it', 'id', 'vi', 'ro'];

const LOCALE_TO_GOOGLE = {
  ja: 'ja', ko: 'ko', es: 'es', fr: 'fr', de: 'de', zh: 'zh-CN', 'zh-TW': 'zh-TW',
  pt: 'pt', ar: 'ar', it: 'it', id: 'id', vi: 'vi', ro: 'ro',
};

const KEEP_ENGLISH = new Set([
  'homePage.heroTitleAccent',
  'homePage.aiBadge',
  'footer.brandLine1',
  'footer.brandLine2',
  'footer.storeGooglePlay',
  'footer.storeAppStore',
  'footer.cookies',
  'aiMenu.ocrPdf',
]);

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
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

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'PDFCraft-i18n-sync/1.0' } }, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}`));
          else resolve(body);
        });
      })
      .on('error', reject);
  });
}

async function translateOne(text, targetLang) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'en');
  url.searchParams.set('tl', targetLang);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);
  const body = await httpsGet(url.toString());
  const data = JSON.parse(body);
  return data[0].map((p) => p[0]).join('');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const enLayout = JSON.parse(
  fs.readFileSync(path.join(fragmentsDir, 'layout.en.json'), 'utf8'),
);
const enFlat = flatten(enLayout);

for (const locale of LOCALES) {
  const googleLang = LOCALE_TO_GOOGLE[locale];
  const fragmentPath = path.join(fragmentsDir, `layout.${locale}.json`);
  const data = fs.existsSync(fragmentPath)
    ? JSON.parse(fs.readFileSync(fragmentPath, 'utf8'))
    : {};
  const flat = flatten(data);

  const keys = Object.keys(enFlat).filter((key) => {
    if (KEEP_ENGLISH.has(key)) return false;
    if (typeof enFlat[key] !== 'string' || !enFlat[key].trim()) return false;
    return flat[key] === undefined || flat[key] === enFlat[key];
  });

  if (keys.length === 0) {
    console.log(`${locale}: layout fragment up to date`);
    continue;
  }

  console.log(`${locale}: translating ${keys.length} layout keys`);
  let done = 0;
  for (const key of keys) {
    try {
      const translated = await translateOne(enFlat[key], googleLang);
      setByPath(data, key, translated);
      done++;
      if (done % 10 === 0) process.stdout.write(`  ${done}/${keys.length}\r`);
      await sleep(150);
    } catch (err) {
      console.warn(`\n${locale} ${key}: ${err.message}`);
      await sleep(1000);
    }
  }

  fs.writeFileSync(fragmentPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`\n${locale}: saved ${done} layout translations`);
}

console.log('Layout fragment translation complete.');
