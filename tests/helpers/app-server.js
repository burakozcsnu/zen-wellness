// Serves the app from disk on a free port. page.route cannot see a service worker's own update fetch of sw.js,
// so specs that need a different sw.js on update use this server and its `swapSw` hook.
const fs = require('fs');
const http = require('http');
const path = require('path');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

// swapSw: () => string | null; a string replaces the body of /sw.js (null serves the file on disk).
async function startAppServer(swapSw = () => null) {
  const server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://x').pathname.replace(/^\/$/, '/index.html');
    const type = TYPES[path.extname(name)] || 'application/octet-stream';
    const swapped = name === '/sw.js' ? swapSw() : null;
    if (swapped !== null) return res.writeHead(200, { 'Content-Type': type }).end(swapped);
    fs.readFile(path.join(process.cwd(), path.normalize(name)), (error, body) => error ? res.writeHead(404).end() : res.writeHead(200, { 'Content-Type': type }).end(body));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() };
}

module.exports = { startAppServer };
