import { defineConfig } from '@playwright/test';

// E2e tests run against a DEPLOYED url: BASE_URL=https://... npm run test:e2e
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
  },
});
