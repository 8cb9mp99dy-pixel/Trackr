/* An old document (before every key added since Oct 2026) loads, gets the new keys with their
   defaults, and keeps every value it had — nothing dropped or changed. */
const { test, expect } = require('@playwright/test');
const fs = require('fs'), path = require('path');
const { openApp, goPage, PAGES } = require('./helpers');
const OLD = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'old-format.json'), 'utf8');

// Every leaf of `old` must exist unchanged in `now`. (Arrays: same length, item by item.)
function missing(old, now, at = '') {
  if (old === null || typeof old !== 'object') return Object.is(old, now) || (typeof old === 'number' && Math.abs(old - now) < 1e-9) ? [] : [`${at}: ${JSON.stringify(old)} → ${JSON.stringify(now)}`];
  if (now === null || typeof now !== 'object') return [`${at}: object → ${JSON.stringify(now)}`];
  if (Array.isArray(old) && (!Array.isArray(now) || now.length !== old.length)) return [`${at}: array length ${old.length} → ${Array.isArray(now) ? now.length : typeof now}`];
  return Object.keys(old).flatMap(k => missing(old[k], now[k], at ? `${at}.${k}` : k));
}

test('old-format document loads, gains defaults and loses nothing', async ({ page }) => {
  const errors = await openApp(page, { json: OLD });
  for (const p of PAGES) await goPage(page, p);
  const now = await page.evaluate(() => { save(); return JSON.parse(localStorage.getItem('trackr-v1')); });
  const old = JSON.parse(OLD);
  // The app adds today's snapshot at the end of the history (past days never change) and stamps
  // updatedAt: compare the old days with the same days now.
  delete old.updatedAt;
  expect(now.history.length).toBeGreaterThanOrEqual(old.history.length);
  now.history = now.history.slice(0, old.history.length);
  const diff = missing(old, now);
  expect(diff).toEqual([]);
  for (const k of ['goals', 'liabilities', 'emergencyFund', 'investPlans', 'exchangeLogos', 'forecastScenarios', 'txRules', 'targetAllocation'])
    expect(now[k], k).toBeDefined();
  expect(now.settings.notifications).toBeDefined();
  expect(now.settings.budgetLimitsBeta).toBe(false);
  expect(now.settings.applyTradesToHoldings).toBe(false);
  expect(errors).toEqual([]);
});
