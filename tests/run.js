// Serves the app on a free port and runs the browser tests against it.
//   npm test            all tests
//   npm test -- home    only tests whose file name contains "home"
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const file = path.normalize(path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(ROOT + path.sep) || file.startsWith(__dirname)) {
    res.writeHead(404).end();
    return;
  }
  fs.readFile(file, (err, body) => {
    if (err) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
});

server.listen(0, '127.0.0.1', () => {
  const base = `http://localhost:${server.address().port}/`;
  const filter = process.argv[2] || '';
  const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js') && f.includes(filter)).sort();
  if (!files.length) {
    console.error(`No test files match "${filter}".`);
    server.close();
    process.exitCode = 1;
    return;
  }

  // Each test runs in its own process, one after another. They are started asynchronously so this
  // process stays free to keep serving the app.
  let failed = 0;
  (async () => {
    for (const f of files) {
      console.log(`\n=== ${f}`);
      const code = await new Promise((resolve) => {
        const child = spawn(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit', env: { ...process.env, BASE_URL: base } });
        child.on('exit', resolve);
      });
      if (code !== 0) failed++;
    }
    console.log(failed ? `\n${failed} of ${files.length} test files failed.` : `\nAll ${files.length} test files passed.`);
    server.close();
    server.closeAllConnections(); // a test that crashed can leave its browser holding a connection open
    process.exitCode = failed ? 1 : 0;
  })();
});

