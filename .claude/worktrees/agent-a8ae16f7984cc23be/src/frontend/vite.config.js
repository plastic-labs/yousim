import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: path.resolve(__dirname, '../api/public'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy API requests to the Bun backend
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/manual': 'http://localhost:3000',
      '/auto': 'http://localhost:3000',
      '/constructor': 'http://localhost:3000',
      '/chat': 'http://localhost:3000',
      '/identity': 'http://localhost:3000',
      '/reset': 'http://localhost:3000',
      '/session': 'http://localhost:3000',
      '/sessions': 'http://localhost:3000',
      '/export': 'http://localhost:3000',
    },
  },
});
