import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  fullyParallel: true, // 각 테스트가 독립적인 계정 쌍 사용 → 병렬 실행 가능
  forbidOnly: !!process.env.CI,
  retries: 0, // No retries - fail fast
  workers: 5, // 5 test pairs = 5 parallel workers
  reporter: 'html',

  // Global setup: 테스트 전 한 번만 로그인
  globalSetup: require.resolve('./global-setup'),
  // Global teardown: 테스트 후 DB 정리
  globalTeardown: require.resolve('./global-teardown'),

  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 }, // Full HD for complete UI visibility
      },
    },
  ],
});
