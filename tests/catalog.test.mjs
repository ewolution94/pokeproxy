// The catalogue: built from TCGSL's snapshot (a small stand-in here), and searched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEntries, createCatalog, normalize, numberKey, parseQuery, printedNumber, search, speciesMatcher } from '../server/catalog.mjs';

const EN = {
  built: '2026-10-22T00:00:00Z',
  sets: [
    { id: 'me55', name: '30th Celebration', series: 'Mega Evolution', date: '2026-09-16', printed: 128, total: 161, code: '30C' },
    { id: 'sv3pt5', name: '151', series: 'Scarlet & Violet', date: '2023-09-22', printed: 165, total: 207, code: 'MEW' },
    { id: 'swsh7', name: 'Evolving Skies', series: 'Sword & Shield', date: '2021-08-27', printed: 203, total: 237, code: 'EVS' },
    { id: 'base1', name: 'Base', series: 'Base', date: '1999-01-09', printed: 102, total: 102, code: 'BS' },
    { id: 'xy12', name: 'Evolutions', series: 'XY', date: '2016-11-02', printed: 108, total: 113, code: 'EVO' },
  ],
};
const JA = {
  built: '2026-10-22T00:00:00Z',
  sets: [
    { id: 'sv2a_ja', name: 'Pokémon Card 151', ja: 'ポケモンカード151', series: 'Scarlet & Violet', date: '2023-06-16', printed: 165, total: 210, code: 'SV2a', pics: true },
    { id: 'pmcg1_ja', name: 'Expansion Pack', series: 'PMCG', date: '1996-10-20', printed: 102, total: 102, code: 'PMCG1', pics: false },
  ],
};
const CARDS = new Map([
  ['me55', [['4', '4', 'Charizard', 'Rare', 0], ['156', '156', 'Salamence ex', 'Special Illustration Rare', 0]]],
  ['sv3pt5', [['6', '6', 'Charizard ex', 'Double Rare', 7.3], ['199', '199', 'Charizard ex', 'Special Illustration Rare', 235.7], ['122', '122', 'Mr. Mime', 'Rare', 0.1], ['151', '151', 'Mew ex', 'Double Rare', 3]]],
  ['swsh7', [['95', '95', 'Umbreon VMAX', 'Rare Holo VMAX', 30], ['215', '215', 'Umbreon VMAX', 'Rare Secret', 1500], ['TG01', 'TG01', 'Flabébé', 'Rare', 0]]],
  ['base1', [['4', '4', 'Charizard', 'Rare Holo', 400], ['151', '151', 'Nope', '', 0]]],
  ['xy12', [['11', '11', 'Charizard', 'Rare Holo', 20], ['12', '12', 'Charizard EX', 'Rare Holo EX', 5]]],
  ['sv2a_ja', [['6', '006', 'リザードンex', '', 0], ['1', '001', '', '', 0]]],
  ['pmcg1_ja', [['6', '006', 'リザードン', '', 0]]],
]);

// A few rows of the names table (server/species.json): en, ja, de, fr, it, es, ko, zh-hant, zh-hans.
const SPECIES = {
  langs: ['en', 'ja', 'de', 'fr', 'it', 'es', 'ko', 'zh-hant', 'zh-hans'],
  species: [
    ['Charizard', 'リザードン', 'Glurak', 'Dracaufeu', 'Charizard', 'Charizard', '리자몽', '噴火龍', '喷火龙'],
    ['Mr. Mime', 'バリヤード', 'Pantimos', 'M. Mime', 'Mr. Mime', 'Mr. Mime', '마임맨', '魔牆人偶', '魔墙人偶'],
    ['Umbreon', 'ブラッキー', 'Nachtara', 'Noctali', 'Umbreon', 'Umbreon', '블래키', '月亮伊布', '月亮伊布'],
    ['Mew', 'ミュウ', 'Mew', 'Mew', 'Mew', 'Mew', '뮤', '夢幻', '梦幻'],
    ['Mewtwo', 'ミュウツー', 'Mewtu', 'Mewtwo', 'Mewtwo', 'Mewtwo', '뮤츠', '超夢', '超梦'],
    ['Flabébé', 'フラベベ', 'Flabébé', 'Flabébé', 'Flabébé', 'Flabébé', '플라베베', '花蓓蓓', '花蓓蓓'],
  ],
};

const entries = buildEntries(
  [
    { sets: EN.sets, lang: 'en' },
    { sets: JA.sets, lang: 'ja' },
  ],
  CARDS,
  SPECIES,
);
const names = (q, options) => search(entries, q, options).cards.map((e) => `${e.set}/${e.key}`);

test('normalising: accents, full width, punctuation, hiragana', () => {
  assert.equal(normalize('Flabébé'), 'flabebe');
  assert.equal(normalize('ＦＬＡＢＥＢＥ'), 'flabebe');
  assert.equal(normalize('Mr. Mime'), 'mr mime');
  assert.equal(normalize('Ho-Oh'), 'ho oh');
  assert.equal(normalize("Farfetch'd"), 'farfetchd');
  assert.equal(normalize('りざーどん'), normalize('リザードン'));
  assert.equal(numberKey('006'), '6');
  assert.equal(numberKey('TG01'), 'tg1');
  assert.equal(printedNumber('6', 165), '6/165');
  assert.equal(printedNumber('006', 165), '006/165');
  assert.equal(printedNumber('TG01', 203), 'TG01');
});

test('Japanese sets without pictures are left out: nothing to print', () => {
  assert.ok(!entries.some((e) => e.set === 'pmcg1_ja'));
});

test('a name: every card of it, newest set first', () => {
  // The English cards by name; the Japanese one by its Pokémon (an alias), after them.
  assert.deepEqual(names('charizard'), ['me55/4', 'xy12/11', 'base1/4', 'sv3pt5/6', 'sv3pt5/199', 'xy12/12', 'sv2a_ja/6']);
});

test('a name and a set', () => {
  assert.deepEqual(names('charizard 151'), ['sv3pt5/6', 'sv3pt5/199', 'sv2a_ja/6']);
  assert.deepEqual(names('umbreon vmax'), ['swsh7/95', 'swsh7/215']);
  assert.deepEqual(names('umbreon evolving'), ['swsh7/95', 'swsh7/215']);
});

test('a set alone lists it in order, ahead of other sets’ cards with that number', () => {
  const hits = names('151');
  assert.deepEqual(hits.slice(0, 4), ['sv3pt5/6', 'sv3pt5/122', 'sv3pt5/151', 'sv3pt5/199']);
  assert.ok(hits.indexOf('base1/151') > 3);
});

test('a set code and a number, with or without the printed total', () => {
  assert.deepEqual(names('MEW 6'), ['sv3pt5/6']);
  assert.equal(names('6/165')[0], 'sv3pt5/6');
  assert.deepEqual(names('evs tg01'), ['swsh7/TG01']);
  assert.deepEqual(names('sv3pt5 199'), ['sv3pt5/199']);
});

test('punctuation and accents don’t matter', () => {
  assert.deepEqual(names('mr mime'), ['sv3pt5/122']);
  assert.deepEqual(names('flabebe'), ['swsh7/TG01']);
});

test('Japanese cards: by set and number, in katakana or hiragana, or with jp in the query', () => {
  assert.deepEqual(names('151 jp 6'), ['sv2a_ja/6']);
  assert.equal(names('リザードン')[0], 'sv2a_ja/6');
  assert.equal(names('りざーどん')[0], 'sv2a_ja/6');
  assert.ok(names('リザードン').includes('sv3pt5/6'), 'the English Charizards by their Japanese name');
  assert.deepEqual(names('sv2a 1'), ['sv2a_ja/1']);
  // The Japanese cards by their Pokémon's English name (the bug the user found, 2026-10-23).
  assert.deepEqual(names('charizard', { lang: 'ja' }), ['sv2a_ja/6']);
  assert.deepEqual(names('charizard jp'), ['sv2a_ja/6']);
  assert.ok(names('6', { lang: 'en' }).every((id) => !id.endsWith('_ja/6')));
});

test('nothing for an empty query or a word that fits nowhere', () => {
  assert.deepEqual(search(entries, '   ').cards, []);
  assert.deepEqual(names('charizard zzzz'), []);
});

test('the catalogue reads TCGSL, hands out TCGSL picture addresses, and keeps the last good copy', async () => {
  let fail = false;
  const fetchJSON = async (url) => {
    if (fail) throw new Error('down');
    const path = new URL(url).pathname;
    if (path === '/data/sets.json') return EN;
    if (path === '/data/sets-ja.json') return JA;
    const id = /\/data\/sets\/(.+)\.json$/.exec(path)[1];
    // Plenty of filler, so the size check passes.
    return { cards: [...CARDS.get(id), ...Array.from({ length: 300 }, (_, i) => [`f${i}`, `${900 + i}`, `Filler ${i}`, '', 0])] };
  };
  const catalog = createCatalog({ origin: 'http://tcgsl.test', images: 'https://tcgsl.example', fetchJSON, log: () => {} });
  assert.equal(catalog.search('charizard'), null);
  await catalog.load();
  assert.ok(catalog.ready);
  const card = catalog.card('sv3pt5', '6');
  assert.equal(card.name, 'Charizard ex');
  assert.equal(card.number, '6/165');
  assert.equal(card.image, 'https://tcgsl.example/img/card-hd/sv3pt5/6-734.webp');
  assert.equal(card.thumb, 'https://tcgsl.example/img/card/sv3pt5/6-240.webp');
  assert.equal(catalog.byCode('en', 'MEW', '006')?.id, 'sv3pt5/6');
  assert.equal(catalog.byCode('ja', 'SV2a', '6')?.id, 'sv2a_ja/6');
  assert.deepEqual(catalog.set('sv3pt5'), { id: 'sv3pt5', name: '151', lang: 'en' });
  fail = true;
  await assert.rejects(catalog.load());
  assert.equal(catalog.card('sv3pt5', '6')?.name, 'Charizard ex');
});

test('parseQuery keeps the language words out of the search', () => {
  const { tokens, lang } = parseQuery('151 JP 6');
  assert.equal(lang, 'ja');
  assert.deepEqual(
    tokens.map((t) => t.text),
    ['151', '6'],
  );
});

test('a card’s Pokémon in every other language: German, French, Korean, Chinese', () => {
  for (const q of ['glurak', 'dracaufeu', '리자몽', '喷火龙', '噴火龍']) assert.ok(names(q).includes('sv3pt5/6'), q);
  assert.deepEqual(names('pantimos'), ['sv3pt5/122']);
  assert.deepEqual(names('nachtara vmax'), ['swsh7/95', 'swsh7/215']);
});

test('the matcher takes the longest name: Mewtwo isn’t Mew, Mr. Mime is two words', () => {
  const aliases = speciesMatcher(SPECIES);
  assert.equal(aliases(normalize('ミュウツーex'), 'ja').english, 'Mewtwo');
  assert.equal(aliases(normalize('ミュウex'), 'ja').english, 'Mew');
  assert.equal(aliases(normalize('Mr. Mime'), 'en').english, 'Mr. Mime');
  assert.equal(aliases(normalize('Mewtwo & Mew-GX'), 'en').english, 'Mewtwo & Mew');
  assert.equal(aliases(normalize('Professor’s Research'), 'en').english, '');
  // A Japanese card shows its Pokémon's English name beside its own.
  assert.equal(search(entries, 'リザードン', { lang: 'ja' }).cards[0].english, 'Charizard');
});

