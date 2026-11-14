# Personal Health Profile

A simple web form for keeping your health information in one organized place, then turning it into a clean PDF to bring to appointments.

## Privacy

Everything you enter is saved **only in the browser on your own device**. Nothing is sent to a server, and no one else can see it. Each person who opens the link gets their own separate profile.

Because of this:

- Your information does not sync between devices. Use **Settings → Save a backup** to move it or keep a copy.
- Clearing your browser data erases it.
- On iPhone and iPad, add the page to your Home Screen (Share → Add to Home Screen). Safari can erase data from websites you have not opened in 7 days.

## What it covers

Personal information, medical history (current and past conditions), allergies, medications (current and past), surgeries and procedures, family history, lifestyle, providers (current and past), insurance, emergency contacts, and a notes and questions log.

Under Additional Sections you can add: immunizations, an appointment log, supplements, hospital stays, tests and screenings, reproductive health, a vitals log, devices and implants, vision, hearing, and dental. Each one appears next to the section it relates to (for example, supplements after medications), and notes and questions always stays last.

Save PDF offers the full profile, a "New doctor" version, a one-page emergency summary, a fold-over wallet card, or sections you choose.

No field is required. The PDF includes only what you have filled in.

## Running it

It is a static site with no build step and no dependencies to install.

```
python3 -m http.server 8765
```

Then open http://localhost:8765. To publish it, upload this folder to any static host (GitHub Pages, Netlify, Cloudflare Pages).

## Tests

Browser tests live in `tests/` and drive an installed Google Chrome. They need Node.js and are only for development; the app itself has no dependencies.

```
cd tests
npm install
npm test
```

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page layout |
| `styles.css` | Colors, type and layout |
| `js/schema.js` | Every section and field. Edit here to add, remove or rename fields |
| `js/core.js` | Shared helpers, autosave and undo |
| `js/fields.js`, `js/sections.js` | The form: fields, sections and entries |
| `js/screens.js` | Home screen, tutorial, Settings (backup and restore), sharing and tips |
| `js/pdf-panel.js` | The Save PDF panel and preview |
| `js/main.js` | Starts the app |
| `js/pdf.js` | PDF output: full profile, emergency summary and wallet card |
| `js/sample.js` | Fictional sample profile used by the tests (not loaded by the app) |
| `manifest.webmanifest`, `icons/` | Lets people install it to their Home Screen like an app |
| `sw.js` | Offline support. Caches only the app's own files, never health information |
| `vendor/` | [jsPDF](https://github.com/parallax/jsPDF) 2.5.1 and [jsPDF-AutoTable](https://github.com/simonbengtsson/jsPDF-AutoTable) 3.8.2 (MIT) create the PDF; [PDF.js](https://github.com/mozilla/pdf.js) 3.11.174 (Apache 2.0) draws the preview. Included so the app works offline |

## License

[MIT](LICENSE). The bundled jsPDF and jsPDF-AutoTable libraries keep their own MIT licenses, and PDF.js keeps its Apache 2.0 license (`vendor/pdfjs/LICENSE`).
