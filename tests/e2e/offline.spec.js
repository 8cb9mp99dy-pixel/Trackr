/* With the service worker on: after one visit the app opens again with no connection. */
const { test, expect } = require('@playwright/test');
const fs = require('fs'), path = require('path');
const FIXTURE = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'demo-data.json'), 'utf8');

test.use({ serviceWorkers: 'allow' });
test('offline reload', async ({ page, context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, r => r.abort());
  await page.addInitScript(d => { if (!localStorage.getItem('trackr-v1')) { localStorage.setItem('trackr-v1', d); localStorage.setItem('trackr-ask-mode', '0'); } }, FIXTURE);
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(async () => { await page.reload(); await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 }); });
  await page.waitForTimeout(1500);   // let the shell finish caching
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => typeof data !== 'undefined' && data && document.querySelector('.main .page'), null, { timeout: 15000 });
  await expect(page.locator('.page-title').first()).toBeVisible();
  await context.setOffline(false);
});
