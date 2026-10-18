## What changes

## Checklist (Trackr's rules)
- [ ] Minimalist, very few emojis, logo unchanged
- [ ] No connection to banks or brokers; data typed, imported, or from free public prices
- [ ] Nothing places a real order or moves real money
- [ ] The invested bank loan stays out of net worth everywhere
- [ ] Every new amount is hidden by the eye (pages, charts, tooltips, notifications, PDF, exports)
- [ ] Still zero-build vanilla JS; no new runtime framework
- [ ] No social / multi-user / subscription / ranking features
- [ ] Old data documents still load (new keys in `defaultData()`, test in `tests/e2e/migration.spec.js`)
- [ ] `sw.js` cache version bumped if app files changed
- [ ] No secrets and no real financial data in the diff (tests use `tests/fixtures/demo-data.json`)
- [ ] Unit tests for new calculations; `npx playwright test` passes
