/* Screenshots of every page (desktop 1440 px, phone 390 px) into docs/overnight/screens/<SCREENS>/,
   plus the console errors seen on each page in errors-<project>.json.
     SCREENS=before npx playwright test screens       (or after) */
const { test } = require('@playwright/test');
const fs = require('fs'), path = require('path');
const { openApp, goPage, PAGES } = require('./helpers');
const dir = path.join(__dirname, '..', '..', 'docs', 'overnight', 'screens', process.env.SCREENS || 'after');

test('screenshots of every page', async ({ page }, info) => {
  test.skip(!process.env.SCREENS, 'set SCREENS=before|after to take screenshots');
  fs.mkdirSync(dir, { recursive: true });
  const errors = await openApp(page, { reducedMotion: true });
  const report = {};
  for (const p of PAGES) {
    const before = errors.length;
    await goPage(page, p);
    await page.screenshot({ path: path.join(dir, `${p}-${info.project.name}.png`), fullPage: true });
    report[p] = errors.slice(before);
  }
  fs.writeFileSync(path.join(dir, `errors-${info.project.name}.json`), JSON.stringify(report, null, 1));
});
