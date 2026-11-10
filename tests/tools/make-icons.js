const puppeteer = require('puppeteer-core');
const path = require('path');
const { CHROME } = require('../env');
const OUT = path.join(__dirname, '..', '..', 'icons') + '/';
// Full-bleed square (iOS and Android mask the corners); cross sits well inside the maskable safe zone
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#007ba7"/>
  <path fill="#fff" d="M214 136h84a12 12 0 0 1 12 12v66h66a12 12 0 0 1 12 12v60a12 12 0 0 1-12 12h-66v66a12 12 0 0 1-12 12h-84a12 12 0 0 1-12-12v-66h-66a12 12 0 0 1-12-12v-60a12 12 0 0 1 12-12h66v-66a12 12 0 0 1 12-12z"/>
</svg>`;
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage();
  for (const [name, size] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180], ['favicon-32.png', 32]]) {
    await p.setViewport({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await p.screenshot({ path: OUT + name, omitBackground: false });
  }
  await b.close();
})();
