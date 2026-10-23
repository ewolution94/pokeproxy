import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
// @ts-expect-error: plain .mjs modules shared with the production server
import { createApi } from './server/api.mjs';
// @ts-expect-error: as above
import { createCatalog } from './server/catalog.mjs';
// @ts-expect-error: as above
import { createCensus } from './server/census.mjs';
// @ts-expect-error: as above
import { createLocalized } from './server/localized.mjs';

// The dev server answers /api and Census's /_e with the same code as production; the catalogue
// comes from the live TCGSL unless POKEPROXY_TCGSL names another.
function appRoutes(): Plugin {
  const catalog = createCatalog({
    origin: process.env.POKEPROXY_TCGSL ?? 'https://tcgsl.ewolution.cloud',
    images: process.env.POKEPROXY_TCGSL_IMAGES ?? 'https://tcgsl.ewolution.cloud',
  });
  const api = createApi({ catalog, localized: createLocalized({ catalog }) });
  const census = createCensus({ site: 'pokeproxy' });
  let started = false;
  const middleware = async (req: any, res: any, next: (error?: unknown) => void) => {
    if (!started) {
      started = true;
      catalog.start();
    }
    try {
      if (await census(req, res)) return;
      if (await api(req, res)) return;
      next();
    } catch (error) {
      next(error);
    }
  };
  return {
    name: 'pokeproxy-routes',
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}

export default defineConfig({
  plugins: [svelte(), appRoutes()],
  // 7100 is the NAS port; locally the app runs beside it.
  server: { port: 7110, strictPort: true },
  preview: { port: 7111, strictPort: true },
  build: {
    target: 'es2022',
    cssTarget: ['chrome123', 'safari17.5', 'firefox120'],
    // The CSP allows fonts from 'self' only, not data: (learnings/toolchain.md).
    assetsInlineLimit: 0,
  },
});
