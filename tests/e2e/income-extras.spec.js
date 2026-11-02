/* Income plan → Your split, extras: presets, a preview amount, Undo inside the window; the
   acceptance checks of the brief (VAT incl./excl., cents that add up); old plans and reloads. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const pcts = page => page.evaluate(() => ui.ipDraft.parts.map(x => x.pct));
const open = async page => {
  const errors = await openApp(page);
  await page.evaluate(() => { openIncomePlanEditor(); ui.ipDraft.vatOpen = true; render(); });
  await expect(page.locator('.sd-wrap.live')).toBeVisible();
  return errors;
};
const tryAmount = async (page, v) => { const n = page.locator('.ip-try-num'); await n.fill(String(v)); await n.dispatchEvent('change'); };

test('presets: 50/30/20, even split, save your own, apply it, delete it', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: '50/30/20' }).click();
  expect(await pcts(page)).toEqual([50, 30, 20]);
  await page.getByRole('button', { name: '+ Add a part' }).click();
  await page.getByRole('button', { name: 'Even split' }).click();
  expect(await pcts(page)).toEqual([25, 25, 25, 25]);
  page.once('dialog', d => d.accept('Quarter each'));
  await page.getByRole('button', { name: 'Save current as preset' }).click();
  expect(await page.evaluate(() => data.incomePlan.presets.map(p => [p.name, p.parts.length]))).toEqual([['Quarter each', 4]]);
  await page.getByRole('button', { name: '50/30/20' }).click();   // 4 parts: becomes Needs / Wants / Savings
  expect(await page.evaluate(() => ui.ipDraft.parts.map(x => [x.label, x.pct]))).toEqual([['Needs', 50], ['Wants', 30], ['Savings', 20]]);
  await page.getByRole('button', { name: 'Quarter each', exact: true }).click();
  expect(await pcts(page)).toEqual([25, 25, 25, 25]);
  await page.getByRole('button', { name: 'Delete preset Quarter each' }).click();
  expect(await page.evaluate(() => data.incomePlan.presets.length)).toBe(0);
  expect(errors).toEqual([]);
});

test('acceptance: €1,210 incl. 21 % → VAT €210, €1,000 to split, 25 % = €250; excl. and incl. €1,000', async ({ page }) => {
  const errors = await open(page);
  await tryAmount(page, 1210);
  await expect(page.locator('.ip-vat-amt')).toHaveText('€210.00');
  await expect(page.locator('.sd-center')).toContainText('€1,000.00');
  await expect(page.locator('.ip-part[data-i="0"] .ip-impact')).toContainText('+€250.00');
  await tryAmount(page, 1000);
  await page.getByRole('button', { name: 'excl. VAT' }).click();
  await expect(page.locator('.ip-vat-amt')).toHaveText('€210.00');
  await expect(page.locator('.sd-center')).toContainText('€1,000.00');
  await expect(page.locator('.ip-part[data-i="0"] .ip-impact')).toContainText('+€250.00');
  await page.getByRole('button', { name: 'incl. VAT' }).click();
  await page.locator('.ip-check input').uncheck();                  // exact, not rounded up
  await expect(page.locator('.ip-vat-amt')).toHaveText('€173.55');
  await expect(page.locator('.sd-center')).toContainText('€826.45');
  // Parts + what stays = what's split, to the cent, at awkward amounts.
  for (const v of [999.99, 1234.57, 77.77]) {
    await tryAmount(page, v);
    const ok = await page.evaluate(() => {
      const d = ui.ipDraft, { ex } = ipPreview(d);
      const sum = ex.lines.filter(l => !l.vat).reduce((s, l) => s + Math.round(l.amount * 100), 0) + Math.round(ex.rest * 100);
      return sum === Math.round(ex.base * 100) && Math.round((ex.vat + ex.base) * 100) === Math.round(d.amt * 100);
    });
    expect(ok).toBe(true);
  }
  // The preview never changes the saved plan or any payment.
  await page.evaluate(() => ipCommit());
  expect(await page.evaluate(() => 'amt' in data.incomePlan)).toBe(false);
  expect(errors).toEqual([]);
});

test('the slider previews live; Undo (button and Ctrl/Cmd+Z) walks changes back', async ({ page }) => {
  const errors = await open(page);
  await page.locator('.ip-try input[type=range]').fill('2420');
  await expect(page.locator('.sd-center')).toContainText('€2,000.00');
  await page.getByRole('button', { name: '50/30/20' }).click();
  await page.locator('.sd-handle[data-k="0"]').focus();
  await page.keyboard.press('ArrowRight');
  expect(await pcts(page)).toEqual([51, 29, 20]);
  await page.locator('.ip-part[data-i="2"] input[aria-label="Percent"]').fill('5');
  await page.locator('.ip-part[data-i="2"] input[aria-label="Percent"]').dispatchEvent('change');
  expect(await pcts(page)).toEqual([51, 29, 5]);
  await page.locator('.page-title').click();
  await page.keyboard.press('ControlOrMeta+z');
  expect(await pcts(page)).toEqual([51, 29, 20]);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await pcts(page)).toEqual([50, 30, 20]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await pcts(page)).toEqual([25, 25, 25]);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('the plan survives a reload', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: 'Even split' }).click();
  await page.evaluate(() => ipCommit());
  await page.reload();
  await page.waitForFunction(() => typeof data !== 'undefined' && data && document.querySelector('.main .page'));
  expect(await page.evaluate(() => data.incomePlan.steps.filter(s => !s.setAside).map(s => s.pct))).toEqual([34, 33, 33]);
  // What's saved is in the one document that syncs to Supabase.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('trackr-v1')).incomePlan.steps.length)).toBe(4);
  expect(errors).toEqual([]);
});

test('an old plan (saved before this change) loads and gains the new keys', async ({ page }) => {
  const doc = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'fixtures', 'demo-data.json'), 'utf8'));
  doc.incomePlan = { on: true, since: '2026-10-01', version: 2, triggerCats: ['inc_freelance'], steps: [
    { id: 'ip_vat', label: 'VAT', pct: 21, setAside: true, onlyCat: 'inc_freelance', to: '' },
    { id: 'ip_inv', label: 'Invest', pct: 25, setAside: false, onlyCat: '', to: 'brk:brk_demo1' },
  ] };
  const errors = await openApp(page, { json: JSON.stringify(doc) });
  const p = await page.evaluate(() => { openIncomePlanEditor(); ui.ipDraft.vatOpen = true; render(); return { plan: data.incomePlan, parts: ui.ipDraft.parts.map(x => [x.label, x.pct, x.to]) }; });
  expect(p.plan.vatModes).toEqual({});
  expect(p.plan.vatRoundUp).toBe(true);
  expect(p.plan.presets).toEqual([]);
  expect(p.parts).toEqual([['Invest', 25, 'brk:brk_demo1']]);         // "Invest → Trade Republic" stays as it was
  await expect(page.locator('.ip-part[data-i="0"] .ip-place')).toContainText('Sample Broker');
  await expect(page.locator('.ip-vat-amt')).toBeVisible();
  expect(errors).toEqual([]);
});
