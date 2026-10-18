# GitHub test runs (switched off)

`ci.yml` (syntax, lint, unit tests, cache version, Playwright, accessibility, Lighthouse) and
`codeql.yml` (code scanning) are kept here, switched off. GitHub only accepts files in
`.github/workflows/` from a login with the **workflow** permission, which this Mac's token
doesn't have yet.

To switch them on: give the token the workflow permission (`brew install gh`, then
`gh auth login`), move both files back to `.github/workflows/`, commit and push.
