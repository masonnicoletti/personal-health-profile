# Plan: split `app.js` into a `js/` folder

Status: planned, not started (written 2026-11-09). Agreed with the project owner; deferred to its own session so behaviour changes and code moves are never mixed.

## Goal

`app.js` is ~1,400 lines and mixes six jobs. Split it by job into a `js/` folder, move the other app scripts in with it, and change **nothing** a user can see or anything stored on their device. Success = every existing test passes unchanged, plus the manual checks at the end.

Expected effort: 30–45 minutes, plus up to 15–20 minutes if load-order problems show up.

## Files that must stay where they are

- `index.html`: GitHub Pages serves it as the home page.
- `sw.js`: a service worker only controls pages in its own folder and below. Moved into `js/`, it would stop covering the site, and GitHub Pages cannot send the `Service-Worker-Allowed` header that would fix that.
- `manifest.webmanifest`, `icons/`, `vendor/`, `styles.css`, docs: unchanged.

## Target layout

| New file | Takes from today's `app.js` | Approx. lines |
| --- | --- | --- |
| `js/core.js` | Setup (`$`, `h`, `uid`, `plural`, id counter), State (`blank`, `normalize`, `load`, `save`, `flush`, `status`, `pagehide` and `storage` listeners, `sd`, `listArr`, `active`, `hasAnyData`), Undo (`snapshot`, `undo`, `toast`, `hideToast`), and from Notices: `META`, `getMeta`, `setMeta`, plus the `btn` helper | ~200 |
| `js/fields.js` | Fields: `fieldGrid`, `field` (with the group, heading, height and number branches), `phoneBehavior`, `checklist`, `dateInput` | ~310 |
| `js/sections.js` | Sections (`entriesWithData`, `count`, `summary`, `onChange`, `infoEl`, `closeInfos`, `setOpen`, `renderSection`, `listBlock`, `focusChoice`, `hasDetails`, `questionnaireEl`, `choicesBlock`, `entryEl`, `focusFirst`, `rerender`), Actions (`addEntry`, `done`, `removeEntry`, `addSection`, `removeSection`, `goTo`), Page chrome (`renderNav`, `renderAdd`, `renderAll`, `spy` and the scroll, click and Escape listeners) | ~430 |
| `js/screens.js` | Screens (`showView`, `goForm`, `goHome`, `popstate`, Home button), `renderHome`, `quickAdd`, Tutorial and Instructions (`STEPS`, `MORE_STEPS`, tour), Privacy button, `askConfirm`, Settings (`download`, `replaceState`, `dayOf`, `openSettings`, `exportBackup`, restore, tutorial, sample, erase), Share, Notices (`standalone`, `isIOS`, `amountEntered`, install prompt listeners, `notice`, `renderNotices`, `protectStorage`) | ~330 |
| `js/pdf-panel.js` | Save PDF: `PRESETS`, `presetIds`, `choosePreset`, `ticked`, `openPdf`, `makePdf`, `loadPdfjs`, preview, Save buttons | ~170 |
| `js/main.js` | Start: `renderAll()`, `showView(...)`, `protectStorage()`, service worker registration, `PHP._debug` | ~20 |
| `js/schema.js`, `js/pdf.js`, `js/sample.js` | Moved as they are, with `git mv`. `sample.js` is not loaded by the app; update `useSample` in `tests/env.js` to `BASE + 'js/sample.js'` | n/a |

Today's section markers (`/* ---------- State ---------- */` and so on) line up with these groups, so most of the move is cutting at those markers.

## How the files share code

Every file stays an IIFE and shares one object: `const A = (PHP.app = PHP.app || {});`

1. **Everything shared lives on `A`.** Each file assigns what it exports (`A.renderAll = renderAll;`) and calls other files' functions as `A.fn()` **at call time**. Never destructure another file's function at load time (`const { renderNotices } = A` in `sections.js` would capture `undefined`, because `screens.js` loads later). Destructuring helpers from `core.js` at the top of later files is fine, because `core.js` loads first.
2. **`state` is reassigned**, so it must live on `A`, not in a `let` per file. It is replaced in `undo()`, `replaceState()` and the `storage` listener. Every read becomes `A.state`. A plain search for `state` will also hit `PHP.getState`, `state.data`, `state.added`, `state.open` and `normalize`'s argument, so go through them one at a time.
3. **`PHP.getState = () => state`** must become `() => A.state`. `schema.js` uses it for provider, office, pharmacy and sex lookups.
4. **`PHP._debug.state`** is a getter the tests rely on. Keep it, returning `A.state`, in `main.js`.
5. **Shared mutable values move to `A`:** `editing` (a Set: mutate it, never reassign), the id counter `seq` (make it `A.nextId()`), and `undoSnap` (only `core.js` needs it).
6. **Cross-file calls to check** (all must go through `A.`):
   - `undo` → `renderAll`
   - `renderAll` → `renderHome`
   - `done` → `renderNotices`, `protectStorage`
   - `addSection` / `goTo` → `setOpen`
   - `renderHome` → `quickAdd`, `openPdf`
   - `quickAdd` → `goForm`, `renderAll`, `rerender`, `focusFirst`
   - `exportBackup` → `renderNotices`
   - the `storage` listener → `renderAll`
   - `fields.js` (group removal) → `snapshot`, `toast`
   - `sections.js` → `fieldGrid`
   - `pdf-panel.js` → `active`, `getMeta`, `setMeta`, `toast`
7. **Load order in `index.html`**, after the vendor scripts: `js/schema.js`, `js/pdf.js`, `js/core.js`, `js/fields.js`, `js/sections.js`, `js/screens.js`, `js/pdf-panel.js`, `js/main.js`. Only `main.js` may run start-up code that calls into other files.
8. **Element lookups at load** (`$('#tourDialog')`, `$('#settingsDialog')`, `$('#pdfDialog')`, `$('#previewDialog')`, `$('#shareDialog')`) are fine anywhere, because the scripts sit at the end of `<body>`. Keep each with its feature.
9. **Keep names that collide on separate files:** `dlg` (Save PDF), `settings`, `share`, `preview` and `tour` are file-local today and should stay that way.

## Steps

1. Run `cd tests && npm test` and confirm everything passes before touching anything.
2. `git mv schema.js pdf.js sample.js js/`
3. Create the six new files by cutting `app.js` at its section markers as listed above. Move code as it is; the only edits are the `A.` changes. No renames, no tidying, no behaviour changes. Then delete `app.js`.
4. Update `index.html` script tags (order in point 7 above).
5. Update `sw.js`: `ASSETS` gets the new `js/...` paths and drops `app.js`, `schema.js` and `pdf.js`. Bump `CACHE` to the next version (it is `'php-v2'` as of this writing) so phones drop the old copies.
6. Update the docs: CLAUDE.md (script load order line, `schema.js` / `app.js` / `pdf.js` mentions, the PDF preview note) and the README files table. Remove "a `js/` folder" from future plans.
7. `cd tests && npm test`. Nothing in `tests/` references script paths (they use the DOM, `PHP._debug.state`, `PHP.buildPdf` and similar), so no test should need editing. If one does, that is a sign behaviour changed.
8. Manual smoke test at `python3 -m http.server 8765`:
   - Get Started and tutorial
   - add and edit an entry in Medications, Providers and Allergies
   - the Medical History checklist
   - Undo after a removal
   - Save PDF Preview for all five presets
   - Settings: backup, restore, share
   - reload, and confirm data persists
   - the browser console stays clear of errors
9. Commit (`Split app.js into js/ by job; no behaviour changes`). Push only when the project owner says so.
10. Delete the `planned-app-js-split` memory note and this plan's "Status" line, or mark it done.

## Grep checks before committing

```
grep -n "state\b" js/*.js | grep -v "A.state\|getState\|\.state\b"   # stray bare state references
grep -n "^  const {.*} = A" js/*.js                                    # load-time destructuring of later files
grep -rn "app.js\|\"schema.js\|'schema.js\|\"pdf.js\|'pdf.js" index.html sw.js CLAUDE.md README.md
```

## Rollback

Everything is one commit on top of `main`, so `git revert` or `git reset --hard origin/main` (before pushing) undoes it completely. No saved user data is touched.
