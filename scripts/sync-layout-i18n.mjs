#!/usr/bin/env node
/**
 * Merge messages/fragments/layout.{locale}.json into messages/{locale}.json
 * Updates common (badge, upgrade, search, footer, ai.menu) and homePage.
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

const enLayout = JSON.parse(
  fs.readFileSync(path.join(fragmentsDir, 'layout.en.json'), 'utf8'),
);

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

function applyLayout(data, layout) {
  data.common.workspaceBadge = layout.workspaceBadge;
  data.common.upgrade = layout.upgrade;
  data.common.upgradeTitle = layout.upgradeTitle;

  const prevSearch = data.common.search ?? {};
  data.common.search = deepMerge(prevSearch, layout.search);

  const prevFooter = data.common.footer ?? {};
  data.common.footer = deepMerge(prevFooter, layout.footer);

  if (!data.common.ai) data.common.ai = {};
  const prevMenu = data.common.ai.menu ?? {};
  data.common.ai.menu = deepMerge(prevMenu, layout.aiMenu);

  const prevHomePage = data.homePage ?? {};
  data.homePage = deepMerge(prevHomePage, layout.homePage);
}

for (const locale of locales) {
  const fragmentPath = path.join(fragmentsDir, `layout.${locale}.json`);
  const localeFragment =
    locale === 'en'
      ? enLayout
      : fs.existsSync(fragmentPath)
        ? JSON.parse(fs.readFileSync(fragmentPath, 'utf8'))
        : {};

  const layout =
    locale === 'en' ? enLayout : deepMerge(enLayout, localeFragment);

  const messagePath = path.join(messagesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(messagePath, 'utf8'));
  applyLayout(data, layout);
  fs.writeFileSync(messagePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`layout → ${locale}.json`);
}
