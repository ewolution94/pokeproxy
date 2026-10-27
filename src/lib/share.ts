// A sheet that travels: as a file with everything (the uploaded and fetched pictures inside, as
// data URLs), or as a link that carries the sheet in its address (#s=…, deflated JSON in
// base64url). What follows # never reaches a server, so the link needs no storage. A link carries
// catalogue cards and link cards (their picture is fetched again from the link); uploads travel
// only in a file. sharing.ts saves, copies and opens; this is the format.
//
// Plain TypeScript with erasable types, so the tests run it as it is.

import type { Setup } from './layout.ts';
import type { Card } from './sheet.svelte.ts';

export const FORMAT = 'pokeproxy-sheet';
export const VERSION = 1;
/** The start of a shared link's address after the page's. */
export const HASH = '#s=';

export interface SheetData {
  setup: Setup;
  slots: (Card | null)[];
}

/** A card as it travels: without its uid (made up on this device) and without empty fields. */
export function packCard(card: Card | null, keepFile: boolean): Partial<Card> | null {
  if (!card) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(card)) {
    if (key === 'uid' || (key === 'file' && !keepFile)) continue;
    if (value === null || value === undefined || value === '' || value === false) continue;
    out[key] = value;
  }
  return out as Partial<Card>;
}

/** Empty slots at the end go; the sheet pads its pages again when it opens. */
function trimEnd<T>(slots: (T | null)[]): (T | null)[] {
  let end = slots.length;
  while (end && slots[end - 1] == null) end--;
  return slots.slice(0, end);
}

/** What a link carries, and how many uploaded pictures it has to leave behind (their slots stay empty). */
export function forLink(data: SheetData): { payload: { v: number; setup: Setup; slots: (Partial<Card> | null)[] }; left: number } {
  let left = 0;
  const slots = data.slots.map((card) => {
    if (card && (card.source === 'file' || (card.source === 'link' && !card.link))) {
      left++;
      return null;
    }
    return packCard(card, false);
  });
  return { payload: { v: VERSION, setup: data.setup, slots: trimEnd(slots) }, left };
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** The part of a link after #s=. */
export async function encodeLink(payload: object): Promise<string> {
  const stream = new Blob([JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

/** A link's sheet, or null when it can't be read (cut short, or not one of ours). */
export async function decodeLink(code: string): Promise<{ setup?: unknown; slots: unknown[] } | null> {
  try {
    const stream = new Blob([fromBase64Url(code) as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const raw = JSON.parse(await new Response(stream).text());
    return raw && typeof raw === 'object' && Array.isArray(raw.slots) ? raw : null;
  } catch {
    return null;
  }
}

/** The file: the sheet with every card, and the pictures that live on this device by their key. */
export function fileText(data: SheetData, pictures: Record<string, string>): string {
  const slots = trimEnd(data.slots.map((card) => packCard(card, true)));
  return JSON.stringify({ format: FORMAT, version: VERSION, setup: data.setup, slots, pictures });
}

/** "pokeproxy-2026-10-27.json", by the day on this device. JSON, so a phone's Files app opens it too. */
export function fileName(date = new Date()): string {
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
  return `pokeproxy-${day}.json`;
}

/** A file's sheet, or null when it isn't one. */
export function readSheetFile(text: string): { setup: unknown; slots: unknown[]; pictures: Record<string, unknown> } | null {
  try {
    const raw = JSON.parse(text);
    if (!raw || raw.format !== FORMAT || !Array.isArray(raw.slots)) return null;
    const pictures = raw.pictures && typeof raw.pictures === 'object' && !Array.isArray(raw.pictures) ? raw.pictures : {};
    return { setup: raw.setup, slots: raw.slots, pictures };
  } catch {
    return null;
  }
}

const PICTURE = /^image\/(png|jpeg|webp|gif|avif)$/;

/** A picture from a file's data URL; null unless it's a picture the sheet can show. */
export function pictureFrom(dataUrl: unknown): Blob | null {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
  const comma = dataUrl.indexOf(',');
  const [type, encoding] = dataUrl.slice(5, comma).split(';');
  if (comma < 0 || encoding !== 'base64' || !PICTURE.test(type)) return null;
  try {
    const bin = atob(dataUrl.slice(comma + 1));
    return new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))], { type });
  } catch {
    return null;
  }
}
