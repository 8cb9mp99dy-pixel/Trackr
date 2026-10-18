#!/usr/bin/env node
/* Fails when app files changed but sw.js's CACHE version didn't — otherwise installed copies
   (iPhone, Mac) could keep serving the old files. Compares against a base ref:
     node tools/dev/check-sw-version.js [baseRef]      (default origin/main) */
const { execFileSync } = require('child_process');
const base = process.argv[2] || process.env.BASE_REF || 'origin/main';
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
let changed;
try { changed = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean); }
catch (e) { console.log(`(no ${base} to compare with — skipped)`); process.exit(0); }
const shell = /^(index\.html|styles\.css|manifest\.webmanifest|[a-z-]+\.js|assets\/)/;
const appChanged = changed.filter(f => shell.test(f) && f !== 'sw.js' && !/^(eslint|playwright)\.config/.test(f));
if (!appChanged.length) { console.log('✓ no app files changed'); process.exit(0); }
const ver = s => (s.match(/const CACHE = '([^']+)'/) || [])[1];
const before = ver(git('show', `${base}:sw.js`)), after = ver(require('fs').readFileSync('sw.js', 'utf8'));
if (before === after) { console.error(`✗ app files changed (${appChanged.join(', ')}) but sw.js CACHE is still '${after}' — bump it.`); process.exit(1); }
console.log(`✓ cache version ${before} → ${after}`);
