#!/usr/bin/env node
/* Regenerates templates/Trackr-transactions-template.xlsx — the blank import template shipped
   with the project — from the same definition the app uses (budget-import.js) and the app's
   default categories and payment methods (app.js). The in-app "Download template" button builds
   the same file live, with YOUR current categories, accounts and payment methods instead.

   Run after changing the default categories:   node tools/build-budget-template.js */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const XLSX = require(path.join(root, 'assets/vendor/xlsx.full.min.js'));
const { buildBudgetTemplateFile } = require(path.join(root, 'budget-import.js'));

const defs = require('./app-defaults.js')(); // the app's own category/payment-method definitions

const bytes = buildBudgetTemplateFile(XLSX, {
  categories: defs.BUDGET_CATEGORIES_TEMPLATE,
  accounts: [],
  paymentMethods: defs.DEFAULT_PAYMENT_METHODS.map(p => p.name),
  currencies: defs.CURRENCIES,
  defaultCurrency: 'EUR',
  today: new Date(2026, 8, 1),
});
const out = path.join(root, 'templates/Trackr-transactions-template.xlsx');
fs.writeFileSync(out, bytes);
console.log(`Wrote ${path.relative(root, out)} (${(bytes.length / 1024).toFixed(1)} KB)`);
