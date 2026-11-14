/* Personal Health Profile: sections, entries and page chrome */
(function () {
  const PHP = window.PHP;
  const A = (PHP.app = PHP.app || {});
  const { $, h, uid, plural, nextId, blank, normalize, save, flush, sd, listArr, active, hasAnyData, snapshot, toast, getMeta, setMeta, btn, editing, fresh } = A;
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
    A.state.open[id] = open;
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
    const open = !!A.state.open[sec.id];
    const bodyId = 'body-' + sec.id;

    const toggle = h(
      'button',
      { type: 'button', class: 'sec-toggle', 'aria-expanded': String(open), 'aria-controls': bodyId, onclick: () => setOpen(sec.id, !A.state.open[sec.id]) },
      h('h2', { text: sec.title }),
      h('span', { class: 'summary', text: summary(sec) })
    );
    const head = h('div', { class: 'sec-head' }, toggle, sec.info && infoEl(sec));

    const body = h('div', { class: 'sec-body', id: bodyId });
    if (sec.kind === 'profile') body.append(A.fieldGrid(sec.fields, d.values, () => onChange(sec)));
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
      const id = 'f' + nextId();
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

    const items = PHP.sortEntries(L, arr.filter((e) => !fresh.has(e.id))).concat(arr.filter((e) => fresh.has(e.id)));
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
      const cid = 'f' + nextId();
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
      const cid = 'f' + nextId();
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
          const det = h('div', { class: 'choice-detail', 'data-entry': e.id }, A.fieldGrid(isOther ? L.fields : detail, e, () => onChange(sec)));
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
    edit.append(A.fieldGrid(L.fields, e, () => onChange(sec), L.autofill));
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
    fresh.add(e.id);
    A.state.open[sec.id] = true;
    save();
    rerender(sec.id);
    focusFirst(e.id);
  }

  function done(sec, L, e) {
    editing.delete(e.id);
    fresh.delete(e.id);
    if (!PHP.entryHasData(L, e)) {
      const arr = listArr(sec.id, L.key);
      arr.splice(arr.indexOf(e), 1);
    }
    save();
    rerender(sec.id);
    A.renderNotices();
    A.protectStorage();
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
    A.state.added.push(sec.id);
    A.state.open[sec.id] = true;
    save();
    renderAll();
    const el = document.getElementById('sec-' + sec.id);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.querySelector('.sec-toggle').focus({ preventScroll: true });
  }

  function removeSection(sec) {
    snapshot();
    delete A.state.data[sec.id];
    A.state.added = A.state.added.filter((id) => id !== sec.id);
    save();
    renderAll();
    toast(sec.title + ' removed.', true);
  }

  function goTo(id) {
    if (!A.state.open[id]) setOpen(id, true);
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
        const added = A.state.added.includes(s.id);
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
    A.renderHome();
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

  Object.assign(A, { count, rerender, focusFirst, renderAll, spy });
})();
