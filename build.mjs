// Builds public/index.html from src/: the page, its styles, its icons and its script, all in one file
// (one file means the app opens instantly and works offline from a single download).
//
// The script parts are joined into ONE <script>, in the order below, so they share one scope exactly as
// before the split: a function in one file can call a function in another. Order only matters for code
// that runs straight away (start.js runs last).
//
//   node build.mjs           writes public/index.html
//   node build.mjs --check   fails if public/index.html is not what src/ builds (used by the tests)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'public', 'index.html');

export const SCRIPTS = [
  'core',             // ids, dates, categories, colours, a new or example trip
  'storage',          // saving trips and settings on the phone
  'sync',             // encryption and syncing with the server
  'trips',            // switching trips, resetting the invite link
  'paying',           // payment links, bank details, "Did you pay?", the person menu
  'trip-delete-join', // deleting, restoring and erasing trips; joining by link
  'money',            // who owes whom: splits, couples, settle-up currency, fewest payments
  'activity',         // the Activity list: who changed what, and when
  'views',            // drawing the Expenses, Settle up and Group tabs
  'events',           // buttons, taps and the toast
  'expense-form',     // the add / edit expense form
  'duplicates',       // spotting the same expense added twice
  'settle-sheets',    // settle-up currency and record-a-payment forms
  'photos',           // receipt photos and receipt reading
  'export',           // spreadsheet export
  'help',             // Help, What's new, About
  'notify',           // notifications: the Settings switch, signing up with the server
  'settings',         // Settings and import
  'sheets',           // pop-up sheets: open, close, swipe down
  'start',            // runs last: starts the app
];

const read = f => readFileSync(path.join(SRC, f), 'utf8');

export function build() {
  const js = SCRIPTS.map(n => read(`js/${n}.js`)).join('');
  return read('index.html')
    .replace('<!-- @css styles.css -->\n', () => read('styles.css'))
    .replace('<!-- @include icons.svg -->\n', () => read('icons.svg'))
    .replace('<!-- @js -->\n', () => js);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = build();
  if (process.argv.includes('--check')) {
    if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== html) { console.error('public/index.html is out of date: run npm run build'); process.exit(1); }
    console.log('public/index.html is up to date');
  } else {
    writeFileSync(OUT, html);
    console.log(`Built public/index.html (${SCRIPTS.length} script parts, ${html.split('\n').length} lines)`);
  }
}
