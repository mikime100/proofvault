import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  optimizeDeps: {
    include: [
      '@bryntum/scheduler-react-enterprise',
      '@bryntum/scheduler-enterprise',
      '@bryntum/core-enterprise',
      '@bryntum/grid-enterprise',
    ],
  },
});
