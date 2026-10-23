// The app's API, shared by the production server and Vite's dev server:
//
//   GET  /api/search?q=…&lang=all|en|ja&offset=N   cards from the catalogue, 48 at a time
//   GET  /api/status                               whether the catalogue is in, and its size
//   POST /api/link  { "url": "…" }                 a pasted link: a card or a set (JSON), or the
//                                                  picture it points at (the bytes, image/*)
//   GET  /api/local?ref=sv3pt5/6&lang=de           the card's picture in that language, if TCGdex
//                                                  has one (localized.mjs)

import { LinkError, resolveLink } from './link.mjs';

const LIMIT = 48;
/** Links each visitor may resolve per ten minutes, and how many run at once in all. */
const LINKS_PER_WINDOW = 60;
const WINDOW = 10 * 60_000;
const AT_ONCE = 4;

// No 5xx for a page that wouldn't answer: Cloudflare swaps an origin's 502 for its own error page,
// and the page would never see which error it was.
const STATUS = { invalid: 400, blocked: 400, set: 200, 'no-image': 422, 'too-big': 413, unreachable: 422, busy: 503, limit: 429 };

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

function readBody(req, max = 4096) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > max) {
        reject(new LinkError('invalid'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * @param {{ catalog: ReturnType<typeof import('./catalog.mjs').createCatalog>, localized?: { find(ref: string, lang: string): Promise<any> }, resolve?: typeof resolveLink }} options
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<boolean>}
 */
export function createApi({ catalog, localized, resolve = resolveLink }) {
  // Who asked how often, in memory only and forgotten with the window: the address never leaves
  // this function (learnings/privacy-and-security.md).
  let window = Date.now();
  let counts = new Map();
  let running = 0;

  function allowed(req) {
    const now = Date.now();
    if (now - window > WINDOW) {
      window = now;
      counts = new Map();
    }
    const who = String(req.headers['cf-connecting-ip'] ?? req.socket.remoteAddress ?? '');
    const n = (counts.get(who) ?? 0) + 1;
    counts.set(who, n);
    return n <= LINKS_PER_WINDOW;
  }

  return async function api(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return false;

    if (url.pathname === '/api/status' && req.method === 'GET') {
      json(res, 200, { ready: catalog.ready, cards: catalog.size });
      return true;
    }

    if (url.pathname === '/api/search' && req.method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').slice(0, 120);
      const lang = /** @type {any} */ (['en', 'ja'].includes(url.searchParams.get('lang') ?? '') ? url.searchParams.get('lang') : 'all');
      const offset = Math.max(0, Math.min(5000, Number(url.searchParams.get('offset')) || 0));
      const found = catalog.search(q, { lang, offset, limit: LIMIT });
      if (!found) json(res, 503, { error: 'loading' });
      else json(res, 200, { ...found, offset, limit: LIMIT });
      return true;
    }

    if (url.pathname === '/api/local' && req.method === 'GET' && localized) {
      if (!catalog.ready) {
        json(res, 503, { error: 'loading' });
        return true;
      }
      const ref = (url.searchParams.get('ref') ?? '').slice(0, 80);
      const lang = (url.searchParams.get('lang') ?? '').slice(0, 10);
      let local = null;
      try {
        local = await localized.find(ref, lang);
      } catch (err) {
        console.error('local:', err.message);
      }
      json(res, 200, { local });
      return true;
    }

    if (url.pathname === '/api/link' && req.method === 'POST') {
      try {
        if (!catalog.ready) throw new LinkError('busy');
        if (!allowed(req)) throw new LinkError(/** @type {any} */ ('limit'));
        if (running >= AT_ONCE) throw new LinkError('busy');
        let link;
        try {
          link = JSON.parse(await readBody(req)).url;
        } catch {
          throw new LinkError('invalid');
        }
        if (typeof link !== 'string' || link.length > 2048) throw new LinkError('invalid');
        running++;
        let out;
        try {
          out = await resolve(link, catalog);
        } finally {
          running--;
        }
        if (out.kind === 'card') json(res, 200, { card: out.card });
        else if (out.kind === 'set') json(res, 200, { set: out.set });
        else {
          res.writeHead(200, {
            'content-type': out.type,
            'content-length': out.body.length,
            'cache-control': 'no-store',
            'content-disposition': 'inline',
            // Header values are Latin-1: the page decodes these.
            'x-card-name': encodeURIComponent(out.name),
            'x-card-source': encodeURIComponent(out.source),
          });
          res.end(out.body);
        }
      } catch (err) {
        const code = err instanceof LinkError ? err.code : 'unreachable';
        if (!(err instanceof LinkError)) console.error('link:', err.message);
        json(res, STATUS[code] ?? 502, { error: code });
      }
      return true;
    }

    json(res, 404, { error: 'not-found' });
    return true;
  };
}
