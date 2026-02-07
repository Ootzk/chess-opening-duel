import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  fullyParallel: false, // 두 플레이어 동시 제어 필요
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // 순차 실행
  reporter: 'html',

  // Global setup: 테스트 전 한 번만 로그인
  globalSetup: require.resolve('./global-setup'),
  // Global teardown: 테스트 후 DB 정리
  globalTeardown: require.resolve('./global-teardown'),

  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
