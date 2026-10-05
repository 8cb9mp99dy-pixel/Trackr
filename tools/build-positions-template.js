#!/usr/bin/env node
/* Regenerates templates/Trackr-positions-template.xlsx — the blank positions template shipped
   with the project (give it to a Claude chat with screenshots of your broker apps) — from the
   same definition the app uses (excel-import.js). The in-app "Download template" button builds
   the same file live, with YOUR brokers and asset categories in the drop-downs.

   Run after changing the columns:   node tools/build-positions-template.js */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const XLSX = require(path.join(root, 'assets/vendor/xlsx.full.min.js'));
const { buildPositionsTemplateFile } = require(path.join(root, 'excel-import.js'));

const bytes = buildPositionsTemplateFile(XLSX, {
  brokers: ['Trade Republic', 'Trading 212'],
  types: ['Stocks', 'ETFs', 'Crypto', 'Private Equity', 'Gold', 'Real Estate', 'Other', 'Cash'],
  currencies: ['EUR', 'USD', 'GBP', 'CHF'],
});
const out = path.join(root, 'templates/Trackr-positions-template.xlsx');
fs.writeFileSync(out, bytes);
console.log(`Wrote ${path.relative(root, out)} (${(bytes.length / 1024).toFixed(1)} KB)`);
