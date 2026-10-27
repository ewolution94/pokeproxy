// A sheet that travels: the file with its pictures, the link in the address, and what each carries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETUP } from '../src/lib/layout.ts';
import { FORMAT, decodeLink, encodeLink, fileName, fileText, forLink, packCard, pictureFrom, readSheetFile } from '../src/lib/share.ts';

const catalog = (n) => ({
  uid: `u${n}`,
  source: 'catalog',
  name: 'Charizard',
  meta: 'Base Set 2 · 4/130 · 2000',
  image: `https://tcgsl.ewolution.cloud/img/card-hd/base2/4-734.webp?${n}`,
  thumb: `https://tcgsl.ewolution.cloud/img/card/base2/4-240.webp?${n}`,
  ref: 'base2/4',
  lang: 'en',
  style: null,
  tag: n % 2 ? 'de' : null,
  note: '',
  local: null,
  original: false,
  label: null,
});
const upload = { uid: 'f1', source: 'file', name: 'scan', meta: 'Upload', file: 'key-1', style: null, tag: 'it', note: '1st Edition' };
const linked = { uid: 'l1', source: 'link', name: 'Charizard', meta: 'cardmarket.com', file: 'key-2', link: 'https://example.com/c.jpg', style: 'colour' };

test('a card travels without its uid and without empty fields', () => {
  const packed = packCard(catalog(1), false);
  assert.equal(packed.uid, undefined);
  assert.equal(packed.note, undefined);
  assert.equal(packed.local, undefined);
  assert.equal(packed.original, undefined);
  assert.equal(packed.tag, 'de');
  assert.equal(packCard(upload, false).file, undefined);
  assert.equal(packCard(upload, true).file, 'key-1');
  assert.equal(packCard(null, true), null);
});

test('a link leaves uploads behind as empty slots and link cards without their stored picture', () => {
  const setup = { ...DEFAULT_SETUP, gap: 2 };
  const { payload, left } = forLink({ setup, slots: [catalog(1), upload, linked, null, null] });
  assert.equal(left, 1);
  assert.equal(payload.slots.length, 3, 'empty slots at the end go');
  assert.equal(payload.slots[1], null, 'the upload keeps its place, empty');
  assert.equal(payload.slots[2].file, undefined);
  assert.equal(payload.slots[2].link, 'https://example.com/c.jpg');
  assert.equal(payload.setup.gap, 2);
});

test('a link reads back as it went in, and stays short for a page of cards', async () => {
  const { payload } = forLink({ setup: DEFAULT_SETUP, slots: Array.from({ length: 9 }, (_, i) => catalog(i)) });
  const code = await encodeLink(payload);
  assert.match(code, /^[A-Za-z0-9_-]+$/, 'base64url, nothing to escape in an address');
  assert.ok(code.length < 1200, `nine cards in ${code.length} characters`);
  assert.deepEqual(await decodeLink(code), JSON.parse(JSON.stringify(payload)));
});

test('a link cut short or made up opens nothing', async () => {
  const code = await encodeLink(forLink({ setup: DEFAULT_SETUP, slots: [catalog(1)] }).payload);
  assert.equal(await decodeLink(code.slice(0, code.length >> 1)), null);
  assert.equal(await decodeLink('not-a-sheet'), null);
  assert.equal(await decodeLink(''), null);
});

test('a file keeps every card and the pictures that live on the device', () => {
  const text = fileText({ setup: DEFAULT_SETUP, slots: [catalog(1), upload, null] }, { 'key-1': 'data:image/png;base64,AAAA' });
  const raw = readSheetFile(text);
  assert.equal(JSON.parse(text).format, FORMAT);
  assert.equal(raw.slots.length, 2);
  assert.equal(raw.slots[1].file, 'key-1');
  assert.equal(raw.pictures['key-1'], 'data:image/png;base64,AAAA');
  assert.equal(readSheetFile('{"format":"something-else","slots":[]}'), null);
  assert.equal(readSheetFile('not json'), null);
  assert.deepEqual(readSheetFile(`{"format":"${FORMAT}","slots":[],"pictures":[1]}`).pictures, {});
});

test('a picture from a file: only the kinds the sheet shows', async () => {
  const png = pictureFrom('data:image/png;base64,iVBORw0KGgo=');
  assert.equal(png.type, 'image/png');
  assert.deepEqual([...new Uint8Array(await png.arrayBuffer())].slice(0, 4), [0x89, 0x50, 0x4e, 0x47]);
  assert.equal(pictureFrom('data:image/svg+xml;base64,PHN2Zz4='), null);
  assert.equal(pictureFrom('data:image/png,plain'), null);
  assert.equal(pictureFrom('https://example.com/a.png'), null);
  assert.equal(pictureFrom(42), null);
});

test('the file is named by the day', () => {
  assert.equal(fileName(new Date(2026, 9, 7)), 'pokeproxy-2026-10-07.json');
});
