/* ===================== Recurrence =====================
 * Its own file, loaded before app.js. How often a recurring item comes: pure date maths, no data,
 * Node-tested. app.js keeps the series themselves (data.recurring) and calls these.
 *
 * data.recurring[id] = { day, lastMonth, stopped, missed } as before, and for anything other than
 * "every month" also:
 *   every: 'day' | 'weekdays' | 'week' | 'twice' | '2weeks' | 'quarter' | 'year'
 *   from: 'YYYY-MM-DD'   the first date; every 2 weeks, every 3 months… count from it
 *   days: [0-6]          twice a week only: the two weekdays, 0 = Sunday
 *   lastDate: 'YYYY-MM-DD'  the newest date already handled
 * A series without `every` repeats every month, so old documents need nothing. */
const RECUR_RHYTHMS = [
  { id: 'day', label: 'Every day', chip: 'Daily', perYear: 365 },
  { id: 'weekdays', label: 'Every weekday', chip: 'Weekdays', perYear: 261 },
  { id: 'week', label: 'Every week', chip: 'Weekly', perYear: 52 },
  { id: 'twice', label: 'Twice a week', chip: 'Twice a week', perYear: 104 },
  { id: '2weeks', label: 'Every 2 weeks', chip: 'Every 2 weeks', perYear: 26 },
  { id: 'month', label: 'Every month', chip: 'Monthly', perYear: 12 },
  { id: 'quarter', label: 'Every 3 months', chip: 'Every 3 months', perYear: 4 },
  { id: 'year', label: 'Every year', chip: 'Yearly', perYear: 1 },
];
const RECUR_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const RECUR_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const RECUR_MAX_DAYS = 800; // one call never walks further than this

const recurOf = st => RECUR_RHYTHMS.find(r => r.id === ((st && st.every) || 'month')) || RECUR_RHYTHMS[5];
/* Comes more than once a month: the app can't ask "was it paid?" for each one. */
const recurIsShort = st => !['month', 'quarter', 'year'].includes(recurOf(st).id);
const recurPerMonth = (st, amount) => (+amount || 0) * recurOf(st).perYear / 12;

const recurToN = ymd => Math.round(Date.parse(ymd + 'T00:00:00Z') / 864e5);
const recurToYmd = n => new Date(n * 864e5).toISOString().slice(0, 10);
const recurAddDays = (ymd, n) => recurToYmd(recurToN(ymd) + n);
const recurWeekday = n => (((n + 4) % 7) + 7) % 7; // day 0 was a Thursday
const recurMonthEnd = ym => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };
function recurDue(ym, day) {
  const end = recurMonthEnd(ym);
  return `${ym}-${String(Math.min(+day || 1, +end.slice(8))).padStart(2, '0')}`;
}
const recurMonthIndex = ymd => +ymd.slice(0, 4) * 12 + +ymd.slice(5, 7) - 1;
const recurYm = i => `${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`;

/* Every date of the series between from and to, both included, oldest first. */
function recurDates(st, from, to) {
  const every = recurOf(st).id, out = [];
  const a = recurToN(st.from && st.from > from ? st.from : from), b = Math.min(recurToN(to), a + RECUR_MAX_DAYS);
  if (['month', 'quarter', 'year'].includes(every)) {
    const step = { month: 1, quarter: 3, year: 12 }[every], start = recurMonthIndex(st.from || from);
    for (let i = recurMonthIndex(recurToYmd(a)); i <= recurMonthIndex(recurToYmd(b)); i++) {
      if ((i - start) % step) continue;
      const date = recurDue(recurYm(i), st.day), n = recurToN(date);
      if (n >= a && n <= b) out.push(date);
    }
    return out;
  }
  const anchor = recurToN(st.from || from), first = recurWeekday(anchor);
  for (let n = a; n <= b; n++) {
    const wd = recurWeekday(n);
    const on = every === 'day' ? true : every === 'weekdays' ? wd >= 1 && wd <= 5 : every === 'week' ? wd === first
      : every === 'twice' ? (st.days || []).includes(wd) : (n - anchor) % 14 === 0;
    if (on) out.push(recurToYmd(n));
  }
  return out;
}
/* The newest date already handled. */
const recurLast = st => st.lastDate || recurDue(st.lastMonth, st.day);
/* The next date, or '' if it can't be found. */
function recurNext(st) {
  return recurDates(st, recurAddDays(recurLast(st), 1), recurAddDays(recurLast(st), 400))[0] || '';
}
/* Do two dates stand for the same payment? A bank's date can shift by a day or two around a
   weekly payment; a month or more has one payment per month, whatever the day. */
function recurSameSlot(st, a, b) {
  if (!recurIsShort(st)) return a.slice(0, 7) === b.slice(0, 7);
  const every = recurOf(st).id;
  return Math.abs(recurToN(a) - recurToN(b)) <= (every === 'week' || every === '2weeks' ? 2 : 0);
}
/* A second day that keeps the two apart: Monday → Monday and Thursday. */
function recurDefaultDays(ymd) {
  const wd = recurWeekday(recurToN(ymd));
  return [wd, (wd + 3) % 7].sort((x, y) => x - y);
}
/* Changes a series' rhythm from `anchor` on, nothing before it is added again. */
function recurSet(st, every, days, anchor) {
  const was = recurOf(st).id, sameDays = every !== 'twice' || String(st.days || []) === String(days || []);
  if (was === every && sameDays) return false;
  st.day = +anchor.slice(8, 10) || 1;
  if (anchor.slice(0, 7) > st.lastMonth) st.lastMonth = anchor.slice(0, 7);
  if (every === 'month') { delete st.every; delete st.from; delete st.days; delete st.lastDate; return true; }
  Object.assign(st, { every, from: anchor, lastDate: anchor });
  if (every === 'twice') st.days = (days && days.length ? days : recurDefaultDays(anchor)).slice().sort((x, y) => x - y); else delete st.days;
  return true;
}
const recurOrdinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
/* "Every Monday and Thursday", "Every 2 weeks on Friday", "Every month on the 5th"… */
function recurLabel(st) {
  const r = recurOf(st);
  const wd = st.from ? RECUR_DAY_NAMES[recurWeekday(recurToN(st.from))] : '';
  if (r.id === 'week') return wd ? `Every ${wd}` : r.label;
  if (r.id === '2weeks') return wd ? `Every 2 weeks on ${wd}` : r.label;
  if (r.id === 'twice') return (st.days || []).length === 2 ? `Every ${RECUR_DAY_NAMES[st.days[0]]} and ${RECUR_DAY_NAMES[st.days[1]]}` : r.label;
  if (r.id === 'year') return st.from ? `Every year on ${st.day} ${RECUR_MONTH_NAMES[+st.from.slice(5, 7) - 1]}` : r.label;
  if (r.id === 'month' || r.id === 'quarter') return `${r.label} on the ${recurOrdinal(+st.day || 1)}`;
  return r.label;
}
/* The shape of a rhythm, to draw: four weeks from the Monday of `start`, or twelve months from
   its month, with the ones it lands on. */
function recurPattern(st, start) {
  const s = Object.assign({}, st, { from: start });
  if (recurIsShort(s)) {
    const n = recurToN(start), monday = n - (recurWeekday(n) + 6) % 7, hits = new Set(recurDates(s, start, recurToYmd(monday + 27)));
    return { kind: 'weeks', cells: Array.from({ length: 28 }, (_, i) => { const date = recurToYmd(monday + i); return { date, on: hits.has(date), past: date < start }; }) };
  }
  const first = recurMonthIndex(start), step = { month: 1, quarter: 3, year: 12 }[recurOf(s).id];
  return { kind: 'months', cells: Array.from({ length: 12 }, (_, i) => ({ label: RECUR_MONTH_NAMES[(first + i) % 12][0], on: i % step === 0 })) };
}
/* The calendar rule for reminders; '' when a reminder would just be noise (every single day). */
function recurIcsRule(st) {
  const r = recurOf(st), day = +st.day || 1;
  const codes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  if (r.id === 'day' || r.id === 'weekdays') return '';
  if (r.id === 'week') return 'FREQ=WEEKLY';
  if (r.id === '2weeks') return 'FREQ=WEEKLY;INTERVAL=2';
  if (r.id === 'twice') return `FREQ=WEEKLY;BYDAY=${(st.days || []).map(d => codes[d]).join(',')}`;
  if (r.id === 'year') return 'FREQ=YEARLY';
  if (r.id === 'quarter') return `FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=${Math.min(day, 28)}`;
  return day <= 28 ? `FREQ=MONTHLY;BYMONTHDAY=${day}` : `FREQ=MONTHLY;BYMONTHDAY=${Array.from({ length: day - 27 }, (_, i) => 28 + i).join(',')};BYSETPOS=-1`;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RECUR_RHYTHMS, recurOf, recurIsShort, recurPerMonth, recurDates, recurLast, recurNext, recurSameSlot, recurDefaultDays, recurSet, recurLabel, recurPattern, recurIcsRule, recurAddDays, recurMonthEnd };
}
