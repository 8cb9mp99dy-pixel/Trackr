/* Dark mode: the top bar switch, kept after a reload, Settings → Display, red / green figures. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

test('dark mode: switch, reload, settings, colours', async ({ page }) => {
  const errors = await openApp(page);
  const mode = () => page.evaluate(() => document.documentElement.getAttribute('data-mode'));
  expect(await mode()).toBe(null);
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  expect(await mode()).toBe('dark');
  // Kept on this device, set before the first frame.
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.main .page'));
  expect(await mode()).toBe('dark');
  const colours = await page.evaluate(() => {
    const s = getComputedStyle(document.body), el = document.createElement('span');
    el.className = 'positive'; document.body.appendChild(el);
    const pos = getComputedStyle(el).color; el.className = 'negative';
    const neg = getComputedStyle(el).color; el.remove();
    return { bg: s.backgroundColor, pos, neg, theme: document.querySelector('meta[name="theme-color"]').content };
  });
  expect(colours).toEqual({ bg: 'rgb(7, 8, 12)', pos: 'rgb(46, 240, 154)', neg: 'rgb(255, 77, 106)', theme: '#07080C' });
  // Settings → Display: Auto follows the device.
  await page.evaluate(() => { goPage('settings'); ui.settingsOpenSections.display = true; render(); });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('group', { name: 'Appearance' }).getByRole('button', { name: 'Auto' }).click();
  expect(await mode()).toBe(null);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(mode).toBe('dark');
  await page.getByRole('group', { name: 'Appearance' }).getByRole('button', { name: 'Light' }).click();
  expect(await mode()).toBe(null);
  expect(errors).toEqual([]);
});
