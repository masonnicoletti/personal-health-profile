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
  const icon = await page.$eval('#homeView .topbar img.brand-icon', (i) => {
    const r = i.getBoundingClientRect();
    const bar = i.closest('.topbar-inner').getBoundingClientRect();
    return { loaded: i.complete && i.naturalWidth > 0, left: r.left - bar.left < 40 };
  });
  ok(icon.loaded && icon.left, 'home bar shows the icon at the top left');

  await page.click('#homePrimary');
  ok((await vis(page, '#formView')) && (await page.$eval('#tourDialog', (d) => d.open)), 'Get Started opens the form, then the tutorial on top of it');
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

  // Privacy, from the menu bar
  const homeBar = await page.$$eval('#homeView .topbar button', (bs) => bs.map((b) => b.textContent));
  ok(homeBar.join() === 'Instructions,Privacy,Settings', 'home menu bar: ' + homeBar.join(', '));
  await clickText(page, '#homeView .privacy-open', 'Privacy');
  const priv = await page.$$eval('#privacyDialog h3', (hs) => hs.map((x) => x.textContent));
  ok((await page.$eval('#privacyDialog', (d) => d.open)) && priv.length === 5 && priv[0] === 'Your information stays with you', 'privacy panel: ' + priv.length + ' points');
  await page.screenshot({ path: OUT + '/home-9-privacy.png' });
  const privText = await page.$eval('#privacyDialog .privacy-text', (e) => e.innerText);
  ok(!/\b(we|us|our)\b/i.test(privText), 'privacy text avoids "we" and "us"');
  await clickText(page, '#privacyDialog button', 'Close');

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
  ok(sec.join() === 'Log Appointment,Add a Note,Save PDF', 'secondary options: ' + sec.join(', '));
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
  ok(opts.join() === 'Save a backup,Restore from backup,Share this site,Replay the tutorial,Load sample data,Erase everything', 'settings: ' + opts.join(', '));

  // Share this site: link only, ready-made for text, email and social apps
  await page.click('#shareBtn');
  const sh = await page.evaluate(() => ({
    open: document.querySelector('#shareDialog').open,
    url: document.querySelector('#shareUrl').value,
    sms: document.querySelector('#shareText').href,
    mail: document.querySelector('#shareEmail').href,
    fb: document.querySelector('#shareFacebook').href,
    x: document.querySelector('#shareX').href,
    wa: document.querySelector('#shareWhatsApp').href,
  }));
  const site = URL.split('#')[0];
  ok(sh.open && sh.url === site && !sh.url.includes('#'), 'share link is the site address: ' + sh.url);
  ok(sh.sms.startsWith('sms:') && sh.mail.startsWith('mailto:') && sh.fb.includes(encodeURIComponent(site)) && sh.x.includes('twitter.com/intent') && sh.wa.startsWith('https://wa.me/'), 'text, email and social links prepared');
  ok(!/Margaret|Ellis|Lisinopril/.test(Object.values(sh).join(' ')), 'no personal information in shared links');
  await page.browserContext().overridePermissions(site, ['clipboard-read', 'clipboard-write']);
  await page.click('#shareCopy');
  await wait(100);
  ok((await page.$eval('#shareCopy', (b) => b.textContent)) === 'Copied' && (await page.evaluate(() => navigator.clipboard.readText())) === site, 'Copy link copies the address');
  await page.screenshot({ path: OUT + '/home-11-share.png' });
  await clickText(page, '#shareDialog button', 'Close');
  await clickText(page, '#homeView .settings-open', 'Settings');
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
  ok(await vis(page, '#formView .privacy-open'), 'form header has Privacy');

  // PDF preview draws every page before downloading
  await page.evaluate(() => localStorage.setItem('php.profile.v1', JSON.stringify(PHP.sampleData())));
  await page.reload({ waitUntil: 'load' });
  await clickText(page, '#formView .pdf-open', 'Save PDF');
  await page.click('#pdfPreview');
  await page.waitForFunction(() => /pages?$|could not/.test(document.querySelector('#previewStatus').textContent), { timeout: 30000 });
  const pv = await page.evaluate(() => ({
    status: document.querySelector('#previewStatus').textContent,
    canvases: document.querySelectorAll('#previewPages canvas').length,
    drawn: [...document.querySelectorAll('#previewPages canvas')].every((c) => c.width > 300 && c.height > 300),
  }));
  ok(pv.canvases >= 3 && pv.drawn && pv.status === pv.canvases + ' pages', 'preview shows every page: ' + JSON.stringify(pv));
  await page.screenshot({ path: OUT + '/home-10-preview.png' });
  await page.click('#previewBack');
  ok(await page.$eval('#pdfDialog', (d) => d.open), 'Back returns to the section choices');
  // Fewer sections means fewer pages
  await page.evaluate(() => document.querySelectorAll('#pdfChoices input').forEach((c) => (c.checked = c.value === 'meds')));
  await page.click('#pdfPreview');
  await page.waitForFunction(() => /^1 page$/.test(document.querySelector('#previewStatus').textContent), { timeout: 30000 });
  ok((await page.$$('#previewPages canvas')).length === 1, 'preview follows the chosen sections');
  await page.click('#previewBack');
  await clickText(page, '#pdfDialog button', 'Cancel');

  // Menu bar buttons: white with cerulean text; Save PDF stays solid cerulean
  const colors = await page.evaluate(() => {
    const st = (sel) => { const c = getComputedStyle(document.querySelector(sel)); return [c.backgroundColor, c.color]; };
    return { settings: st('#formView .settings-open'), privacy: st('#formView .privacy-open'), save: st('#formView .pdf-open') };
  });
  ok(colors.settings.join() === 'rgb(255, 255, 255),rgb(18, 48, 90)' && colors.privacy.join() === colors.settings.join(), 'menu bar buttons are white with dark blue text');
  ok(colors.save[0] === 'rgb(0, 123, 167)' && colors.save[1] === 'rgb(255, 255, 255)', 'Save PDF stays solid cerulean');

  // Phones: each menu bar stays on a single row
  for (const w of [320, 360, 375, 390, 430]) {
    await page.setViewport({ width: w, height: 800, isMobile: true, hasTouch: true });
    for (const view of ['home', 'form']) {
      await page.goto(URL + (view === 'form' ? '#form' : ''), { waitUntil: 'load' });
      const bar = await page.evaluate((view) => {
        const inner = document.querySelector(`#${view}View .topbar-inner`);
        const items = [...inner.querySelectorAll(':scope > img, :scope > .brand, .btn')].filter((e) => e.getClientRects().length);
        const tops = items.map((e) => Math.round(e.getBoundingClientRect().top));
        const right = Math.max(...items.map((e) => e.getBoundingClientRect().right));
        return { rows: new Set(tops.map((t) => Math.round(t / 10))).size, fits: right <= window.innerWidth, count: items.length };
      }, view);
      ok(bar.rows === 1 && bar.fits, `${view} menu bar fits on one row at ${w}px (${bar.count} items)`);
      if (w === 390) await page.screenshot({ path: `${OUT}/bar-${view}-390.png`, clip: { x: 0, y: 0, width: 390, height: 120 } });
    }
  }
  await page.setViewport({ width: 1280, height: 900 });

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
