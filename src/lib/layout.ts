// The sheet's geometry, in millimetres: how many cards fit the paper, where each one sits, and
// where the cut marks go. No DOM, no Svelte (tests/layout.test.mjs runs it under plain Node).

export type PaperId = 'a4' | 'a3' | 'a5' | 'letter' | 'legal';
export type PrintStyle = 'colour' | 'grey' | 'light';

export const PAPERS: Record<PaperId, { w: number; h: number; label: string }> = {
  a4: { w: 210, h: 297, label: 'A4' },
  a3: { w: 297, h: 420, label: 'A3' },
  a5: { w: 148, h: 210, label: 'A5' },
  letter: { w: 215.9, h: 279.4, label: 'Letter' },
  legal: { w: 215.9, h: 355.6, label: 'Legal' },
};

/** A Pokémon card, like every standard trading card: 63 × 88 mm (2.48 × 3.46 in). */
export const STANDARD = { w: 63, h: 88 };

/** The edge most printers can't print into; the grid keeps at least this much paper around it. */
export const MARGIN = 5;
/** Cut marks start this far from the grid and are at most this long. */
const MARK_GAP = 1;
const MARK_LENGTH = 4;
/** The scale check: a line this long, in the bottom margin. */
export const RULER = 50;

export interface Setup {
  paper: PaperId;
  landscape: boolean;
  /** The card's size; STANDARD unless the custom size is on. */
  custom: boolean;
  w: number;
  h: number;
  /** Space between neighbouring cards. 0: one cut separates two cards. */
  gap: number;
  marks: boolean;
  ruler: boolean;
  style: PrintStyle;
}

export const DEFAULT_SETUP: Setup = {
  paper: 'a4',
  landscape: false,
  custom: false,
  w: STANDARD.w,
  h: STANDARD.h,
  gap: 0,
  marks: true,
  ruler: true,
  style: 'grey',
};

export interface Cell {
  x: number;
  y: number;
}

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Layout {
  /** The paper, as it lies (landscape swaps the sides). */
  pw: number;
  ph: number;
  /** The card. */
  cw: number;
  ch: number;
  cols: number;
  rows: number;
  perPage: number;
  /** Each card's top-left corner, row by row. */
  cells: Cell[];
  /** The grid's box. */
  x0: number;
  y0: number;
  gridW: number;
  gridH: number;
  marks: Line[];
  /** The scale check's line, when there's room for it below the grid. */
  ruler: Line | null;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function cardSize(setup: Pick<Setup, 'custom' | 'w' | 'h'>) {
  return setup.custom ? { w: clampSize(setup.w), h: clampSize(setup.h) } : { ...STANDARD };
}

export const clampSize = (n: number) => Math.min(400, Math.max(20, Number.isFinite(n) ? n : 63));

export function layout(setup: Setup): Layout {
  const paper = PAPERS[setup.paper] ?? PAPERS.a4;
  const [pw, ph] = setup.landscape ? [paper.h, paper.w] : [paper.w, paper.h];
  const { w: cw, h: ch } = cardSize(setup);
  const g = Math.max(0, Math.min(20, setup.gap || 0));

  const cols = Math.max(0, Math.floor((pw - 2 * MARGIN + g + 1e-6) / (cw + g)));
  const rows = Math.max(0, Math.floor((ph - 2 * MARGIN + g + 1e-6) / (ch + g)));
  const gridW = cols ? cols * cw + (cols - 1) * g : 0;
  const gridH = rows ? rows * ch + (rows - 1) * g : 0;
  const x0 = round((pw - gridW) / 2);
  const y0 = round((ph - gridH) / 2);

  const cells: Cell[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ x: round(x0 + c * (cw + g)), y: round(y0 + r * (ch + g)) });

  // Every edge a cut follows, once: with no gap, neighbours share theirs.
  const xs = [...new Set(cells.flatMap((c) => [c.x, round(c.x + cw)]))].sort((a, b) => a - b);
  const ys = [...new Set(cells.flatMap((c) => [c.y, round(c.y + ch)]))].sort((a, b) => a - b);
  const marks: Line[] = [];
  if (setup.marks && cells.length) {
    const lenX = Math.min(MARK_LENGTH, x0 - MARK_GAP - 1.5);
    const lenY = Math.min(MARK_LENGTH, y0 - MARK_GAP - 1.5);
    if (lenY > 1) {
      for (const x of xs) {
        marks.push({ x1: x, y1: round(y0 - MARK_GAP - lenY), x2: x, y2: round(y0 - MARK_GAP) });
        marks.push({ x1: x, y1: round(y0 + gridH + MARK_GAP), x2: x, y2: round(y0 + gridH + MARK_GAP + lenY) });
      }
    }
    if (lenX > 1) {
      for (const y of ys) {
        marks.push({ x1: round(x0 - MARK_GAP - lenX), y1: y, x2: round(x0 - MARK_GAP), y2: y });
        marks.push({ x1: round(x0 + gridW + MARK_GAP), y1: y, x2: round(x0 + gridW + MARK_GAP + lenX), y2: y });
      }
    }
  }

  // The scale check sits under a column in the middle, between its cut marks, and needs about
  // 7.5 mm of paper below the grid (the line, its label, and the printer's own edge).
  let ruler: Line | null = null;
  const below = ph - (y0 + gridH);
  if (setup.ruler && cells.length && below >= 7.5 && cw >= RULER + 2) {
    const col = cells[Math.floor((cols - 1) / 2)];
    const mid = round(col.x + cw / 2);
    const y = round(y0 + gridH + 2.5);
    ruler = { x1: round(mid - RULER / 2), y1: y, x2: round(mid + RULER / 2), y2: y };
  }

  return { pw, ph, cw, ch, cols, rows, perPage: cols * rows, cells, x0, y0, gridW, gridH, marks, ruler };
}

/** Where slot `index` (counted across every page) sits: its page and its place on it. */
export function locate(index: number, perPage: number) {
  return { page: Math.floor(index / perPage), cell: index % perPage };
}

/** The slots, padded to whole pages (one at least). */
export function padToPages<T>(slots: (T | null)[], perPage: number): (T | null)[] {
  if (perPage <= 0) return slots;
  const pages = Math.max(1, Math.ceil(slots.length / perPage));
  const out = slots.slice();
  while (out.length < pages * perPage) out.push(null);
  return out;
}

/** Empty pages at the end go, but one page always stays. */
export function trimPages<T>(slots: (T | null)[], perPage: number): (T | null)[] {
  if (perPage <= 0) return slots;
  let end = slots.length;
  while (end > perPage && slots.slice(end - perPage, end).every((s) => s === null)) end -= perPage;
  return padToPages(slots.slice(0, end), perPage);
}

/** The CSS filter that gives a card its print style. */
export function filterFor(style: PrintStyle): string {
  if (style === 'grey') return 'grayscale(1)';
  // Lighter and flatter: a placeholder that still reads, with a fraction of the ink.
  if (style === 'light') return 'grayscale(1) contrast(0.62) brightness(1.28)';
  return 'none';
}
