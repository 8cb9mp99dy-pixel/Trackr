/* When two devices disagree: see what each choice loses, ask first, keep a copy of what goes. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

/* The cloud has one transaction of its own and lacks two of this device's. */
const clash = page => page.evaluate(() => {
  saveSupabaseSyncConfig({ url: 'http://127.0.0.1:9', anonKey: 'test', secret: 'test', lastSeenUpdatedAt: 'old', pending: true });
  const cloud = JSON.parse(JSON.stringify(data));
  cloud.budgetTransactions = cloud.budgetTransactions.slice(2).concat({ ...cloud.budgetTransactions[2], id: 'only-in-cloud' });
  cloud.updatedAt = new Date().toISOString();
  window.__cloudCount = cloud.budgetTransactions.length;
  window.__localCount = data.budgetTransactions.length;
  syncState.conflict = { serverData: cloud, serverUpdatedAt: 'new', reason: 'rejected' };
  render();
});

test('The banner shows what each side holds, and both buttons can be read in dark mode', async ({ page }) => {
  const errors = await openApp(page);
  await clash(page);
  const counts = await page.evaluate(() => [window.__localCount, window.__cloudCount]);
  const banner = page.locator('.sync-banner');
  await expect(banner).toContainText(`${counts[0]} transactions, 2 only here`);
  await expect(banner).toContainText(`${counts[1]} transactions, 1 only there`);
  await expect(banner).toContainText('either choice loses some');

  await page.evaluate(() => { document.documentElement.dataset.mode = 'dark'; });
  for (const name of ["Keep this device's data", "Use the cloud's data"]) {
    const look = await banner.getByRole('button', { name }).evaluate(el => { const s = getComputedStyle(el); return [s.backgroundColor, s.color]; });
    expect(look).toEqual(['rgb(255, 255, 255)', 'rgb(17, 17, 17)']);
  }
  expect(errors).toEqual([]);
});

test('Saying no changes nothing; saying yes names the loss and keeps a copy', async ({ page }) => {
  const errors = await openApp(page);
  await clash(page);
  const said = [];
  let accept = false;
  page.on('dialog', d => { said.push(d.message()); return accept ? d.accept() : d.dismiss(); });

  await page.getByRole('button', { name: "Use the cloud's data" }).click();
  expect(said[0]).toContain('2 transactions found only in this device will disappear');
  expect(await page.evaluate(() => [!!syncState.conflict, data.budgetTransactions.length === window.__localCount])).toEqual([true, true]);

  accept = true;
  await page.getByRole('button', { name: "Use the cloud's data" }).click();
  await expect(page.locator('.sync-banner')).toHaveCount(0);
  expect(await page.evaluate(() => data.budgetTransactions.length === window.__cloudCount)).toBe(true);
  const copy = await page.evaluate(async () => (await safetyPoints()).find(p => p.label === 'This device, before using the cloud'));
  expect(JSON.parse(copy.json).budgetTransactions.some(t => t.id === 'only-in-cloud')).toBe(false);
  expect(errors).toEqual([]);
});

test("Keeping this device's data saves the cloud's version first", async ({ page }) => {
  const errors = await openApp(page);
  await clash(page);
  await page.evaluate(() => { window.supabasePushRow = async () => ({ ok: true, updated_at: 'newer' }); });
  const said = [];
  page.on('dialog', d => { said.push(d.message()); return d.accept(); });

  await page.getByRole('button', { name: "Keep this device's data" }).click();
  await expect(page.locator('.sync-banner')).toHaveCount(0);
  expect(said[0]).toContain('1 transaction found only in the cloud will disappear');
  const copy = await page.evaluate(async () => (await safetyPoints()).find(p => p.label === 'The cloud, before keeping this device'));
  expect(JSON.parse(copy.json).budgetTransactions.some(t => t.id === 'only-in-cloud')).toBe(true);
  expect(errors).toEqual([]);
});

test('a copy with far fewer transactions than the cloud is never sent without asking', async ({ page }) => {
  const errors = await openApp(page);
  const URL = 'https://demo-test.supabase.co';
  let sent = 0;
  const cloud = await page.evaluate(() => JSON.parse(JSON.stringify(data)));
  await page.route(URL + '/rest/v1/rpc/*', route => {
    const fn = route.request().url().split('/rpc/')[1];
    if (fn === 'set_trackr_data') sent++;
    const body = fn === 'get_trackr_data' ? { data: cloud, updated_at: 'v1' } : { ok: true, updated_at: 'v2' };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.evaluate(u => {
    saveSupabaseSyncConfig({ url: u, anonKey: 'test', secret: 'test', lastSeenUpdatedAt: 'v1', pending: true });
    data.budgetTransactions = data.budgetTransactions.slice(0, 3);
    return syncNow();
  }, URL);
  expect(sent).toBe(0);
  await expect(page.locator('.sync-banner')).toContainText('would remove most of what the cloud holds');
  await expect(page.locator('.sync-banner')).toContainText('3 transactions, 0 only here');
  expect(errors).toEqual([]);
});
