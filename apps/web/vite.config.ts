import react from '@vitejs/plugin-react';
// Vitest 4 no longer augments Vite's own defineConfig, so the test-aware one is
// imported from vitest/config.
import { defineConfig } from 'vitest/config';

// The Dev Container forwards these ports, so the server must not bind to
// loopback only.
export default defineConfig({
  plugins: [react()],
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
