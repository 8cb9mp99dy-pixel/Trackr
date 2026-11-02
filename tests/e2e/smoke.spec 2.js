/* Every page at desktop and phone width: no console errors, every amount hidden with the eye,
   the loan never in net worth, reduced motion, dark scheme. */
const { test, expect } = require('@playwright/test');
const { openApp, goPage, PAGES } = require('./helpers');

test('every page loads without errors', async ({ page }) => {
  const errors = await openApp(page);
  for (const p of PAGES) {
    await goPage(page, p);
    await expect(page.locator('.main .page')).toBeVisible();
    expect(await page.evaluate(() => /Something went wrong/.test(document.body.innerText))).toBe(false);
  }
  // Sub-tabs too.
  for (const t of ['transactions', 'recurring', 'forecast', 'totals', 'categories', 'import']) await page.evaluate(x => { goPage('budget'); setBudgetTab(x); }, t);
  for (const t of ['stocks', 'crypto', 'other', 'loan']) await page.evaluate(x => { goPage('investments'); setInvestmentsTab(x); }, t);
  await page.evaluate(() => { goPage('wealth'); ui.wealthTab = 'liabilities'; render(); goPage('goals'); ui.goalsTab = 'emergency'; render(); });
  expect(errors).toEqual([]);
});

test('the eye hides every amount on every page', async ({ page }) => {
  await openApp(page, { privacy: true });
  for (const p of PAGES.concat(['investAccount'])) {
    if (p === 'investAccount') await page.evaluate(() => { ui.investAccount = 'broker:brk_demo1'; });
    await goPage(page, p);
    // The live price bar shows public market prices (not your amounts), visible by design.
    const txt = await page.locator('.main').evaluate(el => { const c = el.cloneNode(true); c.querySelectorAll('.ticker').forEach(t => t.remove()); return c.innerText; });
    const hits = (txt.match(/[€£$]\s?\d[\d,.]*/g) || []).filter(m => !/^\$?\d/.test(m));
    expect(hits, `${p}: ${hits.slice(0, 5).join(' | ')}`).toEqual([]);
  }
});

test('the loan is never counted in net worth', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    const before = netWorthTotal();
    const L = data.loans[0];
    L.portfolio.positions.forEach(p => { p.value = 999999; });
    L.principal = 888888;
    save(); render();
    return { before, after: netWorthTotal(), history: data.history[data.history.length - 1].netWorth };
  });
  expect(r.after).toBe(r.before);
  expect(r.history).toBe(r.before);
});

test('reduced motion and dark scheme render', async ({ page }) => {
  const errors = await openApp(page, { reducedMotion: true, colorScheme: 'dark' });
  for (const p of ['dashboard', 'budget', 'wealth']) await goPage(page, p);
  expect(errors).toEqual([]);
});
