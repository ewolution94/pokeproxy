// The sheet's geometry: real card sizes, how many fit, where the cut marks and the scale check go.
// layout.ts is TypeScript with nothing but erasable types, so Node runs it as it is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LABEL, DEFAULT_SETUP, LABEL_ANGLE, LABEL_SIZE, MARGIN, RULER, cleanLabel, filterFor, layout, padToPages, snapAngle, trimPages } from '../src/lib/layout.ts';

const setup = (patch = {}) => ({ ...DEFAULT_SETUP, ...patch });

test('A4 portrait takes nine Pokémon cards, centred, at 63 × 88 mm', () => {
  const g = layout(setup());
  assert.equal(g.pw, 210);
  assert.equal(g.ph, 297);
  assert.equal(g.cw, 63);
  assert.equal(g.ch, 88);
  assert.equal(g.cols, 3);
  assert.equal(g.rows, 3);
  assert.equal(g.perPage, 9);
  assert.deepEqual(g.cells[0], { x: 10.5, y: 16.5 });
  assert.deepEqual(g.cells[8], { x: 136.5, y: 192.5 });
});

test('the other papers and landscape', () => {
  const fits = (patch) => {
    const g = layout(setup(patch));
    return `${g.cols}×${g.rows}`;
  };
  assert.equal(fits({ landscape: true }), '4×2');
  assert.equal(fits({ paper: 'letter' }), '3×3');
  assert.equal(fits({ paper: 'letter', landscape: true }), '4×2');
  assert.equal(fits({ paper: 'a3' }), '4×4');
  assert.equal(fits({ paper: 'a5' }), '2×2');
  assert.equal(fits({ paper: 'legal' }), '3×3');
});

test('a gap goes between cards only, and can cost a row', () => {
  const g = layout(setup({ gap: 2 }));
  assert.equal(g.perPage, 9);
  assert.equal(g.cells[1].x - g.cells[0].x, 65);
  assert.equal(g.gridW, 3 * 63 + 2 * 2);
  // Letter is 279.4 mm tall: three rows of 88 with 5 mm gaps need 274, more than 279.4 − 2 × 5.
  assert.equal(layout(setup({ paper: 'letter', gap: 5 })).rows, 2);
});

test('the grid keeps the printer margin all round', () => {
  for (const paper of ['a4', 'a3', 'a5', 'letter', 'legal']) {
    for (const landscape of [false, true]) {
      for (const gap of [0, 1.5, 5]) {
        const g = layout(setup({ paper, landscape, gap }));
        assert.ok(g.x0 >= MARGIN - 1e-6 && g.y0 >= MARGIN - 1e-6, `${paper} ${landscape} ${gap}`);
        assert.ok(g.x0 + g.gridW <= g.pw - MARGIN + 1e-6 && g.y0 + g.gridH <= g.ph - MARGIN + 1e-6);
      }
    }
  }
});

test('a custom size is clamped, and one that fits nowhere gives no cells', () => {
  assert.equal(layout(setup({ custom: true, w: 59, h: 86 })).perPage, 9);
  assert.equal(layout(setup({ custom: true, w: 5, h: 5 })).cw, 20);
  const big = layout(setup({ custom: true, paper: 'a5', w: 200, h: 280 }));
  assert.equal(big.perPage, 0);
  assert.deepEqual(big.cells, []);
  assert.equal(big.ruler, null);
});

test('cut marks: one per shared edge with no gap, two with one, none without room', () => {
  const g = layout(setup());
  // 4 vertical edges × top and bottom + 4 horizontal edges × left and right.
  assert.equal(g.marks.length, 16);
  for (const m of g.marks) {
    const inGrid = (x, y) => x > g.x0 && x < g.x0 + g.gridW && y > g.y0 && y < g.y0 + g.gridH;
    assert.ok(!inGrid(m.x1, m.y1) && !inGrid(m.x2, m.y2), 'marks stay outside the cards');
  }
  assert.equal(layout(setup({ gap: 2 })).marks.length, 24);
  assert.equal(layout(setup({ marks: false })).marks.length, 0);
});

test('the scale check is 50 mm, under a column, clear of the cut marks', () => {
  const g = layout(setup());
  assert.ok(g.ruler);
  assert.equal(g.ruler.x2 - g.ruler.x1, RULER);
  assert.ok(g.ruler.y1 > g.y0 + g.gridH && g.ruler.y1 < g.ph - 5);
  // Under the middle column, so no mark crosses it.
  assert.ok(g.ruler.x1 > g.cells[1].x && g.ruler.x2 < g.cells[1].x + g.cw);
  // Landscape A4 has four columns: under the second, not across the middle edge.
  const l = layout(setup({ landscape: true }));
  assert.ok(l.ruler.x1 > l.cells[1].x && l.ruler.x2 < l.cells[1].x + l.cw);
  assert.equal(layout(setup({ ruler: false })).ruler, null);
});

test('pages: padded to whole pages, trailing empty pages trimmed, one always kept', () => {
  assert.deepEqual(padToPages([], 4), [null, null, null, null]);
  assert.equal(padToPages(['a', null, 'b', null, 'c'], 4).length, 8);
  assert.deepEqual(trimPages(['a', null, null, null, null, null, null, null], 4), ['a', null, null, null]);
  assert.deepEqual(trimPages([null, null, null, null, null, null, null, null], 4), [null, null, null, null]);
  // An empty page between full ones stays: it's a choice someone made.
  assert.equal(trimPages(['a', null, null, null, null, null, null, null, 'b'], 4).length, 12);
});

test('print styles', () => {
  assert.equal(filterFor('colour'), 'none');
  assert.equal(filterFor('grey'), 'grayscale(1)');
  assert.match(filterFor('light'), /^grayscale\(1\) contrast/);
});

test('a label is cleaned into range: known look, size, tilt, centre on the card', () => {
  assert.deepEqual(cleanLabel(undefined), DEFAULT_LABEL);
  assert.deepEqual(cleanLabel({ look: 'neon', size: 99, angle: -200, x: 3, y: -1 }), {
    look: 'dark',
    size: LABEL_SIZE.max,
    angle: -LABEL_ANGLE,
    x: 0.95,
    y: 0.05,
  });
  assert.equal(cleanLabel({ size: 6.26 }).size, 6.3);
  assert.equal(cleanLabel({ look: 'stamp' }).look, 'stamp');
  assert.equal(cleanLabel({ size: 'big' }).size, DEFAULT_LABEL.size);
  // The sheet's setup carries a label from the start, so every card has one to follow.
  assert.deepEqual(DEFAULT_SETUP.label, DEFAULT_LABEL);
});

test('a turned label snaps to multiples of 15° when close', () => {
  assert.equal(snapAngle(-28), -30);
  assert.equal(snapAngle(13), 15);
  assert.equal(snapAngle(22), 22);
  assert.equal(snapAngle(0.4), 0);
  assert.equal(snapAngle(-7.6), -8);
});

