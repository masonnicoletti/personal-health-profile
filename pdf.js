/* Personal Health Profile: PDF output
 *   PHP.buildPdf          the full profile, or chosen sections. Only what was entered is printed.
 *   PHP.buildEmergencyPdf a one-page emergency summary
 *   PHP.buildWalletPdf    a wallet card to cut out and fold
 */
(function () {
  const PHP = window.PHP;
  const C = {
    text: [18, 48, 90],
    sub: [79, 112, 155],
    accent: [0, 123, 167],
    border: [214, 222, 232],
    head: [241, 245, 248],
    severe: [150, 40, 40],
    bar: [18, 48, 90], // deep blue, same as the app's menu bar
    onBar: [243, 245, 248],
    onBarSub: [184, 199, 220],
  };

  function ageStr(dob) {
    const { y, m, d } = PHP.parseDate(dob);
    if (!(y && m && d)) return '';
    const now = new Date();
    let age = now.getFullYear() - +y;
    if (now.getMonth() + 1 < +m || (now.getMonth() + 1 === +m && now.getDate() < +d)) age--;
    return age >= 0 && age < 130 ? ` (age ${age})` : '';
  }

  function fileName(kind, name) {
    const slug = String(name || '').trim().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
    return [kind, slug, PHP.todayISO()].filter(Boolean).join('-') + '.pdf';
  }

  // What the summaries draw from: current, filled-in entries only
  function essentials(state) {
    const d = state.data;
    const list = (id) => {
      const sec = PHP.sectionById(id);
      const rows = ((d[id] && d[id].lists && d[id].lists.main) || []).filter((e) => PHP.entryHasData(sec.list, e));
      return { sec, rows };
    };
    const basic = (d.basic && d.basic.values) || {};
    const allergies = list('allergies');
    return {
      basic,
      name: PHP.fullName(basic),
      noAllergies: !!(d.allergies && d.allergies.none),
      allergies: PHP.choiceOrder(allergies.sec.list, allergies.rows),
      meds: list('meds').rows.filter(PHP.isCurrent),
      conditions: list('conditions').rows.filter(PHP.isCurrent),
      contacts: list('emergency').rows,
    };
  }

  // Shared page furniture: font helper, deep blue title band, footer
  function kit(doc) {
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const font = (style, size, color) => {
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
      doc.setTextColor(...color);
    };
    const band = (title, M) => {
      const BAND = 64;
      doc.setFillColor(...C.bar);
      doc.rect(0, 0, W, BAND, 'F');
      font('bold', 19, C.onBar);
      doc.text(title, M, BAND / 2 + 7);
      font('normal', 9, C.onBarSub);
      doc.text('Updated ' + PHP.fmtDate(PHP.todayISO()), W - M, BAND / 2 + 4, { align: 'right' });
      return BAND;
    };
    // Pages can differ in size (the timeline page is landscape), so measure each one
    const footer = (label, M) => {
      const n = doc.getNumberOfPages();
      for (let i = 1; i <= n; i++) {
        doc.setPage(i);
        const pw = doc.internal.pageSize.getWidth();
        const ph = doc.internal.pageSize.getHeight();
        font('normal', 8, C.sub);
        doc.text(label, M, ph - 28);
        if (n > 1) doc.text(`Page ${i} of ${n}`, pw - M, ph - 28, { align: 'right' });
      }
    };
    return { W, H, font, band, footer };
  }

  /* ---------- Full profile ---------- */
  PHP.buildPdf = function (state, ids, opts = {}) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const { W, H, font, band, footer } = kit(doc);
    const M = 48;
    const BOTTOM = H - 56;
    const basic = (state.data.basic && state.data.basic.values) || {};
    const name = PHP.fullName(basic);
    let y = M;

    const ensure = (h) => {
      if (y + h > BOTTOM) {
        doc.addPage();
        y = M;
      }
    };

    /* Header: deep blue band across the top of the first page */
    y = band('Personal Health Profile', M) + 30;
    if (name || PHP.isFilled(basic.dob)) {
      let x = M;
      if (name) {
        font('bold', 12, C.text);
        doc.text(name, x, y);
        x += doc.getTextWidth(name) + 14;
      }
      if (PHP.isFilled(basic.dob)) {
        font('normal', 11, C.sub);
        doc.text('Born ' + PHP.fmtDate(basic.dob) + ageStr(basic.dob), x, y);
      }
      y += 34;
    } else y += 6;

    const base = {
      margin: { left: M, right: M, top: M, bottom: H - BOTTOM },
      theme: 'plain',
      rowPageBreak: 'avoid',
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        textColor: C.text,
        cellPadding: { top: 4, bottom: 4, left: 6, right: 6 },
        overflow: 'linebreak',
        valign: 'top',
      },
    };
    const HEADING = 14; // space a heading takes before its table

    // Headings must never sit alone at the bottom of a page: keep room for the table header and a row
    function heading(title) {
      ensure(110);
      font('bold', 12.5, C.text);
      doc.text(title, M, y);
      y += 7;
      doc.setDrawColor(...C.accent); // the blue bar under every heading
      doc.setLineWidth(1.5);
      doc.line(M, y, W - M, y);
      y += 7;
    }
    function subheading(title) {
      ensure(100);
      y += 8;
      font('bold', 9, C.text);
      doc.text(title, M + 6, y + 6);
      y += 12;
    }

    // If a short section would leave one or two rows stranded on either side of a page break,
    // start the whole section on the next page instead
    function keepTogether(tableOpts) {
      if (y + 110 > BOTTOM) return; // heading() starts a new page anyway
      const probe = new jsPDF({ unit: 'pt', format: 'letter' });
      const pages = [];
      probe.autoTable({
        ...tableOpts,
        startY: y + HEADING,
        didDrawCell: (c) => {
          if (c.section === 'body' && c.column.index === 0) pages.push(c.pageNumber);
        },
      });
      const first = pages.filter((p) => p === 1).length;
      const rest = pages.length - first;
      if (rest > 0 && Math.max(...pages) === 2 && (rest <= 2 || first <= 2)) {
        doc.addPage();
        y = M;
      }
    }

    // Label / value pairs, two per row; long values take a full row
    function profileOpts(sec, values) {
      const pairs = PHP.outputCols(PHP.visibleFields(sec.fields, values), sec.merge)
        .filter((c) => c.filled(values))
        .map((c) => ({ c, v: c.text(values) }));
      if (!pairs.length) return null;
      const lab = (t) => ({ content: t, styles: { textColor: C.sub, fontSize: 7.5 } });
      const body = [];
      let row = null;
      for (const p of pairs) {
        if (p.c.long) {
          if (row) body.push(row.concat(['', '']));
          row = null;
          body.push([lab(p.c.label), { content: p.v, colSpan: 3 }]);
        } else if (!row) {
          row = [lab(p.c.label), p.v];
        } else {
          body.push(row.concat([lab(p.c.label), p.v]));
          row = null;
        }
      }
      if (row) body.push(row.concat(['', '']));
      return { ...base, body, columnStyles: { 0: { cellWidth: 108 }, 2: { cellWidth: 108 } } };
    }

    // One table per list; only columns that have something in them
    function listOpts(L, rows) {
      if (!rows.length) return null;
      const cols = PHP.outputCols(L.fields, L.merge).filter((c) => rows.some((e) => c.filled(e)));
      const columnStyles = {};
      cols.forEach((c, i) => {
        if (c.type === 'date') columnStyles[i] = { cellWidth: 74 };
        if (c.type === 'check') columnStyles[i] = { cellWidth: 64 };
        if (c.type === 'phone') columnStyles[i] = { cellWidth: 86 };
      });
      return {
        ...base,
        head: [cols.map((c) => c.label)],
        body: rows.map((e) => cols.map((c) => c.text(e))),
        columnStyles,
        headStyles: { fontStyle: 'bold', fontSize: 7.5, textColor: C.sub, fillColor: C.head },
        bodyStyles: { lineColor: C.border, lineWidth: { bottom: 0.5 } },
        didParseCell: (data) => {
          if (data.section !== 'body') return;
          const c = cols[data.column.index];
          if (c.k === 'severity' && data.cell.raw === 'Severe') {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = C.severe;
          }
        },
      };
    }
    function draw(tableOpts) {
      if (!tableOpts) return;
      ensure(60);
      doc.autoTable({ ...tableOpts, startY: y });
      y = doc.lastAutoTable.finalY + 6;
    }

    // The timeline goes second, right after Basic Information: its landscape page(s), then a fresh portrait page
    let timelinePending = !!opts.timeline;
    const placeTimeline = () => {
      timelinePending = false;
      if (drawTimeline(doc, state, ids)) {
        doc.addPage('letter', 'portrait');
        y = M;
      }
    };

    /* Sections */
    for (const sec of PHP.SECTIONS) {
      if (!ids.includes(sec.id)) continue;
      const d = state.data[sec.id];
      if (!PHP.sectionHasData(sec, d)) continue;
      if (timelinePending && sec.id !== 'basic') placeTimeline();
      const L = sec.list;
      const rows = L ? ((d.lists || {})[L.key] || []).filter((e) => PHP.entryHasData(L, e)) : [];

      if (sec.kind === 'profile') {
        const t = profileOpts(sec, d.values || {});
        keepTogether(t);
        heading(sec.title);
        draw(t);
      } else if (L.noneLabel && d.none) {
        heading(sec.title);
        font('normal', 8.5, C.text);
        doc.text(L.noneLabel, M + 6, y + 12);
        y += 20;
      } else if (L.split) {
        heading(sec.title);
        const { current, past } = PHP.splitEntries(L, rows);
        if (current.length && past.length) subheading('Current');
        draw(listOpts(L, current));
        if (past.length) {
          subheading('Past');
          draw(listOpts(L, past));
        }
      } else {
        const t = listOpts(L, L.choices ? PHP.choiceOrder(L, rows) : PHP.sortEntries(L, rows));
        keepTogether(t);
        heading(sec.title);
        draw(t);
      }
      y += 28; // space between sections
    }

    // Only Basic Information (or nothing) was printed: the timeline simply follows it
    if (timelinePending) {
      timelinePending = false;
      drawTimeline(doc, state, ids);
    }

    footer(['Personal Health Profile', name].filter(Boolean).join('  ·  '), M);
    if (opts.save !== false) doc.save(fileName('Health-Profile', name));
    return doc;
  };

  /* ---------- Timeline page ---------- */
  // Partial dates are placed at the start of the period they name: "2008" is Jan 1, 2008
  const toTime = (v) => {
    const { y, m, d } = PHP.parseDate(v);
    if (!/^\d{4}$/.test(y)) return null;
    return new Date(+y, (+m || 1) - 1, +d || 1).getTime();
  };
  const tint = (c, amount = 0.6) => c.map((v) => Math.round(v + (255 - v) * amount));
  const PROCEDURE = [35, 120, 111]; // muted teal, to set one-time events apart from the blues

  // Rows for the timeline, grouped. Only sections included in the PDF are used.
  PHP.timelineData = function (state, ids) {
    const d = state.data;
    const entries = (id) => {
      const sec = PHP.sectionById(id);
      return ((d[id] && d[id].lists && d[id].lists.main) || []).filter((e) => PHP.entryHasData(sec.list, e));
    };
    const undated = [];
    const span = (label, start, end, ongoing) => {
      const s = toTime(start);
      if (s == null) return undated.push(label), null;
      const e = ongoing ? null : toTime(end);
      // A past item with no end date can only be shown as the moment it started
      return { label, start: s, end: e, ongoing, point: !ongoing && e == null };
    };
    const byStart = (a, b) => a.start - b.start;
    const groups = [];
    if (ids.includes('conditions'))
      groups.push({ title: 'Conditions', color: C.accent, items: entries('conditions').map((e) => span(e.name, e.diagnosed, e.resolved, PHP.isCurrent(e))).filter(Boolean).sort(byStart) });
    if (ids.includes('meds'))
      groups.push({ title: 'Medications', color: C.bar, items: entries('meds').map((e) => span(e.name, e.start, e.end, PHP.isCurrent(e))).filter(Boolean).sort(byStart) });
    if (ids.includes('surgeries'))
      groups.push({
        title: 'Surgeries & Procedures',
        color: PROCEDURE,
        items: entries('surgeries')
          .map((e) => {
            const t = toTime(e.date);
            if (t == null) return undated.push(e.name), null;
            return { label: e.name, start: t, end: null, point: true };
          })
          .filter(Boolean)
          .sort(byStart),
      });
    return { groups: groups.filter((g) => g.items.length), undated: undated.filter((u) => PHP.isFilled(u || '')) };
  };

  // Returns true when it added a page (false when nothing in the chosen sections has a date)
  function drawTimeline(doc, state, ids) {
    const { groups, undated } = PHP.timelineData(state, ids);
    if (!groups.length) return false;
    const today = Date.now();
    const first = Math.min(...groups.flatMap((g) => g.items.map((i) => i.start)));

    // Year ticks: the step widens as the span grows so labels never crowd
    const y0 = new Date(first).getFullYear();
    const y1 = new Date(today).getFullYear() + 1;
    const spanYears = y1 - y0;
    const step = spanYears <= 6 ? 1 : spanYears <= 15 ? 2 : spanYears <= 30 ? 5 : 10;
    const startYear = Math.floor(y0 / step) * step;
    const t0 = new Date(startYear, 0, 1).getTime();
    const t1 = new Date(y1, 0, 1).getTime();

    const font = (style, size, color) => {
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
      doc.setTextColor(...color);
    };
    const M = 40;
    const LABEL_W = 170;
    const ROW = 14;
    let W, H, X0, X1, BOTTOM, y;
    const xOf = (t) => X0 + ((t - t0) / (t1 - t0)) * (X1 - X0);

    // Heading, key and year axis; repeated on every timeline page. Gridlines stop at endY, just below the last row.
    function newPage(continued, endY) {
      doc.addPage('letter', 'landscape');
      W = doc.internal.pageSize.getWidth();
      H = doc.internal.pageSize.getHeight();
      X0 = M + LABEL_W + 12;
      X1 = W - M - 8;
      BOTTOM = H - 52;
      y = M + 4;
      font('bold', 14, C.text);
      doc.text(continued ? 'Health Timeline (continued)' : 'Health Timeline', M, y);
      y += 7;
      doc.setDrawColor(...C.accent);
      doc.setLineWidth(1.5);
      doc.line(M, y, W - M, y);
      y += 16;

      // Key
      let kx = M;
      font('normal', 7.5, C.sub);
      const key = (draw, text) => {
        draw(kx, y - 3);
        doc.text(text, kx + 26, y);
        kx += 26 + doc.getTextWidth(text) + 18;
      };
      key((x, cy) => (doc.setFillColor(...C.accent), doc.roundedRect(x, cy - 3, 20, 6, 3, 3, 'F')), 'Ongoing');
      key((x, cy) => (doc.setFillColor(...tint(C.accent)), doc.roundedRect(x, cy - 3, 20, 6, 3, 3, 'F')), 'Ended');
      key((x, cy) => (doc.setFillColor(...PROCEDURE), doc.circle(x + 10, cy, 3, 'F')), 'Single date');
      y += 18;

      // Axis: year labels, light gridlines down to the last row, and today
      const axisY = y;
      font('normal', 7.5, C.sub);
      for (let yr = startYear; yr <= y1; yr += step) {
        const x = xOf(new Date(yr, 0, 1).getTime());
        doc.text(String(yr), x, axisY, { align: 'center' });
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.4);
        doc.line(x, axisY + 4, x, endY);
      }
      const tx = xOf(today);
      doc.setDrawColor(...C.accent);
      doc.setLineWidth(0.8);
      doc.setLineDashPattern([2, 2], 0);
      doc.line(tx, axisY + 4, tx, endY);
      doc.setLineDashPattern([], 0);
      font('bold', 7, C.accent);
      doc.text('Today', tx, endY + 9, { align: 'center' });
      y = axisY + 14;
    }
    // Where rows land never depends on what is drawn, so lay out each page first to know where it ends
    const HEADER = 55; // heading (7 + 16), key (18) and axis (14) above the first row, as drawn by newPage
    const pageH = 612;
    const pageBottom = pageH - 52;
    function layout() {
      const pages = [[]];
      let ly = M + 4 + HEADER;
      const room = (h) => {
        if (ly + h > pageBottom) {
          pages.push([]);
          ly = M + 4 + HEADER;
        }
      };
      for (const g of groups) {
        room(ROW * 2);
        pages[pages.length - 1].push({ group: g, y: ly });
        ly += ROW;
        for (const it of g.items) {
          room(ROW);
          pages[pages.length - 1].push({ group: g, item: it, y: ly });
          ly += ROW;
        }
        ly += 6;
      }
      return pages.map((rows) => ({ rows, endY: rows[rows.length - 1].y + 8 }));
    }

    const fit = (text, width) => {
      if (doc.getTextWidth(text) <= width) return text;
      let t = text;
      while (t.length > 1 && doc.getTextWidth(t + '…') > width) t = t.slice(0, -1);
      return t.trimEnd() + '…';
    };

    const pages = layout();
    pages.forEach((pg, i) => {
      newPage(i > 0, pg.endY);
      for (const r of pg.rows) {
        if (!r.item) {
          font('bold', 8.5, C.text);
          doc.text(r.group.title, M, r.y + 4);
          continue;
        }
        const it = r.item;
        font('normal', 8, C.text);
        doc.text(fit(it.label || '', LABEL_W), M + 8, r.y + 3);
        const xs = xOf(it.start);
        if (it.point) {
          doc.setFillColor(...r.group.color);
          doc.circle(xs, r.y + 0.5, 3, 'F');
        } else {
          const xe = xOf(it.ongoing ? today : it.end);
          doc.setFillColor(...(it.ongoing ? r.group.color : tint(r.group.color)));
          doc.roundedRect(xs, r.y - 2.5, Math.max(xe - xs, 4), 6, 3, 3, 'F');
        }
      }
      y = pg.endY + 16;
    });

    if (undated.length) {
      font('normal', 7.5, C.sub);
      const lines = doc.splitTextToSize('Not shown because no start date was entered: ' + undated.join(', ') + '.', W - M * 2);
      if (y + lines.length * 9 > BOTTOM) newPage(true, M + 4 + HEADER);
      doc.text(lines, M, y + 6);
    }
    return true;
  }

  /* ---------- One-page emergency summary ---------- */
  PHP.buildEmergencyPdf = function (state, opts = {}) {
    const { jsPDF } = window.jspdf;
    const e = essentials(state);
    const b = e.basic;
    const facts = [
      ['Date of birth', PHP.isFilled(b.dob) && PHP.fmtDate(b.dob) + ageStr(b.dob)],
      ['Blood type', PHP.ov(b, 'blood')],
      ['Sex', PHP.ov(b, 'sex')],
      ['Height', PHP.fmtHeight(b.height)],
      ['Weight', PHP.isFilled(b.weight) && b.weight + ' lb'],
      ['Organ donor', PHP.ov(b, 'donor')],
      ['Phone', b.phone],
    ].filter(([, v]) => PHP.isFilled(v || ''));

    // Try smaller type until everything fits on one page
    let doc;
    for (const size of [9.5, 8.5, 7.5, 6.5]) {
      doc = draw(size);
      if (doc.getNumberOfPages() === 1) break;
    }
    if (opts.save !== false) doc.save(fileName('Emergency-Summary', e.name));
    return doc;

    function draw(size) {
      doc = new jsPDF({ unit: 'pt', format: 'letter' });
      const { W, font, band, footer } = kit(doc);
      const M = 40;
      let y = band('Emergency Medical Summary', M) + 28;
      font('bold', 14, C.text);
      doc.text(e.name || 'Name not entered', M, y);
      y += 12;

      const table = (headRow, body, extra = {}) => {
        doc.autoTable({
          startY: y,
          margin: { left: M, right: M, top: M, bottom: 40 },
          theme: 'plain',
          head: headRow ? [headRow] : undefined,
          body,
          styles: { font: 'helvetica', fontSize: size, textColor: C.text, cellPadding: { top: 3, bottom: 3, left: 5, right: 5 }, overflow: 'linebreak', valign: 'top' },
          headStyles: { fontStyle: 'bold', fontSize: size - 1, textColor: C.sub, fillColor: C.head },
          bodyStyles: { lineColor: C.border, lineWidth: { bottom: 0.5 } },
          ...extra,
        });
        y = doc.lastAutoTable.finalY;
      };
      const heading = (title) => {
        y += size * 2.2;
        font('bold', size + 2.5, C.text);
        doc.text(title, M, y);
        y += 5;
        doc.setDrawColor(...C.accent);
        doc.setLineWidth(1.5);
        doc.line(M, y, W - M, y);
        y += 4;
      };
      const none = (text) => {
        font('normal', size, C.sub);
        doc.text(text, M + 5, y + size + 4);
        y += size + 10;
      };

      // Key facts, four pairs per row
      if (facts.length) {
        const body = [];
        for (let i = 0; i < facts.length; i += 2) {
          const row = [];
          for (const [label, value] of facts.slice(i, i + 2)) row.push({ content: label, styles: { textColor: C.sub, fontSize: size - 1 } }, value);
          while (row.length < 4) row.push('');
          body.push(row);
        }
        table(null, body, {
          bodyStyles: {},
          columnStyles: { 0: { cellWidth: 80 }, 2: { cellWidth: 80 } },
          didParseCell: (c) => {
            const label = c.row.raw[c.column.index - 1];
            if (label && label.content === 'Blood type') c.cell.styles.fontStyle = 'bold';
          },
        });
      }

      heading('Allergies');
      if (e.noAllergies) none('No known allergies');
      else if (!e.allergies.length) none('None entered');
      else
        table(
          ['Allergic to', 'Severity', 'Reaction'],
          e.allergies.map((a) => [a.name || '', a.severity || '', PHP.ov(a, 'reaction')]),
          {
            didParseCell: (c) => {
              if (c.section === 'body' && c.column.index === 1 && c.cell.raw === 'Severe') {
                c.cell.styles.fontStyle = 'bold';
                c.cell.styles.textColor = C.severe;
              }
            },
          }
        );

      heading('Current medications');
      if (!e.meds.length) none('None entered');
      else table(['Medication', 'Strength', 'How much', 'How often'], e.meds.map((m) => [m.name || '', PHP.medStrength(m), m.amount || '', PHP.medFreq(m)]));

      heading('Current conditions');
      if (!e.conditions.length) none('None entered');
      else table(['Condition', 'Since', 'Notes'], e.conditions.map((c) => [c.name || '', PHP.fmtDate(c.diagnosed), c.notes || '']));

      heading('Emergency contacts');
      if (!e.contacts.length) none('None entered');
      else table(['Name', 'Relationship', 'Phone', 'Notes'], e.contacts.map((c) => [PHP.fullName(c), PHP.ov(c, 'rel'), c.phone || '', c.notes || '']));

      footer(['Emergency Medical Summary', e.name].filter(Boolean).join('  ·  ') + '  ·  A fuller record is kept in the Personal Health Profile', M);
      return doc;
    }
  };

  /* ---------- Wallet card ---------- */
  // Credit-card sized (3.5 x 2 in) front and back side by side: cut around the outside, fold in the middle
  PHP.buildWalletPdf = function (state, opts = {}) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const { font } = kit(doc);
    const e = essentials(state);
    const b = e.basic;
    const CW = 252; // 3.5 in
    const CH = 144; // 2 in
    const X = 54;
    const Y = 90;
    const PAD = 9;

    font('bold', 13, C.text);
    doc.text('Wallet card', X, 54);
    font('normal', 9, C.sub);
    doc.text('Print at actual size (100%). Cut along the outer line, fold on the dotted line, and keep it in your wallet.', X, 70);

    // Cut line and fold line
    doc.setLineDashPattern([3, 3], 0);
    doc.setDrawColor(...C.sub);
    doc.setLineWidth(0.6);
    doc.rect(X, Y, CW * 2, CH);
    doc.setLineDashPattern([1, 2], 0);
    doc.line(X + CW, Y, X + CW, Y + CH);
    doc.setLineDashPattern([], 0);

    // Writes wrapped text inside a box, cutting it off with "…" when it runs out of lines
    const block = (label, text, x, y, w, maxLines, size = 6.5) => {
      font('bold', size, C.text);
      doc.text(label, x, y);
      font('normal', size, C.text);
      let lines = doc.splitTextToSize(text || 'None entered', w);
      if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, '') + '…';
      }
      doc.text(lines, x, y + size + 2);
      return y + size + 2 + lines.length * (size + 1.5) + 4;
    };

    // Front: deep blue strip, name, key facts, allergies, conditions
    doc.setFillColor(...C.bar);
    doc.rect(X, Y, CW, 20, 'F');
    font('bold', 7.5, C.onBar);
    doc.text('MEDICAL INFORMATION', X + PAD, Y + 13);
    let fy = Y + 34;
    font('bold', 10, C.text);
    doc.text(e.name || 'Name not entered', X + PAD, fy);
    fy += 11;
    font('normal', 6.5, C.sub);
    doc.text([PHP.isFilled(b.dob) && 'Born ' + PHP.fmtDate(b.dob), PHP.ov(b, 'blood') && 'Blood type ' + PHP.ov(b, 'blood'), PHP.ov(b, 'donor') === 'Yes' && 'Organ donor'].filter(Boolean).join('  ·  '), X + PAD, fy);
    fy += 10;
    const allergyText = e.noAllergies ? 'No known allergies' : e.allergies.map((a) => (a.severity === 'Severe' ? `${a.name} (severe)` : a.name)).join(', ');
    fy = block('Allergies', allergyText, X + PAD, fy, CW - PAD * 2, 3);
    block('Conditions', e.conditions.map((c) => c.name).join(', '), X + PAD, fy, CW - PAD * 2, Math.max(1, Math.floor((Y + CH - PAD - fy - 10) / 8)));

    // Back: medications and emergency contacts
    const bx = X + CW + PAD;
    let by = Y + PAD + 8;
    // One medication per line: "Lisinopril 20 mg tablet, once daily"
    const medText = e.meds
      .map((m) => {
        const what = [m.name, PHP.medStrength(m)].filter(Boolean).join(' ');
        const freq = PHP.medFreq(m);
        return freq ? `${what}, ${freq.charAt(0).toLowerCase()}${freq.slice(1)}` : what;
      })
      .join('\n');
    by = block('Medications', medText, bx, by, CW - PAD * 2, 8);
    const contactText = e.contacts
      .slice(0, 2)
      .map((c) => [PHP.fullName(c), PHP.ov(c, 'rel') && `(${PHP.ov(c, 'rel')})`, c.phone].filter(Boolean).join(' '))
      .join('\n');
    block('Emergency contacts', contactText, bx, by, CW - PAD * 2, 3);

    if (opts.save !== false) doc.save(fileName('Wallet-Card', e.name));
    return doc;
  };
})();
