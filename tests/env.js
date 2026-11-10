// Shared settings for the browser tests
const fs = require('fs');
const path = require('path');

// Address of the running app. run.js sets this; when running a single test by hand, start a server on 8765 first.
const BASE = process.env.BASE_URL || 'http://localhost:8765/';

// puppeteer-core drives an installed Chrome rather than downloading its own
const CHROME =
  process.env.CHROME_PATH ||
  {
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    linux: '/usr/bin/google-chrome',
  }[process.platform];

// Screenshots and generated PDFs, for checking the result by eye
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

module.exports = { BASE, CHROME, OUT };
