// Loads the real public/index.html in a headless browser so tests exercise the shipped code.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

function load() {
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', url: 'https://test.workers.dev/', pretendToBeVisual: true,
    beforeParse(w) { w.fetch = () => Promise.reject(new Error('offline')); w.scrollTo = () => {}; w.setInterval = () => 0; },
  });
  const w = dom.window;
  // copy results out of the browser as plain data so assertions compare values
  const run = code => { const r = w.eval(code); return r && typeof r === 'object' ? JSON.parse(w.JSON.stringify(r)) : r; };
  // Replace the open trip with a test trip. amounts are in pence.
  const trip = (people, expenses, extra = {}) => {
    w.__t = { v: 1, id: 'testtrip000000000000', name: 'T', cur: '€', nu: 0, u: 1,
      people: people.map((p, i) => typeof p === 'string' ? { id: p, name: p, c: i, u: 1 } : { c: i, u: 1, ...p }),
      expenses: expenses.map((e, i) => ({ id: 'e' + i, date: '2026-10-01', cat: 'other', u: 1, ...e })), ...extra };
    run('S=fix(__t)');
  };
  return { w, run, trip };
}
module.exports = { load };
