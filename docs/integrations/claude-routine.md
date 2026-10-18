# A Claude Code routine for future nights (template)

**Purpose:** a regular, unattended pass on Trackr. It works on a branch, never on `main`, and never with real data. You review it in the morning.

**What it does each run**
1. Checks out a fresh `overnight/<date>` branch from `main`.
2. Runs `npm ci`, `npm run check`, `npx eslint .`, `npm test` and `npx playwright test`. Failures are fixed first.
3. Takes the top open item from `docs/overnight/BACKLOG.md`: writes acceptance criteria, builds it, adds tests and commits.
4. Updates the screenshots in `docs/overnight/screens/after/` and writes a short `REPORT.md`.
5. Pushes the branch and opens a **draft** pull request, if `gh` is available. Nothing is merged.

**Prompt template**

```
You are working alone on Trackr (zero-build vanilla JS PWA, ~/Desktop/Claude Code/Trackr).
Follow CLAUDE.md and docs/overnight/PLAN.md. Hard rules: never commit or push to main; work on
overnight/<today>; never contact the real Supabase project; never read or print secrets; test
only with tests/fixtures/demo-data.json; old JSON documents must keep loading (migration test);
every amount hideable with the eye; the invested loan never in net worth; no real orders.
Task: take the first unchecked item in docs/overnight/BACKLOG.md, write its acceptance criteria,
implement it with unit tests for any calculation and an e2e test, run the full suite, commit in
small steps (bash tools/dev/secret-check.sh before each commit), then update REPORT.md.
Stop after 3 items or when the suite is red and you can't fix it in 60 minutes.
```

**Schedule**

Weekly at night, with `/schedule` in Claude Code, or a local `launchd` job running `claude -p "<prompt>"` in the project folder.
