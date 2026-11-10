/* Personal Health Profile: PDF output
 * Only what the user entered is printed. Empty fields, columns, entries and sections are left out.
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

  function fileName(name) {
    const slug = String(name || '').trim().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
    return ['Health-Profile', slug, PHP.todayISO()].filter(Boolean).join('-') + '.pdf';
  }

  PHP.buildPdf = function (state, ids, opts = {}) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
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
    const font = (style, size, color) => {
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
      doc.setTextColor(...color);
    };

    /* Header: deep blue band across the top of the first page */
    const BAND = 64;
    doc.setFillColor(...C.bar);
    doc.rect(0, 0, W, BAND, 'F');
    font('bold', 19, C.onBar);
    doc.text('Personal Health Profile', M, BAND / 2 + 7);
    font('normal', 9, C.onBarSub);
    doc.text('Updated ' + PHP.fmtDate(PHP.todayISO()), W - M, BAND / 2 + 4, { align: 'right' });
    y = BAND + 30;
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

    // Label / value pairs, two per row; long values take a full row
    function profileTable(sec, values) {
      const pairs = PHP.outputCols(PHP.visibleFields(sec.fields, values), sec.merge)
        .filter((c) => c.filled(values))
        .map((c) => ({ c, v: c.text(values) }));
      if (!pairs.length) return;
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
      doc.autoTable({ ...base, startY: y, body, columnStyles: { 0: { cellWidth: 108 }, 2: { cellWidth: 108 } } });
      y = doc.lastAutoTable.finalY + 6;
    }

    // One table per list; only columns that have something in them
    function listTable(L, rows) {
      if (!rows.length) return;
      ensure(60);
      const cols = PHP.outputCols(L.fields, L.merge).filter((c) => rows.some((e) => c.filled(e)));
      const columnStyles = {};
      cols.forEach((c, i) => {
        if (c.type === 'date') columnStyles[i] = { cellWidth: 74 };
        if (c.type === 'check') columnStyles[i] = { cellWidth: 64 };
        if (c.type === 'phone') columnStyles[i] = { cellWidth: 86 };
      });
      doc.autoTable({
        ...base,
        startY: y,
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
      });
      y = doc.lastAutoTable.finalY + 6;
    }

    /* Sections */
    for (const sec of PHP.SECTIONS) {
      if (!ids.includes(sec.id)) continue;
      const d = state.data[sec.id];
      if (!PHP.sectionHasData(sec, d)) continue;
      heading(sec.title);

      if (sec.kind === 'profile') {
        profileTable(sec, d.values || {});
      } else if (sec.list.noneLabel && d.none) {
        font('normal', 8.5, C.text);
        doc.text(sec.list.noneLabel, M + 6, y + 12);
        y += 20;
      } else {
        const L = sec.list;
        const rows = ((d.lists || {})[L.key] || []).filter((e) => PHP.entryHasData(L, e));
        if (L.split) {
          const { current, past } = PHP.splitEntries(L, rows);
          if (current.length && past.length) subheading('Current');
          listTable(L, current);
          if (past.length) {
            subheading('Past');
            listTable(L, past);
          }
        } else {
          listTable(L, L.choices ? PHP.choiceOrder(L, rows) : PHP.sortEntries(L, rows));
        }
      }
      y += 28; // space between sections
    }

    /* Footer on every page */
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      font('normal', 8, C.sub);
      doc.text(['Personal Health Profile', name].filter(Boolean).join('  ·  '), M, H - 28);
      doc.text(`Page ${i} of ${n}`, W - M, H - 28, { align: 'right' });
    }

    if (opts.save !== false) doc.save(fileName(name));
    return doc;
  };
})();
