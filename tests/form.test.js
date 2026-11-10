const puppeteer = require('puppeteer-core');
const { BASE, CHROME, OUT } = require('./env');
const fs = require('fs');
const URL = BASE + '#form';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  const errors = [], external = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('request', (r) => { if (!r.url().startsWith(BASE) && !/^(data|blob):/.test(r.url())) external.push(r.url()); });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  const S = () => page.evaluate(() => JSON.parse(JSON.stringify(PHP._debug.state)));
  const labels = (sel) => page.$$eval(sel + ' .f:not([hidden]) > label, ' + sel + ' .f:not([hidden]) > .lbl, ' + sel + ' .f:not([hidden]) .check', (ls) => ls.map((l) => l.textContent.trim()));
  const open = (id) => page.evaluate((id) => { const t = document.querySelector('#sec-' + id + ' .sec-toggle'); if (t.getAttribute('aria-expanded') === 'false') t.click(); }, id);
  const clickText = (sel, text) => page.evaluate((sel, text) => [...document.querySelectorAll(sel)].find((b) => b.textContent.trim() === text).click(), sel, text);

  // Order, with Notes & Questions last even after adding a section
  let order = await page.$$eval('.sec', (els) => els.map((e) => e.id.slice(4)));
  ok(order.join() === 'basic,conditions,lifestyle,family,meds,surgeries,allergies,providers,insurance,emergency,notes', 'section order: ' + order.join(','));
  await page.evaluate(() => [...document.querySelectorAll('.add-opt')].find((b) => b.querySelector('b').textContent === 'Hearing').click());
  order = await page.$$eval('.sec', (els) => els.map((e) => e.id.slice(4)));
  ok(order[order.length - 1] === 'notes' && order.includes('hearing'), 'Notes & Questions stays last after adding a section');
  const addable = await page.$$eval('.add-opt b', (bs) => bs.map((b) => b.textContent));
  ok(addable.includes('Vision') && addable.includes('Dental') && !addable.some((t) => /Vision, Hearing/.test(t)), 'Vision, Hearing and Dental are separate sections');
  ok((await page.$eval('#addSection h2', (x) => x.textContent)) === 'Additional Sections' && addable.length === 11 && addable.includes('Immunizations') && addable.includes('Reproductive Health'), 'Additional Sections shows all 11 optional sections');
  const rows = await page.$$eval('.add-opt', (ts) => {
    const gw = Math.round(document.querySelector('#addGrid').getBoundingClientRect().width);
    return ts.map((t) => ({ w: Math.round(t.getBoundingClientRect().width), gw, order: [...t.children].map((c) => c.className || c.tagName) }));
  });
  ok(rows.every((r) => r.w === r.gw) && rows.every((r) => r.order.join() === 'state,B,blurb'), 'each additional section is a full-width row: Add, title, description');
  ok((await page.$eval('#formView .brand', (b) => !!b.querySelector('img.brand-icon') && b.textContent.trim() === 'Personal Health Profile')) && !(await page.$('#formView .btn#homeBtn')), 'form bar shows the icon beside the title, no Home button');
  ok(!(await page.evaluate(() => document.body.innerText.includes('Download PDF'))), 'no "Download PDF" wording left');
  ok((await page.$eval('.add-opt.added', (t) => t.innerText)).includes('Added'), 'an added section is marked Added');
  const navLast = await page.$$eval('#nav .nav-link', (ls) => ls[ls.length - 1].textContent);
  ok(navLast === 'Additional Sections', 'side menu ends with Additional Sections');
  await (await page.$('#addSection')).screenshot({ path: OUT + '/v6-additional-sections.png' });

  // Basic information
  const basic = await labels('#sec-basic');
  ok(!basic.includes('Primary language') && ['Height', 'Weight', 'Preferred name', 'Marital status', 'Organ donor'].every((l) => basic.includes(l)), 'basic info: ' + basic.join(', '));
  const [ft, inch] = await page.$$('#sec-basic .height input');
  await ft.type('5'); await inch.type('6x');
  const weight = await page.evaluateHandle(() => [...document.querySelectorAll('#sec-basic .f')].find((f) => (f.querySelector('label') || {}).textContent === 'Weight').querySelector('input'));
  await weight.type('15o2');
  let v = (await S()).data.basic.values;
  ok(v.height === '5-6' && v.weight === '152', `height and weight saved as numbers: ${v.height} / ${v.weight}`);

  // Phone formatting and "Other" boxes still work
  const phone = await page.$('#sec-basic input[type=tel]');
  await phone.type('4345550142');
  ok((await phone.evaluate((i) => i.value)) === '(434) 555-0142', 'phone formatted');
  const sels = await page.$$('#sec-basic select');
  await sels[sels.length - 1].select('Other');
  await page.keyboard.type('Ontario');
  ok((await S()).data.basic.values.stateOther === 'Ontario', 'Other opens a text box');

  // Lifestyle questionnaire reveals follow-ups
  await open('lifestyle');
  const ls = '#sec-lifestyle';
  ok((await page.$$eval(ls + ' .f.heading h3', (hs) => hs.map((x) => x.textContent))).join() === 'Habits,Activity & sleep,Work & home', 'lifestyle grouped into topics');
  let lsl = await labels(ls);
  ok(!lsl.includes('Year you quit') && !lsl.includes('What do you do?') && !lsl.includes('What kind of trouble?'), 'follow-up questions hidden at first');
  const lsSel = async (labelText, value) => page.evaluate((ls, labelText, value) => {
    const f = [...document.querySelectorAll(ls + ' .f')].find((x) => x.querySelector('label') && x.querySelector('label').textContent === labelText);
    const s = f.querySelector('select'); s.value = value; s.dispatchEvent(new Event('change'));
  }, ls, labelText, value);
  await lsSel('Do you use tobacco?', 'Used to');
  await lsSel('How physically active are you?', 'Moderately active');
  await lsSel('Work status', 'Retired');
  await clickText(ls + ' .check', 'Trouble sleeping');
  lsl = await labels(ls);
  ok(['Year you quit', 'What do you do?', 'Days per week', 'Former occupation', 'What kind of trouble?'].every((l) => lsl.includes(l)), 'answers open the right follow-ups');
  ok(['How well do you sleep?', 'How would you rate your stress?'].every((l) => lsl.includes(l)), 'sleep and stress questions present');

  // Medical History questionnaire
  await open('conditions');
  const cs = '#sec-conditions';
  ok((await page.$eval(cs + ' .q-prompt', (p) => p.textContent)).startsWith('Have you ever been diagnosed'), 'Medical History opens with a questionnaire');
  ok((await page.$eval(cs + ' h2', (x) => x.textContent)) === 'Medical History' && !(await page.$('#sec-dxhistory')), 'conditions and diagnosis history merged');
  await clickText(cs + ' .q-grid .check', 'Diabetes');
  await clickText(cs + ' .q-grid .check', 'Asthma');
  let c = (await S()).data.conditions.lists.main;
  ok(c.length === 2 && c[0].q === 'Diabetes' && c[0].name === 'Diabetes', 'checking adds the condition to the list');
  ok((await page.$$(cs + ' .entry')).length === 2, 'checked conditions appear as cards');
  await clickText(cs + ' .q-grid .check', 'Asthma');
  ok((await S()).data.conditions.lists.main.length === 1, 'unchecking removes it');
  await page.click(cs + ' .entry .edit');
  const cfields = await labels(cs + ' .entry.editing');
  ok(cfields[0] === 'Current condition' && !cfields.includes('Managed by') && !cfields.includes('Date resolved'), 'condition fields: ' + cfields.join(', '));
  await page.click(cs + ' .entry.editing .checkf input');
  ok((await labels(cs + ' .entry.editing')).includes('Date resolved'), 'unchecking Current condition shows Date resolved');
  await page.click(cs + ' .entry.editing .btn.primary');
  ok(!!(await page.$(cs + ' .group-title')) && (await page.$eval(cs + ' .summary', (s) => s.textContent)) === '1 past', 'resolved condition moves to Past');
  ok(await page.$eval(cs + ' .q-grid input[data-q="Diabetes"]', (i) => i.checked), 'checklist stays checked for a past condition');

  // Medications: checkbox first, no "For"
  await open('meds');
  await page.click('#sec-meds .btn.add');
  await page.keyboard.type('Aspirin');
  const mfields = await labels('#sec-meds .entry.editing');
  ok(mfields[0] === 'Currently taking' && !mfields.includes('For'), 'medication fields: ' + mfields.join(', '));
  ok((await S()).data.meds.lists.main[0].name === 'Aspirin', 'typing starts in the first text box');
  ok(['Prescription or over-the-counter', 'Strength', 'Unit', 'Form', 'How much each time', 'How often', 'Pharmacy', 'Last filled', 'Refills left'].every((l) => mfields.includes(l)), 'medication details: type, strength, unit, form, amount, frequency, pharmacy, refills');
  const medSel = (label) => page.evaluateHandle((label) => [...document.querySelectorAll('#sec-meds .entry.editing .f')].find((f) => (f.querySelector('label') || {}).textContent === label).querySelector('select'), label);
  const freqOpts = await (await medSel('How often')).evaluate((s) => [...s.options].map((o) => o.value).filter(Boolean));
  ok(['Once daily', 'Twice daily', 'As needed', 'Other'].every((o) => freqOpts.includes(o)), 'frequency dropdown: ' + freqOpts.join(', '));
  ok(!(await labels('#sec-meds .entry.editing')).includes('Take it for'), '"Take it for" hidden until As needed');
  await (await medSel('How often')).select('As needed');
  ok((await labels('#sec-meds .entry.editing')).includes('Take it for'), 'As needed asks what it is taken for');
  await (await medSel('Unit')).select('mg');
  await (await medSel('Form')).select('Tablet');
  const med = (await S()).data.meds.lists.main[0];
  ok(med.freq === 'As needed' && med.unit === 'mg' && med.form === 'Tablet', 'medication dropdowns saved');
  await page.click('#sec-meds .entry.editing .btn.primary');

  // Immunizations: an additional section with a vaccine dropdown and "Administered at"
  ok(!(await page.$('#sec-immunizations')), 'Immunizations is not shown until added');
  await page.evaluate(() => [...document.querySelectorAll('.add-opt')].find((b) => b.querySelector('b').textContent === 'Immunizations').click());
  ok(!!(await page.$('#sec-immunizations')) && (await page.$eval('#sec-immunizations', (s) => s.classList.contains('open'))), 'adding Immunizations opens it');
  await page.click('#sec-immunizations .btn.add');
  const vopts = await page.$$eval('#sec-immunizations .entry.editing select option', (os) => os.map((o) => o.value));
  const ifields = await labels('#sec-immunizations .entry.editing');
  ok(vopts.includes('Shingles (Shingrix)') && vopts.includes('Other') && ifields.includes('Administered at'), 'vaccine dropdown and Administered at: ' + ifields.join(', '));
  await page.select('#sec-immunizations .entry.editing select', 'RSV');
  await page.click('#sec-immunizations .entry.editing .btn.primary');

  // Allergies checklist
  await open('allergies');
  const al = '#sec-allergies';
  const choices = await page.$$eval(al + ' .choice > .check', (cs) => cs.map((x) => x.textContent.trim()));
  ok(choices.includes('Penicillin') && choices.includes('Latex') && choices[choices.length - 1] === 'Other', 'allergy checklist: ' + choices.length + ' choices');
  ok(!(await page.$(al + ' .choice-detail')), 'no details until something is checked');
  await clickText(al + ' .choice > .check', 'Penicillin');
  const afields = await labels(al + ' .choice.checked');
  ok(afields.join() === 'Severity,Reaction,Notes', 'checking opens severity, reaction, notes: ' + afields.join(', '));
  ok((await page.evaluate(() => document.activeElement.tagName)) === 'SELECT', 'cursor moves to the details');
  await page.select(al + ' .choice.checked select', 'Severe');
  const rsel = (await page.$$(al + ' .choice.checked select'))[1];
  await rsel.select('Other');
  await page.keyboard.type('Swollen lips');
  await clickText(al + ' .choice > .check', 'Other');
  await page.keyboard.type('Strawberries');
  await clickText(al + ' .choice.checked .btn.add', '+ Add another allergy');
  await page.keyboard.type('Adhesive tape');
  let a = (await S()).data.allergies.lists.main;
  ok(a.length === 3 && a[0].severity === 'Severe' && a[0].reactionOther === 'Swollen lips' && a[1].name === 'Strawberries' && a[2].name === 'Adhesive tape', 'details, Other and Add another saved');
  ok((await page.$eval(al + ' .summary', (s) => s.textContent)) === '3 allergies', 'allergy count');
  await clickText(al + ' .choice > .check', 'Penicillin');
  await wait(100);
  ok((await S()).data.allergies.lists.main.length === 2 && !!(await page.$('.toast')), 'unchecking removes it, with Undo');

  // Providers: address split, autofill copies all parts
  await open('providers');
  const pv = '#sec-providers .entry.editing';
  await page.click('#sec-providers .btn.add');
  const pfields = await labels(pv);
  ok(pfields[0] === 'Currently seeing' && pfields[1] === 'Prefix' && pfields[2] === 'Name' && pfields[3] === 'Credentials', 'prefix, name, then credentials: ' + pfields.slice(0, 4).join(', '));
  const specOpts = await page.$$eval(pv + ' select', (ss) => [...ss].map((s) => [...s.options].map((o) => o.value)).find((o) => o.includes('Primary care')));
  ok(specOpts.includes('Pharmacy'), 'Pharmacy is a provider type');
  const prefixOpts = await page.$$eval(pv + ' select', (ss) => [...ss[0].options].map((o) => o.value).filter(Boolean));
  ok(prefixOpts[0] === 'Dr.' && prefixOpts.includes('Other'), 'prefix options: ' + prefixOpts.join(', '));
  ok(['Street address', 'Suite or unit', 'City', 'State', 'ZIP code'].every((l) => pfields.includes(l)) && !pfields.includes('Address'), 'provider address in parts');
  await (await page.$(pv + ' select')).select('Dr.');
  await (await page.evaluateHandle((pv) => [...document.querySelectorAll(pv + ' .f')].find((f) => (f.querySelector('label') || {}).textContent === 'Name').querySelector('input'), pv)).type('One');
  const pInput = (label) => page.evaluateHandle((pv, label) => [...document.querySelectorAll(pv + ' .f')].find((f) => f.querySelector('label') && f.querySelector('label').textContent === label).querySelector('input, select'), pv, label);
  await (await pInput('Office')).type('Hill Clinic');
  await (await pInput('Street address')).type('1 Hill St');
  await (await pInput('City')).type('Crozet');
  await (await pInput('State')).select('VA');
  await page.click(pv + ' .btn.primary');
  await page.click('#sec-providers .btn.add');
  await page.keyboard.type('Dr. Two');
  await (await pInput('Office')).type('hill clinic');
  const auto = await page.evaluate((pv) => [...document.querySelectorAll(pv + ' .f')].filter((f) => /Street|City|State/.test((f.querySelector('label') || {}).textContent)).map((f) => f.querySelector('input,select').value), pv);
  ok(auto.join() === '1 Hill St,Crozet,VA', 'office autofills every address part: ' + auto.join(', '));
  await page.click(pv + ' .btn.primary');

  // Family history: relative first, then any number of conditions
  await open('family');
  const fm = '#sec-family .entry.editing';
  await page.click('#sec-family .btn.add');
  const ffields = await labels(fm);
  ok(ffields[0] === 'Relative' && ffields[1] === 'Status' && ffields.indexOf('Condition') > 1, 'relative details come before conditions: ' + ffields.join(', '));
  const relOpts = await page.$eval(fm + ' select', (s) => [...s.options].map((o) => o.value).filter(Boolean));
  ok(relOpts.includes('Mother') && relOpts.includes('Maternal grandmother') && relOpts[relOpts.length - 1] === 'Other', 'relative dropdown with Other');
  await page.select(fm + ' select', 'Father');
  await (await page.$$(fm + ' select'))[1].select('Deceased');
  ok((await labels(fm)).includes('Age at death'), 'Deceased asks age at death');
  await (await page.$(fm + ' .group-item input')).type('Stroke');
  await clickText(fm + ' .btn.add', '+ Add another condition');
  ok((await page.$$(fm + ' .group-item')).length === 2, 'Add another condition adds a second one');
  await page.keyboard.type('Gout');
  const fam = (await S()).data.family.lists.main[0];
  ok(fam.rel === 'Father' && fam.conditions.length === 2 && fam.conditions[0].name === 'Stroke' && fam.conditions[1].name === 'Gout', 'conditions saved for one relative');
  await page.click(fm + ' .btn.primary');
  ok((await page.$eval('#sec-family .entry-sum', (e) => e.innerText)).includes('Stroke, Gout'), 'summary lists the conditions');
  // Removing a condition can be undone
  await page.click('#sec-family .entry .edit');
  await clickText(fm + ' .link.danger', 'Remove condition');
  ok((await S()).data.family.lists.main[0].conditions.length === 1 && !!(await page.$('.toast button')), 'removing a condition offers Undo');
  await page.click('.toast button');
  await wait(100);
  ok((await S()).data.family.lists.main[0].conditions.map((c) => c.name).join() === 'Stroke,Gout', 'Undo brings the condition back');

  // Reproductive Health follows the sex chosen in Basic Information
  await page.evaluate(() => [...document.querySelectorAll('.add-opt')].find((b) => b.querySelector('b').textContent === 'Reproductive Health').click());
  const rp = await labels('#sec-reproductive');
  ok(['Number of pregnancies', 'Have you gone through menopause?', 'Last mammogram', 'Last Pap test', 'Last prostate screening (PSA)'].every((l) => rp.includes(l)), 'all questions shown when sex is not Female or Male');
  await page.evaluate(() => { PHP._debug.state.data.basic.values.sex = 'Male'; });
  const male = await page.evaluate(() => { const s = PHP.SECTIONS.find((x) => x.id === 'reproductive'); return PHP.visibleFields(s.fields, {}).map((f) => f.label); });
  ok(male.includes('Last prostate screening (PSA)') && !male.includes('Number of pregnancies') && !male.includes('Last mammogram'), 'Male shows prostate screening, not pregnancy or mammogram');
  await page.evaluate(() => { PHP._debug.state.data.basic.values.sex = 'Female'; });
  const female = await page.evaluate(() => { const s = PHP.SECTIONS.find((x) => x.id === 'reproductive'); return PHP.visibleFields(s.fields, {}).map((f) => f.label); });
  ok(!female.includes('Last prostate screening (PSA)') && female.includes('Number of pregnancies'), 'Female shows pregnancy, not prostate screening');
  await page.evaluate(() => { PHP._debug.state.data.basic.values.sex = ''; });

  // Emergency contacts have notes
  await open('emergency');
  await page.click('#sec-emergency .btn.add');
  ok((await labels('#sec-emergency .entry.editing')).includes('Notes'), 'emergency contacts have Notes');

  // Data from every earlier version is converted
  await wait(700);
  await page.evaluate(() => localStorage.setItem('php.profile.v1', JSON.stringify({
    v: 2,
    data: {
      basic: { values: { first: 'Ann', lang: 'English' } },
      conditions: { lists: { main: [{ id: 'c1', name: 'Diabetes', by: 'Dr. Lee' }, { id: 'c2', name: 'Gout' }] } },
      dxhistory: { lists: { main: [{ id: 'c3', name: 'Shingles', resolved: '2019--' }] } },
      meds: { lists: { main: [{ id: 'm1', name: 'Aspirin', purpose: 'Heart', current: true }, { id: 'm2', name: 'Lasix', dose: '40 mg', freq: 'once daily' }, { id: 'm3', name: 'Insulin', dose: '10 units at night', freq: 'Twice daily with meals' }] } },
      allergies: { lists: { main: [{ id: 'a1', name: 'penicillin', reaction: 'Hives', severity: 'Severe' }, { id: 'a2', name: 'Strawberries' }] } },
      immunizations: { lists: { main: [{ id: 'i1', name: 'Flu', where: 'CVS' }, { id: 'i2', name: 'Yellow fever', notes: 'Given at: Travel clinic\nBooster not needed' }] } },
      family: { lists: { main: [{ id: 'f1', rel: 'mother', name: 'Diabetes', age: '60', status: 'Living' }, { id: 'f2', rel: 'Mother', name: 'Glaucoma', status: 'Living' }, { id: 'f3', rel: 'Great-uncle', name: 'Gout' }] } },
      providers: { lists: { main: [{ id: 'p1', name: 'Dr. Lee', address: '9 Elm St\nRichmond, VA 23220', current: true }, { id: 'p2', name: 'Sam Rivera, PA-C' }, { id: 'p3', name: 'Jo Park MD' }] } },
      lifestyle: { values: { smoking: 'Former', exercise: 'Regular', exerciseDesc: 'Swimming', diet: 'Keto', caregiver: 'Jane' } },
      senses: { values: { glasses: 'Yes', hearing: 'No', dental: '2025-01-', notes: 'Bifocals' } },
    },
    added: ['senses'], open: { dxhistory: true },
  })));
  await page.reload({ waitUntil: 'load' });
  const st = await S();
  const m = st.data;
  ok(m.conditions.lists.main.length === 3 && !m.dxhistory && m.conditions.lists.main[0].q === 'Diabetes' && /Managed by: Dr. Lee/.test(m.conditions.lists.main[0].notes) && m.conditions.lists.main[2].current === false, 'conditions and diagnosis history merged, Managed by kept in notes');
  ok(!('purpose' in m.meds.lists.main[0]) && m.meds.lists.main[0].notes === 'For: Heart', 'medication For moved to notes');
  const [, lasix, insulin] = m.meds.lists.main;
  ok(lasix.strength === '40' && lasix.unit === 'mg' && lasix.freq === 'Once daily' && !('dose' in lasix), 'typed "40 mg" becomes strength and unit; frequency matched');
  ok(insulin.amount === '10 units at night' && insulin.freq === 'Other' && insulin.freqOther === 'Twice daily with meals', 'unmatched dose and frequency are kept word for word');
  ok(m.allergies.lists.main[0].q === 'Penicillin' && m.allergies.lists.main[0].reaction === 'Hives or rash' && m.allergies.lists.main[1].q === 'Other', 'allergies linked to the checklist');
  const im = m.immunizations.lists.main;
  ok(im[0].name === 'Flu (influenza)' && im[0].location === 'CVS' && !im[0].notes && im[1].nameOther === 'Yellow fever' && im[1].location === 'Travel clinic' && im[1].notes === 'Booster not needed', 'Given at becomes Administered at, including notes from the last update');
  ok(m.providers.lists.main[0].prefix === 'Dr.' && m.providers.lists.main[0].name === 'Lee', 'a title in a provider name becomes the prefix');
  const [, sam, jo] = m.providers.lists.main;
  ok(sam.name === 'Sam Rivera' && sam.credentials === 'PA-C' && jo.name === 'Jo Park' && jo.credentials === 'MD', 'credentials typed after a name move to their own box');
  const fmig = m.family.lists.main;
  ok(fmig.length === 2 && fmig[0].rel === 'Mother' && fmig[0].conditions.map((c) => c.name).join() === 'Diabetes,Glaucoma' && fmig[1].rel === 'Other' && fmig[1].relOther === 'Great-uncle', 'family entries grouped by relative: ' + JSON.stringify(fmig.map((e) => [e.rel, (e.conditions || []).length])));
  ok(m.providers.lists.main[0].street === '9 Elm St' && m.providers.lists.main[0].zip === '23220' && !('address' in m.providers.lists.main[0]), 'provider address split');
  ok(m.lifestyle.values.smoking === 'Used to' && m.lifestyle.values.activity === 'Moderately active' && m.lifestyle.values.dietOther === 'Keto' && m.lifestyle.values.caregiverName === 'Jane', 'lifestyle answers carried over');
  ok(!m.senses && m.vision.values.notes === 'Bifocals' && m.hearing.values.aids === 'No' && m.dental.values.dental === '2025-01-' && ['vision', 'hearing', 'dental'].every((id) => st.added.includes(id)), 'vision, hearing and dental split');
  ok(st.added.includes('immunizations'), 'anyone with vaccines entered keeps the Immunizations section');
  ok(await page.evaluate(() => document.querySelector('#sec-conditions').classList.contains('open')), 'open sections remembered');

  // Sample data + PDF
  await page.evaluate(() => localStorage.setItem('php.profile.v1', JSON.stringify(PHP.sampleData())));
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(() => PHP.SECTIONS.forEach((s) => { const t = document.querySelector('#sec-' + s.id + ' .sec-toggle'); if (t && t.getAttribute('aria-expanded') === 'false') t.click(); }));
  for (const id of ['basic', 'lifestyle', 'conditions', 'allergies', 'family', 'immunizations']) {
    const el = await page.$('#sec-' + id);
    await el.screenshot({ path: OUT + '/v4-' + id + '.png' });
  }
  await page.click('#sec-family .entry .edit');
  await (await page.$('#sec-family')).screenshot({ path: OUT + '/v5-family-edit.png' });
  await page.click('#sec-family .entry.editing .btn.primary');
  await page.click('#sec-providers .entry .edit');
  await (await page.$('#sec-providers')).screenshot({ path: OUT + '/v4-providers.png' });
  await page.evaluate(() => [...document.querySelectorAll('#sec-meds .entry')].find((e) => e.innerText.startsWith('Acetaminophen')).querySelector('.edit').click());
  await (await page.$('#sec-meds')).screenshot({ path: OUT + '/v7-meds-edit.png' });
  const pharmacies = await page.$$eval('#sec-meds .entry.editing datalist option', (os) => os.map((o) => o.value));
  ok(pharmacies.includes('Main Street Pharmacy'), 'medication Pharmacy box suggests pharmacies from Providers');
  await page.click('#sec-meds .entry.editing .btn.primary');
  await (await page.$('#sec-reproductive')).screenshot({ path: OUT + '/v7-reproductive.png' });

  const b64 = await page.evaluate(() => PHP.buildPdf(PHP._debug.state, PHP.SECTIONS.map((s) => s.id), { save: false }).output('datauristring').split(',')[1]);
  fs.writeFileSync(OUT + '/sample.pdf', Buffer.from(b64, 'base64'));
  // Short sections are not split across pages: Lifestyle's heading and its last row land on the same page
  const lifestylePages = await page.evaluate(() => {
    const doc = PHP.buildPdf(PHP._debug.state, PHP.SECTIONS.map((s) => s.id), { save: false });
    const pages = doc.internal.pages.slice(1).map((p) => p.join('\n'));
    return [pages.findIndex((p) => p.includes('(Lifestyle & Social)')), pages.findIndex((p) => p.includes('(Daytime only)'))];
  });
  ok(lifestylePages[0] >= 0 && lifestylePages[0] === lifestylePages[1], 'Lifestyle is not split across pages: ' + lifestylePages.join(' / '));

  // Timeline page: landscape, at the end, built from conditions, medications and procedures
  const tl = await page.evaluate(() => {
    const all = PHP.SECTIONS.map((s) => s.id);
    const without = PHP.buildPdf(PHP._debug.state, all, { save: false }).getNumberOfPages();
    const doc = PHP.buildPdf(PHP._debug.state, all, { save: false, timeline: true });
    const n = doc.getNumberOfPages();
    // Page 2 (right after Basic Information) is the landscape timeline; every other page is portrait
    const shapes = [];
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      shapes.push(doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight() ? 'L' : 'P');
    }
    const landscape = shapes[1] === 'L' && shapes.filter((x) => x === 'L').length === 1;
    const page2 = doc.internal.pages[2].join('\n');
    const afterBasic = page2.includes('(Health Timeline)') && doc.internal.pages[1].join('\n').includes('(Basic Information)');
    const data = PHP.timelineData(PHP._debug.state, all);
    const noMeds = PHP.timelineData(PHP._debug.state, all.filter((id) => id !== 'meds'));
    return {
      added: n - without,
      landscape,
      afterBasic,
      groups: data.groups.map((g) => `${g.title}:${g.items.length}`),
      undated: data.undated,
      noMeds: noMeds.groups.map((g) => g.title),
      b64: doc.output('datauristring').split(',')[1],
    };
  });
  fs.writeFileSync(OUT + '/timeline.pdf', Buffer.from(tl.b64, 'base64'));
  ok(tl.landscape && tl.afterBasic, 'timeline is the landscape page right after Basic Information');
  ok(tl.added >= 1 && tl.added <= 2, 'timeline adds its page (and a fresh page for the sections after it): ' + tl.added);
  ok(tl.groups.join() === 'Conditions:4,Medications:5,Surgeries & Procedures:2', 'timeline rows: ' + tl.groups.join(', '));
  ok(tl.undated.join() === 'Acetaminophen', 'items without a start date are listed, not drawn: ' + tl.undated.join(', '));
  ok(!tl.noMeds.includes('Medications'), 'timeline follows the chosen sections');

  // Emergency summary and wallet card fit on one page each
  for (const [fn, file] of [['buildEmergencyPdf', 'emergency.pdf'], ['buildWalletPdf', 'wallet.pdf']]) {
    const out = await page.evaluate((fn) => { const d = PHP[fn](PHP._debug.state, { save: false }); return { pages: d.getNumberOfPages(), b64: d.output('datauristring').split(',')[1] }; }, fn);
    fs.writeFileSync(OUT + '/' + file, Buffer.from(out.b64, 'base64'));
    ok(out.pages === 1, `${file} is one page`);
  }

  // Mobile
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(() => document.querySelector('#sec-allergies').scrollIntoView());
  await page.screenshot({ path: OUT + '/v4-mobile-allergies.png' });
  await page.evaluate(() => document.querySelector('#addSection').scrollIntoView());
  await page.screenshot({ path: OUT + '/v6-mobile-additional.png' });
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'no horizontal scroll on mobile');

  ok(errors.length === 0, 'no console errors ' + JSON.stringify(errors));
  ok(external.length === 0, 'no external requests ' + JSON.stringify(external));
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exitCode = fails ? 1 : 0;
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
