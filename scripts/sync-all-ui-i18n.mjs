#!/usr/bin/env node
/** Sync workspace + layout fragments into all locale message files. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

for (const script of ['sync-workspace-i18n.mjs', 'sync-layout-i18n.mjs']) {
  const r = spawnSync('node', [path.join(dir, script)], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log('All UI i18n synced.');
