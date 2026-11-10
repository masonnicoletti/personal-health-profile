/* Personal Health Profile: form app */
(function () {
  const PHP = window.PHP;
  const KEY = 'php.profile.v1';
  const $ = (s, r = document) => r.querySelector(s);
  let seq = 0;

  // Tiny element builder
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false || kid === '') continue;
      el.append(kid.nodeType ? kid : document.createTextNode(kid));
    }
    return el;
  }
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const plural = (w, n) => (n === 1 ? w : /is$/.test(w) ? w.replace(/is$/, 'es') : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ies' : w + 's');

  /* ---------- State ---------- */
  const blank = () => ({ v: 2, data: {}, added: [], open: { basic: true } });
  function normalize(o) {
    if (!o || typeof o !== 'object' || !o.data || typeof o.data !== 'object') throw new Error('Not a health profile');
    const open = o.open && typeof o.open === 'object' ? o.open : {};
    if (open.doctors || open.formerdoctors) open.providers = true;
    if (open.medhistory) open.meds = true;
    return {
      v: 2,
      data: PHP.migrate(o.data),
      added: Array.isArray(o.added) ? o.added.filter((id) => (PHP.sectionById(id) || {}).optional) : [],
      open,
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) {
      /* fall through to a blank profile */
    }
    return blank();
  }

  let state = load();
  PHP.getState = () => state;
  const editing = new Set(); // entry ids currently open for editing (not saved)

  let saveTimer;
  let dirty = false;
  function save() {
    dirty = true;
    status('Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 400);
  }
  function flush() {
    clearTimeout(saveTimer);
    if (!dirty) return;
    dirty = false;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      status('Saved');
    } catch (e) {
      status('Could not save on this device');
    }
  }
  const status = (t) => ($('#saveStatus').textContent = t);
  window.addEventListener('pagehide', flush);
  // Another tab saved changes: pick them up unless this tab has unsaved edits
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || dirty || !e.newValue) return;
    try {
      state = normalize(JSON.parse(e.newValue));
      editing.clear();
      renderAll();
    } catch (err) {
      /* ignore unreadable data */
    }
  });

  function sd(id) {
    const d = state.data[id] || (state.data[id] = {});
    if (!d.values || typeof d.values !== 'object') d.values = {};
    if (!d.lists || typeof d.lists !== 'object') d.lists = {};
    return d;
  }
  const listArr = (id, key) => {
    const d = sd(id);
    return d.lists[key] || (d.lists[key] = []);
  };
  const active = () => PHP.SECTIONS.filter((s) => !s.optional || state.added.includes(s.id));
  const hasAnyData = () => PHP.SECTIONS.some((s) => PHP.sectionHasData(s, state.data[s.id]));

  /* ---------- Undo ---------- */
  let undoSnap = null;
  const snapshot = () => (undoSnap = JSON.stringify(state));
  function undo() {
    if (!undoSnap) return;
    state = normalize(JSON.parse(undoSnap));
    undoSnap = null;
    editing.clear();
    save();
    renderAll();
    hideToast();
  }

  let toastEl, toastTimer;
  function toast(msg, canUndo) {
    hideToast();
    toastEl = h('div', { class: 'toast', role: 'status' }, h('span', { text: msg }), canUndo && h('button', { type: 'button', text: 'Undo', onclick: undo }));
    document.body.append(toastEl);
    toastTimer = setTimeout(hideToast, canUndo ? 10000 : 4000);
  }
  function hideToast() {
    clearTimeout(toastTimer);
    if (toastEl) toastEl.remove();
    toastEl = null;
  }

  /* ---------- Fields ---------- */
  function fieldGrid(fields, obj, changed, autofill) {
    const grid = h('div', { class: 'grid' });
    const els = [];
    const byKey = {};
    for (const f of fields) {
      const el = field(f, obj, () => onField(f.k));
      grid.append(el);
      els.push([f, el]);
      byKey[f.k] = el;
    }
    function onField(k) {
      const out = autofill && autofill(obj, k);
      if (out)
        for (const [kk, v] of Object.entries(out)) {
          obj[kk] = v;
          if (byKey[kk] && byKey[kk].setVal) byKey[kk].setVal(v);
        }
      refresh();
      changed();
    }
    function refresh() {
      for (const [f, el] of els) el.hidden = f.showIf ? !f.showIf(obj) : false;
    }
    refresh();
    return grid;
  }

  function field(f, obj, changed) {
    const id = 'f' + ++seq;
    const wrap = h('div', { class: 'f ' + (f.w || 'full') + (f.type === 'check' ? ' checkf' : '') });
    const set = (v) => {
      obj[f.k] = v;
      changed();
    };

    if (f.type === 'check') {
      const cb = h('input', { type: 'checkbox', id });
      cb.checked = f.defaultOn ? obj[f.k] !== false : !!obj[f.k];
      cb.addEventListener('change', () => set(cb.checked));
      wrap.append(h('label', { class: 'check', for: id }, cb, f.label));
      return wrap;
    }
    if (f.type === 'date') {
      wrap.append(h('span', { class: 'lbl', id: id + 'l', text: f.label }), dateInput(obj[f.k], set, id + 'l'));
      return wrap;
    }
    if (f.type === 'checklist') return checklist(f, obj, changed, wrap, id);

    wrap.append(h('label', { for: id, text: f.label }));
    let input;
    let other = null;
    if (f.type === 'long') {
      input = h('textarea', { id, rows: '2', placeholder: f.ph });
    } else if (f.type === 'select') {
      const opts = typeof f.opts === 'function' ? f.opts() : f.opts;
      input = h('select', { id }, h('option', { value: '', text: 'Choose' }), opts.map((o) => h('option', { value: o, text: o })));
      const v = obj[f.k];
      if (v && !opts.includes(v)) input.append(h('option', { value: v, text: v }));
      if (opts.includes('Other')) {
        other = h('input', { type: 'text', class: 'other-input', placeholder: 'Please specify', 'aria-label': f.label + ', other' });
        other.value = obj[f.k + 'Other'] || '';
        other.addEventListener('input', () => {
          obj[f.k + 'Other'] = other.value;
          changed();
        });
      }
    } else if (f.type === 'phone') {
      input = h('input', { type: 'tel', id, inputmode: 'tel', placeholder: '(555) 555-5555', autocomplete: 'off' });
    } else {
      input = h('input', { type: 'text', id, placeholder: f.ph, inputmode: f.inputmode, maxlength: f.maxlength && String(f.maxlength) });
      const sugg = f.suggest ? f.suggest().filter((s) => s !== obj[f.k]) : [];
      if (sugg.length) {
        const lid = id + 'list';
        input.setAttribute('list', lid);
        input.setAttribute('autocomplete', 'off');
        wrap.append(h('datalist', { id: lid }, sugg.map((s) => h('option', { value: s }))));
      }
    }
    input.value = obj[f.k] || '';

    if (f.type === 'select') {
      const sync = () => {
        input.classList.toggle('empty', !input.value);
        if (other) other.hidden = input.value !== 'Other';
      };
      sync();
      input.addEventListener('change', () => {
        sync();
        set(input.value);
        if (other && !other.hidden) other.focus();
      });
      wrap.setVal = (v) => {
        input.value = v;
        sync();
      };
    } else if (f.type === 'phone') {
      phoneBehavior(input, set);
      wrap.setVal = (v) => (input.value = PHP.fmtPhone(v));
    } else {
      input.addEventListener('input', () => set(input.value));
      wrap.setVal = (v) => (input.value = v);
    }
    wrap.append(input);
    if (other) wrap.append(other);
    return wrap;
  }

  // Formats as (XXX) XXX-XXXX while typing, keeping the cursor in place
  function phoneBehavior(input, set) {
    const apply = (raw, digitsBefore) => {
      const f = PHP.fmtPhone(raw);
      input.value = f;
      let i = 0;
      for (let n = 0; i < f.length && n < digitsBefore; i++) if (/\d/.test(f[i])) n++;
      if (document.activeElement === input) input.setSelectionRange(i, i);
      set(f);
    };
    input.addEventListener('input', () => {
      const pos = input.selectionStart == null ? input.value.length : input.selectionStart;
      apply(input.value, input.value.slice(0, pos).replace(/\D/g, '').length);
    });
    // Backspace right after "(", ")", " " or "-" deletes the digit before it
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Backspace' || input.selectionStart !== input.selectionEnd) return;
      const c = input.selectionStart;
      let p = c;
      while (p > 0 && /\D/.test(input.value[p - 1])) p--;
      if (p === c || p === 0) return;
      e.preventDefault();
      const raw = input.value.slice(0, p - 1) + input.value.slice(c);
      apply(raw, input.value.slice(0, p - 1).replace(/\D/g, '').length);
    });
  }

  // A set of checkboxes; checking one opens a short text box for details
  function checklist(f, obj, changed, wrap, id) {
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-labelledby', id + 'l');
    wrap.append(h('span', { class: 'lbl', id: id + 'l', text: f.label }));
    const box = h('div', { class: 'checklist' });
    for (const it of f.items) {
      const cid = 'f' + ++seq;
      const cb = h('input', { type: 'checkbox', id: cid });
      cb.checked = obj[it.k] === true;
      const note = h('input', { type: 'text', class: 'cl-note', placeholder: 'Details', 'aria-label': it.label + ', details' });
      note.value = obj[it.k + 'Note'] || '';
      note.hidden = !cb.checked;
      cb.addEventListener('change', () => {
        obj[it.k] = cb.checked;
        note.hidden = !cb.checked;
        if (cb.checked) note.focus();
        changed();
      });
      note.addEventListener('input', () => {
        obj[it.k + 'Note'] = note.value;
        changed();
      });
      box.append(h('div', { class: 'cl-item' }, h('label', { class: 'check', for: cid }, cb, it.label), note));
    }
    wrap.append(box);
    return wrap;
  }

  // One consistent date entry everywhere: MM / DD / YYYY, any part may be left blank.
  function dateInput(val, set, labelId) {
    const p = PHP.parseDate(val);
    const mk = (cls, ph, len, v, aria) => {
      const i = h('input', { type: 'text', class: cls, inputmode: 'numeric', maxlength: String(len), placeholder: ph, 'aria-label': aria });
      i.value = v;
      return i;
    };
    const m = mk('mm', 'MM', 2, p.m, 'Month');
    const d = mk('dd', 'DD', 2, p.d, 'Day');
    const y = mk('yyyy', 'YYYY', 4, p.y, 'Year');
    const parts = [m, d, y];
    const check = () => {
      m.classList.toggle('bad', m.value !== '' && (+m.value < 1 || +m.value > 12) && m.value !== '0');
      d.classList.toggle('bad', d.value !== '' && (+d.value < 1 || +d.value > 31) && d.value !== '0');
      y.classList.toggle('bad', y.value.length === 4 && (+y.value < 1900 || +y.value > 2100));
    };
    const emit = () => {
      check();
      set(PHP.joinDate(y.value, m.value, d.value));
    };
    parts.forEach((inp, i) => {
      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/\D/g, '');
        const full = inp.value.length === +inp.maxLength || (inp === m && +inp.value > 1) || (inp === d && +inp.value > 3);
        if (full && inp !== y && document.activeElement === inp) {
          if (inp.value.length === 1) inp.value = '0' + inp.value;
          parts[i + 1].focus();
          parts[i + 1].select();
        }
        emit();
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !inp.value && parts[i - 1]) {
          e.preventDefault();
          parts[i - 1].focus();
        } else if ((e.key === '/' || e.key === '-' || e.key === '.') && parts[i + 1]) {
          e.preventDefault();
          parts[i + 1].focus();
        }
      });
      inp.addEventListener('blur', () => {
        if (inp !== y && inp.value.length === 1 && inp.value !== '0') {
          inp.value = '0' + inp.value;
          emit();
        }
      });
    });
    check();
    return h('div', { class: 'date', role: 'group', 'aria-labelledby': labelId }, m, d, y);
  }

  /* ---------- Sections ---------- */
  function entriesWithData(sec) {
    return (sd(sec.id).lists[sec.list.key] || []).filter((e) => PHP.entryHasData(sec.list, e));
  }
  function count(sec) {
    if (!sec.list || (sec.list.noneLabel && sd(sec.id).none)) return 0;
    return entriesWithData(sec).length;
  }
  function summary(sec) {
    const d = sd(sec.id);
    if (sec.kind === 'profile') return sec.id === 'basic' ? PHP.fullName(d.values) : '';
    const L = sec.list;
    if (L.noneLabel && d.none) return L.noneLabel;
    const es = entriesWithData(sec);
    if (!es.length) return '';
    if (L.split) {
      const cur = es.filter(PHP.isCurrent).length;
      const past = es.length - cur;
      return [cur && cur + ' current', past && past + ' past'].filter(Boolean).join(' · ');
    }
    return es.length + ' ' + plural(L.itemLabel, es.length);
  }
  function onChange(sec) {
    save();
    const s = document.querySelector('#sec-' + sec.id + ' .summary');
    if (s) s.textContent = summary(sec);
    renderNav();
  }

  function infoEl(sec) {
    const pid = 'info-' + sec.id;
    const wrap = h('div', { class: 'info' });
    const btn = h('button', {
      type: 'button',
      class: 'info-btn',
      'aria-expanded': 'false',
      'aria-controls': pid,
      'aria-label': "What's this?",
      text: '?',
      onclick: (ev) => {
        ev.stopPropagation();
        const on = !wrap.classList.contains('pinned');
        closeInfos();
        wrap.classList.toggle('pinned', on);
        btn.setAttribute('aria-expanded', String(on));
      },
    });
    const panel = h(
      'div',
      { class: 'info-panel', id: pid, role: 'note' },
      h('p', {}, h('b', { text: 'What to add' }), sec.info.what),
      h('p', {}, h('b', { text: 'Why it helps' }), sec.info.why)
    );
    wrap.append(btn, panel);
    return wrap;
  }
  function closeInfos() {
    document.querySelectorAll('.info.pinned').forEach((w) => {
      w.classList.remove('pinned');
      w.querySelector('.info-btn').setAttribute('aria-expanded', 'false');
    });
  }

  function setOpen(id, open) {
    state.open[id] = open;
    const el = document.getElementById('sec-' + id);
    if (el) {
      el.classList.toggle('open', open);
      const t = el.querySelector('.sec-toggle');
      t.setAttribute('aria-expanded', String(open));
    }
    save();
  }

  function renderSection(sec) {
    const d = sd(sec.id);
    const kind = sec.list ? sec.list.kind : 'profile';
    const open = !!state.open[sec.id];
    const bodyId = 'body-' + sec.id;

    const toggle = h(
      'button',
      { type: 'button', class: 'sec-toggle', 'aria-expanded': String(open), 'aria-controls': bodyId, onclick: () => setOpen(sec.id, !state.open[sec.id]) },
      h('h2', { text: sec.title }),
      h('span', { class: 'summary', text: summary(sec) })
    );
    const head = h('div', { class: 'sec-head' }, toggle, sec.info && infoEl(sec));

    const body = h('div', { class: 'sec-body', id: bodyId });
    if (sec.kind === 'profile') body.append(fieldGrid(sec.fields, d.values, () => onChange(sec)));
    else body.append(listBlock(sec, sec.list));
    if (sec.optional) {
      body.append(
        h('div', { class: 'entry-actions section-remove' }, h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'link danger', text: 'Remove this section', onclick: () => removeSection(sec) }))
      );
    }

    return h('section', { class: 'card sec ' + kind + (open ? ' open' : ''), id: 'sec-' + sec.id, 'aria-label': sec.title }, head, body);
  }

  function listBlock(sec, L) {
    const d = sd(sec.id);
    const arr = listArr(sec.id, L.key);
    const block = h('div', { class: 'list-block' });

    if (L.noneLabel) {
      const id = 'f' + ++seq;
      const cb = h('input', { type: 'checkbox', id });
      cb.checked = !!d.none;
      cb.addEventListener('change', () => {
        d.none = cb.checked;
        save();
        rerender(sec.id);
        $('#sec-' + sec.id + ' .list-block input[type=checkbox]').focus();
      });
      block.append(h('label', { class: 'check', for: id }, cb, L.noneLabel));
      if (d.none) return block;
    }

    const addBtn = h('button', { type: 'button', class: 'btn add', text: '+ Add ' + L.itemLabel, onclick: () => addEntry(sec, L) });
    const group = (items) => h('div', { class: 'entries' }, items.map((e) => entryEl(sec, L, e)));

    if (L.split) {
      // Being edited stays where it is until Done, so the card does not jump mid-edit
      const cur = arr.filter((e) => PHP.isCurrent(e) || editing.has(e.id));
      const old = PHP.splitEntries(L, arr).past.filter((e) => !editing.has(e.id));
      if (cur.length) block.append(group(cur));
      else if (!old.length) block.append(h('p', { class: 'empty-note', text: 'None added yet.' }));
      block.append(addBtn);
      if (old.length) block.append(h('h3', { class: 'group-title', text: L.pastTitle }), group(old));
      return block;
    }

    const items = PHP.sortEntries(L, arr);
    if (items.length) block.append(group(items));
    else if (!L.noneLabel) block.append(h('p', { class: 'empty-note', text: 'None added yet.' }));
    block.append(addBtn);
    return block;
  }

  function entryEl(sec, L, e) {
    const isEd = editing.has(e.id);
    const title = PHP.entryTitle(L, e);
    const sub = L.sub ? L.sub(e) : '';
    const el = h('div', { class: 'entry' + (isEd ? ' editing' : ''), 'data-entry': e.id });

    el.append(
      h(
        'div',
        { class: 'entry-sum' },
        h('div', { class: 'txt' }, h('div', { class: 't' + (title ? '' : ' placeholder'), text: title || 'Untitled ' + L.itemLabel }), sub && h('div', { class: 's', text: sub })),
        h('button', {
          type: 'button',
          class: 'link edit',
          text: 'Edit',
          'aria-label': 'Edit ' + (title || L.itemLabel),
          onclick: () => {
            editing.add(e.id);
            rerender(sec.id);
            focusFirst(e.id);
          },
        })
      )
    );
    if (!isEd) return el;

    const edit = h('div', { class: 'entry-edit' });
    edit.append(fieldGrid(L.fields, e, () => onChange(sec), L.autofill));
    const actions = h('div', { class: 'entry-actions' }, h('button', { type: 'button', class: 'btn primary', text: 'Done', onclick: () => done(sec, L, e) }));

    let panel = null;
    const toggleMove = () => {
      if (panel) {
        panel.remove();
        panel = null;
        return;
      }
      const mv = { end: PHP.todayISO() };
      panel = h(
        'div',
        { class: 'move-panel' },
        h('p', { class: 'sub', text: 'Saves this to ' + L.historyName + ' as a permanent record.' }),
        fieldGrid([{ k: 'end', label: L.endLabel, type: 'date', w: 'half' }], mv, () => {}),
        h(
          'div',
          { class: 'entry-actions' },
          h('button', { type: 'button', class: 'btn primary', text: 'Move', onclick: () => moveToHistory(sec, L, e, mv) }),
          h('button', { type: 'button', class: 'link', text: 'Cancel', onclick: toggleMove })
        )
      );
      edit.append(panel);
      panel.querySelector('input').focus();
    };

    if (L.historyId) actions.append(h('button', { type: 'button', class: 'link', text: 'Move to ' + L.historyName, onclick: toggleMove }));
    actions.append(h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'link danger', text: 'Remove', onclick: () => removeEntry(sec, L, e) }));
    edit.append(actions);
    el.append(edit);
    return el;
  }

  function focusFirst(entryId) {
    const ed = document.querySelector(`[data-entry="${entryId}"] .entry-edit`);
    const f = ed && ed.querySelector('input, select, textarea');
    if (f) {
      f.focus({ preventScroll: true });
      f.closest('.entry').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function rerender(id) {
    const old = document.getElementById('sec-' + id);
    const sec = PHP.sectionById(id);
    if (old && sec) old.replaceWith(renderSection(sec));
    renderNav();
  }

  /* ---------- Actions ---------- */
  function addEntry(sec, L) {
    const e = { id: uid() };
    listArr(sec.id, L.key).push(e);
    editing.add(e.id);
    state.open[sec.id] = true;
    save();
    rerender(sec.id);
    focusFirst(e.id);
  }

  function done(sec, L, e) {
    editing.delete(e.id);
    if (!PHP.entryHasData(L, e)) {
      const arr = listArr(sec.id, L.key);
      arr.splice(arr.indexOf(e), 1);
    }
    save();
    rerender(sec.id);
    renderNotices();
    protectStorage();
    const btn = document.querySelector(`[data-entry="${e.id}"] .edit`) || document.querySelector('#sec-' + sec.id + ' .btn.add');
    if (btn) btn.focus({ preventScroll: true });
  }

  function removeEntry(sec, L, e) {
    snapshot();
    const arr = listArr(sec.id, L.key);
    arr.splice(arr.indexOf(e), 1);
    editing.delete(e.id);
    save();
    rerender(sec.id);
    toast('Removed.', true);
  }

  function moveToHistory(sec, L, e, mv) {
    snapshot();
    const entry = { id: uid() };
    for (const [from, to] of Object.entries(L.toHistory)) if (PHP.isFilled(e[from])) entry[to] = e[from];
    if (PHP.isFilled(mv.end)) entry[L.endField] = mv.end;
    const arr = listArr(sec.id, L.key);
    arr.splice(arr.indexOf(e), 1);
    editing.delete(e.id);
    const hs = PHP.sectionById(L.historyId);
    listArr(hs.id, hs.list.key).push(entry);
    save();
    rerender(sec.id);
    rerender(hs.id);
    toast('Moved to ' + L.historyName + '.', true);
  }

  function addSection(sec) {
    state.added.push(sec.id);
    state.open[sec.id] = true;
    save();
    renderAll();
    const el = document.getElementById('sec-' + sec.id);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.querySelector('.sec-toggle').focus({ preventScroll: true });
  }

  function removeSection(sec) {
    snapshot();
    delete state.data[sec.id];
    state.added = state.added.filter((id) => id !== sec.id);
    save();
    renderAll();
    toast(sec.title + ' removed.', true);
  }

  function goTo(id) {
    if (!state.open[id]) setOpen(id, true);
    const el = document.getElementById('sec-' + id);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.querySelector('.sec-toggle').focus({ preventScroll: true });
  }

  /* ---------- Page chrome ---------- */
  function renderNav() {
    $('#nav').replaceChildren(
      ...active().map((sec) => {
        const c = count(sec);
        return h('li', {}, h('button', { type: 'button', class: 'nav-link', 'data-sec': sec.id, onclick: () => goTo(sec.id) }, h('span', { text: sec.title }), c ? h('span', { class: 'count', text: String(c) }) : null));
      })
    );
    spy();
  }

  function renderAdd() {
    const opts = PHP.SECTIONS.filter((s) => s.optional && !state.added.includes(s.id));
    $('#addSection').hidden = !opts.length;
    $('#addGrid').replaceChildren(...opts.map((s) => h('button', { type: 'button', class: 'add-opt', onclick: () => addSection(s) }, h('b', { text: s.title }), h('span', { text: s.blurb }))));
  }

  function renderAll() {
    $('#sections').replaceChildren(...active().map(renderSection));
    renderNav();
    renderAdd();
    renderHome();
  }

  // Highlight the section currently in view
  let spyQueued = false;
  function spy() {
    if (spyQueued) return;
    spyQueued = true;
    requestAnimationFrame(() => {
      spyQueued = false;
      let cur = null;
      for (const el of document.querySelectorAll('.sec')) if (el.getBoundingClientRect().top < 180) cur = el.id.slice(4);
      if (!cur) {
        const first = document.querySelector('.sec');
        cur = first && first.id.slice(4);
      }
      document.querySelectorAll('.nav-link').forEach((b) => b.classList.toggle('active', b.dataset.sec === cur));
    });
  }
  window.addEventListener('scroll', spy, { passive: true });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.info')) closeInfos();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeInfos();
  });

  /* ---------- Screens: home and form ---------- */
  function showView(name) {
    const toForm = name === 'form';
    $('#homeView').hidden = toForm;
    $('#formView').hidden = !toForm;
    if (toForm) spy();
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
    primary.onclick = () => (has ? goForm() : startTour(true));
    $('#homeSecondary').replaceChildren(
      ...(has ? [btn('ghost', 'Log Appointment', () => quickAdd('appointments')), btn('ghost', 'Add a Note', () => quickAdd('notes')), btn('ghost', 'Download PDF', openPdf)] : [])
    );
    renderNotices();
  }

  // Jump straight to a new, dated entry in a section (adding the section if needed)
  function quickAdd(id) {
    const sec = PHP.sectionById(id);
    if (sec.optional && !state.added.includes(id)) state.added.push(id);
    state.open[id] = true;
    goForm();
    renderAll();
    const e = { id: uid(), date: PHP.todayISO() };
    listArr(id, sec.list.key).push(e);
    editing.add(e.id);
    save();
    rerender(id);
    document.getElementById('sec-' + id).scrollIntoView({ block: 'start' });
    focusFirst(e.id);
  }

  /* ---------- Tutorial and instructions ---------- */
  const STEPS = [
    { title: 'Welcome', text: 'Your Personal Health Profile keeps all of your health information in one place.' },
    { title: 'Fill in what you like', text: 'Go through the form at your own pace. Nothing is required, so skip anything you would rather leave out.' },
    {
      title: 'Download a PDF',
      text: 'When you are ready, tap Download PDF at the top. Choose which sections to include, so you can make different versions to bring to appointments or share with family.',
    },
    { title: 'Come back anytime', text: 'Everything saves automatically on this device. Open the app whenever you want to make changes.' },
  ];
  const MORE_STEPS = [
    { title: 'Keep a backup', text: 'In Settings, choose Save a backup to keep a copy of your information somewhere safe.' },
    { title: 'Add it to your Home Screen', text: 'On iPhone or iPad, tap Share, then Add to Home Screen. On Android, open the browser menu and choose Install app.' },
  ];

  const tour = $('#tourDialog');
  let tourStep = 0;
  let tourThenForm = false;
  function showStep() {
    const s = STEPS[tourStep];
    const last = tourStep === STEPS.length - 1;
    $('#tourCount').textContent = `${tourStep + 1} of ${STEPS.length}`;
    $('#tourTitle').textContent = s.title;
    $('#tourText').textContent = s.text;
    $('#tourNext').textContent = last ? (tourThenForm ? 'Start' : 'Done') : 'Next';
  }
  function startTour(thenForm) {
    tourStep = 0;
    tourThenForm = thenForm;
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
  tour.addEventListener('close', () => {
    if (!tourThenForm) return;
    tourThenForm = false;
    goForm();
  });

  $('#instrSteps').replaceChildren(...STEPS.concat(MORE_STEPS).map((s) => h('li', {}, h('b', { text: s.title }), h('p', { text: s.text }))));
  $('#instrBtn').addEventListener('click', () => $('#instrDialog').showModal());

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
    state = next;
    editing.clear();
    save();
    renderAll();
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
    const payload = JSON.stringify({ ...state, app: 'Personal Health Profile', exported: new Date().toISOString() }, null, 2);
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
  $('#sampleBtn').addEventListener('click', async () => {
    settings.close();
    if (hasAnyData() && !(await askConfirm('Replace your information?', 'The sample profile will replace what is here. You can undo this right after.', 'Replace'))) return;
    replaceState(normalize(PHP.sampleData()), 'Sample data loaded.');
  });
  $('#eraseBtn').addEventListener('click', async () => {
    settings.close();
    if (!(await askConfirm('Are you sure?', 'This deletes all information saved on this device.', 'Erase', true))) return;
    replaceState(blank(), 'Everything erased.');
    goHome();
  });

  /* ---------- Download PDF ---------- */
  const dlg = $('#pdfDialog');
  function openPdf() {
    flush();
    const secs = active().filter((s) => PHP.sectionHasData(s, state.data[s.id]));
    $('#pdfChoices').replaceChildren(
      ...secs.map((s) => {
        const id = 'pdf-' + s.id;
        const cb = h('input', { type: 'checkbox', id, value: s.id });
        cb.checked = true;
        return h('label', { class: 'check', for: id }, cb, s.title);
      })
    );
    $('#pdfEmpty').hidden = !!secs.length;
    $('#pdfGo').disabled = !secs.length;
    $('#pdfSelectAll').hidden = !secs.length;
    dlg.showModal();
  }
  document.querySelectorAll('.pdf-open').forEach((b) => b.addEventListener('click', openPdf));
  $('#pdfSelectAll').addEventListener('click', () => {
    const cbs = [...document.querySelectorAll('#pdfChoices input')];
    const all = cbs.every((c) => c.checked);
    cbs.forEach((c) => (c.checked = !all));
  });
  $('#pdfGo').addEventListener('click', () => {
    const ids = [...document.querySelectorAll('#pdfChoices input:checked')].map((c) => c.value);
    if (!ids.length) return;
    try {
      PHP.buildPdf(state, ids);
      dlg.close();
    } catch (err) {
      console.error(err);
      toast('Could not create the PDF.');
    }
  });

  /* ---------- Notices: install tip and backup reminder ---------- */
  // Kept apart from the profile so erasing or restoring a profile does not bring tips back
  const META = 'php.meta.v1';
  const DAY = 864e5;
  function getMeta() {
    try {
      return JSON.parse(localStorage.getItem(META)) || {};
    } catch (e) {
      return {};
    }
  }
  function setMeta(patch) {
    try {
      localStorage.setItem(META, JSON.stringify({ ...getMeta(), ...patch }));
    } catch (e) {
      /* tips will simply show again */
    }
  }
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Filled fields plus list entries: a rough measure of how much would be lost
  const amountEntered = () =>
    active().reduce((n, s) => {
      const d = state.data[s.id];
      if (!d) return n;
      if (s.kind === 'profile') return n + PHP.visibleFields(s.fields, d.values || {}).filter((f) => PHP.fieldFilled(f, d.values || {})).length;
      return n + count(s);
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
  const btn = (cls, text, onclick) => h('button', { type: 'button', class: 'btn ' + cls, text, onclick });

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

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  /* ---------- Start ---------- */
  renderAll();
  showView(location.hash === '#form' ? 'form' : 'home');
  protectStorage();
  PHP._debug = {
    get state() {
      return state;
    },
  };
})();
