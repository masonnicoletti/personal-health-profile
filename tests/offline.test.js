const puppeteer = require('puppeteer-core');
const { BASE, CHROME, OUT, useSample } = require('./env');
const URL = BASE;
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

(async () => {
  for (let i = 0; i < 20; i++) { try { await fetch(URL); break; } catch (e) { await wait(250); } }
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const errors = [];
  const track = (p) => { p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text())); };

  // Desktop: manifest, service worker, offline, backup reminder
  const page = await browser.newPage();
  track(page);
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });

  const man = await page.evaluate(async () => { const r = await fetch(document.querySelector('link[rel=manifest]').href); return r.ok ? r.json() : null; });
  ok(man && man.icons.length === 3 && man.display === 'standalone', 'manifest loads');
  const icons = await page.evaluate(async (m) => Promise.all(m.icons.map(async (i) => (await fetch(i.src)).ok)), man);
  ok(icons.every(Boolean), 'manifest icons load');

  await page.evaluate(() => navigator.serviceWorker.ready);
  await wait(500);
  ok(await page.evaluate(() => !!navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true)), 'service worker active');
  ok(!(await page.$('[data-notice=backup]')) && !(await page.$('[data-notice=ios]')), 'no backup reminder or iPhone tip on an empty desktop profile');

  // Enough data triggers the backup reminder
  await useSample(page);
  await page.reload({ waitUntil: 'load' });
  ok(!!(await page.$('[data-notice=backup]')), 'backup reminder appears with lots of data');
  await page.screenshot({ path: OUT + '/pwa-1-backup.png' });
  await page.evaluate(() => [...document.querySelectorAll('[data-notice=backup] button')].find((b) => b.textContent === 'Not now').click());
  ok(!(await page.$('[data-notice=backup]')), 'Not now hides it');
  const snooze = await page.evaluate(() => JSON.parse(localStorage.getItem('php.meta.v1')).snoozeBackup - Date.now());
  ok(snooze > 13 * 864e5 && snooze <= 14 * 864e5, 'snoozed for 14 days');
  await page.evaluate(() => localStorage.removeItem('php.meta.v1'));
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(() => [...document.querySelectorAll('[data-notice=backup] button')].find((b) => b.textContent === 'Save backup').click());
  ok(!(await page.$('[data-notice=backup]')) && (await page.evaluate(() => !!JSON.parse(localStorage.getItem('php.meta.v1')).lastBackup)), 'saving a backup records it and hides reminder');

  // Offline: app still loads from cache with data intact
  await page.reload({ waitUntil: 'load' }); // ensure controlled by the worker
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'load' });
  const offlineOk = await page.evaluate(() => typeof PHP !== 'undefined' && !!window.jspdf && document.querySelectorAll('.sec').length > 10 && PHP.fullName(PHP._debug.state.data.basic.values));
  ok(offlineOk === 'Margaret Ellis', 'works offline with data intact');
  const pdfOk = await page.evaluate(() => PHP.buildPdf(PHP._debug.state, ['meds'], { save: false }).getNumberOfPages() >= 1);
  ok(pdfOk, 'PDF builds offline');
  await page.setOfflineMode(false);

  // iPhone (Safari, not on Home Screen): install tip
  const ios = await browser.newPage();
  track(ios);
  await ios.setUserAgent(IOS_UA);
  await ios.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await ios.goto(URL);
  await ios.evaluate(() => localStorage.clear());
  await ios.reload({ waitUntil: 'load' });
  ok(!!(await ios.$('[data-notice=ios]')), 'iPhone tip appears');
  ok(!(await ios.$('[data-notice=ios] .btn.ghost')), 'no backup button when nothing entered');
  await ios.screenshot({ path: OUT + '/pwa-2-ios-empty.png' });
  await useSample(ios);
  await ios.reload({ waitUntil: 'load' });
  const txt = await ios.$eval('[data-notice=ios]', (n) => n.innerText);
  ok(/save a backup first/.test(txt) && !!(await ios.$('[data-notice=ios] .btn.ghost')) && !(await ios.$('[data-notice=backup]')), 'tip mentions backup when data exists, no duplicate reminder');
  await ios.screenshot({ path: OUT + '/pwa-3-ios-data.png' });
  await ios.evaluate(() => [...document.querySelectorAll('[data-notice=ios] button')].find((b) => b.textContent === 'Got it').click());
  await ios.reload({ waitUntil: 'load' });
  ok(!(await ios.$('[data-notice=ios]')), 'Got it dismisses the tip for good');
  ok(!(await ios.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'no horizontal scroll on phone');

  ok(errors.length === 0, 'no console errors ' + JSON.stringify(errors));
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exitCode = fails ? 1 : 0;
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
