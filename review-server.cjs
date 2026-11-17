const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const file = 'index.html';
if (!fs.existsSync(path.join(__dirname, file))) throw new Error('index.html was not found.');
const port = 8765;
const url = `http://127.0.0.1:${port}/`;
function openBrowser() {
  spawn('cmd.exe', ['/c', 'start', '', url], { windowsHide: true, stdio: 'ignore' }).unref();
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.pdf': 'application/pdf', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.md': 'text/markdown; charset=utf-8', '.webm': 'video/webm' };
const root = path.resolve(__dirname);
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, url).pathname);
  // 시험용: 확장자 없는 인터넷 사진 주소 흉내 (/noext/photo1 → test-media/photo1.jpg)
  if (pathname.startsWith('/noext/')) {
    const f = path.join(root, 'test-media', path.basename(pathname) + '.jpg');
    if (fs.existsSync(f)) { res.writeHead(200, { 'content-type': 'image/jpeg' }); return fs.createReadStream(f).pipe(res); }
  }
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('sense-director-v2');
  }
  const target = path.resolve(root, '.' + (pathname === '/' ? '/' + file : pathname));
  const rel = path.relative(root, target);
  const allowed = target === path.join(root, file) || rel.split(path.sep)[0] === 'assets' || rel.split(path.sep)[0] === 'test-media';
  if (!allowed || rel.startsWith('..') || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404); return res.end('Not found');
  }
  const headers = { 'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };
  const size = fs.statSync(target).size, range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
  if (range) {
    const a = range[1] ? +range[1] : 0, b = range[2] ? +range[2] : size - 1;
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': b - a + 1 });
    return fs.createReadStream(target, { start: a, end: b }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
  fs.createReadStream(target).pipe(res);
});
server.on('error', err => {
  if (err.code !== 'EADDRINUSE') throw err;
  http.get(url + 'health', res => {
    let data = '';
    res.on('data', part => data += part);
    res.on('end', () => {
      if (data === 'sense-director-v2') openBrowser();
      else { console.error('Port 8765 is in use by another application.'); process.exitCode = 1; }
    });
  }).on('error', error => { console.error(error.message); process.exitCode = 1; });
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Sense Director: ${url}`);
  console.log('Keep this window open while reviewing. Close it to stop the server.');
  if (!process.argv.includes('--no-browser')) openBrowser();
});
