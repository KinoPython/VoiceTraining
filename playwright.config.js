import { defineConfig, devices } from '@playwright/test';

// ブラウザは /opt/pw-browsers から自動で見つかる。見つからない環境でだけ PW_CHROMIUM で場所を渡す
const executable = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
// 本物のマイクの代わりに、音声ファイルをマイクの入力として流す（ファイルは e2e/fixtures に置く）
const launchOptions = {
  ...executable,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--use-file-for-fake-audio-capture=e2e/fixtures/a3.wav',
  ],
};

export default defineConfig({
  testDir: 'e2e',
  timeout: 60000,
  workers: 2,
  use: { baseURL: 'http://localhost:4173', launchOptions },
  webServer: {
    command: 'npm run build && npm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
});
