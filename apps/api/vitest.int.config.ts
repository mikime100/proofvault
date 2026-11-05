import { existsSync } from 'node:fs';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Integration tests: need DATABASE_URL pointing at a real Postgres.
// Locally it comes from apps/api/.env; in CI from the workflow's env (which wins).
if (!process.env.DATABASE_URL && existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: { include: ['test/**/*.int.test.ts'], fileParallelism: false },
});
