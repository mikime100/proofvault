import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Integration tests: need DATABASE_URL pointing at a real Postgres (docker compose or CI).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: { include: ['test/**/*.int.test.ts'], fileParallelism: false },
});
