/* Personal Health Profile: shared setup, state, saving, undo and device-only settings */
(function () {
  const PHP = window.PHP;
  const A = (PHP.app = PHP.app || {});
  const KEY = 'php.profile.v1';
  const $ = (s, r = document) => r.querySelector(s);
  let seq = 0;
  const nextId = () => ++seq;

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

  A.state = load();
  PHP.getState = () => A.state;
  const editing = new Set(); // entry ids currently open for editing (not saved)
  const fresh = new Set(); // entries just added: shown at the bottom of their list until Done

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
      localStorage.setItem(KEY, JSON.stringify(A.state));
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
      A.state = normalize(JSON.parse(e.newValue));
      editing.clear();
      fresh.clear();
      A.renderAll();
    } catch (err) {
      /* ignore unreadable data */
    }
  });

  function sd(id) {
    const d = A.state.data[id] || (A.state.data[id] = {});
    if (!d.values || typeof d.values !== 'object') d.values = {};
    if (!d.lists || typeof d.lists !== 'object') d.lists = {};
    return d;
  }
  const listArr = (id, key) => {
    const d = sd(id);
    return d.lists[key] || (d.lists[key] = []);
  };
  const active = () => PHP.SECTIONS.filter((s) => !s.optional || A.state.added.includes(s.id));
  const hasAnyData = () => PHP.SECTIONS.some((s) => PHP.sectionHasData(s, A.state.data[s.id]));

  /* ---------- Undo ---------- */
  let undoSnap = null;
  const snapshot = () => (undoSnap = JSON.stringify(A.state));
  function undo() {
    if (!undoSnap) return;
    A.state = normalize(JSON.parse(undoSnap));
    undoSnap = null;
    editing.clear();
    fresh.clear();
    save();
    A.renderAll();
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

  /* ---------- Notices: install tip and backup reminder ---------- */
  // Kept apart from the profile so erasing or restoring a profile does not bring tips back
  const META = 'php.meta.v1';
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

  const btn = (cls, text, onclick) => h('button', { type: 'button', class: 'btn ' + cls, text, onclick });

  Object.assign(A, { KEY, $, h, uid, plural, nextId, blank, normalize, save, flush, sd, listArr, active, hasAnyData, editing, fresh, snapshot, undo, toast, hideToast, getMeta, setMeta, btn });
})();
