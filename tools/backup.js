#!/usr/bin/env node
/* Trackr backup tool — writes an Excel backup of all your Trackr data into Trackr/Backups/.
 *
 *   node tools/backup.js                    fetch from your Supabase sync (read-only) and back up
 *   node tools/backup.js --from FILE        back up a file instead (.json from the app, or .xlsx)
 *   node tools/backup.js --encrypt          write an encrypted copy (.xlsx.enc) instead of a readable one
 *   node tools/backup.js --set-password     store the encryption password in your macOS Keychain
 *   node tools/backup.js --decrypt FILE     turn a .xlsx.enc back into a readable .xlsx
 *   node tools/backup.js --verify FILE      check a backup against its fingerprint
 *   node tools/backup.js --keep 60          how many backups to keep (default 60; oldest removed)
 *   node tools/backup.js --out DIR          write somewhere else than Backups/
 *
 * Security:
 *   - Backups/ is in .gitignore: nothing in it is ever sent to GitHub.
 *   - Backups/ is readable by your Mac user only (folder 700, files 600).
 *   - The connection is read from Backups/.connection (your setup code, which you paste there
 *     yourself) — never stored in the code. The tool only READS your data (get_trackr_data); it
 *     can't change anything in the cloud.
 *   - Every backup is re-opened after writing and checked against its SHA-256 fingerprint.
 *   - --encrypt: AES-256-GCM, key derived from your password with scrypt. The password lives in
 *     the macOS Keychain (--set-password), never in a file; without it, the file can't be opened.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const argOut = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : null; })();
const DIR = argOut ? path.resolve(argOut) : path.join(ROOT, 'Backups');
const CONNECTION = path.join(ROOT, 'Backups', '.connection');
const KEYCHAIN_SERVICE = 'Trackr backup';
const MAGIC = Buffer.from('TRKENC1');
const XLSX = require(path.join(ROOT, 'assets/vendor/xlsx.full.min.js'));
const { buildWorkbook, readWorkbook } = require(path.join(ROOT, 'backup-excel.js'));

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null; };
const sha256 = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const die = msg => { console.error('✗ ' + msg); process.exit(1); };

function ensureDir() {
  fs.mkdirSync(DIR, { recursive: true });
  fs.chmodSync(DIR, 0o700);
  const readme = path.join(DIR, 'README.txt');
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme, [
      'Trackr backups — private, never sent to GitHub (this folder is in .gitignore).',
      '',
      'Make a backup:      node tools/backup.js            (from the Trackr folder)',
      'Encrypted backup:   node tools/backup.js --encrypt  (password from your Keychain: --set-password)',
      'Open an encrypted:  node tools/backup.js --decrypt Backups/<file>.xlsx.enc',
      'Restore in the app: Settings → Backup & Restore → Restore from Excel.',
      '',
      '.connection holds your setup code (Settings → Supabase Sync → Copy setup code). Anyone with',
      'it can read and change your Trackr data: keep it here only.',
      '',
    ].join('\n'), { mode: 0o600 });
  }
}
function parseSetupCode(text) {
  const raw = String(text || '').replace(/\s+/g, '');
  const at = raw.indexOf('trackr-sync:');
  if (at < 0) return null;
  try {
    const o = JSON.parse(Buffer.from(raw.slice(at + 12), 'base64').toString('utf8'));
    return o && o.u && o.k && o.s ? { url: String(o.u).replace(/\/+$/, ''), anonKey: String(o.k), secret: String(o.s) } : null;
  } catch (e) { return null; }
}
async function fetchFromCloud() {
  if (!fs.existsSync(CONNECTION)) {
    fs.mkdirSync(path.dirname(CONNECTION), { recursive: true, mode: 0o700 });
    fs.writeFileSync(CONNECTION, '', { mode: 0o600 });
    die(`No connection yet. In Trackr: Settings → Supabase Sync → Copy setup code, then paste it into\n  ${CONNECTION}\n  (an empty file was just created there for you), save, and run this again.`);
  }
  fs.chmodSync(CONNECTION, 0o600);
  const cfg = parseSetupCode(fs.readFileSync(CONNECTION, 'utf8'));
  if (!cfg) die(`${CONNECTION} doesn't contain a setup code (it starts with "trackr-sync:").`);
  let res;
  try {
    res = await fetch(`${cfg.url}/rest/v1/rpc/get_trackr_data`, {
      method: 'POST',
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: cfg.secret }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) { die("Couldn't reach Supabase — check the internet connection. (" + e.message + ')'); }
  const text = await res.text();
  if (!res.ok) die(`Supabase answered ${res.status}: ${text.slice(0, 200)}`);
  const out = text ? JSON.parse(text) : null;
  const data = out && typeof out === 'object' && 'data' in out && 'updated_at' in out ? out.data : out;
  if (!data) die('Supabase has no Trackr data for this setup code.');
  return { data, source: `Supabase sync (${new URL(cfg.url).host})` };
}
function loadFromFile(file) {
  if (!fs.existsSync(file)) die('No such file: ' + file);
  if (/\.xlsx$/i.test(file)) {
    const { json, expected } = readWorkbook(XLSX, XLSX.read(fs.readFileSync(file)));
    if (sha256(json) !== expected) die('That Excel file fails its fingerprint check — not using it.');
    return { data: JSON.parse(json), source: 'file ' + path.basename(file) };
  }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  // A browser-storage dump ({"trackr-v1": "<json>"}) or the app's own backup file.
  const data = typeof parsed['trackr-v1'] === 'string' ? JSON.parse(parsed['trackr-v1']) : parsed;
  return { data, source: 'file ' + path.basename(file) };
}
function checkData(d) {
  if (!(d && typeof d === 'object' && Array.isArray(d.accounts) && Array.isArray(d.budgetTransactions) && d.settings)) die("This isn't Trackr data (accounts, transactions and settings are missing).");
}

/* ---- Encryption: AES-256-GCM, scrypt key ---- */
function keychainPassword() {
  const r = spawnSync('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.replace(/\n$/, '') : null;
}
function encrypt(buf, password) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(password, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), body]);
}
function decrypt(buf, password) {
  if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) die('Not a Trackr encrypted backup.');
  let o = MAGIC.length;
  const salt = buf.subarray(o, o += 16), iv = buf.subarray(o, o += 12), tag = buf.subarray(o, o += 16), body = buf.subarray(o);
  const key = crypto.scryptSync(password, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  try { return Buffer.concat([d.update(body), d.final()]); } catch (e) { die('Wrong password, or the file was changed.'); }
}

function rotate(keep) {
  const files = fs.readdirSync(DIR).filter(f => /^Trackr-backup-.*\.xlsx(\.enc)?$/.test(f)).sort();
  const extra = files.slice(0, Math.max(0, files.length - keep));
  extra.forEach(f => fs.unlinkSync(path.join(DIR, f)));
  return extra.length;
}

async function main() {
  if (opt('--set-password')) {
    console.log(`Type the password for encrypted backups (stored in your Keychain as "${KEYCHAIN_SERVICE}"):`);
    const r = spawnSync('security', ['add-generic-password', '-U', '-s', KEYCHAIN_SERVICE, '-a', process.env.USER || 'trackr', '-w'], { stdio: 'inherit' });
    process.exit(r.status || 0);
  }
  if (opt('--decrypt')) {
    const file = opt('--decrypt'); if (file === true) die('Give the .xlsx.enc file to decrypt.');
    const pw = keychainPassword() || die('No password in the Keychain — run with --set-password first.');
    const out = file.replace(/\.enc$/i, '');
    fs.writeFileSync(out, decrypt(fs.readFileSync(file), pw), { mode: 0o600 });
    console.log('✓ Decrypted to ' + path.relative(ROOT, out));
    return;
  }
  if (opt('--verify')) {
    const file = opt('--verify'); if (file === true) die('Give the .xlsx file to check.');
    const { json, expected } = readWorkbook(XLSX, XLSX.read(fs.readFileSync(file)));
    if (sha256(json) !== expected) die('Fingerprint does NOT match — the file was changed or damaged.');
    console.log('✓ Fingerprint matches — this backup is intact.');
    return;
  }

  ensureDir();
  const from = opt('--from');
  const { data, source } = from && from !== true ? loadFromFile(path.resolve(from)) : await fetchFromCloud();
  checkData(data);
  const json = JSON.stringify(data), fp = sha256(json);
  const madeAt = new Date().toISOString();
  const wb = buildWorkbook(XLSX, data, json, fp, { madeAt, source: 'tools/backup.js — ' + source });
  const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', compression: true });

  // Check the written workbook reads back to exactly the same data before keeping it.
  const back = readWorkbook(XLSX, XLSX.read(bytes));
  if (back.json !== json || sha256(back.json) !== fp) die('Self-check failed: the workbook did not read back identically. Nothing was saved.');

  const stamp = madeAt.slice(0, 16).replace('T', '-').replace(':', '');
  let file = path.join(DIR, `Trackr-backup-${stamp}.xlsx`);
  if (opt('--encrypt')) {
    const pw = keychainPassword() || die('No password in the Keychain — run: node tools/backup.js --set-password');
    file += '.enc';
    const enc = encrypt(bytes, pw);
    if (!decrypt(enc, pw).equals(bytes)) die('Encryption self-check failed. Nothing was saved.');
    fs.writeFileSync(file, enc, { mode: 0o600 });
  } else {
    fs.writeFileSync(file, bytes, { mode: 0o600 });
  }
  const removed = rotate(+opt('--keep') > 0 ? +opt('--keep') : 60);
  const c = n => (n || []).length;
  console.log(`✓ Backup saved: ${path.relative(ROOT, file)}`);
  console.log(`  from ${source} · ${c(data.accounts)} accounts · ${c(data.budgetTransactions)} transactions · ${c(data.assetEntries)} positions · ${c(data.cryptoAssets)} coins · ${c(data.loans)} loans`);
  console.log(`  fingerprint ${fp.slice(0, 16)}… · checked after writing · readable by you only${removed ? ` · ${removed} old backup(s) removed` : ''}`);
}
main().catch(e => die(e.message || String(e)));
