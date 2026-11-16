/* VAT in the Income plan, 16 Nov 2026 (the user's checks): 21 %, rounded up to the euro for the VAT
   pocket, the cents left over
   stay in the account, and the KOR switch (no VAT). The real "Split this income" window, the
   transfers it records, and an income already split that never changes. Invented data only. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const PLAN = [
  { id: 'ip_vat', label: 'VAT', pct: 21, setAside: true, onlyCat: 'inc_freelance', to: 'pk:acc_demo1:pk_demo1' },
  { id: 'ip_inv', label: 'Invest', pct: 25, to: 'brk:brk_demo1' }, { id: 'ip_day', label: 'Day-to-day spending', pct: 25, to: 'stay' },
  { id: 'ip_keep', label: 'Keep', pct: 10, to: 'stay' }, { id: 'ip_proj', label: 'Projects', pct: 10, to: 'stay' },
  { id: 'ip_clo', label: 'Clothes', pct: 10, to: 'stay' }, { id: 'ip_sole', label: 'Sole Proprietorship', pct: 10, to: 'stay' },
];
const lines = page => page.locator('.modal .split-row').allInnerTexts();
async function income(page, id, amount) {
  await page.evaluate(([id, amount]) => {
    data.budgetTransactions.push({ id, date: todayYmd(), type: 'income', categoryId: 'inc_freelance', subCategoryId: null, nature: 'Variable', paymentMethodId: null, accountId: 'acc_demo1', currency: 'EUR', amount, comment: 'Demo Client', location: '', description: '', logo: '', impact: '' });
    save(); openIncomeSplit(id);
  }, [id, amount]);
}

test('KOR off: €55.06 → VAT €10.00 (€9.56 rounded up) to the VAT pocket, €45.06 split, the spare cents stay; KOR on: no VAT; the first split stays as it was', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(plan => { Object.assign(incomePlan(), { on: true, since: '2026-01-01', triggerCats: ['inc_freelance'], steps: plan }); data.settings.korVatExempt = false; save(); }, PLAN);
  expect(await page.evaluate(() => defaultData().settings.korVatExempt)).toBe(false); // off unless you turn it on

  await income(page, 'tx_demo_kor1', 55.06);
  await expect(page.locator('.modal .split-head')).toContainText('VAT included');
  const off = await lines(page);
  expect(off.map(t => t.replace(/\s+/g, ' '))).toEqual([
    expect.stringMatching(/^VAT 21%.*€10\.00$/), expect.stringMatching(/^Invest 25%.*€11\.26$/), expect.stringMatching(/^Day-to-day spending 25%.*€11\.26$/),
    expect.stringMatching(/^Keep 10%.*€4\.50$/), expect.stringMatching(/^Projects 10%.*€4\.50$/), expect.stringMatching(/^Clothes 10%.*€4\.50$/),
    expect.stringMatching(/^Sole Proprietorship 10%.*€4\.50$/), expect.stringMatching(/^Left.*€4\.54$/),
  ]);
  await page.getByRole('button', { name: 'Split now' }).click();
  const confirm = page.locator('.modal').getByRole('button', { name: /^(Save|Add)/ });
  if (await confirm.count()) await confirm.first().click();
  const made = await page.evaluate(() => data.budgetTransactions.filter(t => t.splitOf === 'tx_demo_kor1').map(t => [t.to, t.amount]));
  expect(made).toEqual([['pk:acc_demo1:pk_demo1', 10], ['brk:brk_demo1', 11.26]]); // what stays in the account isn't moved

  // Turn KOR on: only new splits change.
  await page.evaluate(() => setKor(true));
  expect(await page.evaluate(() => data.settings.korVatExempt)).toBe(true);
  await income(page, 'tx_demo_kor2', 55.06);
  await expect(page.locator('.modal .split-head')).toContainText('KOR · no VAT');
  const on = (await lines(page)).map(t => t.replace(/\s+/g, ' '));
  expect(on.some(t => /^VAT/.test(t))).toBe(false);
  expect(on[0]).toMatch(/^Invest 25%.*€13\.76$/);
  expect(on[on.length - 1]).toMatch(/^Left.*€5\.54$/);
  expect(await page.evaluate(() => data.budgetTransactions.filter(t => t.splitOf === 'tx_demo_kor1').map(t => t.amount))).toEqual([10, 11.26]);
  expect(await page.evaluate(() => !!data.budgetTransactions.find(t => t.id === 'tx_demo_kor1').split)).toBe(true);
  expect(errors).toEqual([]);
});

test('€0.01 both ways, and the try-another-amount preview at €55.06 and €100', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(plan => { Object.assign(incomePlan(), { on: true, since: '2026-01-01', triggerCats: ['inc_freelance'], steps: plan }); save(); openIncomePlanEditor(); }, PLAN);
  const tryAmt = async v => { await page.locator('.ip-try-num').fill(String(v)); await page.locator('.ip-try-num').dispatchEvent('change'); };
  const card = page.locator('.split-example');
  await tryAmt(55.06);
  await expect(card.locator('.eyebrow')).toContainText('of €55.06 · VAT included');
  await expect(card.locator('.split-row').first()).toContainText('€10.00');
  await expect(card.locator('.split-rest')).toContainText('€4.54');
  await tryAmt(100);
  await expect(card.locator('.split-row').first()).toContainText('€18.00');
  await expect(page.locator('.sd-center')).toContainText('€82.00');
  await tryAmt(0.01);
  await expect(card.locator('.split-rest')).toContainText('€0.01');
  await page.evaluate(() => setKor(true));
  await expect(card.locator('.eyebrow')).toContainText('KOR · no VAT');
  await expect(card.locator('.split-rest')).toContainText('€0.01');
  await tryAmt(55.06);
  await expect(card.locator('.split-row', { hasText: 'VAT' })).toHaveCount(0);
  await expect(card.locator('.split-rest')).toContainText('€5.54');
  expect(errors).toEqual([]);
});
