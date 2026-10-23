// The link reader: the addresses it knows, the pages it reads, and the ones it refuses to fetch.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { LinkError, checkTarget, isPublicAddress, known, pagePicture, publicLookup, resolveLink, sniffImage } from '../server/link.mjs';
import { createApi } from '../server/api.mjs';

const catalog = {
  ready: true,
  size: 3,
  card: (set, key) => (set === 'sv3pt5' && key === '6' ? { id: 'sv3pt5/6', name: 'Charizard ex' } : null),
  byCode: (lang, code, n) => (lang === 'en' && code.toUpperCase() === 'MEW' && Number(n) === 6 ? { id: 'sv3pt5/6', name: 'Charizard ex' } : null),
  set: (id) => (id === 'sv3pt5' ? { id, name: '151', lang: 'en' } : null),
  search: () => ({ total: 0, cards: [] }),
};

test('addresses on our side of the router are never public', () => {
  for (const a of ['127.0.0.1', '10.1.2.3', '192.168.178.36', '172.20.0.5', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:192.168.0.1', '::ffff:127.0.0.1']) {
    assert.equal(isPublicAddress(a), false, a);
  }
  for (const a of ['1.1.1.1', '104.21.0.1', '2606:4700::1111', '::ffff:8.8.8.8']) assert.equal(isPublicAddress(a), true, a);
  assert.equal(isPublicAddress('not an ip'), false);
});

test('only http(s) on the usual ports, no credentials, no local names', () => {
  const code = (u) => {
    try {
      checkTarget(u);
      return 'ok';
    } catch (e) {
      return e.code;
    }
  };
  assert.equal(code('https://limitlesstcg.com/cards/MEW/6'), 'ok');
  assert.equal(code('file:///etc/passwd'), 'invalid');
  assert.equal(code('ftp://example.com/a.png'), 'invalid');
  assert.equal(code('nonsense'), 'invalid');
  assert.equal(code('https://user:pw@example.com/'), 'invalid');
  assert.equal(code('http://example.com:8080/'), 'blocked');
  assert.equal(code('http://127.0.0.1/'), 'blocked');
  assert.equal(code('http://[::1]/'), 'blocked');
  assert.equal(code('http://localhost/'), 'blocked');
  assert.equal(code('http://nas.local/'), 'blocked');
  assert.equal(code('http://192.168.178.36:5700/'), 'blocked');
});

test('a name that resolves to a private address is refused at connect time', async () => {
  const err = await new Promise((resolve) => publicLookup('localhost', { all: true }, (e) => resolve(e)));
  assert.equal(err?.code, 'EBLOCKED');
});

test('known addresses become catalogue cards without a fetch', () => {
  const k = (u) => known(new URL(u), catalog);
  assert.equal(k('https://limitlesstcg.com/cards/MEW/6').card.id, 'sv3pt5/6');
  assert.equal(k('https://images.pokemontcg.io/sv3pt5/6_hires.png').card.id, 'sv3pt5/6');
  assert.equal(k('https://images.scrydex.com/pokemon/sv3pt5-6/small').card.id, 'sv3pt5/6');
  assert.equal(k('https://tcgsl.ewolution.cloud/img/card/sv3pt5/6-240.webp').card.id, 'sv3pt5/6');
  assert.deepEqual(k('https://tcgsl.ewolution.cloud/#/set/sv3pt5').set, { id: 'sv3pt5', name: '151', lang: 'en' });
  // Not in the catalogue: fetch the largest picture there is.
  assert.equal(k('https://images.pokemontcg.io/xx1/7.png').fetch, 'https://images.pokemontcg.io/xx1/7_hires.png');
  assert.equal(k('https://images.scrydex.com/pokemon/zz1-3/small').fetch, 'https://images.scrydex.com/pokemon/zz1-3/large');
  assert.equal(k('https://example.com/card.png'), null);
});

test('a page’s link-preview picture and title', () => {
  const html = `<html><head><title>Fallback | Site</title>
    <meta property="og:title" content="Charizard ex &amp; friends">
    <meta content="/media/card.png?x=1&amp;y=2" property="og:image">
    </head></html>`;
  assert.deepEqual(pagePicture(html, new URL('https://cards.example/c/1')), { image: 'https://cards.example/media/card.png?x=1&y=2', title: 'Charizard ex & friends' });
  assert.deepEqual(pagePicture('<meta name="twitter:image" content="https://x.example/t.jpg"><title>T</title>', new URL('https://a.example/')), {
    image: 'https://x.example/t.jpg',
    title: 'T',
  });
  assert.equal(pagePicture('<p>nothing</p>', new URL('https://a.example/')).image, '');
});

test('pictures are told by their bytes, not their headers', () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  assert.equal(sniffImage(png), 'image/png');
  assert.equal(sniffImage(Buffer.from('ffd8ffe000104a4649460001', 'hex')), 'image/jpeg');
  assert.equal(sniffImage(Buffer.from('RIFF0000WEBPVP8 ', 'latin1')), 'image/webp');
  assert.equal(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(sniffImage(Buffer.from('<html><body>hi</body></html>')), null);
});

test('resolveLink refuses private targets before any request', async () => {
  await assert.rejects(resolveLink('http://192.168.178.36:5700/', catalog), (e) => e instanceof LinkError && e.code === 'blocked');
  await assert.rejects(resolveLink('javascript:alert(1)', catalog), (e) => e instanceof LinkError && e.code === 'invalid');
  const out = await resolveLink('https://limitlesstcg.com/cards/MEW/6', catalog);
  assert.equal(out.kind, 'card');
});

// The API around it, on a real socket.
let server;
let base;
before(async () => {
  const api = createApi({
    catalog,
    resolve: async (url) => {
      if (url.includes('picture')) return { kind: 'image', type: 'image/png', body: Buffer.from('89504e47', 'hex'), name: 'Mew · 151', source: url };
      if (url.includes('set')) return { kind: 'set', set: { id: 'sv3pt5', name: '151', lang: 'en' } };
      throw new LinkError('no-image');
    },
  });
  server = http.createServer(async (req, res) => {
    if (!(await api(req, res))) res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const post = (body) => fetch(`${base}/api/link`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('POST /api/link answers a picture as its bytes, with the name in a header', async () => {
  const res = await post({ url: 'https://a.example/picture' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(decodeURIComponent(res.headers.get('x-card-name')), 'Mew · 151');
});

test('POST /api/link: a set, an error, a bad body', async () => {
  assert.deepEqual(await (await post({ url: 'https://a.example/set' })).json(), { set: { id: 'sv3pt5', name: '151', lang: 'en' } });
  const none = await post({ url: 'https://a.example/x' });
  assert.equal(none.status, 422);
  assert.deepEqual(await none.json(), { error: 'no-image' });
  assert.equal((await post('not json')).status, 400);
  assert.equal((await post({ url: 42 })).status, 400);
  assert.equal((await post({ url: 'x'.repeat(3000) })).status, 400);
});

test('GET /api/search and /api/status; anything else under /api is a 404', async () => {
  assert.deepEqual(await (await fetch(`${base}/api/status`)).json(), { ready: true, cards: 3 });
  const s = await (await fetch(`${base}/api/search?q=x&lang=fr&offset=-4`)).json();
  assert.equal(s.offset, 0);
  assert.equal((await fetch(`${base}/api/nope`)).status, 404);
  assert.equal((await fetch(`${base}/api/link`)).status, 404);
});
