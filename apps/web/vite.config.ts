import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
// Vitest 4 no longer augments Vite's own defineConfig, so the test-aware one is
// imported from vitest/config.
import { defineConfig } from 'vitest/config';

// The Dev Container forwards these ports, so the server must not bind to
// loopback only.
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'owned-artboard-references',
      apply: 'serve',
      configureServer(server) {
        // Fixed, dev-only files: never expose a repository directory or accept a path.
        const files = new Map(
          [
            'Components.dc.html',
            'Search.dc.html',
            'Filters.dc.html',
            'States.dc.html',
            'Main.dc.html',
            'PlaceEN.dc.html',
            'DesktopPlace.dc.html',
            'Property.dc.html',
            'DesktopProperty.dc.html',
            'Listing.dc.html',
            'Ask.dc.html',
            'DesktopAsk.dc.html',
            'map-neighborhood.svg',
            'tokens.css',
            'components.css',
          ].map((name) => [
            `/test-fixtures/artboards/${name}`,
            {
              file: new URL(`../../docs/design/canvas/project/${name}`, import.meta.url),
              html: name.endsWith('.html'),
            },
          ]),
        );
        server.middlewares.use(async (request, response, next) => {
          const entry = files.get(request.url?.split('?')[0] ?? '');
          if (!entry) return next();
          try {
            let content = await readFile(entry.file, 'utf8');
            if (entry.html) {
              // These artboards already contain their static rendered markup. The
              // canvas editor's absent support.js is not needed for browser evidence.
              content = content
                .replace('<script src="./support.js"></script>', '')
                .replace(
                  /<link href="https:\/\/fonts\.googleapis\.com\/[^"\n]+" rel="stylesheet">/,
                  '<link rel="stylesheet" href="./fonts.css">',
                );
            }
            response.setHeader(
              'Content-Type',
              entry.html
                ? 'text/html'
                : entry.file.pathname.endsWith('.svg')
                  ? 'image/svg+xml'
                  : 'text/css',
            );
            response.end(content);
          } catch (error) {
            next(error);
          }
        });
      },
    },
  ],
  // Linked workspace contracts emit CommonJS. Include them explicitly so the
  // dev-only component entry receives the same interop as production builds.
  optimizeDeps: { include: ['@rei/contracts'] },
  server: {
    host: '0.0.0.0',
    port: 3200,
    strictPort: true,
    proxy: { '/api/v1': { target: 'http://127.0.0.1:8200' } },
  },
  preview: {
    host: '0.0.0.0',
    port: 3200,
    strictPort: true,
  },
  test: {
    environment: 'node',
  },
});
