// Static preview mode ya functions/local-server.js (`npm run local:static`).
// Inahakikisha: frontend inaserved kama hosting (bila /__fn injection),
// assets zinafanana byte-kwa-byte, na hakuna functions zinazopakiwa.
// Haihitaji credentials wala `npm --prefix functions install`.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5100 + Math.floor(Math.random() * 500);
const B = 'http://127.0.0.1:' + PORT;

const child = spawn(
  process.execPath,
  [path.join('functions', 'local-server.js'), '--static'],
  {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), SKH_HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe']
  }
);

let log = '';
child.stdout.on('data', d => (log += d));
child.stderr.on('data', d => (log += d));

let passed = 0;
const fails = [];
const ok = (c, n, x) =>
  c ? passed++ : fails.push(n + (x !== undefined ? ' → ' + JSON.stringify(x) : ''));

try {
  for (let i = 0; i < 60 && !/LOCAL FUNCTIONS SERVER/.test(log); i++) {
    await new Promise(r => setTimeout(r, 200));
  }

  ok(/STATIC PREVIEW/.test(log), 'inaanza bila credentials (static preview)', log.slice(-300));
  ok(!/Hakuna credentials zilizopatikana/.test(log), 'haidai credentials');

  const html = await (await fetch(B + '/')).text();
  const disk = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok(html === disk, 'index.html inaserved byte-kwa-byte kama ilivyo kwenye disk');
  ok(!/SKH_FUNCTIONS_URL|SKH_LOCAL_FUNCTIONS_SERVER/.test(html), 'hakuna /__fn injection');
  ok(/js\/00-config\.js/.test(html), 'ukurasa unatumia config halisi ya app');

  const css = await fetch(B + '/css/00-tokens.css');
  ok(css.status === 200, 'CSS inaserved');
  ok(/text\/css/.test(css.headers.get('content-type') || ''), 'CSS content-type sahihi', css.headers.get('content-type'));
  ok(!/--green:\s*#18A982/.test('') && /#18A982/.test(await css.text()), 'tokens halisi (--green #18A982)');

  const js = await fetch(B + '/js/app/105-calls.js');
  ok(js.status === 200 && /javascript/.test(js.headers.get('content-type') || ''), 'JS module inaserved na MIME sahihi');

  for (const p of ['/functions/local-server.js', '/tools/build_html.py', '/html/00-head.html', '/node_modules/playwright/package.json']) {
    const r = await fetch(B + p);
    ok(r.status === 404, 'imezuiwa: ' + p, r.status);
  }

  const fn = await fetch(B + '/__fn/creativePublish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { creativeId: 'x' } })
  });
  const fnBody = await fn.text();
  ok(fn.status >= 400, 'hakuna callable inayotekelezwa', { status: fn.status, body: fnBody.slice(0, 120) });

  const spa = await fetch(B + '/baadhi/ya/ukurasa');
  ok(spa.status === 200 && (await spa.text()) === disk, 'SPA fallback → index.html');

  const lan = fs.readFileSync(path.join(ROOT, 'functions', 'local-server.js'), 'utf8');
  ok(/SKH_STATIC_ONLY|--static/.test(lan), 'flag ya static mode ipo kwenye code');
} finally {
  child.kill('SIGTERM');
}

if (fails.length) {
  console.log('LOCAL SERVER (static mode): ' + passed + ' passed, ' + fails.length + ' FAILED');
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('LOCAL SERVER (static mode): ' + passed + ' passed, 0 failed');
