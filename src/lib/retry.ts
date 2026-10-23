// A picture that fails once is asked for once more a second later: TCGdex's image server and other
// hosts sometimes fail a first request they answer the next time, and a broken slot prints empty.
export function retry(img: HTMLImageElement) {
  let tried = '';
  const again = () => {
    const src = img.getAttribute('src') ?? '';
    if (!src || src.startsWith('blob:') || tried === src) return;
    tried = src;
    setTimeout(() => {
      if (img.getAttribute('src') !== src) return;
      img.src = `${src}${src.includes('?') ? '&' : '?'}again=1`;
      tried = img.getAttribute('src') ?? '';
    }, 1000);
  };
  img.addEventListener('error', again);
  return { destroy: () => img.removeEventListener('error', again) };
}
