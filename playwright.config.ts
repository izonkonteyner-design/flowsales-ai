import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  timeout: 120000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    extraHTTPHeaders: {
      'x-forwarded-for': `127.0.0.${Math.floor(Math.random() * 255)}`,
      ...(process.env.E2E_RATE_LIMIT_BYPASS_SECRET ? { 'x-e2e-bypass': process.env.E2E_RATE_LIMIT_BYPASS_SECRET } : {})
    }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    }
  ],
  ...(process.env.PLAYWRIGHT_BASE_URL ? {} : {
    webServer: {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    }
  }),
});
