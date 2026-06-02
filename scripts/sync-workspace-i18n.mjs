#!/usr/bin/env node
/**
 * Merge messages/fragments/workspace.{locale}.json into messages/{locale}.json
 * English fragment is the source of truth; locale fragments override translations.
 * Locales without a dedicated fragment use English only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fragmentsDir = path.join(root, 'messages', 'fragments');
const messagesDir = path.join(root, 'messages');
const locales = [
  'en', 'ja', 'ko', 'es', 'fr', 'de', 'zh', 'zh-TW', 'pt', 'ar', 'it', 'id', 'vi', 'ro',
];

/** Locale overrides win; missing keys fall back to English. */
function deepMerge(base, override) {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const baseValue = base[key];
    const overrideValue = override[key];
    if (
      overrideValue &&
      typeof overrideValue === 'object' &&
      !Array.isArray(overrideValue) &&
      baseValue &&
      typeof baseValue === 'object' &&
      !Array.isArray(baseValue)
    ) {
      result[key] = deepMerge(baseValue, overrideValue);
    } else {
      result[key] = overrideValue;
    }
  }
  return result;
}

const enFragment = JSON.parse(
  fs.readFileSync(path.join(fragmentsDir, 'workspace.en.json'), 'utf8'),
);

for (const locale of locales) {
  const fragmentPath = path.join(fragmentsDir, `workspace.${locale}.json`);
  const localeFragment =
    locale === 'en'
      ? enFragment
      : fs.existsSync(fragmentPath)
        ? JSON.parse(fs.readFileSync(fragmentPath, 'utf8'))
        : {};

  const workspace =
    locale === 'en' ? enFragment : deepMerge(enFragment, localeFragment);

  const messagePath = path.join(messagesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(messagePath, 'utf8'));
  data.workspace = workspace;
  fs.writeFileSync(messagePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`workspace → ${locale}.json`);
}
