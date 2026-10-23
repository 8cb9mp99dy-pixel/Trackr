/* Shared set-up for the end-to-end tests: the invented fixture in localStorage, a fixed clock,
   and NO network outside this machine (prices, FX and — above all — Supabase are never reached;
   the fixture has no sync settings either). */
const fs = require('fs'), path = require('path');
const FIXTURE = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'demo-data.json'), 'utf8');
const PAGES = ['dashboard', 'wealth', 'goals', 'analysis', 'budget', 'investments', 'accounts', 'trading', 'settings', 'trips', 'ious', 'contracts', 'yearly', 'patterns'];

async function openApp(page, opts = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  // Tests run with every outside request blocked, so the app's own "offline, keeping the last
  // known value" messages are expected; anything else logged as an error fails the test.
  const offline = /Failed to load resource|net::ERR_FAILED|ERR_INTERNET_DISCONNECTED|Failed to fetch|keeping (the )?last known|unavailable, keeping|not sent to the cloud/i;
  page.on('console', m => { if (m.type() === 'error' && !offline.test(m.text())) errors.push('console: ' + m.text()); });
  await page.context().route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, r => r.abort());
  await page.clock.setFixedTime(new Date('2026-10-18T10:00:00'));
  const json = opts.json || FIXTURE;
  await page.addInitScript(([key, doc, privacy]) => {
    if (!sessionStorage.getItem('fixture-loaded')) {
      localStorage.clear();
      localStorage.setItem(key, doc);
      if (privacy) localStorage.setItem('trackr-privacy', '1');
      sessionStorage.setItem('fixture-loaded', '1');
    }
  }, ['trackr-v1', json, !!opts.privacy]);
  if (opts.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  if (opts.colorScheme) await page.emulateMedia({ colorScheme: opts.colorScheme });
  await page.goto('/');
  await page.waitForFunction(() => typeof data !== 'undefined' && data && document.querySelector('.main .page'));
  return errors;
}
async function goPage(page, id) {
  await page.evaluate(p => { window.goPage(p); window.scrollTo(0, 0); }, id);
  await page.waitForTimeout(350);
}
module.exports = { openApp, goPage, PAGES, FIXTURE };
