import { test, expect } from '@playwright/test';
import { users } from '../helpers/auth';

const user = users.elena;

test.describe('Opening Pool Page', () => {
  test('[Test 20] Opening Pool 페이지 접근 및 렌더링 확인', async ({ browser }) => {
    const context = await browser.newContext({ storageState: user.storageState });
    const page = await context.newPage();

    try {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await test.step('Dasher 드롭다운에 Opening Pool 링크 확인', async () => {
        await page.locator('#user_tag').click();
        await page.waitForSelector('#dasher_app .links');
        const openingPoolLink = page.locator('#dasher_app .links a[href="/opening-pool"]');
        await expect(openingPoolLink).toBeVisible();
        await expect(openingPoolLink).toHaveText('Opening Pool');

        await test.info().attach('dasher-dropdown', {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });

      await test.step('/opening-pool 페이지 로드 및 제목 확인', async () => {
        await page.goto('/opening-pool');
        await page.waitForLoadState('networkidle');

        const heading = page.locator('.box__top h1');
        await expect(heading).toHaveText('Manage your opening pools');

        await test.info().attach('opening-pool-page', {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });
    } finally {
      await context.close();
    }
  });

  test('[Test 20] 비로그인 상태에서 /opening-pool 접근 시 리다이렉트', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto('/opening-pool');
      await page.waitForLoadState('networkidle');

      expect(page.url()).toMatch(/\/(login|signup)/);
    } finally {
      await context.close();
    }
  });
});
