# Personal Health Profile

A simple web form for keeping your health information in one organized place, then turning it into a clean PDF to bring to appointments.

## Privacy

Everything you enter is saved **only in the browser on your own device**. Nothing is sent to a server, and no one else can see it. Each person who opens the link gets their own separate profile.

Because of this:

- Your information does not sync between devices. Use **Settings → Save a backup** to move it or keep a copy.
- Clearing your browser data erases it.
- On iPhone and iPad, add the page to your Home Screen (Share → Add to Home Screen). Safari can erase data from websites you have not opened in 7 days.

## What it covers

Basic information, lifestyle, family history, medical history (current and past conditions), medications (current and past), surgeries, immunizations, allergies, providers (current and past), insurance, emergency contacts, and a notes and questions log.

You can also add optional sections: an appointment log, supplements, hospital stays, tests and screenings, a vitals log, devices and implants, vision, hearing, and dental. Notes and questions always stays last.

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
| `schema.js` | Every section and field. Edit here to add, remove or rename fields |
| `app.js` | Form behavior, autosave, backup and restore |
| `pdf.js` | PDF output |
| `sample.js` | Fictional sample profile, loaded from Settings → Load sample data |
| `manifest.webmanifest`, `icons/` | Lets people install it to their Home Screen like an app |
| `sw.js` | Offline support. Caches only the app's own files, never health information |
| `vendor/` | [jsPDF](https://github.com/parallax/jsPDF) 2.5.1 and [jsPDF-AutoTable](https://github.com/simonbengtsson/jsPDF-AutoTable) 3.8.2 (MIT), included so the app works offline |

## License

[MIT](LICENSE). The bundled jsPDF and jsPDF-AutoTable libraries keep their own MIT licenses.
