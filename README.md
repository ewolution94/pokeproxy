# PokeProxy

Printable sheets of Pokémon card proxies at the real card size, for the binder: placeholders for
the cards you still want. Pick the paper and the card size, fill the grid from a search, a pasted
link or your own pictures, and print. Desktop first; it works on a phone too.

## How it works

**The sheet.** A4 portrait by default (A3, A5, Letter and Legal too, either way round), with
Pokémon cards at 63 × 88 mm, the size of every standard trading card, or a size of your own. The
grid is as many cards as fit inside a 5 mm printer margin (3 × 3 on A4), centred, with optional
space between cards, cut marks in the margin and a 50 mm scale check under the cards to measure
after printing. Cards print in colour, greyscale (the default) or ink saver, per sheet or per card.
The slots run on from page to page, so a different paper or card size flows the same cards onto
the new pages in order. Everything lives on the device: the sheet in `localStorage`, uploaded and
fetched pictures in IndexedDB (`src/lib/files.svelte.ts`).

**What you see is what prints.** Every position on a page is in millimetres times `--mm`
(`src/lib/layout.ts` does the geometry), a screen scale on screen and exactly `1mm` in print, with
`@page { size: …; margin: 0 }` written for the chosen paper. Only pages with a card print.
Checked by printing to PDF in headless Chromium: cards at 63.00 × 88.00 mm, the page A4 to the
point. In the print dialog: scale 100 % (actual size), no margins.

**Search.** The catalogue is TCGSL's (tcgsl.ewolution.cloud, the family's set list): the server
reads its public snapshot at start and once a day (`/data/sets.json`, `/data/sets-ja.json`, one
file per set; about 2 MB) and keeps every card in memory, about 33,000 English and Japanese cards
(Japanese sets without pictures are left out). `server/catalog.mjs` searches it: every word has to
fit the name, the set (name, code or id) or the number, best fit first, newest set first among
equals. "umbreon vmax", "151 6", "MEW 199/165", "151 jp 6" and katakana (or hiragana) all work.
The pictures come straight from TCGSL: 240 px thumbnails in the results, the 734 px version
(about 300 dpi on a 63 mm card) on the sheet.

**Links** (`server/link.mjs`). Addresses it knows become catalogue cards without a fetch: TCGSL's
pictures and set pages, pokemontcg.io's and Scrydex's image servers, Limitless TCG's card pages
(English and Japanese, by set code and number). Anything else is fetched once: a picture as it is,
a page for its link-preview picture (`og:image`, which card sites set to the card). The bytes go
back to the page, which keeps them like an upload, so a sheet never depends on another site. The
fetch only reaches public addresses on ports 80 and 443 (checked on the address it connects to, at
every redirect), gives up after 10 s, reads at most 2 MB of a page and 15 MB of a picture, and
accepts only PNG, JPEG, WebP, GIF and AVIF by their bytes. Sixty links per visitor per ten
minutes, four at a time in all. Sites behind bot protection (Cardmarket) don't answer: copying
the picture's address there works. `⌘V` on the sheet pastes a link or a picture into the selected
slot; pictures dropped on a slot land there.

**Uploads** never leave the device.

## Run it

```bash
cd ~/Documents/private/development/pokeproxy && npm install
```

Then `pokeproxy-dev` (Vite, port 7110) from the browser pane, or `npm run build` and
`pokeproxy-prod` (the production server, port 7111). Both read the catalogue from the live TCGSL.
`npm run check` type-checks, `npm test` runs the unit tests (geometry, search, the link reader).

## Deploy (NAS)

CI on `release` (typecheck, tests, build, a smoke test of the production server) publishes
`ghcr.io/ewolution94/pokeproxy:latest` for amd64 and arm64; the shared Watchtower pulls it into the
stack from `deploy/portainer-stack.yml` (port 7100, the `ewolution` network for TCGSL and Census).
No volume: the server keeps nothing.

| Variable | Default | |
|---|---|---|
| `PORT` | `8080` | |
| `POKEPROXY_TCGSL` | `https://tcgsl.ewolution.cloud` | where the catalogue is read (the stack uses `http://tcgsl:5700`) |
| `POKEPROXY_TCGSL_IMAGES` | `https://tcgsl.ewolution.cloud` | where the page loads the pictures from (also in the CSP) |
| `POKEPROXY_REFRESH` | `24` | hours between catalogue reloads; `off` loads none (CI) |
| `POKEPROXY_CENSUS` | – | Census's ingest origin for visit counts |

## Layout

```
server/server.mjs     static files, security headers, the API, Census
server/api.mjs        /api/search, /api/status, /api/link
server/catalog.mjs    TCGSL's snapshot in memory, and the search
server/link.mjs       pasted links: known addresses, guarded fetches, og:image
src/lib/layout.ts     paper, card size, grid, cut marks, scale check (millimetres)
src/lib/sheet.svelte.ts  the setup and the slots, kept on the device
src/components/       Header, Setup, Pages (the paper), Picker (Search, Link, Upload), Settings
tests/                node --test
```
