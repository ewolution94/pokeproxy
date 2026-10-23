// Writes server/species.json: every Pokémon's name in the languages cards are printed in, from
// PokéAPI's open data (github.com/PokeAPI/pokeapi, data/v2/csv, BSD 3-Clause; the names are
// Nintendo's trademarks). The catalogue uses it so a search in one language finds cards printed
// in another: "charizard" finds リザードンex, "glurak" finds Charizard ex.
//
//   node scripts/species.mjs [path/to/pokemon_species_names.csv]
//
// Without a path it downloads the file. Run again when new Pokémon are added.

import { readFile, writeFile } from 'node:fs/promises';

const URL_CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv';
// PokéAPI's language ids (data/v2/csv/languages.csv) in the order the file keeps them.
const LANGS = { en: 9, ja: 1, de: 6, fr: 5, it: 8, es: 7, ko: 3, 'zh-hant': 4, 'zh-hans': 12 };

const text = process.argv[2] ? await readFile(process.argv[2], 'utf8') : await (await fetch(URL_CSV)).text();
const byId = new Map();
for (const line of text.split('\n').slice(1)) {
  if (!line.trim()) continue;
  // id,language,name,genus: a name never holds a comma, a genus may (it's last, so it doesn't matter).
  const [id, lang, name] = line.split(',');
  const row = byId.get(id) ?? {};
  for (const [code, n] of Object.entries(LANGS)) if (Number(lang) === n) row[code] = name.trim();
  byId.set(id, row);
}
const species = [...byId.entries()]
  .sort((a, b) => Number(a[0]) - Number(b[0]))
  .filter(([, r]) => r.en)
  .map(([, r]) => Object.keys(LANGS).map((code) => r[code] ?? ''));
await writeFile(
  new URL('../server/species.json', import.meta.url),
  JSON.stringify({ source: 'PokéAPI (BSD 3-Clause, © Paul Hallett and PokéAPI contributors); names are trademarks of Nintendo', langs: Object.keys(LANGS), species }) + '\n',
);
console.log(`${species.length} species in ${Object.keys(LANGS).length} languages`);
