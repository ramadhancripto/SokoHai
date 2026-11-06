#!/usr/bin/env node
/**
 * SokoHai local preview server.
 *
 *   node tools/dev_server.mjs [port]      (default 5055)
 *
 * Serves the repository root as a static site — the same files the browser
 * loads from index.html, including uncommitted working-tree changes. It does
 * NOT build dist/ and does NOT rebuild index.html (tools/build_html.py build
 * is destructive; never call it).
 *
 * Bind: 0.0.0.0 so the Arena preview proxy can reach it.
 * No emulator injection: with no window.SKH_EMULATOR the app uses its normal
 * configured Firebase project (see js/app/00-bootstrap.js). To run against the
 * local emulators you also need the emulators themselves on 8085/9099.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 5055);
const HOST = '0.0.0.0';

function readBuild() {
  try {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const m = html.match(/name="skh-build"\s+content="([^"]+)"/);
    return m ? m[1] : 'unknown';
  } catch (e) { return 'unknown'; }
}
const BUILD = readBuild();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  }, headers || {}));
  res.end(body);
}

function notFound(res, rel) {
  send(res, 404, 'Not found: ' + rel, { 'Content-Type': 'text/plain; charset=utf-8' });
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    return send(res, 400, 'Bad request', { 'Content-Type': 'text/plain' });
  }
  if (urlPath.endsWith('/')) urlPath += 'index.html';

  // Resolve inside ROOT only — no path traversal.
  const abs = path.normalize(path.join(ROOT, urlPath));
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) return notFound(res, urlPath);

  /* The preview is reachable through a public proxy, so serve only what the
     browser actually needs. Server source, rules, seed scripts and reports
     stay private (same intent as the allow-list in tools/build_dist.mjs). */
  const rel = '/' + path.relative(ROOT, abs).split(path.sep).join('/');
  const DENY_DIRS = ['/tools/', '/functions/', '/html/', '/.git/', '/node_modules/', '/audit/'];
  const DENY_FILES = [/^\/firestore\.rules$/, /^\/firestore\.indexes\.json$/, /^\/firebase\.json$/,
    /^\/package(-lock)?\.json$/, /\.md$/i, /\.backup/i, /\.bak$/i, /\.patch$/i, /\.log$/i,
    /\.env/i, /service-account/i, /adminsdk/i, /^\/\.[^/]+/];
  if (DENY_DIRS.some(d => rel.startsWith(d)) || DENY_FILES.some(r => r.test(rel))
      || /^\/[^/]*\.(rules|mjs)$/i.test(rel)) {
    return send(res, 404, 'Not found: ' + urlPath, { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) {
      // Unknown path with no extension: fall back to the app shell.
      if (!path.extname(urlPath)) {
        const shell = path.join(ROOT, 'index.html');
        return fs.readFile(shell, (e2, buf) => {
          if (e2) return notFound(res, urlPath);
          send(res, 200, buf, { 'Content-Type': MIME['.html'] });
        });
      }
      return notFound(res, urlPath);
    }
    const type = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
    const isHtml = type.startsWith('text/html');
    const headers = {
      'Content-Type': type,
      'Content-Length': st.size,
      /* [2026-11-05] Bila hivi, browser/proxy ya preview ilikuwa inaonyesha
         toleo la kale la CSS/JS (local server ilionekana tofauti na screen shot). */
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-SokoHai-Build': BUILD,
      'Access-Control-Allow-Origin': '*'
    };
    /* kwa HTML: futa HTTP cache ya kivinjari kila ukurasa unapopakiwa */
    if (isHtml) headers['Clear-Site-Data'] = '"cache"';
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(abs)
      .on('error', () => res.destroy())
      .pipe(res);
  });
});

server.on('error', (e) => {
  console.error('[dev_server] ' + (e.code === 'EADDRINUSE'
    ? 'port ' + PORT + ' is already in use — stop that process first'
    : 'error: ' + e.message));
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('[dev_server] SokoHai preview: http://' + HOST + ':' + PORT + '/');
  console.log('[dev_server] root: ' + ROOT);
  console.log('[dev_server] mode: static (no emulator injection, no dist build)');
});
