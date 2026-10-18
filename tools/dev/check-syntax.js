#!/usr/bin/env node
/* node --check on every script the app ships (index.html <script src>) plus tools and tests. */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const shipped = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(s => !/vendor|logos\.js/.test(s));
const extra = ['sw.js', ...fs.readdirSync(path.join(root, 'tools')).filter(f => f.endsWith('.js')).map(f => 'tools/' + f)];
let bad = 0;
for (const f of [...new Set([...shipped, ...extra])]) {
  try { execFileSync(process.execPath, ['--check', path.join(root, f)], { stdio: 'pipe' }); }
  catch (e) { bad++; console.error(`✗ ${f}\n${e.stderr}`); }
}
console.log(bad ? `${bad} file(s) with syntax errors` : `✓ ${shipped.length + extra.length} files parse`);
process.exit(bad ? 1 : 0);
