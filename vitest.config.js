import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    setupFiles: ['fake-indexeddb/auto'],
    // メモリを手放したかを確かめるテスト（段6の曲の追加）で gc() を使うため
    poolOptions: { forks: { execArgv: ['--expose-gc'] } },
  },
});
