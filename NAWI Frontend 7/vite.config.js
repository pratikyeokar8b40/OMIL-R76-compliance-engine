import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Backend the dev server proxies /api to. 127.0.0.1 (not "localhost") avoids
// the IPv4/IPv6 lookup lottery on Windows (memory.md D-35). If port 8000 is
// taken by something else, start the backend elsewhere and set e.g.
//   NAWI_API_TARGET=http://127.0.0.1:8010 npm run dev
const apiTarget = process.env.NAWI_API_TARGET || 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
  preview: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
});
