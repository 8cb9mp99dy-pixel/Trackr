/* Accessibility (axe-core) on the main pages. Fails on "critical" issues; everything else is
   listed in the test's attachments so it can be worked through. */
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { openApp, goPage } = require('./helpers');

for (const p of ['dashboard', 'wealth', 'budget', 'investments', 'analysis', 'settings', 'accounts', 'goals']) {
  test(`axe: ${p}`, async ({ page }, info) => {
    await openApp(page, { reducedMotion: true });
    await goPage(page, p);
    const r = await new AxeBuilder({ page }).include('.shell').analyze();
    const summary = r.violations.map(v => `${v.impact} · ${v.id} · ${v.nodes.length} — ${v.help}`);
    await info.attach(`axe-${p}.txt`, { body: summary.join('\n') || 'no violations', contentType: 'text/plain' });
    expect(r.violations.filter(v => v.impact === 'critical').map(v => v.id)).toEqual([]);
  });
}
