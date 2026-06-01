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

function applyLayout(data, layout) {
  data.common.workspaceBadge = layout.workspaceBadge;
  data.common.upgrade = layout.upgrade;
  data.common.upgradeTitle = layout.upgradeTitle;

  for (const [key, value] of Object.entries(layout.search)) {
    data.common.search[key] = value;
  }
  for (const [key, value] of Object.entries(layout.footer)) {
    data.common.footer[key] = value;
  }

  if (!data.common.ai) data.common.ai = {};
  data.common.ai.menu = layout.aiMenu;

  data.homePage = layout.homePage;
}

for (const locale of locales) {
  const fragmentPath = path.join(fragmentsDir, `layout.${locale}.json`);
  const layout =
    locale === 'en'
      ? enLayout
      : fs.existsSync(fragmentPath)
        ? JSON.parse(fs.readFileSync(fragmentPath, 'utf8'))
        : enLayout;

  const messagePath = path.join(messagesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(messagePath, 'utf8'));
  applyLayout(data, layout);
  fs.writeFileSync(messagePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`layout → ${locale}.json`);
}
