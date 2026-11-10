const puppeteer = require('puppeteer-core');
const { BASE, CHROME, OUT } = require('./env');
const URL = BASE;
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const vis = (p, sel) => p.$eval(sel, (e) => !e.closest('[hidden]') && e.getClientRects().length > 0).catch(() => false);
const clickText = (p, sel, text) =>
  p.evaluate((sel, text) => [...document.querySelectorAll(sel)].find((b) => b.textContent.trim() === text && b.getClientRects().length).click(), sel, text);

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(URL);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('php.meta.v1', JSON.stringify({ installDismissed: 1 })); });
  await page.reload({ waitUntil: 'load' });

  // New user
  ok((await vis(page, '#homeView')) && !(await vis(page, '#formView')), 'opens on the home screen');
  ok((await page.$eval('.home-title', (e) => e.textContent)) === 'Personal Health Profile', 'big title');
  ok((await page.$eval('#homePrimary', (e) => e.textContent)) === 'Get Started', 'new user sees Get Started');
  ok((await page.$$('#homeSecondary button')).length === 0, 'no extra options for a new user');
  await page.screenshot({ path: OUT + '/home-1-new.png' });

  await page.click('#homePrimary');
  const steps = [];
  for (let i = 0; i < 4; i++) {
    steps.push(await page.evaluate(() => [document.querySelector('#tourCount').textContent, document.querySelector('#tourTitle').textContent, document.querySelector('#tourNext').textContent]));
    if (i === 2) await page.screenshot({ path: OUT + '/home-2-tour.png' });
    await page.click('#tourNext');
  }
  await wait(200);
  ok(steps.map((s) => s[0]).join() === '1 of 4,2 of 4,3 of 4,4 of 4' && steps[3][2] === 'Start' && steps[0][2] === 'Next', 'tutorial: 4 steps, Next then Start ' + JSON.stringify(steps.map((s) => s[1])));
  ok((await vis(page, '#formView')) && (await page.evaluate(() => location.hash)) === '#form', 'tutorial ends in the form');

  await page.click('#homeBtn');
  await wait(200);
  ok(await vis(page, '#homeView'), 'Home button returns home');
  await page.click('#homePrimary');
  for (let i = 0; i < 4; i++) await page.click('#tourNext');
  await wait(200);
  await page.goBack();
  await wait(200);
  ok(await vis(page, '#homeView'), 'browser back returns home');

  // Instructions
  await page.click('#instrBtn');
  ok((await page.$$('#instrSteps li')).length === 6 && (await page.$eval('#instrDialog', (d) => d.open)), 'instructions panel with 6 steps');
  await page.screenshot({ path: OUT + '/home-3-instructions.png' });
  await clickText(page, '#instrDialog button', 'Close');

  // Returning user
  await page.evaluate(() => localStorage.setItem('php.profile.v1', JSON.stringify(PHP.sampleData())));
  await page.reload({ waitUntil: 'load' });
  ok((await page.$eval('#homePrimary', (e) => e.textContent)) === 'Update Profile', 'returning user sees Update Profile');
  ok((await page.$eval('#homeSub', (e) => e.textContent)) === 'Welcome back, Margaret.', 'greets by first name');
  const sec = await page.$$eval('#homeSecondary button', (bs) => bs.map((b) => b.textContent));
  ok(sec.join() === 'Log Appointment,Add a Note,Download PDF', 'secondary options: ' + sec.join(', '));
  await page.screenshot({ path: OUT + '/home-4-returning.png' });

  await clickText(page, '#homeSecondary button', 'Add a Note');
  await wait(300);
  const note = await page.evaluate(() => ({
    editing: !!document.querySelector('#sec-notes .entry.editing'),
    open: document.querySelector('#sec-notes').classList.contains('open'),
    focus: document.activeElement.closest('#sec-notes') !== null,
  }));
  ok((await vis(page, '#formView')) && note.editing && note.open && note.focus, 'Add a Note opens a new note in the form');
  await page.click('#homeBtn');
  await wait(200);
  await page.evaluate(() => { PHP._debug.state.added = []; });
  await clickText(page, '#homeSecondary button', 'Log Appointment');
  await wait(300);
  const appt = await page.evaluate(() => ({
    added: PHP._debug.state.added.includes('appointments'),
    editing: !!document.querySelector('#sec-appointments .entry.editing'),
    date: PHP._debug.state.data.appointments.lists.main.slice(-1)[0].date,
  }));
  ok(appt.added && appt.editing && appt.date === (await page.evaluate(() => PHP.todayISO())), 'Log Appointment adds the section and a dated entry');
  await page.click('#homeBtn');
  await wait(200);

  // Settings
  await clickText(page, '#homeView .settings-open', 'Settings');
  const opts = await page.$$eval('#settingsDialog .setting b', (bs) => bs.map((b) => b.textContent));
  ok(opts.join() === 'Save a backup,Restore from backup,Replay the tutorial,Load sample data,Erase everything', 'settings: ' + opts.join(', '));
  await page.screenshot({ path: OUT + '/home-5-settings.png' });
  await page.click('#eraseBtn');
  const conf = await page.evaluate(() => ({
    open: document.querySelector('#confirmDialog').open,
    t: document.querySelector('#confirmTitle').textContent,
    b: [...document.querySelectorAll('#confirmDialog button')].map((b) => b.textContent),
  }));
  ok(conf.open && conf.t === 'Are you sure?' && conf.b.join() === 'Cancel,Erase', 'erase asks Are you sure? with Cancel and Erase');
  await page.screenshot({ path: OUT + '/home-6-confirm.png' });
  await clickText(page, '#confirmDialog button', 'Cancel');
  await wait(100);
  ok(await page.evaluate(() => PHP.fullName(PHP._debug.state.data.basic.values) === 'Margaret Ellis'), 'Cancel keeps everything');
  await clickText(page, '#homeView .settings-open', 'Settings');
  await page.click('#eraseBtn');
  await clickText(page, '#confirmDialog button', 'Erase');
  await wait(200);
  ok((await page.$eval('#homePrimary', (e) => e.textContent)) === 'Get Started' && (await vis(page, '#homeView')), 'Erase wipes data and returns to Get Started');

  // Form header: Settings replaces Backup
  await page.goto(URL + '#form', { waitUntil: 'load' });
  ok(!(await page.$('#backupBtn')) && (await vis(page, '#formView .settings-open')) && (await vis(page, '#homeBtn')), 'form header has Home and Settings, no Backup');

  // Phone: panels take over the screen
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('php.profile.v1', JSON.stringify(PHP.sampleData())));
  await page.reload({ waitUntil: 'load' });
  await page.screenshot({ path: OUT + '/home-7-phone.png' });
  await clickText(page, '#homeView .settings-open', 'Settings');
  const r = await page.$eval('#settingsDialog', (d) => { const b = d.getBoundingClientRect(); return [b.width, b.height]; });
  ok(r[0] === 390 && r[1] === 844, 'settings fills the phone screen ' + r.join('x'));
  await page.screenshot({ path: OUT + '/home-8-phone-settings.png' });
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'no horizontal scroll on phone');

  ok(errors.length === 0, 'no console errors ' + JSON.stringify(errors));
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exitCode = fails ? 1 : 0;
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
