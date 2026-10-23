/* Sage: set up with a key, ask, it looks things up (a tool call) and answers; the eye hides its
   amounts; the key stays on the device; errors are explained; it can be hidden. Claude is faked
   here: no request leaves the machine. */
const { test, expect } = require('@playwright/test');
const { openApp } = require('./helpers');

const FAKE_KEY = 'test-key-not-real';
const sse = events => events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const start = { type: 'message_start', message: { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } };
const toolTurn = sse([start,
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_test', name: 'sum_transactions', input: {} } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"group_by":"category","type":"expense","from":"2026-10-01","to":"2026-10-31"}' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 20 } },
  { type: 'message_stop' }]);
const textTurn = text => sse([start,
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  ...text.match(/[\s\S]{1,12}/g).map(t => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })),
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 30 } },
  { type: 'message_stop' }]);
const ANSWER = 'This month you spent **€1,234.00**.\n\n| Category | Spent |\n|---|---|\n| Food | €103.50 |';

test('ask Sage: it looks up your data and answers', async ({ page }) => {
  const errors = await openApp(page);
  const calls = [];
  await page.route('https://api.anthropic.com/**', async route => {
    const req = route.request();
    calls.push({ headers: req.headers(), body: JSON.parse(req.postData()) });
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: calls.length === 1 ? toolTurn : textTurn(ANSWER) });
  });
  const face = page.locator('#sage .sage-face');
  await expect(face).toBeVisible();
  await face.click();
  // No key yet: the setup explains what is sent and where the key stays.
  await expect(page.locator('.sage-panel')).toContainText('stays on this device');
  await page.locator('#sage-key').fill(FAKE_KEY);
  await page.locator('#sage-notes').fill('I am saving for a summer trip.');
  await page.locator('.sage-panel').getByRole('button', { name: 'Save' }).click();
  await page.locator('.sage-sugg button').first().click();
  await expect(page.locator('.sage-msg.bot')).toContainText('This month you spent', { timeout: 15000 });
  await expect(page.locator('.sage-msg.bot table td').first()).toHaveText('Food');
  expect(calls.length).toBe(2);
  const [first, second] = calls;
  expect(first.headers['x-api-key']).toBe(FAKE_KEY);
  expect(first.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  expect(first.body.model).toBe('claude-opus-5-5');
  expect(first.body.fallbacks).toBe('default');
  expect(first.body.tools.map(t => t.name)).toEqual(['read_sheet', 'search_transactions', 'sum_transactions']);
  const system = first.body.system.map(b => b.text).join('\n');
  expect(system).toContain('NOT the user\'s money');
  expect(system).toContain('I am saving for a summer trip.');
  expect(system).toContain('Summary sheet today');
  // The tool ran here, on the device, and its result went back.
  const result = second.body.messages[second.body.messages.length - 1].content[0];
  expect(result.type).toBe('tool_result');
  expect(result.content).toContain('grouped by category');
  // The eye hides Sage's amounts too.
  await page.evaluate(() => togglePrivacy());
  await expect(page.locator('.sage-msg.bot')).not.toContainText('€1,234.00');
  await expect(page.locator('.sage-msg.bot')).toContainText('•••••');
  await page.evaluate(() => togglePrivacy());
  // The key is on this device only: not in the synced data.
  expect(await page.evaluate(() => JSON.stringify(data).includes('test-key-not-real'))).toBe(false);
  // The chat is still there after a reload.
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.main .page'));
  await page.locator('#sage .sage-face').click();
  await expect(page.locator('.sage-msg.bot')).toContainText('This month you spent');
  expect(errors).toEqual([]);
});

test('a refused key is explained; Sage can be hidden', async ({ page }, info) => {
  const errors = await openApp(page);
  await page.route('https://api.anthropic.com/**', route => route.fulfill({ status: 401, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) }));
  await page.evaluate(k => localStorage.setItem('trackr-sage', JSON.stringify({ apiKey: k })), FAKE_KEY);
  await page.locator('#sage .sage-face').click();
  await page.locator('#sage-in').fill('How much did I spend?');
  await page.locator('#sage-in').press('Enter');
  await expect(page.locator('.sage-msg.bot')).toContainText('key was refused', { timeout: 15000 });
  if (info.project.name === 'phone') {
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(wide).toBeLessThanOrEqual(0);
  }
  await page.evaluate(() => { goPage('settings'); ui.settingsOpenSections.display = true; render(); });
  await page.getByRole('switch', { name: 'Show Sage' }).click();
  await expect(page.locator('#sage .sage-face')).toHaveCount(0);
  expect(errors.filter(e => !/401/.test(e))).toEqual([]);
});
