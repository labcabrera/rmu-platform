import { defineConfig } from '@playwright/test';

// Responsive smoke test of the web served by the local gateway (`make up`): run it with `make e2e` from
// rmu-platform. Credentials come from RMU_E2E_USER / RMU_E2E_PASSWORD (a user of the local realm).
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  timeout: 60_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.RMU_E2E_BASE_URI ?? 'http://localhost',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: process.env.RMU_E2E_CHROMIUM_PATH ? { executablePath: process.env.RMU_E2E_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'responsive',
      dependencies: ['setup'],
      testIgnore: /combat-flow\.spec\.ts/,
      use: { storageState: '.auth/user.json' },
    },
    // Opt-in: it changes the first tactical game (spec 005). `make e2e-combat` or RMU_E2E_COMBAT=1.
    ...(process.env.RMU_E2E_COMBAT
      ? [{ name: 'combat', dependencies: ['setup'], testMatch: /combat-flow\.spec\.ts/, use: { storageState: '.auth/user.json' } }]
      : []),
  ],
});
