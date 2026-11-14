/* Personal Health Profile: form fields */
(function () {
  const PHP = window.PHP;
  const A = (PHP.app = PHP.app || {});
  const { h, nextId, snapshot, toast } = A;
  /* ---------- Fields ---------- */
  // Which collapsible groups (e.g. Lifestyle's Sleep, Activity…) are open; on screen only, not saved
  const openGroups = new Set();

  // Removes spaces at either end of a text box once the person moves on from it.
  // (Trimming while typing would swallow the space between words.)
  function trimOnLeave(el, store) {
    el.addEventListener('change', () => {
      const t = el.value.trim();
      if (t === el.value) return;
      el.value = t;
      store(t);
    });
  }

  function fieldGrid(fields, obj, changed, autofill) {
    const grid = h('div', { class: 'grid' });
    const els = [];
    const byKey = {};
    const groupOf = new Map(); // field -> the collapsible heading above it
    const toggles = []; // [heading, button, its fields]
    let current = null;
    for (const f of fields) {
      if (f.type === 'heading') current = f.collapsible ? f : null;
      if (f.type === 'heading' && f.collapsible) {
        // A heading that opens and closes the questions under it, with a count of what's answered
        const btn = h(
          'button',
          {
            type: 'button',
            class: 'group-toggle',
            'aria-expanded': String(openGroups.has(f.label)),
            onclick: () => {
              if (openGroups.has(f.label)) openGroups.delete(f.label);
              else openGroups.add(f.label);
              refresh();
            },
          },
          h('span', { class: 'group-name', text: f.label }),
          h('span', { class: 'group-count' })
        );
        const holder = h('div', { class: 'f full group-head' }, btn);
        grid.append(holder);
        toggles.push([f, btn, []]);
        continue;
      }
      const el = field(f, obj, () => onField(f.k));
      grid.append(el);
      els.push([f, el]);
      byKey[f.k] = el;
      const g = f.ungrouped ? null : current;
      groupOf.set(f, g);
      if (g) toggles[toggles.length - 1][2].push(f);
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
      for (const [f, el] of els) {
        const g = groupOf.get(f);
        el.hidden = (f.showIf ? !f.showIf(obj) : false) || (!!g && !openGroups.has(g.label));
      }
      for (const [g, btn, members] of toggles) {
        const open = openGroups.has(g.label);
        btn.setAttribute('aria-expanded', String(open));
        btn.parentElement.classList.toggle('open', open);
        const n = members.filter((f) => (!f.showIf || f.showIf(obj)) && PHP.fieldFilled(f, obj)).length;
        btn.querySelector('.group-count').textContent = n ? `${n} answered` : '';
      }
    }
    refresh();
    return grid;
  }

  function field(f, obj, changed) {
    const id = 'f' + nextId();
    const wrap = h('div', { class: 'f ' + (f.w || 'full') + (f.type === 'check' ? ' checkf' : '') });
    const set = (v) => {
      obj[f.k] = v;
      changed();
    };

    if (f.type === 'check') {
      const cb = h('input', { type: 'checkbox', id });
      cb.checked = f.defaultOn ? obj[f.k] !== false : !!obj[f.k];
      cb.addEventListener('change', () => set(cb.checked));
      wrap.append(h('label', { class: f.meta ? 'check check-lg' : 'check', for: id }, cb, f.label));
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
    // Unit dropdown for height and weight. Switching converts what was entered; the choice is stored as <key>Unit.
    const unitPicker = (options, onSwitch) => {
      const sel = h('select', { class: 'unit-select', 'aria-label': f.label + ' units' }, options.map(([value, text]) => h('option', { value, text })));
      sel.value = obj[f.k + 'Unit'] || '';
      sel.addEventListener('change', () => {
        onSwitch(sel.value);
        if (sel.value) obj[f.k + 'Unit'] = sel.value;
        else delete obj[f.k + 'Unit'];
        changed();
      });
      return sel;
    };

    if (f.type === 'height') {
      const box = h('div', { class: 'height' });
      const digits = (val, max, unit, aria, onInput) => {
        const i = h('input', { type: 'text', inputmode: 'numeric', maxlength: String(max), 'aria-label': aria });
        i.value = val || '';
        i.addEventListener('input', () => {
          i.value = i.value.replace(/\D/g, '');
          onInput();
        });
        return h('span', { class: 'unit-input' }, i, h('span', { class: 'unit', text: unit }));
      };
      // Feet and inches boxes, or a single centimetres box
      const draw = () => {
        if (obj[f.k + 'Unit'] === 'cm') {
          const cm = digits(obj[f.k], 3, '', f.label + ', centimetres', () => set(cm.querySelector('input').value));
          box.replaceChildren(cm);
          return;
        }
        const [ft0, in0] = String(obj[f.k] || '').split('-');
        const both = () => {
          const ft = ftWrap.querySelector('input').value;
          const inch = inWrap.querySelector('input').value;
          set(ft || inch ? `${ft}-${inch}` : '');
        };
        const ftWrap = digits(ft0, 1, 'ft', f.label + ', feet', both);
        const inWrap = digits(in0, 2, 'in', f.label + ', inches', both);
        box.replaceChildren(ftWrap, inWrap);
      };
      const units = unitPicker(
        [
          ['', 'ft / in'],
          ['cm', 'cm'],
        ],
        (to) => {
          obj[f.k] = PHP.convertHeight(obj[f.k], to);
          obj[f.k + 'Unit'] = to; // so draw() shows the new boxes
          draw();
        }
      );
      draw();
      wrap.setAttribute('role', 'group');
      wrap.setAttribute('aria-labelledby', id + 'l');
      wrap.append(h('span', { class: 'lbl', id: id + 'l', text: f.label }), h('div', { class: 'with-units' }, box, units));
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
      let control = input;
      if (f.units) {
        // First unit is the default and is not stored; e.g. lb, or kg once chosen
        const units = unitPicker(
          f.units.map((u, i) => [i === 0 ? '' : u, u]),
          (to) => {
            obj[f.k] = PHP.convertWeight(obj[f.k], to || f.units[0]);
            input.value = obj[f.k];
          }
        );
        control = h('div', { class: 'with-units' }, input, units);
      } else if (f.unit) control = h('span', { class: 'unit-input' }, input, h('span', { class: 'unit', text: f.unit }));
      wrap.append(h('label', { for: id, text: f.label }), control);
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
        const storeOther = (v) => {
          obj[f.k + 'Other'] = v;
          changed();
        };
        other.addEventListener('input', () => storeOther(other.value));
        trimOnLeave(other, storeOther);
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
      trimOnLeave(input, set);
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
      const cid = 'f' + nextId();
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
      const storeNote = (v) => {
        obj[it.k + 'Note'] = v;
        changed();
      };
      note.addEventListener('input', () => storeNote(note.value));
      trimOnLeave(note, storeNote);
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

  A.fieldGrid = fieldGrid;
})();
