/* Personal Health Profile: Save PDF panel and preview */
(function () {
  const PHP = window.PHP;
  const A = (PHP.app = PHP.app || {});
  const { $, h, flush, active, toast, getMeta, setMeta } = A;
  /* ---------- Save PDF ---------- */
  // Choose sections first, then the special outputs. The last choice, a custom selection and the
  // timeline switch are remembered on this device.
  const PRESETS = [
    { id: 'custom', label: 'Choose sections' },
    { id: 'doctor', label: 'New doctor', row: 'special', skip: ['notes', 'appointments', 'vitals'] },
    { id: 'emergency', label: 'Emergency summary', row: 'special', fixed: true },
    { id: 'wallet', label: 'Wallet card', row: 'special', fixed: true },
  ];
  const dlg = $('#pdfDialog');
  let preset = 'custom';
  const withData = () => active().filter((s) => PHP.sectionHasData(s, A.state.data[s.id]));
  // Earlier versions had an "Everything" preset; it now falls back to Choose sections
  const presetOf = (id) => PRESETS.find((p) => p.id === id) || PRESETS[0];
  // Emergency summary and wallet card have a fixed layout: no section boxes or switches
  const isFixed = () => !!presetOf(preset).fixed;
  const boxes = () => [...document.querySelectorAll('#pdfChoices input')];
  const selectedIds = () => boxes().filter((c) => c.checked).map((c) => c.value);
  const switchOn = (el) => el.getAttribute('aria-checked') === 'true';
  const setSwitch = (el, on) => el.setAttribute('aria-checked', String(on));

  function presetIds(p) {
    const ids = withData().map((s) => s.id);
    if (p.skip) return ids.filter((id) => !p.skip.includes(id));
    const saved = getMeta().pdfCustom;
    return Array.isArray(saved) ? ids.filter((id) => saved.includes(id)) : ids;
  }
  function updatePdfButtons() {
    const ok = withData().length > 0 && (isFixed() || selectedIds().length > 0);
    $('#pdfGo').disabled = !ok;
    $('#pdfPreview').disabled = !ok;
    const all = boxes();
    setSwitch($('#pdfSelectAll'), all.length > 0 && all.every((c) => c.checked));
  }
  // keepTicks: switching to "Choose sections" because a box was ticked by hand
  function choosePreset(id, keepTicks) {
    const p = presetOf(id);
    preset = p.id;
    setMeta({ pdfPreset: p.id });
    document.querySelectorAll('#pdfDialog .preset').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.preset === p.id)));
    if (!keepTicks) {
      const ids = presetIds(p);
      boxes().forEach((c) => (c.checked = ids.includes(c.value)));
    }
    const showChoices = !p.fixed && withData().length > 0;
    $('#pdfChoices').hidden = !showChoices;
    $('#pdfToggles').hidden = !showChoices;
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
    const presetBtn = (p) => h('button', { type: 'button', class: 'preset', role: 'radio', 'aria-checked': 'false', 'data-preset': p.id, text: p.label, onclick: () => choosePreset(p.id) });
    $('#pdfPresets').replaceChildren(...PRESETS.filter((p) => !p.row).map(presetBtn));
    $('#pdfSpecial').replaceChildren(...PRESETS.filter((p) => p.row === 'special').map(presetBtn));
    $('#pdfChoices').replaceChildren(
      ...secs.map((s) => {
        const id = 'pdf-' + s.id;
        const cb = h('input', { type: 'checkbox', id, value: s.id });
        cb.addEventListener('change', ticked);
        return h('label', { class: 'check', for: id }, cb, s.title);
      })
    );
    $('#pdfEmpty').hidden = !!secs.length;
    setSwitch($('#pdfTimeline'), getMeta().pdfTimeline !== false); // on unless turned off before
    choosePreset(getMeta().pdfPreset || 'custom');
    dlg.showModal();
  }
  document.querySelectorAll('.pdf-open').forEach((b) => b.addEventListener('click', openPdf));
  $('#pdfSelectAll').addEventListener('click', () => {
    const on = !switchOn($('#pdfSelectAll'));
    boxes().forEach((c) => (c.checked = on));
    ticked();
  });
  $('#pdfTimeline').addEventListener('click', () => {
    const on = !switchOn($('#pdfTimeline'));
    setSwitch($('#pdfTimeline'), on);
    setMeta({ pdfTimeline: on });
  });

  // The chosen preset's PDF; save: false returns it without downloading (for the preview)
  function makePdf(save) {
    const o = { save, timeline: switchOn($('#pdfTimeline')) };
    if (preset === 'emergency') return PHP.buildEmergencyPdf(A.state, o);
    if (preset === 'wallet') return PHP.buildWalletPdf(A.state, o);
    return PHP.buildPdf(A.state, selectedIds(), o);
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
    if (!isFixed() && !selectedIds().length) return;
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
    if (!isFixed() && !selectedIds().length) return;
    try {
      makePdf(true);
      dlg.close();
    } catch (err) {
      console.error(err);
      toast('Could not create the PDF.');
    }
  });

  A.openPdf = openPdf;
})();
