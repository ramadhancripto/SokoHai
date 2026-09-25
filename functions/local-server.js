#!/usr/bin/env node
/* ==========================================================================
   SokoHai LOCAL FUNCTIONS SERVER — Cloud Functions bila Cloud Billing.

   Inaendesha functions ZILEZILE za functions/index.js (hakuna nakala ya logic):
     • Callables zote (creativePublish, creativeSaveDraft, adsRequestDelivery, ...)
       kwa protokali rasmi ya Firebase callable: POST /__fn/<jina>  {data} → {result}
     • HTTPS functions (pesapalIpn, sitemapXml) kwenye /__fn/<jina>
     • Scheduled functions (adsDeliverySweep, platformStatsHourly, sokopayAutoRelease)
       kwa kipima-muda cha ndani
     • Pia inaserve frontend (kama Firebase Hosting) kwenye http://localhost:5055

   Data ni HALISI (isipokuwa ukitumia Firebase Emulator): inaandika
   Firestore/Auth ya project sokonet-3b847 (Spark plan — haihitaji billing).

   UTAMBULISHO (credentials) — kwa mpangilio huu (hakuna key inayochapishwa):
     A) Firebase Emulator (SALAMA ZAIDI kwa majaribio — haigusi production):
          FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
          GCLOUD_PROJECT=demo-sokohai  → credentials HAZIHITAJIKI.
     B) Faili la service account (kama lipo; njia ya zamani bado inafanya kazi):
          SKH_SERVICE_ACCOUNT → GOOGLE_APPLICATION_CREDENTIALS →
          ~/.sokohai/service-account.json → functions/service-account.json
     C) Google Application Default Credentials (hakuna key ya kuunda —
        inafaa pale org policy inazuia service-account keys):
          gcloud auth application-default login
          gcloud auth application-default set-quota-project sokonet-3b847
        (faili: %APPDATA%\gcloud\application_default_credentials.json au
         ~/.config/gcloud/application_default_credentials.json)

   Matumizi:
     1. cd functions && npm install
     2. npm run local            (au: node local-server.js)
     3. Fungua http://localhost:5055

   Mazingira (hiari):
     PORT=5055  SKH_ALLOWED_ORIGINS=https://a.com,https://b.com  SKH_STATIC=0 (usiserve frontend)
     SKH_HOST=127.0.0.1 (default — kompyuta hii TU). SKH_HOST=0.0.0.0 = LAN/Wi-Fi (hatari, kwa makusudi tu)
     SKH_RUN_SCHEDULES=1 (washa scheduled jobs; default IMEZIMWA — zinaweza kubadilisha data/pesa halisi)
     SKH_ALLOW_PROD_SCHEDULES=1 (inahitajika PIA ili schedules ziendeshwe dhidi ya production)
     SKH_SERVICE_ACCOUNT_ID=<sa-email> (hiari, kwa createCustomToken ukitumia ADC)
     ADMIN_EMAILS=a@b.com (email za admin — lazima ziwe verified — kwa functions za admin)
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

/* ---------- 0. Load local environment ---------- */
// `functions/.env` inasomwa kabla ya process.env kutumiwa
// na kabla ya functions/index.js kupakiwa.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 5055);
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'sokonet-3b847';
const FN_PREFIX = '/__fn';

/* ---------- 1. Credentials ---------- */
// [PHASE 1 SECURITY 2026-09] Emulator → faili la service account → Google ADC.
// Tunasoma `type` na project TU kutoka kwenye faili — maudhui hayachapishwi.
const os = require('os');
const EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;
const SAFE_KEY_PATH = path.join(os.homedir(), '.sokohai', 'service-account.json'); // NJE ya project (salama zaidi)
const ADC_PATH = process.env.CLOUDSDK_CONFIG
  ? path.join(process.env.CLOUDSDK_CONFIG, 'application_default_credentials.json')
  : (process.platform === 'win32'
    ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'gcloud', 'application_default_credentials.json')
    : path.join(os.homedir(), '.config', 'gcloud', 'application_default_credentials.json'));
const credCandidates = [
  ['SKH_SERVICE_ACCOUNT', process.env.SKH_SERVICE_ACCOUNT],
  ['GOOGLE_APPLICATION_CREDENTIALS', process.env.GOOGLE_APPLICATION_CREDENTIALS],
  ['~/.sokohai/service-account.json', SAFE_KEY_PATH],
  ['functions/service-account.json', path.join(__dirname, 'service-account.json')],
  ['Google ADC (gcloud)', ADC_PATH]
].filter(c => c[1]);
const found = EMULATOR ? null : credCandidates.find(c => fs.existsSync(c[1]));
const keyPath = found ? found[1] : null;
let credType = EMULATOR ? 'emulator' : '';

if (!EMULATOR) {
  if (!keyPath) {
    console.error('\n✗ Hakuna credentials zilizopatikana.\n' +
      '  Chaguo salama (hakuna private key inayohitajika):\n' +
      '    1) Firebase Emulator:  FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-sokohai\n' +
      '    2) Google ADC:         gcloud auth application-default login\n' +
      '                           gcloud auth application-default set-quota-project ' + PROJECT_ID + '\n' +
      '  (Njia ya zamani bado inakubalika: SKH_SERVICE_ACCOUNT=/njia/key.json au ' + SAFE_KEY_PATH + ')\n' +
      '  Usiweke credentials kwenye git/Netlify.\n');
    process.exit(1);
  }

  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  } catch (e) {
    console.error('✗ Faili la credentials si JSON sahihi (' + found[0] + ').');
    process.exit(1);
  }

  credType = String(meta.type || 'unknown');
  const credProject = meta.project_id || meta.quota_project_id || '';

  if (credProject && credProject !== PROJECT_ID) {
    console.warn('⚠ Credentials ni za project "' + credProject + '", si "' + PROJECT_ID + '".');
  }

  if (keyPath.startsWith(ROOT + path.sep)) {
    console.warn('⚠ Credentials ziko NDANI ya project. Usizipakie Netlify/git; bora ziweke ' + SAFE_KEY_PATH);
  }

  meta = null;

  process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
  process.env.GCLOUD_PROJECT =
    (credType === 'service_account' && credProject)
      ? credProject
      : PROJECT_ID;
} else {
  process.env.GCLOUD_PROJECT = PROJECT_ID;
}

process.env.GOOGLE_CLOUD_PROJECT =
  process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;

process.env.FIREBASE_CONFIG =
  process.env.FIREBASE_CONFIG ||
  JSON.stringify(Object.assign({
    projectId: process.env.GCLOUD_PROJECT,
    storageBucket: process.env.GCLOUD_PROJECT + '.appspot.com'
  }, process.env.SKH_SERVICE_ACCOUNT_ID
    ? { serviceAccountId: process.env.SKH_SERVICE_ACCOUNT_ID }
    : {}));

const PROD_DATA = !EMULATOR; // bila emulator → Firestore/Auth HALISI

/* ---------- 2. Shared rules packaging (same as firebase predeploy) ---------- */
try {
  require('./build-shared.js');
} catch (e) {
  console.warn('⚠ build:shared:', e.message);
}

/* ---------- 3. Load the REAL functions ---------- */
const functionsModule = require('./index.js');
const admin = require('firebase-admin');

const callables = {};
const httpsFns = {};
const schedules = {};

for (const [name, fn] of Object.entries(functionsModule)) {
  const ep = (fn && fn.__endpoint) || {};

  if (ep.callableTrigger && typeof fn.run === 'function') {
    callables[name] = fn;
  } else if (ep.httpsTrigger && typeof fn === 'function') {
    httpsFns[name] = fn;
  } else if (ep.scheduleTrigger && typeof fn.run === 'function') {
    schedules[name] = {
      fn,
      schedule: String(ep.scheduleTrigger.schedule || '')
    };
  }
}

/* ---------- 4. CORS ---------- */
const allowedOrigins = new Set([
  'https://sokohaiworld.netlify.app',
  'https://' + process.env.GCLOUD_PROJECT + '.web.app',
  'https://' + process.env.GCLOUD_PROJECT + '.firebaseapp.com'
].concat(
  String(process.env.SKH_ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
));

function originAllowed(origin) {
  if (!origin) return false;
  if (allowedOrigins.has(origin)) return true;

  try {
    const u = new URL(origin);
    return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
      || u.hostname.endsWith('.localhost');
  } catch (_) {
    return false;
  }
}

function applyCors(req, res) {
  const origin = req.headers.origin;

  if (originAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      req.headers['access-control-request-headers']
        || 'Content-Type, Authorization, X-Firebase-AppCheck, X-Firebase-GMPID, Firebase-Instance-ID-Token'
    );
    res.setHeader('Access-Control-Max-Age', '3600');

    if (req.headers['access-control-request-private-network']) {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
  }

  return originAllowed(origin) || !origin;
}

/* ---------- 5. Helpers ---------- */
function sendJson(res, status, body) {
  const text = JSON.stringify(body);

  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text)
  });

  res.end(text);
}

function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', c => {
      size += c.length;

      if (size > limit) {
        reject(Object.assign(
          new Error('Payload kubwa mno'),
          { status: 413 }
        ));
        req.destroy();
      } else {
        chunks.push(c);
      }
    });

    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function decorateRequest(req, rawBody) {
  req.rawBody = rawBody;
  req.header = req.get = h => req.headers[String(h).toLowerCase()];

  const fwd = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();

  req.ip = fwd || (req.socket && req.socket.remoteAddress) || '';

  return req;
}

const STATUS_HTTP = {
  OK: 200,
  CANCELLED: 499,
  UNKNOWN: 500,
  INVALID_ARGUMENT: 400,
  DEADLINE_EXCEEDED: 504,
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  PERMISSION_DENIED: 403,
  UNAUTHENTICATED: 401,
  RESOURCE_EXHAUSTED: 429,
  FAILED_PRECONDITION: 400,
  ABORTED: 409,
  OUT_OF_RANGE: 400,
  UNIMPLEMENTED: 501,
  INTERNAL: 500,
  UNAVAILABLE: 503,
  DATA_LOSS: 500
};

function callableError(e) {
  if (e && e.httpErrorCode && e.httpErrorCode.canonicalName) {
    const status = e.httpErrorCode.canonicalName;
    const body = {
      status,
      message: e.message
    };

    if (e.details !== undefined) {
      body.details = e.details;
    }

    return {
      http: STATUS_HTTP[status] || 500,
      body
    };
  }

  return {
    http: 500,
    body: {
      status: 'INTERNAL',
      message: 'INTERNAL (local: ' + String(e && e.message || e).slice(0, 300) + ')'
    }
  };
}

function toWire(value) {
  return value === undefined
    ? null
    : JSON.parse(JSON.stringify(
        value,
        (k, v) => typeof v === 'bigint' ? String(v) : v
      ));
}

/* ---------- 6. Callable handler (Firebase callable protocol v1) ---------- */
async function handleCallable(name, req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, {
      error: {
        status: 'INVALID_ARGUMENT',
        message: 'POST tu'
      }
    });
  }

  const started = Date.now();
  let payload;

  try {
    payload = JSON.parse(
      (await readBody(req)).toString('utf8') || '{}'
    );
  } catch (e) {
    return sendJson(res, e.status || 400, {
      error: {
        status: 'INVALID_ARGUMENT',
        message: 'Body si JSON sahihi'
      }
    });
  }

  if (!payload || typeof payload !== 'object' || !('data' in payload)) {
    return sendJson(res, 400, {
      error: {
        status: 'INVALID_ARGUMENT',
        message: 'Body lazima iwe {data: ...}'
      }
    });
  }

  decorateRequest(
    req,
    Buffer.from(JSON.stringify(payload))
  );

  req.body = payload;

  let auth;
  const m = /^Bearer\s+(.+)$/i.exec(
    String(req.headers.authorization || '')
  );

  if (m) {
    try {
      const token = await admin.auth().verifyIdToken(m[1]);

      auth = {
        uid: token.uid,
        token,
        rawToken: m[1]
      };
    } catch (e) {
      let tokenProject = '';

      try {
        tokenProject = String(
          JSON.parse(
            Buffer.from(
              String(m[1]).split('.')[1] || '',
              'base64url'
            ).toString('utf8')
          ).aud || ''
        );
      } catch (_) {}

      const hint =
        (tokenProject && tokenProject !== process.env.GCLOUD_PROJECT)
          ? ' — token ni ya project "' + tokenProject +
            '", server inatarajia "' +
            process.env.GCLOUD_PROJECT + '"' +
            (EMULATOR
              ? '. Fungua app kupitia http://localhost:' +
                PORT +
                ' (inaunganisha Auth/Firestore Emulator) kisha ingia upya kwa akaunti ya emulator.'
              : '.')
          : '';

      console.warn(
        '  ✗ ' + name +
        ': ID token si sahihi (' +
        (e.code || e.message) + ')' +
        hint
      );

      return sendJson(res, 401, {
        error: {
          status: 'UNAUTHENTICATED',
          message: 'Unauthenticated'
        }
      });
    }
  }

  try {
    const result = await callables[name].run({
      data: payload.data,
      auth,
      rawRequest: req,
      acceptsStreaming: false
    });

    console.log(
      '  ✓ ' +
      name +
      ' ' +
      (auth ? auth.uid.slice(0, 8) : 'anon') +
      ' ' +
      (Date.now() - started) +
      'ms'
    );

    sendJson(res, 200, {
      result: toWire(result)
    });
  } catch (e) {
    const err = callableError(e);

    if (err.http >= 500) {
      console.error(
        '  ✗ ' + name + ':',
        e && e.stack || e
      );
    } else {
      console.log(
        '  • ' +
        name +
        ' → ' +
        err.body.status +
        ': ' +
        err.body.message
      );
    }

    sendJson(res, err.http, {
      error: err.body
    });
  }
}

/* ---------- 7. HTTPS functions (express-style handlers) ---------- */
async function handleHttps(name, req, res, urlObj) {
  const raw = await readBody(req);

  decorateRequest(req, raw);

  req.query = Object.fromEntries(urlObj.searchParams);

  req.path =
    urlObj.pathname.slice(
      (FN_PREFIX + '/' + name).length
    ) || '/';

  const type = String(
    req.headers['content-type'] || ''
  );

  try {
    req.body =
      /json/.test(type)
        ? JSON.parse(raw.toString('utf8') || '{}')
        : /urlencoded/.test(type)
          ? Object.fromEntries(
              new URLSearchParams(
                raw.toString('utf8')
              )
            )
          : raw.toString('utf8');
  } catch (_) {
    req.body = raw.toString('utf8');
  }

  res.status = code => {
    res.statusCode = code;
    return res;
  };

  res.set = res.header = (k, v) => {
    if (typeof k === 'object') {
      Object.entries(k).forEach(([a, b]) =>
        res.setHeader(a, b)
      );
    } else {
      res.setHeader(k, v);
    }

    return res;
  };

  res.send = body => {
    if (
      body &&
      typeof body === 'object' &&
      !Buffer.isBuffer(body)
    ) {
      return res.json(body);
    }

    if (!res.getHeader('Content-Type')) {
      res.setHeader(
        'Content-Type',
        'text/html; charset=utf-8'
      );
    }

    res.end(body == null ? '' : body);
    return res;
  };

  res.json = body => {
    res.setHeader(
      'Content-Type',
      'application/json; charset=utf-8'
    );

    res.end(JSON.stringify(body));
    return res;
  };

  res.sendStatus = code => {
    res.statusCode = code;
    res.end(String(code));
    return res;
  };

  try {
    await httpsFns[name](req, res);

    console.log(
      '  ✓ ' +
      name +
      ' (https) ' +
      res.statusCode
    );
  } catch (e) {
    console.error(
      '  ✗ ' + name + ':',
      e
    );

    if (!res.headersSent) {
      sendJson(res, 500, {
        error: 'internal'
      });
    }
  }
}

/* ---------- 8. Static frontend (mirror of firebase.json hosting) ---------- */
const STATIC_ENABLED =
  process.env.SKH_STATIC !== '0';

const BLOCKED =
  /^\/(functions|html|tools|_originals|docs|node_modules)(\/|$)|\/\.|^\/(firebase\.json|\.firebaserc|firestore\.rules|firestore\.indexes\.json|package(-lock)?\.json)$/i;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8'
};

/* [ADS-AUTH FIX 2026-09-25] Emulator mode:
   Admin SDK (hapa) inathibitisha tokens
   za Auth Emulator (project GCLOUD_PROJECT) na kusoma Firestore Emulator.
   Browser ilibaki kwenye Auth/Firestore ya production → kila callable yenye token
   ilipata 401 (aud mismatch) na data ikagawanyika (browser→prod, functions→emulator).
   Tunaiambia browser iunganishe emulators ZILEZILE.
   Haiwekwi kabisa bila emulator (PROD_DATA mode) wala kwenye hosting ya production. */

function emulatorHostPort(v) {
  const m =
    /^\[?([^\]]*?)\]?:(\d+)$/.exec(
      String(v || '').trim()
    );

  if (!m) return null;

  const host =
    (m[1] === '0.0.0.0' ||
     m[1] === '::' ||
     m[1] === '')
      ? '127.0.0.1'
      : m[1];

  return {
    host,
    port: Number(m[2])
  };
}

function emulatorClientConfig() {
  if (!EMULATOR) return null;

  const fsHp =
    emulatorHostPort(
      process.env.FIRESTORE_EMULATOR_HOST
    );

  const authHp =
    emulatorHostPort(
      process.env.FIREBASE_AUTH_EMULATOR_HOST
    );

  if (!fsHp) return null;

  return {
    projectId: String(
      process.env.GCLOUD_PROJECT || ''
    ),
    firestore: fsHp,
    authUrl: authHp
      ? 'http://' +
        authHp.host +
        ':' +
        authHp.port
      : ''
  };
}

function serveIndex(res) {
  let html = fs.readFileSync(
    path.join(ROOT, 'index.html'),
    'utf8'
  );

  const emu = emulatorClientConfig();

  const inject =
    '<script>window.SKH_FUNCTIONS_URL=' +
    JSON.stringify(FN_PREFIX) +
    ';window.SKH_LOCAL_FUNCTIONS_SERVER=true;' +
    (
      emu
        ? 'window.SKH_EMULATOR=' +
          JSON.stringify(emu).replace(
            /</g,
            '\\u003c'
          ) +
          ';'
        : ''
    ) +
    '</script>';

  html =
    /<head[^>]*>/i.test(html)
      ? html.replace(
          /<head[^>]*>/i,
          m => m + inject
        )
      : inject + html;

  res.writeHead(200, {
    'Content-Type': MIME['.html'],
    'Cache-Control': 'no-store'
  });

  res.end(html);
}

function serveStatic(req, res, urlObj) {
  let pathname;

  try {
    pathname = decodeURIComponent(
      urlObj.pathname
    );
  } catch (_) {
    res.writeHead(400);
    return res.end();
  }

  if (BLOCKED.test(pathname)) {
    res.writeHead(404);
    return res.end('Not found');
  }

  if (
    pathname === '/' ||
    pathname === '/index.html'
  ) {
    return serveIndex(res);
  }

  const file = path.normalize(
    path.join(ROOT, pathname)
  );

  if (!file.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    return res.end();
  }

  let target = file;

  if (
    !fs.existsSync(target) &&
    fs.existsSync(target + '.html')
  ) {
    target += '.html';
  }

  if (
    fs.existsSync(target) &&
    fs.statSync(target).isFile()
  ) {
    if (path.basename(target) === 'index.html') {
      return serveIndex(res);
    }

    res.writeHead(200, {
      'Content-Type':
        MIME[
          path.extname(target).toLowerCase()
        ] || 'application/octet-stream',

      'Cache-Control':
        /\.html$|sw\.js$|\/js\/app\//.test(target)
          ? 'no-cache'
          : 'public, max-age=300'
    });

    return fs
      .createReadStream(target)
      .pipe(res);
  }

  if (path.extname(pathname)) {
    res.writeHead(404);
    return res.end('Not found');
  }

  return serveIndex(res);
}

/* ---------- 9. Server ---------- */
const server = http.createServer(
  async (req, res) => {
    const urlObj = new URL(
      req.url,
      'http://localhost'
    );

    try {
      if (
        urlObj.pathname === FN_PREFIX ||
        urlObj.pathname.startsWith(
          FN_PREFIX + '/'
        )
      ) {
        const corsOk =
          applyCors(req, res);

        if (req.method === 'OPTIONS') {
          res.writeHead(
            corsOk ? 204 : 403
          );
          return res.end();
        }

        if (!corsOk) {
          return sendJson(res, 403, {
            error: {
              status: 'PERMISSION_DENIED',
              message:
                'Origin hairuhusiwi: ' +
                req.headers.origin +
                ' (ongeza kwenye SKH_ALLOWED_ORIGINS)'
            }
          });
        }

        const name =
          urlObj.pathname
            .slice(FN_PREFIX.length + 1)
            .split('/')[0];

        if (!name) {
          return sendJson(res, 200, {
            ok: true,
            project:
              process.env.GCLOUD_PROJECT,
            callables:
              Object.keys(callables),
            https:
              Object.keys(httpsFns),
            schedules:
              Object.keys(schedules)
          });
        }

        if (callables[name]) {
          return handleCallable(
            name,
            req,
            res
          );
        }

        if (httpsFns[name]) {
          return handleHttps(
            name,
            req,
            res,
            urlObj
          );
        }

        return sendJson(res, 404, {
          error: {
            status: 'NOT_FOUND',
            message:
              'Function "' +
              name +
              '" haipo kwenye functions/index.js'
          }
        });
      }

      if (!STATIC_ENABLED) {
        res.writeHead(404);
        return res.end('Not found');
      }

      return serveStatic(
        req,
        res,
        urlObj
      );
    } catch (e) {
      console.error(
        '✗ Request error:',
        e
      );

      if (!res.headersSent) {
        sendJson(res, 500, {
          error: {
            status: 'INTERNAL',
            message: 'INTERNAL'
          }
        });
      }
    }
  }
);

/* ---------- 10. Scheduled functions ---------- */
function intervalFor(schedule) {
  const s = schedule.trim();

  let m =
    /^every\s+(\d+)\s+minutes?$/i.exec(s);

  if (m) {
    return Number(m[1]) * 60000;
  }

  m =
    /^every\s+(\d+)\s+hours?$/i.exec(s);

  if (m) {
    return Number(m[1]) * 3600000;
  }

  m =
    /^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/.exec(s);

  if (m) {
    return Number(m[1]) * 60000;
  }

  if (
    /^\d+\s+\*\s+\*\s+\*\s+\*$/.test(s)
  ) {
    return 3600000;
  }

  m =
    /^\d+\s+\*\/(\d+)\s+\*\s+\*\s+\*$/.exec(s);

  if (m) {
    return Number(m[1]) * 3600000;
  }

  if (
    /^\d+\s+\d+\s+\*\s+\*\s+\*$/.test(s)
  ) {
    return 86400000;
  }

  return 3600000;
}

// [PHASE 1 SECURITY 2026-09] Schedules (mf. sokopayAutoRelease — hutoa PESA)
// HAZIENDESHWI kwa default. Kuziwasha: SKH_RUN_SCHEDULES=1; dhidi ya
// production pia SKH_ALLOW_PROD_SCHEDULES=1 (onyo kubwa linaonyeshwa).
const SCHEDULES_REQUESTED =
  process.env.SKH_RUN_SCHEDULES === '1';

const SCHEDULES_ENABLED =
  SCHEDULES_REQUESTED &&
  (!PROD_DATA ||
    process.env.SKH_ALLOW_PROD_SCHEDULES === '1');

function startSchedules() {
  if (!SCHEDULES_ENABLED) {
    if (SCHEDULES_REQUESTED) {
      console.warn(
        '⚠ SKH_RUN_SCHEDULES=1 lakini data ni ya PRODUCTION — schedules HAZIJAWASHWA.\n' +
        '  Zinaweza kutoa pesa (sokopayAutoRelease) na kubadilisha data halisi. Tumia Firebase Emulator,\n' +
        '  au weka pia SKH_ALLOW_PROD_SCHEDULES=1 ikiwa kweli unakusudia hivyo.'
      );
    }

    return;
  }

  if (PROD_DATA) {
    console.warn(
      '\n' +
      '!'.repeat(64) +
      '\n  ⚠ ONYO: SCHEDULED JOBS ZINAENDESHWA DHIDI YA FIREBASE YA PRODUCTION (' +
      process.env.GCLOUD_PROJECT +
      ').\n' +
      '    ' +
      Object.keys(schedules).join(', ') +
      ' zinaweza KUBADILISHA DATA HALISI na KUTOA PESA.\n' +
      '!'.repeat(64) +
      '\n'
    );
  }

  for (
    const [
      name,
      { fn, schedule }
    ] of Object.entries(schedules)
  ) {
    const every =
      intervalFor(schedule);

    const tick = async () => {
      try {
        await fn.run({
          scheduleTime:
            new Date().toISOString(),
          jobName: name
        });

        console.log(
          '  ⏱ ' +
          name +
          ' imeendeshwa'
        );
      } catch (e) {
        console.error(
          '  ✗ ' +
          name +
          ' (schedule):',
          e && e.message || e
        );
      }
    };

    setTimeout(
      tick,
      15000 +
        Math.floor(
          Math.random() * 5000
        )
    ).unref();

    setInterval(
      tick,
      every
    ).unref();
  }
}

// [PHASE 1 SECURITY 2026-09] Default: localhost PEKEE.
// LAN/Wi-Fi ni kwa makusudi (SKH_HOST=0.0.0.0).
const HOST = String(
  process.env.SKH_HOST || '127.0.0.1'
).trim();

const LAN_EXPOSED =
  !/^(127\.\d+\.\d+\.\d+|localhost|::1)$/i.test(
    HOST
  );

server.listen(
  PORT,
  HOST,
  () => {
    console.log(
      '\n SokoHai LOCAL FUNCTIONS SERVER'
    );

    console.log(
      ' ─────────────────────────────────────────────'
    );

    console.log(
      ' Project     : ' +
      process.env.GCLOUD_PROJECT +
      (
        PROD_DATA
          ? '  (Firestore/Auth HALISI)'
          : '  (FIREBASE EMULATOR — si production)'
      )
    );

    console.log(
      ' Credentials : ' +
      (
        EMULATOR
          ? 'emulator (hazihitajiki)'
          : found[0] +
            ' [' +
            credType +
            ']'
      )
    );

    console.log(
      ' Listening   : ' +
      HOST +
      ':' +
      PORT +
      (
        LAN_EXPOSED
          ? '  ⚠ INAONEKANA KWENYE MTANDAO (LAN/Wi-Fi)'
          : '  (kompyuta hii tu)'
      )
    );

    console.log(
      ' Frontend    : ' +
      (
        STATIC_ENABLED
          ? 'http://localhost:' +
            PORT
          : '(imezimwa)'
      )
    );

    console.log(
      ' Functions   : http://localhost:' +
      PORT +
      FN_PREFIX +
      '/<jina>'
    );

    console.log(
      ' Callables   : ' +
      Object.keys(callables).length +
      '   HTTPS: ' +
      Object.keys(httpsFns).length +
      '   Schedules: ' +
      Object.keys(schedules).length +
      (
        SCHEDULES_ENABLED
          ? ' (ZIMEWASHWA)'
          : ' (zimezimwa — SKH_RUN_SCHEDULES=1 kuwasha)'
      )
    );

    console.log(
      ' Netlify site kwenye kompyuta HII: fungua console na uendeshe'
    );

    console.log(
      "   skhUseLocalFunctions('http://localhost:" +
      PORT +
      FN_PREFIX +
      "')"
    );

    console.log(
      ' ─────────────────────────────────────────────\n'
    );

    if (LAN_EXPOSED) {
      console.warn(
        '⚠ SKH_HOST=' +
        HOST +
        ': vifaa vingine kwenye mtandao wako vinaweza kufikia functions hizi' +
        (
          PROD_DATA
            ? ' (zenye nguvu za Admin SDK dhidi ya PRODUCTION)'
            : ''
        ) +
        '.\n' +
        '  Tumia tu kwenye mtandao unaouamini; default salama ni SKH_HOST=127.0.0.1.'
      );
    }

    startSchedules();
  }
);

server.on(
  'error',
  e => {
    console.error(
      e.code === 'EADDRINUSE'
        ? '✗ Port ' +
          PORT +
          ' inatumika. Jaribu: PORT=5056 npm run local'
        : e
    );

    process.exit(1);
  }
);