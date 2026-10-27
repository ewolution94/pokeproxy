// Saving the sheet as a file, putting it in a link, and opening either again (share.ts has the
// format). Opening replaces the sheet, setup and all, and Undo brings the old one back.

import { readLink } from './api.ts';
import { readFile, saveFile } from './files.svelte.ts';
import { sheet } from './sheet.svelte.ts';
import { HASH, decodeLink, encodeLink, fileName, fileText, forLink, pictureFrom, readSheetFile } from './share.ts';
import { t, tn } from './i18n/index.svelte.ts';
import { toast } from '../../vendor/ewo/elements/toaster.js';

export interface SheetLink {
  url: string;
  /** Uploaded pictures the link can't carry. */
  left: number;
}

/**
 * This page over https. Opened over plain http (an old address in the browser's history), the page is
 * another origin with its own saved sheet, so this sheet goes along in the link, unless the address
 * already carries one. Uploads can't go along (forLink).
 */
export async function httpsAddress(): Promise<string> {
  const base = `https://${location.host}${location.pathname}`;
  if (location.hash.startsWith(HASH) || !sheet.cardCount) return base + location.search + location.hash;
  try {
    return `${base}${HASH}${await encodeLink(forLink({ setup: sheet.setup, slots: sheet.slots }).payload)}`;
  } catch {
    return base;
  }
}

/** The sheet as a link to this page. */
export async function sheetLink(): Promise<SheetLink> {
  const { payload, left } = forLink({ setup: sheet.setup, slots: sheet.slots });
  return { url: `${location.origin}/${HASH}${await encodeLink(payload)}`, left };
}

const dataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/** Downloads the sheet as a file, with the pictures that live on this device inside. */
export async function saveSheetFile() {
  const pictures: Record<string, string> = {};
  for (const card of sheet.slots) {
    if (!card?.file || card.file in pictures) continue;
    const blob = await readFile(card.file);
    if (blob) pictures[card.file] = await dataUrl(blob);
  }
  const name = fileName();
  const url = URL.createObjectURL(new Blob([fileText({ setup: sheet.setup, slots: sheet.slots }, pictures)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  toast(t('share.saved', { name }), { tone: 'ok' });
}

/** Puts an opened sheet in place of this one and says so, with Undo when there was something to lose. */
function opened(raw: { setup?: unknown; slots: unknown[] }, missing: number) {
  const had = sheet.cardCount > 0;
  sheet.open(raw);
  toast(tn('share.opened', sheet.cardCount), had ? { action: { label: t('toast.undo'), run: () => sheet.undo() } } : {});
  if (missing) toast(tn('share.missing', missing), { tone: 'bad', duration: 7000 });
}

/** Opens a saved sheet: its pictures are kept on this device under new keys. */
export async function openSheetFile(file: File) {
  const raw = readSheetFile(await file.text().catch(() => ''));
  if (!raw) {
    toast(t('share.notSheet'), { tone: 'bad' });
    return;
  }
  const keys = new Map<string, string>();
  for (const [key, data] of Object.entries(raw.pictures)) {
    const blob = pictureFrom(data);
    if (blob) keys.set(key, await saveFile(blob));
  }
  let missing = 0;
  const slots = raw.slots.map((card) => {
    if (!card || typeof card !== 'object' || !('file' in card)) return card;
    const key = keys.get(String(card.file));
    if (key) return { ...card, file: key };
    missing++;
    return null;
  });
  opened({ setup: raw.setup, slots }, missing);
}

/** When the page was opened with a shared link (#s=…), its sheet; link cards fetch their picture again. */
export async function openSharedLink() {
  if (!location.hash.startsWith(HASH)) return;
  const code = location.hash.slice(HASH.length);
  // Off the address, so a reload doesn't open it twice.
  history.replaceState(null, '', location.pathname + location.search);
  const raw = await decodeLink(code);
  if (!raw) {
    toast(t('share.badLink'), { tone: 'bad', duration: 7000 });
    return;
  }
  const links = raw.slots.filter((c): c is { source: string; link: string } => !!c && typeof c === 'object' && (c as any).source === 'link' && typeof (c as any).link === 'string');
  let missing = 0;
  if (links.length) {
    const dismiss = toast(tn('share.fetching', links.length), { duration: 0 });
    for (const card of links) {
      try {
        const out = await readLink(card.link);
        if ('card' in out) Object.assign(card, { file: out.card.file, image: out.card.image, thumb: out.card.thumb });
        else missing++;
      } catch {
        missing++;
      }
    }
    dismiss();
  }
  // A link card whose picture didn't come has neither a picture nor a file, and stays out.
  opened(raw, missing);
}
