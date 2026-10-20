#!/usr/bin/env node
/* Dev-only: one screenshot of the app on the invented fixture (server must be running:
   node tools/dev/serve.js 8080).
     node tools/dev/shot.js <out.png> [--width 1440] [--js "goPage('analysis')"] [--sel ".card"] [--full]
   Outside requests are blocked, so nothing leaves this machine. */
const { chromium } = require('@playwright/test');
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2), out = args[0];
const opt = k => { const i = args.indexOf('--' + k); return i > 0 ? args[i + 1] : null; };
(async () => {
  const width = +(opt('width') || 1440);
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width, height: width < 700 ? 844 : 900 }, deviceScaleFactor: width < 700 ? 2 : 1 });
  await p.context().route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await p.clock.setFixedTime(new Date('2026-10-18T10:00:00'));
  const fx = fs.readFileSync(path.join(__dirname, '..', '..', 'tests', 'fixtures', 'demo-data.json'), 'utf8');
  await p.addInitScript(d => { if (!sessionStorage.getItem('fx')) { localStorage.clear(); localStorage.setItem('trackr-v1', d); localStorage.setItem('trackr-ask-mode', '0'); sessionStorage.setItem('fx', '1'); } }, fx);
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.goto('http://127.0.0.1:8080/');
  await p.waitForFunction(() => typeof data !== 'undefined' && data && document.querySelector('.main .page'));
  if (opt('js')) { await p.evaluate(opt('js')); }
  await p.waitForTimeout(900);
  const sel = opt('sel');
  if (sel) await (await p.$(sel)).screenshot({ path: out });
  else await p.screenshot({ path: out, fullPage: args.includes('--full') });
  await b.close();
  console.log('saved', out);
})().catch(e => { console.error(e.message); process.exit(1); });
