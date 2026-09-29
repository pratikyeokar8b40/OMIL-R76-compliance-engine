import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  // Dev proxy: only used in `vite dev` mode, not in production builds.
  // In production, VITE_API_URL env var is set to the Railway backend URL.
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL
          ? process.env.VITE_API_URL.replace('/api/v1', '')
          : 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});

