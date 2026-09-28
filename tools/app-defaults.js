/* Reads the default budget categories, payment methods and currencies straight out of app.js,
   so tools that generate files (the import template, the Claude reference PDF) use the exact same
   names as the app — one copy, no drift. */
const fs = require('fs'), path = require('path');
module.exports = function appDefaults() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const block = src.slice(src.indexOf('const _sc ='), src.indexOf('function cloneJson'));
  const ccyLine = src.match(/const CURRENCIES = \[[^\]]*\];/)[0];
  return new Function(`${ccyLine}\n${block}\nreturn { BUDGET_CATEGORIES_TEMPLATE, DEFAULT_PAYMENT_METHODS, CURRENCIES };`)();
};
