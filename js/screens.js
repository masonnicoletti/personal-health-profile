/* Personal Health Profile: home screen, tutorial, settings, share and notices */
(function () {
  const PHP = window.PHP;
  const A = (PHP.app = PHP.app || {});
  const { $, h, uid, plural, nextId, blank, normalize, save, flush, sd, listArr, active, hasAnyData, snapshot, toast, getMeta, setMeta, btn, editing, fresh } = A;
  /* ---------- Screens: home and form ---------- */
  function showView(name) {
    const toForm = name === 'form';
    $('#homeView').hidden = toForm;
    $('#formView').hidden = !toForm;
    if (toForm) A.spy();
    else renderHome();
    window.scrollTo({ top: 0 });
  }
  function goForm() {
    if (location.hash !== '#form') history.pushState({ view: 'form', pushed: true }, '', '#form');
    showView('form');
  }
  function goHome() {
    flush();
    if (history.state && history.state.pushed) history.back(); // so the phone's back gesture stays in step
    else {
      history.replaceState(null, '', location.pathname + location.search);
      showView('home');
    }
  }
  window.addEventListener('popstate', () => showView(location.hash === '#form' ? 'form' : 'home'));
  $('#homeBtn').addEventListener('click', goHome);

  function renderHome() {
    const has = hasAnyData();
    const first = String(sd('basic').values.first || '').trim();
    const sub = $('#homeSub');
    sub.textContent = has ? (first ? `Welcome back, ${first}.` : 'Welcome back.') : '';
    sub.hidden = !has;
    const primary = $('#homePrimary');
    primary.textContent = has ? 'Update Profile' : 'Get Started';
    // New users: open the form first, then walk through the tutorial on top of it
    primary.onclick = () => {
      goForm();
      if (!has) startTour(true);
    };
    $('#homeSecondary').replaceChildren(
      ...(has ? [btn('ghost', 'Log Appointment', () => quickAdd('appointments')), btn('ghost', 'Add a Note', () => quickAdd('notes')), btn('ghost', 'Save PDF', A.openPdf)] : [])
    );
    renderNotices();
  }

  // Jump straight to a new, dated entry in a section (adding the section if needed)
  function quickAdd(id) {
    const sec = PHP.sectionById(id);
    if (sec.optional && !A.state.added.includes(id)) A.state.added.push(id);
    A.state.open[id] = true;
    goForm();
    A.renderAll();
    const e = { id: uid(), date: PHP.todayISO() };
    fresh.add(e.id);
    listArr(id, sec.list.key).push(e);
    editing.add(e.id);
    save();
    A.rerender(id);
    document.getElementById('sec-' + id).scrollIntoView({ block: 'start' });
    A.focusFirst(e.id);
  }

  /* ---------- Tutorial and instructions ---------- */
  const STEPS = [
    { title: 'Welcome', text: 'Your Personal Health Profile keeps all of your health information in one place.' },
    { title: 'Fill in what you like', text: 'Go through the form at your own pace. Nothing is required, so skip anything you would rather leave out.' },
    {
      title: 'Save a PDF',
      text: 'When you are ready, tap Save PDF at the top. Choose which sections to include, so you can make different versions to bring to appointments or share with family.',
    },
    { title: 'Come back anytime', text: 'Everything saves automatically on this device. Open the app whenever you want to make changes.' },
  ];
  const MORE_STEPS = [
    { title: 'Keep a backup', text: 'In Settings, choose Save a backup to keep a copy of your information somewhere safe.' },
    { title: 'Add it to your Home Screen', text: 'On iPhone or iPad, tap Share, then Add to Home Screen. On Android, open the browser menu and choose Install app.' },
  ];

  const tour = $('#tourDialog');
  let tourStep = 0;
  let firstRun = false;
  function showStep() {
    const s = STEPS[tourStep];
    const last = tourStep === STEPS.length - 1;
    $('#tourCount').textContent = `${tourStep + 1} of ${STEPS.length}`;
    $('#tourTitle').textContent = s.title;
    $('#tourText').textContent = s.text;
    $('#tourNext').textContent = last ? (firstRun ? 'Start' : 'Done') : 'Next';
  }
  function startTour(first) {
    tourStep = 0;
    firstRun = first;
    showStep();
    tour.showModal();
    $('#tourNext').focus();
  }
  $('#tourNext').addEventListener('click', () => {
    if (tourStep < STEPS.length - 1) {
      tourStep++;
      showStep();
      $('#tourNext').focus();
    } else tour.close();
  });

  $('#instrSteps').replaceChildren(...STEPS.concat(MORE_STEPS).map((s) => h('li', {}, h('b', { text: s.title }), h('p', { text: s.text }))));
  $('#instrBtn').addEventListener('click', () => $('#instrDialog').showModal());
  document.querySelectorAll('.privacy-open').forEach((b) => b.addEventListener('click', () => $('#privacyDialog').showModal()));

  /* ---------- Pop-up confirmation ---------- */
  function askConfirm(title, text, okLabel, danger) {
    const d = $('#confirmDialog');
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    const ok = $('#confirmOk');
    ok.textContent = okLabel;
    ok.classList.toggle('danger', !!danger);
    d.returnValue = '';
    d.showModal();
    $('#confirmDialog .btn.ghost').focus(); // Cancel is the safe default
    return new Promise((resolve) => d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true }));
  }

  /* ---------- Settings ---------- */
  function download(blob, name) {
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  function replaceState(next, msg) {
    snapshot();
    A.state = next;
    editing.clear();
    fresh.clear();
    save();
    A.renderAll();
    window.scrollTo({ top: 0 });
    toast(msg, true);
  }

  const settings = $('#settingsDialog');
  const dayOf = (ts) => {
    const t = new Date(ts);
    return [t.getFullYear(), String(t.getMonth() + 1).padStart(2, '0'), String(t.getDate()).padStart(2, '0')].join('-');
  };
  function openSettings() {
    const m = getMeta();
    $('#lastBackup').textContent = m.lastBackup ? 'Last saved ' + PHP.fmtDate(dayOf(m.lastBackup)) + '.' : 'Download a copy of your information.';
    settings.showModal();
  }
  document.querySelectorAll('.settings-open').forEach((b) => b.addEventListener('click', openSettings));

  function exportBackup() {
    if (settings.open) settings.close();
    flush();
    const payload = JSON.stringify({ ...A.state, app: 'Personal Health Profile', exported: new Date().toISOString() }, null, 2);
    download(new Blob([payload], { type: 'application/json' }), `health-profile-backup-${PHP.todayISO()}.json`);
    setMeta({ lastBackup: Date.now() });
    renderNotices();
    toast('Backup file saved.');
  }
  $('#exportBtn').addEventListener('click', exportBackup);
  $('#importBtn').addEventListener('click', () => {
    settings.close();
    $('#importFile').click();
  });
  $('#importFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      replaceState(normalize(JSON.parse(await f.text())), 'Backup restored.');
    } catch (err) {
      toast('That file could not be read.');
    }
  });
  $('#tourBtn').addEventListener('click', () => {
    settings.close();
    startTour(false);
  });

  /* ---------- Share this site ---------- */
  // Only the site's address is shared, never anything the person entered
  const siteUrl = () => location.origin + location.pathname;
  const SHARE_TEXT = 'Personal Health Profile: keep your health information in one place and bring it to appointments.';
  const share = $('#shareDialog');
  $('#shareBtn').addEventListener('click', () => {
    settings.close();
    $('#shareUrl').value = siteUrl();
    // The device's share menu covers texts, email and every app; browsers without one get a note to copy the link
    $('#shareNative').hidden = !navigator.share;
    $('#shareFallback').hidden = !!navigator.share;
    $('#shareCopy').textContent = 'Copy link';
    share.showModal();
  });
  $('#shareNative').addEventListener('click', async () => {
    try {
      await navigator.share({ title: 'Personal Health Profile', text: SHARE_TEXT, url: siteUrl() });
    } catch (err) {
      /* closed without sharing */
    }
  });
  $('#shareCopy').addEventListener('click', async () => {
    const field = $('#shareUrl');
    let copied = false;
    try {
      await navigator.clipboard.writeText(field.value);
      copied = true;
    } catch (err) {
      field.select();
      try {
        copied = document.execCommand('copy');
      } catch (err2) {
        copied = false;
      }
    }
    if (copied) {
      $('#shareCopy').textContent = 'Copied';
      setTimeout(() => ($('#shareCopy').textContent = 'Copy link'), 2500);
    } else field.select(); // leave it selected so it can be copied by hand
  });
  $('#eraseBtn').addEventListener('click', async () => {
    settings.close();
    if (!(await askConfirm('Are you sure?', 'This deletes all information saved on this device.', 'Erase', true))) return;
    replaceState(blank(), 'Everything erased.');
    goHome();
  });

  /* ---------- Notices: install tip and backup reminder ---------- */
  // Kept apart from the profile so erasing or restoring a profile does not bring tips back
  const DAY = 864e5;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Filled fields plus list entries: a rough measure of how much would be lost
  const amountEntered = () =>
    active().reduce((n, s) => {
      const d = A.state.data[s.id];
      if (!d) return n;
      if (s.kind === 'profile') return n + PHP.visibleFields(s.fields, d.values || {}).filter((f) => PHP.fieldFilled(f, d.values || {})).length;
      return n + A.count(s);
    }, 0);

  let installEvt = null; // Chrome and Edge offer their own install prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvt = e;
    renderNotices();
  });
  window.addEventListener('appinstalled', () => {
    installEvt = null;
    setMeta({ installDismissed: Date.now() });
    renderNotices();
  });

  function notice(key, title, text, actions) {
    return h(
      'div',
      { class: 'notice', role: 'status', 'data-notice': key },
      h('div', { class: 'notice-txt' }, h('b', { text: title }), h('p', { text })),
      h('div', { class: 'notice-actions' }, actions)
    );
  }

  function renderNotices() {
    const box = $('#notices');
    if (!box) return;
    const m = getMeta();
    const now = Date.now();
    const out = [];
    const dismissInstall = () => {
      setMeta({ installDismissed: now });
      renderNotices();
    };

    if (!standalone() && !m.installDismissed) {
      if (isIOS()) {
        const hasData = hasAnyData();
        out.push(
          notice(
            'ios',
            'Add this to your Home Screen',
            'Tap the Share button, then "Add to Home Screen", and open it from there. This keeps your information from being erased.' +
              (hasData ? ' You have already entered information here, so save a backup first and restore it in the Home Screen app.' : ''),
            [hasData && btn('ghost', 'Save backup', exportBackup), btn('primary', 'Got it', dismissInstall)]
          )
        );
      } else if (installEvt) {
        out.push(
          notice('install', 'Install this app', 'It opens like an app and works without internet.', [
            btn('ghost', 'Not now', dismissInstall),
            btn('primary', 'Install', async () => {
              installEvt.prompt();
              await installEvt.userChoice;
              installEvt = null;
              renderNotices();
            }),
          ])
        );
      }
    }

    const tipOffersBackup = out.some((n) => n.dataset.notice === 'ios' && n.querySelector('.btn.ghost'));
    const backupDue = !tipOffersBackup && amountEntered() >= 8 && (!m.lastBackup || now - m.lastBackup > 30 * DAY) && !(m.snoozeBackup > now);
    if (backupDue) {
      out.push(
        notice('backup', m.lastBackup ? 'Time for a new backup' : 'Save a backup', 'Your information is stored only on this device. A backup file keeps a copy in case it is lost.', [
          btn('ghost', 'Not now', () => {
            setMeta({ snoozeBackup: now + 14 * DAY });
            renderNotices();
          }),
          btn('primary', 'Save backup', exportBackup),
        ])
      );
    }
    box.replaceChildren(...out);
  }

  // Ask the browser not to clear this site's storage on its own
  function protectStorage() {
    if (!hasAnyData() || !navigator.storage || !navigator.storage.persist) return;
    navigator.storage.persisted().then((p) => p || navigator.storage.persist()).catch(() => {});
  }

  Object.assign(A, { showView, renderHome, renderNotices, protectStorage });
})();
