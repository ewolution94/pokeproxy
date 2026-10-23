// A tagged card's picture in its language, from TCGdex (server/localized.mjs), with TCGdex stood in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalized, matchSets } from '../server/localized.mjs';

test('TCGSL’s sets are matched to TCGdex’s by name, then by id', () => {
  const map = matchSets(
    [
      { id: 'sv3pt5', name: '151' },
      { id: 'base1', name: 'Base' },
      { id: 'hgss4', name: 'HS—Triumphant' },
      { id: 'zzz', name: 'Nowhere' },
    ],
    [
      { id: 'sv03.5', name: '151' },
      { id: 'base1', name: 'Base Set' },
      { id: 'hgss4', name: 'Triumphant' },
    ],
  );
  assert.equal(map.get('sv3pt5'), 'sv03.5');
  assert.equal(map.get('base1'), 'base1');
  assert.equal(map.get('hgss4'), 'hgss4');
  assert.equal(map.has('zzz'), false);
});

test('a card’s picture in German; none for a language TCGdex lacks, a Japanese card or an unknown one', async () => {
  const asked = [];
  const fetchJSON = async (url) => {
    asked.push(url);
    if (url.endsWith('/en/sets')) return [{ id: 'sv03.5', name: '151' }];
    if (url.endsWith('/de/sets/sv03.5')) return { cards: [{ localId: '006', name: 'Glurak-ex', image: 'https://assets.tcgdex.net/de/sv/sv03.5/006' }, { localId: '007', name: 'Schiggy' }] };
    throw new Error('HTTP 404');
  };
  const catalog = {
    englishSets: () => [{ id: 'sv3pt5', name: '151' }],
    card: (set, key) => (set === 'sv3pt5' ? { id: `${set}/${key}`, lang: 'en' } : set === 'sv2a_ja' ? { lang: 'ja' } : null),
  };
  const local = createLocalized({ catalog, fetchJSON });
  assert.deepEqual(await local.find('sv3pt5/6', 'de'), { name: 'Glurak-ex', image: 'https://assets.tcgdex.net/de/sv/sv03.5/006/high.webp' });
  assert.equal(await local.find('sv3pt5/7', 'de'), null, 'a card without a picture');
  assert.equal(await local.find('sv3pt5/6', 'fr'), null, 'a set TCGdex lacks in French');
  assert.equal(await local.find('sv3pt5/6', 'ko'), null, 'a language without pictures');
  assert.equal(await local.find('sv2a_ja/6', 'de'), null, 'a Japanese card');
  assert.equal(await local.find('nope/1', 'de'), null);
  // The German set was fetched once, and the set list once.
  await local.find('sv3pt5/6', 'de');
  assert.equal(asked.filter((u) => u.endsWith('/de/sets/sv03.5')).length, 1);
  assert.equal(asked.filter((u) => u.endsWith('/en/sets')).length, 1);
});
