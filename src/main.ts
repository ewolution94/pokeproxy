import './app.css';
// Folio's shared elements (vendor/ewo, from `npm run vendor -- pokeproxy` in Folio); each defines itself once.
import '../vendor/ewo/elements/sheet.js';
import '../vendor/ewo/elements/segmented.js';
import '../vendor/ewo/elements/settings-basics.js';
import '../vendor/ewo/elements/settings-button.js';
import '../vendor/ewo/elements/slider.js';
import '../vendor/ewo/elements/switch.js';
import '../vendor/ewo/elements/toaster.js';

import { mount } from 'svelte';
import App from './App.svelte';
import { loadCensus } from './lib/census.ts';
import { httpsAddress } from './lib/sharing.ts';

function start() {
  mount(App, { target: document.getElementById('app')! });
  requestAnimationFrame(() => dispatchEvent(new Event('splash:ready')));
  loadCensus();
}

// Over plain http (an address typed or kept in the browser's history) the page has no offline shell,
// no clipboard and a saved sheet of its own: off to https, this sheet in the link. The server's HSTS
// header keeps the browser on https from then on.
if (location.protocol === 'http:' && location.hostname.endsWith('.ewolution.cloud')) {
  void httpsAddress().then((url) => location.replace(url));
} else if (document.documentElement.classList.contains('splash')) {
  // Installed, the app opens on the splash screen (index.html, switched on by public/boot.js; written by
  // development/plans/splash-rollout). iOS fades its launch image into the page as soon as the page has
  // laid out, so the splash has to be on screen before the app's first render takes the main thread, or
  // the fade goes through a blank white web view. It lifts a frame after the app has mounted.
  let started = false;
  const once = () => {
    if (started) return;
    started = true;
    start();
  };
  requestAnimationFrame(() => setTimeout(once));
  setTimeout(once, 100);
} else {
  start();
}

/**
 * The offline shell (see public/sw.js). Production only: a worker in front of the dev server
 * would cache the modules Vite is trying to hot-replace.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
