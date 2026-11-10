# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Personal Health Profile: a static, offline-capable web app where people record their health information and export it as a PDF for appointments. Plain HTML/CSS/JS with no framework, build step, package manager or backend. All user data lives in the browser's `localStorage`; nothing is sent anywhere. Deployed with GitHub Pages from `main` (root folder) at https://masonnicoletti.github.io/personal-health-profile/.

## Commands

```
python3 -m http.server 8765      # run locally, then open http://localhost:8765
```

- `http://localhost:8765/#form` opens the form directly, skipping the home screen.
- There is no build or lint step.

Browser tests (headless Chrome via `puppeteer-core`, which uses the installed Chrome; set `CHROME_PATH` if it isn't in the default place):

```
cd tests && npm install          # first time only
npm test                         # serves the app on a free port and runs every *.test.js
npm test -- form                 # only test files whose name contains "form"
BASE_URL=http://localhost:8765/ node form.test.js   # one file against a server you started yourself
npm run icons                    # regenerate icons/ from the SVG in tools/make-icons.js
```

- `form.test.js`: sections, fields, checklists, autofill, migration of old saved data, PDF generation. `home.test.js`: home screen, tutorial, Settings, erase confirmation. `offline.test.js`: manifest, service worker, offline use, install tip, backup reminder.
- Each file prints PASS/FAIL lines and exits non-zero on any failure. Screenshots and a sample PDF are written to `tests/out/` (gitignored) for checking by eye.
- Tests reach into the page through `PHP._debug.state` (live state) and `PHP.buildPdf(state, ids, { save: false })`. Timing matters: `<dialog>` close events are asynchronous, so wait briefly before asserting what a closed dialog led to.
- When changing fields or sections, update the matching assertions (labels, section order, migration cases) and `sample.js`.
- Settings → Load sample data fills every section with the fictional profile from `sample.js`.
- A push to `main` is live for testers within minutes. Commit locally, then confirm with the user before pushing.

## Architecture

Scripts load in order from `index.html` and share one global namespace, `window.PHP`: `vendor/` (jsPDF 2.5.1 + AutoTable 3.8.2, kept local so the app works offline) → `schema.js` → `pdf.js` → `sample.js` → `app.js`.

**`schema.js` is the single source of truth.** `PHP.SECTIONS` declares every section and field. The form (`app.js`) and the PDF (`pdf.js`) are both generated from it, so adding, removing or renaming a field is normally a schema-only change. It also holds the shared data helpers (`fieldFilled`, `fieldText`, `entryHasData`, `sectionHasData`, `outputCols`) and `PHP.migrate`.

- **Section kinds:**
  - `profile`: a single record of `fields`.
  - `list`: repeating entries, configured on `list`. Options:
    - `kind: 'history'` with `sortBy`: newest first.
    - `split: 'current'`: Current and Past groups, driven by a `current` checkbox field that has `meta: true` and `defaultOn: true` and comes first in the fields.
    - `questionnaire`: Medical History's condition checklist; each checked item becomes an entry linked by `e.q`.
    - `choices`: Allergies; the whole section is a checklist whose entries carry `q`, and `'Other'` allows several.
    - `noneLabel`: a "No known …" checkbox.
- **Field types:** `text`, `long`, `date`, `phone`, `number` (optional `unit`), `height`, `select`, `check`, `checklist`, `heading`, `group` (a repeating set of sub-fields stored as an array on the entry, e.g. a relative's conditions; `format(item)` controls its PDF text).
  - Field options: `showIf(values)` for conditional fields, `suggest()` for datalist suggestions, `pdfLabel` for a shorter PDF label.
  - Any `select` whose options include `'Other'` automatically gets a text box stored at `<key>Other`. Use `PHP.ov(obj, key)` to read the effective value.
  - Select `opts` can be a function (e.g. offices and providers come from the Providers section via `PHP.getState()`).
- **List options:** `merge` combines several fields into one PDF column (names, addresses), and `autofill(entry, changedKey)` pre-fills fields (providers copy address and phone from a matching office).
- **Order:** set by the `ORDER` array at the bottom of the section list; optional sections (listed as rows under "Additional Sections" until added) follow, and Notes & Questions is always last.
- **Stored value formats:**
  - Dates: `"YYYY-MM-DD"`, where any part may be blank (`"2014--"`).
  - Height: `"ft-in"`.
  - Phone: stored already formatted as `(XXX) XXX-XXXX`.
  - "Empty" means `PHP.isFilled` returns false.

**Data and storage.** State is `{ v, data: { [sectionId]: { values, lists: { main: [entries] }, none } }, added: [optional section ids], open: {…} }`, saved with a debounced write to `localStorage['php.profile.v1']`. Tips and reminder state (install tip dismissed, last backup, snooze) live separately in `php.meta.v1`, so erasing or restoring a profile doesn't bring them back.

**Every structural change to saved data must keep old data working.**
- `normalize()` in `app.js` runs `PHP.migrate()` on every load and on backup restore. Migrations must be idempotent, so guard them on the presence of old keys.
- Never silently drop user text. When a field is removed, the convention is to append its value to the entry's `notes` (e.g. `"Managed by: …"`).
- Renamed or merged sections also need their `open`/`added` ids mapped in `normalize()`.

**`app.js`**
- Renders two screens, toggled by `location.hash` (`#form`) with `history` entries so the back gesture works:
  - Home: Get Started, which opens the tutorial, or Update Profile plus quick actions.
  - Form.
- Section changes re-render the whole section via `rerender(id)`. The `editing` set (which entries are open for editing) is UI-only and not saved.
- Dialogs (Save PDF, preview, Settings, Share, Privacy, Instructions, tutorial, confirm) are native `<dialog>` elements. `.panel` dialogs fill the screen on phones. Close a dialog before showing a toast, because the modal's top layer hides it.
- Destructive actions call `snapshot()` first, then show an Undo toast.

**PDF preview** (in `app.js`) renders the same jsPDF output to canvases with PDF.js (`vendor/pdfjs/`), injected as a script only on first use. PDF.js is deliberately not in the service worker's `ASSETS`, to avoid a 1.4 MB download for everyone; it's cached once used.

**`pdf.js`** has three outputs, chosen by the presets in the Save PDF panel (`PRESETS` in `app.js`; the last choice and a custom selection are kept in `php.meta.v1`):
- `buildPdf`: the full profile or chosen sections. Prints only what is filled in: empty fields, columns, entries and sections are omitted, columns come from `PHP.outputCols` (list `merge` keeps tables narrow), and split lists print separate Current and Past tables. `keepTogether` uses a throwaway probe document to move a section to the next page when a break would strand one or two rows.
- `buildEmergencyPdf`: one page of allergies, current medications and conditions, key facts and emergency contacts; it retries at smaller type sizes until it fits.
- `buildWalletPdf`: a 3.5 × 2 in fold-over card drawn on a letter page.

**`sw.js`** is network-first with a cache fallback, so updates reach users on their next load. When adding a new static file, add it to `ASSETS` there too, or it won't work offline.

## Design conventions the user has set

- The form bar has no Home button; its icon and title lead back to the home screen (installed iPhone apps have no back gesture).
- Easy for anyone to use: large text and tap targets, minimal wording, nothing required, plain labels. Don't frame the app or its copy around a particular age group.
- No icons in the form. The only exceptions are the circular "?" info buttons, which show a short "What to add / Why it helps" panel.
- Colors are tokens in `:root` in `styles.css`: deep blue menu bar (`--bar`, `#12305a`) with light text (`--on-bar`), cerulean accent (`--accent`, `#007ba7`), light grey page background. Section headers are unshaded.
- Data from other sections is offered as dropdowns or suggestions rather than retyped (offices, providers).
