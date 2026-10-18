// Dev-only lint for Trackr's classic scripts (no modules, no build). The files share globals on
// purpose (one per area, loaded in order by index.html), so "not defined" checks are off; the
// rules kept catch real mistakes: duplicate keys, unreachable code, bad comparisons, etc.
const js = require('@eslint/js');
module.exports = [
  { ignores: ['node_modules/**', 'assets/vendor/**', 'assets/logos/logos.js', 'playwright-report/**', 'test-results/**', 'Backups*/**', 'docs/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { window: 'readonly', document: 'readonly', navigator: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly', console: 'readonly', module: 'writable', require: 'readonly', process: 'readonly', __dirname: 'readonly' } },
    rules: {
      'no-undef': 'off', 'no-unused-vars': 'off', 'no-empty': 'off', 'no-redeclare': 'off', 'no-useless-escape': 'off',
      'no-prototype-builtins': 'off', 'no-irregular-whitespace': ['error', { skipStrings: true, skipRegExps: true, skipTemplates: true }], 'no-control-regex': 'off', 'no-misleading-character-class': 'off', 'no-cond-assign': ['error', 'except-parens'],
    },
  },
];
