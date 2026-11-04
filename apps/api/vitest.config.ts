import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// swc keeps Nest's decorator metadata, which plain esbuild drops.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['test/**/*.int.test.ts'],
  },
});
