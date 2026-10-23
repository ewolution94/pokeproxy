// What several places do the same way: place a pasted link (the Link tab, ⌘V on the sheet),
// place pictures (the Upload tab, a drop on a slot, a pasted picture), and print.

import { ApiError, readLink } from './api.ts';
import { isPicture, prune, saveFile } from './files.svelte.ts';
import { prefs, ui } from './prefs.svelte.ts';
import { sheet, uid, type Card } from './sheet.svelte.ts';
import { t, tn } from './i18n/index.svelte.ts';
import { toast } from '../../vendor/ewo/elements/toaster.js';

class LinkPlacer {
  state = $state<{ busy: boolean; error: string | null; placed: string | null }>({ busy: false, error: null, placed: null });

  /** Reads the link and places its card; true when one was placed. */
  async run(url: string, at: number | null = sheet.selected, quiet = false): Promise<boolean> {
    this.state = { busy: true, error: null, placed: null };
    try {
      const out = await readLink(/^https?:\/\//i.test(url) ? url : `https://${url}`);
      if ('set' in out) {
        // A whole set: its cards, in Search.
        ui.query = out.set.name;
        prefs.lang = out.set.lang;
        prefs.tab = 'search';
        this.state = { busy: false, error: null, placed: null };
        if (quiet) toast(t('link.set', { name: out.set.name }));
        return false;
      }
      sheet.place([out.card], at);
      this.state = { busy: false, error: null, placed: out.card.name };
      if (quiet) toast(t('link.placed', { name: out.card.name }), { tone: 'ok' });
      return true;
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'unreachable';
      const message = t(`link.${code}` as 'link.unreachable') ?? t('link.unreachable');
      this.state = { busy: false, error: message, placed: null };
      if (quiet) toast(message, { tone: 'bad', duration: 7000 });
      return false;
    }
  }
}

export const placeLink = new LinkPlacer();

/** Keeps the pictures on this device and places them from `at` on. */
export async function placeFiles(files: File[], at: number | null = sheet.selected): Promise<number> {
  const pictures = files.filter(isPicture);
  if (pictures.length < files.length) toast(t('upload.wrong'), { tone: 'bad' });
  if (!pictures.length) return 0;
  const cards: Card[] = [];
  for (const file of pictures) {
    const key = await saveFile(file);
    cards.push({ uid: uid(), source: 'file', name: file.name.replace(/\.[a-z0-9]+$/i, '') || 'Picture', meta: '', file: key, style: null });
  }
  sheet.place(cards, at);
  return cards.length;
}

export async function placeFilesWithNote(files: File[], at: number | null = sheet.selected) {
  const n = await placeFiles(files, at);
  if (n) toast(tn('upload.placed', n), { tone: 'ok' });
}

/** Prints, once every picture on the sheet has loaded (a slot whose picture failed prints empty). */
export async function printSheet() {
  if (!sheet.cardCount) {
    toast(t('print.empty'));
    return;
  }
  const images = [...document.querySelectorAll<HTMLImageElement>('.paper img')];
  const waiting = images.filter((img) => !img.complete);
  let dismiss: (() => void) | null = null;
  if (waiting.length) {
    dismiss = toast(t('print.preparing'), { duration: 0 });
    await Promise.race([
      Promise.all(
        waiting.map(
          (img) =>
            new Promise((resolve) => {
              img.addEventListener('load', resolve, { once: true });
              img.addEventListener('error', resolve, { once: true });
            }),
        ),
      ),
      new Promise((resolve) => setTimeout(resolve, 12_000)),
    ]);
    dismiss?.();
  }
  if (images.some((img) => img.complete && !img.naturalWidth)) toast(t('print.missing'), { tone: 'bad' });
  print();
}

/** Clears pictures no slot uses any more (after a while, so Undo still finds them). */
export function tidyFiles() {
  void prune(sheet.files());
}
