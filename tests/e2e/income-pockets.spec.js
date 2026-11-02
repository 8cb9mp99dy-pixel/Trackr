/* Income plan → Your split, parts connected to pockets: the place picker (pockets, accounts &
   brokers, + New pocket), what each payment does to a pocket and its goal, the VAT pocket and its
   quarter total, slice colours, drag rows into order, and closing a pocket a payment fills. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const open = async page => {
  const errors = await openApp(page);
  await page.evaluate(() => openIncomePlanEditor(2));
  await expect(page.locator('.sd-wrap.live')).toBeVisible();
  return errors;
};
const row = (page, i) => page.locator(`.ip-part[data-i="${i}"]`);

test('pick a pocket: its colour on the slice, the payment and the goal under the row', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => { accountById('acc_demo1').pockets.find(p => p.id === 'pk_demo1').targetAmount = 800; render(); });
  await row(page, 0).locator('.ip-place').click();
  await expect(page.locator('.ip-pick-h').first()).toHaveText('Pockets');
  await expect(page.locator('.ip-pick')).toContainText('Accounts & brokers');
  await page.locator('.ip-pick .ip-opt', { hasText: 'Trip fund' }).click();
  await expect(page.locator('.ip-pick')).toHaveCount(0);
  const color = await page.evaluate(() => accountById('acc_demo1').pockets.find(p => p.id === 'pk_demo1').color);
  await expect(page.locator('.sd-slice[data-i="0"] path')).toHaveAttribute('fill', color);
  // €1,000 incl. VAT → €826 to split; 25 % = €206.50 into a pocket holding €420.00.
  await expect(row(page, 0).locator('.ip-impact')).toContainText('+€206.50 → ✈️ Trip fund: €420.00 → €626.50');
  await expect(row(page, 0).locator('.ip-goal')).toContainText('Goal reached after 1 more payment like this');
  // A part with no name shows its pocket's name; a broker gets a slice colour you choose.
  await row(page, 1).locator('.ip-place').click();
  await page.locator('.ip-pick .ip-opt', { hasText: 'Sample Broker' }).click();
  await row(page, 1).locator('.ip-place').click();
  await page.locator('.ip-pick .ip-np-colors .swatch-dot').nth(5).click();
  await expect(page.locator('.sd-slice[data-i="1"] path')).toHaveAttribute('fill', 'var(--chart-6)');
  await expect(row(page, 1).locator('.ip-goal')).toHaveCount(0); // no goal UI for a broker
  await page.getByRole('button', { name: 'Save plan' }).click();
  const steps = await page.evaluate(() => data.incomePlan.steps.filter(s => !s.setAside).map(s => [s.to, s.color || '']));
  expect(steps[0]).toEqual(['pk:acc_demo1:pk_demo1', '']);
  expect(steps[1]).toEqual(['brk:brk_demo1', 'var(--chart-6)']);
  expect(errors).toEqual([]);
});

test('+ New pocket inline, and a VAT pocket made on save when there is none', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('.ip-vatline .ip-place')).toContainText('New VAT pocket');
  await row(page, 2).locator('.ip-place').click();
  await page.locator('.ip-pick .ip-opt-new').click();
  await page.locator('.ip-np-name').fill('Holidays');
  await page.locator('.ip-np-ic').fill('🏖️');
  await page.getByLabel('Goal amount').fill('500');
  await page.getByRole('button', { name: 'Create pocket' }).click();
  await expect(row(page, 2).locator('.ip-place')).toContainText('Holidays');
  await expect(row(page, 2).locator('.ip-goal')).toContainText('of €500.00');
  await page.getByRole('button', { name: 'Save plan' }).click();
  const out = await page.evaluate(() => {
    const all = data.accounts.flatMap(a => (a.pockets || []).map(p => ({ ref: `pk:${a.id}:${p.id}`, p })));
    const hol = all.find(x => x.p.name === 'Holidays'), vat = all.find(x => x.p.name === 'VAT');
    return { hol: hol && [hol.p.icon, hol.p.targetAmount, hol.p.amountSaved, !!hol.p.color], vatRef: vat && vat.ref, steps: data.incomePlan.steps.map(s => s.to), holRef: hol && hol.ref };
  });
  expect(out.hol).toEqual(['🏖️', 500, 0, true]);
  expect(out.steps[0]).toBe(out.vatRef);           // VAT goes to the new 🧾 VAT pocket
  expect(out.steps[3]).toBe(out.holRef);
  expect(errors).toEqual([]);
});

test('VAT set aside this quarter, from transfers into the VAT place', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    accountById('acc_demo1').pockets.push({ id: 'pk_vat', icon: '🧾', name: 'VAT Storage', amountSaved: 300, targetAmount: 0, color: '#8E6CEF' });
    const tr = (id, date, amount) => ({ id, date, type: 'transfer', categoryId: null, amount, currency: 'EUR', from: 'acc:acc_demo1', to: 'pk:acc_demo1:pk_vat', comment: 'VAT', description: '' });
    data.budgetTransactions.push(tr('tv1', '2026-10-03', 120), tr('tv2', '2026-10-12', 180), tr('tv0', '2026-09-20', 999));
    save(); openIncomePlanEditor(2);
  });
  await expect(page.locator('.ip-vat-q')).toContainText('2026 Q4');
  await expect(page.locator('.ip-vat-q')).toContainText('€300.00');
  await expect(page.locator('.ip-vatline .ip-impact')).toContainText('+€174.00 → 🧾 VAT Storage: €300.00 → €474.00');
  expect(errors).toEqual([]);
});

test('drag a row by its handle: the parts and the slices change order', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse drag; touch uses the same SortableJS set-up as Arrange');
  const errors = await open(page);
  const names = () => page.evaluate(() => ui.modal.payload.parts.map(x => x.label));
  expect(await names()).toEqual(['Savings (invest)', 'Pockets', 'Monthly expenses']);
  await page.waitForFunction(() => window.Sortable);
  await row(page, 1).evaluate(el => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  const g = await row(page, 2).locator('.ip-grip').boundingBox(), t = await row(page, 0).locator('.ip-grip').boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(g.x + g.width / 2, g.y + (t.y - g.y) * i / 12 - 4);
  await page.mouse.up();
  await expect.poll(names).toEqual(['Monthly expenses', 'Savings (invest)', 'Pockets']);
  await expect(page.locator('.sd-handle[data-k="0"]')).toHaveAttribute('aria-label', 'Between Monthly expenses and Savings (invest)');
  expect(errors).toEqual([]);
});

test('a payment that fills a pocket offers to close it after the transfer', async ({ page }) => {
  const errors = await openApp(page);
  await page.evaluate(() => {
    accountById('acc_demo1').pockets.find(p => p.id === 'pk_demo1').targetAmount = 500;
    openTxForm(null, { type: 'income', categoryId: 'inc_salary', amount: '1000', comment: 'Salary', accountId: 'acc_demo1', date: '2026-10-18' });
    saveTxForm();
  });
  await expect(page.locator('.modal-title')).toHaveText('Split this income');
  const close = page.locator('.split-close');
  await expect(close).toContainText('This reaches Trip fund');
  await close.locator('input').check();
  await page.getByRole('button', { name: 'Split now' }).click();
  await expect.poll(() => page.evaluate(() => ui.modal && ui.modal.type)).toBe('pocketClose');
  expect(errors).toEqual([]);
});
