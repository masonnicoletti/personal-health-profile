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
    if (open.dxhistory) open.conditions = true;
    const data = PHP.migrate(o.data);
    let added = Array.isArray(o.added) ? o.added.slice() : [];
    // "Vision, Hearing & Dental" became three sections: keep the ones that hold data
    if (added.includes('senses')) added = added.concat(['vision', 'hearing', 'dental'].filter((id) => data[id] && !added.includes(id)));
    // Immunizations became an additional section: keep it for anyone who already has vaccines entered
    const imm = PHP.sectionById('immunizations');
    if (!added.includes('immunizations') && PHP.sectionHasData(imm, data.immunizations)) added.push('immunizations');
    return {
      v: 3,
      data,
      added: added.filter((id) => (PHP.sectionById(id) || {}).optional),
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
    if (f.type === 'group') {
      if (!Array.isArray(obj[f.k])) obj[f.k] = [];
      const items = obj[f.k];
      if (!items.length) items.push({});
      const list = h('div', { class: 'group-items' });
      const draw = (focusIdx) => {
        list.replaceChildren(
          ...items.map((it, i) => {
            const card = h('div', { class: 'group-item' }, fieldGrid(f.fields, it, changed));
            if (items.length > 1)
              card.append(
                h(
                  'div',
                  { class: 'entry-actions' },
                  h('span', { class: 'spacer' }),
                  h('button', {
                    type: 'button',
                    class: 'link danger',
                    text: 'Remove ' + f.itemLabel,
                    onclick: () => {
                      snapshot();
                      items.splice(i, 1);
                      changed();
                      draw();
                      toast(f.itemLabel[0].toUpperCase() + f.itemLabel.slice(1) + ' removed.', true);
                    },
                  })
                )
              );
            return card;
          })
        );
        if (focusIdx != null) {
          const first = list.children[focusIdx].querySelector('input, select, textarea');
          if (first) first.focus();
        }
      };
      draw();
      wrap.append(
        h('span', { class: 'lbl group-label', text: f.label }),
        list,
        h('button', {
          type: 'button',
          class: 'btn add',
          text: '+ Add another ' + f.itemLabel,
          onclick: () => {
            items.push({});
            changed();
            draw(items.length - 1);
          },
        })
      );
      return wrap;
    }
    if (f.type === 'heading') {
      wrap.className = 'f full heading';
      wrap.append(h('h3', { text: f.label }));
      return wrap;
    }
    if (f.type === 'height') {
      const [ft0, in0] = String(obj[f.k] || '').split('-');
      const part = (val, max, unit, aria) => {
        const i = h('input', { type: 'text', inputmode: 'numeric', maxlength: String(max), 'aria-label': aria });
        i.value = val || '';
        i.addEventListener('input', () => {
          i.value = i.value.replace(/\D/g, '');
          const ft = feet.value;
          const inch = inches.value;
          set(ft || inch ? `${ft}-${inch}` : '');
        });
        return h('span', { class: 'unit-input' }, i, h('span', { class: 'unit', text: unit }));
      };
      const ftWrap = part(ft0, 1, 'ft', f.label + ', feet');
      const inWrap = part(in0, 2, 'in', f.label + ', inches');
      const feet = ftWrap.querySelector('input');
      const inches = inWrap.querySelector('input');
      wrap.setAttribute('role', 'group');
      wrap.setAttribute('aria-labelledby', id + 'l');
      wrap.append(h('span', { class: 'lbl', id: id + 'l', text: f.label }), h('div', { class: 'height' }, ftWrap, inWrap));
      return wrap;
    }
    if (f.type === 'number') {
      const input = h('input', { type: 'text', id, inputmode: 'decimal', placeholder: f.ph });
      input.value = obj[f.k] || '';
      input.addEventListener('input', () => {
        const clean = input.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
        if (clean !== input.value) input.value = clean;
        set(clean);
      });
      wrap.setVal = (v) => (input.value = v);
      wrap.append(h('label', { for: id, text: f.label }), f.unit ? h('span', { class: 'unit-input' }, input, h('span', { class: 'unit', text: f.unit })) : input);
      return wrap;
    }

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

    if (L.choices) return choicesBlock(sec, L, block, arr);

    const addBtn = h('button', { type: 'button', class: 'btn add', text: '+ Add ' + L.itemLabel, onclick: () => addEntry(sec, L) });
    const group = (items) => h('div', { class: 'entries' }, items.map((e) => entryEl(sec, L, e)));
    if (L.questionnaire) block.append(questionnaireEl(sec, L, arr));

    if (L.split) {
      // Being edited stays where it is until Done, so the card does not jump mid-edit
      const cur = arr.filter((e) => PHP.isCurrent(e) || editing.has(e.id));
      const old = PHP.splitEntries(L, arr).past.filter((e) => !editing.has(e.id));
      if (L.questionnaire && (cur.length || old.length)) block.append(h('h3', { class: 'group-title', text: 'Your conditions' }));
      if (cur.length) block.append(group(cur));
      else if (!old.length && !L.questionnaire) block.append(h('p', { class: 'empty-note', text: 'None added yet.' }));
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

  // Restores focus to a checklist box after its section re-renders
  function focusChoice(secId, label) {
    const el = [...document.querySelectorAll('#sec-' + secId + ' input[data-q]')].find((i) => i.dataset.q === label);
    if (el) el.focus({ preventScroll: true });
  }
  const hasDetails = (e, skip) => Object.entries(e).some(([k, v]) => !skip.includes(k) && PHP.isFilled(v));

  // Medical History: a checklist of common conditions. Checking one adds it to the list below.
  function questionnaireEl(sec, L, arr) {
    const grid = h('div', { class: 'checklist q-grid' });
    for (const label of L.questionnaire.items) {
      const cid = 'f' + ++seq;
      const cb = h('input', { type: 'checkbox', id: cid, 'data-q': label });
      const linked = () => arr.filter((e) => e.q === label);
      cb.checked = linked().length > 0;
      cb.addEventListener('change', () => {
        let undoable = false;
        if (cb.checked) arr.push({ id: uid(), q: label, name: label, current: true });
        else {
          undoable = linked().some((e) => hasDetails(e, ['id', 'q', 'name', 'current']) || e.current === false);
          if (undoable) snapshot();
          linked().forEach((e) => {
            arr.splice(arr.indexOf(e), 1);
            editing.delete(e.id);
          });
        }
        save();
        rerender(sec.id);
        focusChoice(sec.id, label);
        if (undoable) toast(label + ' removed.', true);
      });
      grid.append(h('label', { class: 'check', for: cid }, cb, label));
    }
    return h('div', { class: 'questionnaire' }, h('p', { class: 'q-prompt', text: L.questionnaire.prompt }), grid);
  }

  // Allergies: the whole section is a checklist. Checked items open their details; Other allows several.
  function choicesBlock(sec, L, block, arr) {
    const detail = L.fields.filter((f) => f.k !== 'name');
    const list = h('div', { class: 'choices' });
    for (const label of L.choices.concat('Other')) {
      const isOther = label === 'Other';
      const mine = arr.filter((e) => e.q === label);
      const cid = 'f' + ++seq;
      const cb = h('input', { type: 'checkbox', id: cid, 'data-q': label });
      cb.checked = mine.length > 0;
      const row = h('div', { class: 'choice' + (cb.checked ? ' checked' : '') }, h('label', { class: 'check', for: cid }, cb, label));
      cb.addEventListener('change', () => {
        let undoable = false;
        if (cb.checked) arr.push({ id: uid(), q: label, name: isOther ? '' : label });
        else {
          undoable = mine.some((e) => hasDetails(e, isOther ? ['id', 'q'] : ['id', 'q', 'name']));
          if (undoable) snapshot();
          mine.forEach((e) => arr.splice(arr.indexOf(e), 1));
        }
        save();
        rerender(sec.id);
        if (cb.checked) {
          const first = document.querySelector(`#sec-${sec.id} .choice.checked [data-entry="${arr[arr.length - 1].id}"] input, #sec-${sec.id} .choice.checked [data-entry="${arr[arr.length - 1].id}"] select`);
          if (first) first.focus({ preventScroll: true });
          else focusChoice(sec.id, label);
        } else focusChoice(sec.id, label);
        if (undoable) toast(label + ' removed.', true);
      });
      if (cb.checked) {
        for (const e of mine) {
          const det = h('div', { class: 'choice-detail', 'data-entry': e.id }, fieldGrid(isOther ? L.fields : detail, e, () => onChange(sec)));
          if (isOther && mine.length > 1)
            det.append(
              h('div', { class: 'entry-actions' }, h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'link danger', text: 'Remove', onclick: () => removeEntry(sec, L, e) }))
            );
          row.append(det);
        }
        if (isOther)
          row.append(
            h('button', {
              type: 'button',
              class: 'btn add',
              text: '+ Add another allergy',
              onclick: () => {
                const e = { id: uid(), q: 'Other', name: '' };
                arr.push(e);
                save();
                rerender(sec.id);
                const inp = document.querySelector(`#sec-${sec.id} [data-entry="${e.id}"] input`);
                if (inp) inp.focus();
              },
            })
          );
      }
      list.append(row);
    }
    block.append(list);
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

    actions.append(h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'link danger', text: 'Remove', onclick: () => removeEntry(sec, L, e) }));
    edit.append(actions);
    el.append(edit);
    return el;
  }

  function focusFirst(entryId) {
    const ed = document.querySelector(`[data-entry="${entryId}"] .entry-edit`);
    const f = ed && ed.querySelector('input:not([type=checkbox]), select, textarea');
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
      }),
      h(
        'li',
        { class: 'nav-more' },
        h('button', {
          type: 'button',
          class: 'nav-link',
          'data-sec': 'more',
          text: 'Additional Sections',
          onclick: () => {
            const el = $('#addSection');
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            const first = el.querySelector('.add-opt');
            if (first) first.focus({ preventScroll: true });
          },
        })
      )
    );
    spy();
  }

  // Every optional section as a full-width row: Add, title, description. Once added, the row jumps to it.
  function renderAdd() {
    const opts = PHP.SECTIONS.filter((s) => s.optional);
    $('#addGrid').replaceChildren(
      ...opts.map((s) => {
        const added = state.added.includes(s.id);
        return h(
          'button',
          {
            type: 'button',
            class: 'add-opt' + (added ? ' added' : ''),
            'aria-label': (added ? 'Go to ' : 'Add ') + s.title,
            onclick: () => (added ? goTo(s.id) : addSection(s)),
          },
          h('span', { class: 'state', text: added ? 'Added' : '+ Add' }),
          h('b', { text: s.title }),
          h('span', { class: 'blurb', text: s.blurb })
        );
      })
    );
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
      for (const el of document.querySelectorAll('.sec, #addSection')) if (el.getBoundingClientRect().top < 180) cur = el.id === 'addSection' ? 'more' : el.id.slice(4);
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
    // New users: open the form first, then walk through the tutorial on top of it
    primary.onclick = () => {
      goForm();
      if (!has) startTour(true);
    };
    $('#homeSecondary').replaceChildren(
      ...(has ? [btn('ghost', 'Log Appointment', () => quickAdd('appointments')), btn('ghost', 'Add a Note', () => quickAdd('notes')), btn('ghost', 'Save PDF', openPdf)] : [])
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

  /* ---------- Share this site ---------- */
  // Only the site's address is shared, never anything the person entered
  const siteUrl = () => location.origin + location.pathname;
  const SHARE_TEXT = 'Personal Health Profile: keep your health information in one place and bring it to appointments.';
  const share = $('#shareDialog');
  $('#shareBtn').addEventListener('click', () => {
    settings.close();
    const url = siteUrl();
    const msg = `${SHARE_TEXT} ${url}`;
    $('#shareUrl').value = url;
    $('#shareText').href = 'sms:?&body=' + encodeURIComponent(msg);
    $('#shareEmail').href = 'mailto:?subject=' + encodeURIComponent('Personal Health Profile') + '&body=' + encodeURIComponent(msg);
    $('#shareFacebook').href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
    $('#shareX').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(SHARE_TEXT) + '&url=' + encodeURIComponent(url);
    $('#shareWhatsApp').href = 'https://wa.me/?text=' + encodeURIComponent(msg);
    $('#shareNative').hidden = !navigator.share; // phones: the device's own share menu covers every app
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

  /* ---------- Save PDF ---------- */
  // Presets save re-ticking sections. The last choice, and a custom selection, are remembered on this device.
  const PRESETS = [
    { id: 'everything', label: 'Everything', desc: 'Every section you have filled in.' },
    { id: 'doctor', label: 'New doctor', desc: 'Your full health record, without the notes, appointment and vitals logs.', skip: ['notes', 'appointments', 'vitals'] },
    { id: 'emergency', label: 'Emergency summary', desc: 'One page: allergies, current medications, conditions, blood type and emergency contacts.', special: true },
    { id: 'wallet', label: 'Wallet card', desc: 'A small card to cut out, fold and keep in your wallet.', special: true },
    { id: 'custom', label: 'Choose sections', desc: 'Tick the sections to include.' },
  ];
  const dlg = $('#pdfDialog');
  let preset = 'everything';
  const withData = () => active().filter((s) => PHP.sectionHasData(s, state.data[s.id]));
  const presetOf = (id) => PRESETS.find((p) => p.id === id) || PRESETS[0];
  const isSpecial = () => !!presetOf(preset).special;
  const selectedIds = () => [...document.querySelectorAll('#pdfChoices input:checked')].map((c) => c.value);

  function presetIds(p) {
    const ids = withData().map((s) => s.id);
    if (p.skip) return ids.filter((id) => !p.skip.includes(id));
    if (p.id === 'custom') {
      const saved = getMeta().pdfCustom;
      return Array.isArray(saved) ? ids.filter((id) => saved.includes(id)) : ids;
    }
    return ids;
  }
  function updatePdfButtons() {
    const ok = withData().length > 0 && (isSpecial() || selectedIds().length > 0);
    $('#pdfGo').disabled = !ok;
    $('#pdfPreview').disabled = !ok;
  }
  // keepTicks: switching to "Choose sections" because a box was ticked by hand
  function choosePreset(id, keepTicks) {
    const p = presetOf(id);
    preset = p.id;
    setMeta({ pdfPreset: p.id });
    document.querySelectorAll('#pdfPresets .preset').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.preset === p.id)));
    $('#pdfDesc').textContent = p.desc;
    if (!keepTicks) {
      const ids = presetIds(p);
      document.querySelectorAll('#pdfChoices input').forEach((c) => (c.checked = ids.includes(c.value)));
    }
    const showChoices = !p.special && withData().length > 0;
    $('#pdfChoices').hidden = !showChoices;
    $('#pdfSelectAll').hidden = !showChoices;
    $('#pdfTimelineRow').hidden = !showChoices;
    updatePdfButtons();
  }
  function ticked() {
    setMeta({ pdfCustom: selectedIds() });
    if (preset !== 'custom') choosePreset('custom', true);
    else updatePdfButtons();
  }

  function openPdf() {
    flush();
    const secs = withData();
    $('#pdfPresets').replaceChildren(
      ...PRESETS.map((p) => h('button', { type: 'button', class: 'preset', role: 'radio', 'aria-checked': 'false', 'data-preset': p.id, text: p.label, onclick: () => choosePreset(p.id) }))
    );
    $('#pdfChoices').replaceChildren(
      ...secs.map((s) => {
        const id = 'pdf-' + s.id;
        const cb = h('input', { type: 'checkbox', id, value: s.id });
        cb.addEventListener('change', ticked);
        return h('label', { class: 'check', for: id }, cb, s.title);
      })
    );
    $('#pdfEmpty').hidden = !!secs.length;
    $('#pdfTimeline').checked = getMeta().pdfTimeline !== false; // on unless turned off before
    choosePreset(getMeta().pdfPreset || 'everything');
    dlg.showModal();
  }
  document.querySelectorAll('.pdf-open').forEach((b) => b.addEventListener('click', openPdf));
  $('#pdfSelectAll').addEventListener('click', () => {
    const cbs = [...document.querySelectorAll('#pdfChoices input')];
    const all = cbs.every((c) => c.checked);
    cbs.forEach((c) => (c.checked = !all));
    ticked();
  });

  $('#pdfTimeline').addEventListener('change', (e) => setMeta({ pdfTimeline: e.target.checked }));

  // The chosen preset's PDF; save: false returns it without downloading (for the preview)
  function makePdf(save) {
    const o = { save, timeline: $('#pdfTimeline').checked };
    if (preset === 'emergency') return PHP.buildEmergencyPdf(state, o);
    if (preset === 'wallet') return PHP.buildWalletPdf(state, o);
    return PHP.buildPdf(state, selectedIds(), o);
  }

  // The preview draws each PDF page with Mozilla's PDF.js, loaded only the first time it's needed
  let pdfjsLoading = null;
  function loadPdfjs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfjsLoading)
      pdfjsLoading = new Promise((resolve, reject) => {
        const s = h('script', { src: 'vendor/pdfjs/pdf.min.js' });
        s.onload = () => {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
          resolve(window.pdfjsLib);
        };
        s.onerror = () => {
          pdfjsLoading = null;
          s.remove();
          reject(new Error('PDF.js did not load'));
        };
        document.head.append(s);
      });
    return pdfjsLoading;
  }

  const preview = $('#previewDialog');
  let previewRun = 0;
  async function openPreview() {
    if (!isSpecial() && !selectedIds().length) return;
    const run = ++previewRun;
    const pages = $('#previewPages');
    const status = $('#previewStatus');
    pages.replaceChildren();
    status.textContent = 'Preparing preview…';
    preview.showModal();
    try {
      const lib = await loadPdfjs();
      const data = makePdf(false).output('arraybuffer');
      const pdf = await lib.getDocument({ data }).promise;
      const width = pages.clientWidth || 600;
      const ratio = window.devicePixelRatio || 1;
      for (let n = 1; n <= pdf.numPages; n++) {
        if (run !== previewRun) return; // closed or reopened meanwhile
        const page = await pdf.getPage(n);
        const viewport = page.getViewport({ scale: (width / page.getViewport({ scale: 1 }).width) * ratio });
        const canvas = h('canvas', { class: 'preview-page', role: 'img', 'aria-label': `Page ${n} of ${pdf.numPages}` });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        pages.append(canvas);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      }
      if (run === previewRun) status.textContent = pdf.numPages === 1 ? '1 page' : `${pdf.numPages} pages`;
    } catch (err) {
      if (run === previewRun) status.textContent = 'The preview could not be shown. You can still download the PDF.';
    }
  }
  $('#pdfPreview').addEventListener('click', openPreview);
  preview.addEventListener('close', () => previewRun++);
  $('#previewBack').addEventListener('click', () => preview.close());
  $('#previewDownload').addEventListener('click', () => {
    preview.close();
    try {
      makePdf(true);
      dlg.close();
    } catch (err) {
      console.error(err);
      toast('Could not create the PDF.');
    }
  });

  $('#pdfGo').addEventListener('click', () => {
    if (!isSpecial() && !selectedIds().length) return;
    try {
      makePdf(true);
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
