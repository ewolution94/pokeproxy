// A pasted link, turned into a card for the sheet.
//
// First the addresses we can read without asking anyone: TCGSL's own pictures and set pages,
// pokemontcg.io's and Scrydex's image servers, Limitless TCG's card pages. Those become catalogue
// cards, printed from TCGSL's picture. Anything else is fetched once: a picture as it is, a page
// for the picture it names for link previews (og:image), which is what card sites put there.
// The picture's bytes go back to the page, which keeps them on the device like an upload, so a
// sheet never depends on someone else's server staying up.
//
// Fetching what a stranger names is the risky part, so `guardedGet` only talks to public
// addresses on ports 80 and 443 (checked on the address it actually connects to, every redirect
// again), gives up after 10 s, and reads at most 2 MB of a page and 15 MB of a picture.

import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import zlib from 'node:zlib';

const UA = 'Mozilla/5.0 (compatible; PokeProxy/1.0; +https://pokeproxy.ewolution.cloud)';
const MAX_PAGE = 2 * 1024 * 1024;
const MAX_IMAGE = 15 * 1024 * 1024;
const TIMEOUT = 10_000;

/** Why a link gave no card; the page words each one. */
export class LinkError extends Error {
  /** @param {'invalid' | 'blocked' | 'unreachable' | 'no-image' | 'too-big' | 'busy' | 'set'} code */
  constructor(code, detail = {}) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

// --- Addresses that never leave the internet ---------------------------------------------------

const PRIVATE = new net.BlockList();
for (const [a, p] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) PRIVATE.addSubnet(a, p, 'ipv4');
for (const [a, p] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001::', 23],
  ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
]) PRIVATE.addSubnet(a, p, 'ipv6');

/** True for an address anyone on the internet could reach. */
export function isPublicAddress(address) {
  const family = net.isIP(address);
  if (!family) return false;
  if (family === 6) {
    // An IPv4 address written as IPv6 (::ffff:10.0.0.1) is judged as the IPv4 one.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return isPublicAddress(mapped[1]);
    return !PRIVATE.check(address, 'ipv6');
  }
  return !PRIVATE.check(address, 'ipv4');
}

/** dns.lookup that refuses to hand back an address on our side of the router. */
export function publicLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err);
    if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address))) {
      return callback(Object.assign(new Error(`${hostname} is not a public address`), { code: 'EBLOCKED' }));
    }
    if (options?.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
}

/** A URL we're willing to fetch: http(s), the usual ports, no credentials, a public host. */
export function checkTarget(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new LinkError('invalid');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new LinkError('invalid');
  if (url.username || url.password) throw new LinkError('invalid');
  if (url.port && url.port !== '80' && url.port !== '443') throw new LinkError('blocked');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && !isPublicAddress(host)) throw new LinkError('blocked');
  if (/^(localhost|.*\.local|.*\.internal|.*\.lan|.*\.home\.arpa)$/i.test(host)) throw new LinkError('blocked');
  return url;
}

/**
 * One GET to a public address, following up to five redirects, each one checked again.
 * Resolves with the final URL, its content type and up to `max` bytes of its body.
 * @returns {Promise<{ url: URL, type: string, body: Buffer }>}
 */
export function guardedGet(raw, { max, accept, deadline = Date.now() + TIMEOUT, hops = 0 }) {
  const url = checkTarget(raw);
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise((done, fail) => {
    const left = deadline - Date.now();
    if (left <= 0) return fail(new LinkError('unreachable'));
    // The socket's own timeout restarts with every chunk; this one is for the whole answer.
    const timer = setTimeout(() => req.destroy(new LinkError('unreachable')), left);
    const resolve = (value) => (clearTimeout(timer), done(value));
    const reject = (err) => (clearTimeout(timer), fail(err));
    const req = lib.get(
      url,
      {
        lookup: publicLookup,
        headers: { 'user-agent': UA, accept, 'accept-encoding': 'gzip, deflate, br', 'accept-language': 'en,de;q=0.8' },
        timeout: left,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (hops >= 5) return reject(new LinkError('unreachable'));
          let next;
          try {
            next = new URL(res.headers.location, url).href;
          } catch {
            return reject(new LinkError('unreachable'));
          }
          return guardedGet(next, { max, accept, deadline, hops: hops + 1 }).then(resolve, reject);
        }
        if (status !== 200) {
          res.resume();
          return reject(new LinkError('unreachable', { status }));
        }
        const type = String(res.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
        const declared = Number(res.headers['content-length'] ?? 0);
        if (declared > max) {
          res.destroy();
          return reject(new LinkError('too-big'));
        }
        const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
        const stream =
          encoding === 'gzip' ? res.pipe(zlib.createGunzip()) :
          encoding === 'br' ? res.pipe(zlib.createBrotliDecompress()) :
          encoding === 'deflate' ? res.pipe(zlib.createInflate()) : res;
        const chunks = [];
        let size = 0;
        stream.on('data', (chunk) => {
          size += chunk.length;
          if (size > max) {
            res.destroy();
            stream.destroy();
            reject(new LinkError('too-big'));
            return;
          }
          chunks.push(chunk);
        });
        stream.on('end', () => resolve({ url, type, body: Buffer.concat(chunks) }));
        stream.on('error', () => reject(new LinkError('unreachable')));
      },
    );
    req.on('timeout', () => req.destroy(new LinkError('unreachable')));
    req.on('error', (err) => reject(err instanceof LinkError ? err : new LinkError(err.code === 'EBLOCKED' ? 'blocked' : 'unreachable')));
  });
}

// --- Pictures and pages ------------------------------------------------------------------------

/** The picture's real type from its first bytes; null for anything that isn't a raster image. */
export function sniffImage(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('latin1', 0, 3) === 'GIF') return 'image/gif';
  if (buf.toString('latin1', 4, 8) === 'ftyp' && /^(avif|avis)$/.test(buf.toString('latin1', 8, 12))) return 'image/avif';
  return null;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m,
  );

/** The picture a page names for its link preview, and its title. */
export function pagePicture(html, base) {
  const head = html.slice(0, 600_000);
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => {
    const attrs = {};
    for (const a of m[0].matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[a[1].toLowerCase()] = decode(a[3] ?? a[4] ?? a[5] ?? '');
    return attrs;
  });
  const meta = (...names) => {
    for (const name of names) {
      const hit = metas.find((m) => (m.property ?? m.name ?? '').toLowerCase() === name && m.content);
      if (hit) return hit.content.trim();
    }
    return '';
  };
  let image = meta('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src');
  if (!image) image = /<link\b[^>]*rel=["']?image_src["']?[^>]*href=["']([^"']+)["']/i.exec(head)?.[1] ?? '';
  let title = meta('og:title', 'twitter:title');
  if (!title) title = decode(/<title[^>]*>([^<]*)<\/title>/i.exec(head)?.[1] ?? '').trim();
  let resolved = '';
  if (image) {
    try {
      resolved = new URL(decode(image), base).href;
    } catch {}
  }
  return { image: resolved, title: title.slice(0, 120) };
}

// --- Addresses we know -------------------------------------------------------------------------

/**
 * A link we can turn into a catalogue card without fetching anything; null when it isn't one.
 * @returns {{ card?: any, set?: any, fetch?: string } | null}
 *   card   a catalogue card; set   a whole set; fetch   the best picture to fetch instead
 */
export function known(url, catalog) {
  const host = url.hostname.toLowerCase();
  const path = decodeURIComponent(url.pathname);

  if (host === 'tcgsl.ewolution.cloud' || host === 'tcgsl.localhost') {
    const img = /^\/img\/card(?:-hd)?\/([a-z0-9]+(?:_ja)?)\/([A-Za-z0-9_-]+)-\d+\.webp$/.exec(path);
    if (img) return { card: catalog.card(img[1], img[2]) ?? undefined, fetch: url.href };
    const set = /^#\/set\/([a-z0-9]+(?:_ja)?)$/.exec(url.hash)?.[1];
    if (set) return { set: catalog.set(set) ?? undefined };
  }

  if (host === 'images.pokemontcg.io') {
    const m = /^\/([a-z0-9]+)\/([A-Za-z0-9_-]+?)(_hires)?\.png$/.exec(path);
    if (m) return { card: catalog.card(m[1], m[2]) ?? undefined, fetch: `https://images.pokemontcg.io/${m[1]}/${m[2]}_hires.png` };
  }

  if (host === 'images.scrydex.com') {
    const m = /^\/pokemon\/([a-z0-9]+(?:_ja)?)-([A-Za-z0-9_]+)\/(small|medium|large)$/.exec(path);
    if (m) return { card: catalog.card(m[1], m[2]) ?? undefined, fetch: `https://images.scrydex.com/pokemon/${m[1]}-${m[2]}/large` };
  }

  if (host === 'limitlesstcg.com' || host === 'www.limitlesstcg.com') {
    const m = /^\/cards\/(?:(jp)\/)?([A-Za-z0-9.-]+)\/([A-Za-z0-9]+)\/?$/.exec(path);
    if (m) {
      const card = catalog.byCode(m[1] ? 'ja' : 'en', m[2], m[3]);
      if (card) return { card };
    }
  }

  return null;
}

/**
 * The link, as a card: a catalogue card, a set to search for, or a picture's bytes.
 * @returns {Promise<{ kind: 'card', card: any } | { kind: 'set', set: any } | { kind: 'image', type: string, body: Buffer, name: string, source: string }>}
 */
export async function resolveLink(raw, catalog) {
  const url = checkTarget(String(raw).trim());
  const hit = known(url, catalog);
  if (hit?.card) return { kind: 'card', card: hit.card };
  if (hit?.set) return { kind: 'set', set: hit.set };

  const deadline = Date.now() + TIMEOUT;
  const first = await guardedGet(hit?.fetch ?? url.href, {
    max: MAX_IMAGE,
    accept: 'text/html,application/xhtml+xml,image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5',
    deadline,
  });
  const direct = sniffImage(first.body);
  if (direct) return { kind: 'image', type: direct, body: first.body, name: '', source: first.url.href };

  if (!/html|xml/.test(first.type) && !/^\s*</.test(first.body.toString('utf8', 0, 200))) throw new LinkError('no-image');
  if (first.body.length > MAX_PAGE) throw new LinkError('too-big');
  const { image, title } = pagePicture(first.body.toString('utf8'), first.url);
  if (!image) throw new LinkError('no-image');

  const again = known(checkTarget(image), catalog);
  if (again?.card) return { kind: 'card', card: again.card };

  const picture = await guardedGet(again?.fetch ?? image, { max: MAX_IMAGE, accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5', deadline });
  const type = sniffImage(picture.body);
  if (!type) throw new LinkError('no-image');
  return { kind: 'image', type, body: picture.body, name: title, source: url.href };
}
