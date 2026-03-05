import { test, expect } from '@playwright/test';
import { users, createTwoPlayerContexts, loginBothPlayers } from '../helpers/auth';
import { cleanupPairData } from '../helpers/cleanup';
import {
  createSeriesChallenge,
  completeBanPickPhase,
  executeSeriesResult,
  waitForFinishedPage,
  verifyFinishedPageUI,
  finishedSelectors,
  type ScreenshotFn,
} from '../helpers/series';

/**
 * Mobile Viewport - Finished Page Scroll E2E Test
 *
 * Verifies that the score table on the finished page is horizontally
 * scrollable on mobile viewports (375x667).
 *
 * Strategy: Play the series on desktop viewport (board clicks need space),
 * then switch to mobile viewport on the finished page to verify scrollability.
 *
 * | # | P1 | P2 | Scenario |
 * |---|----|----|----------|
 * | 29 | gabriela | guang | 3-0 sweep → mobile finished page table scroll |
 */

const MOBILE_VIEWPORT = { width: 320, height: 568 };

// ===== Test 29: Finished Page Mobile Scroll =====
test.describe('Test 29: gabriela vs guang (Finished page mobile scroll)', () => {
  test.describe.configure({ timeout: 120000 });

  const pairUsers = ['gabriela', 'guang'];
  test.beforeAll(() => cleanupPairData(pairUsers));

  test('[Test 29] Score table is scrollable on mobile viewport', async ({ browser }) => {
    // Play series on desktop viewport (board clicks require adequate size)
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      users.gabriela,
      users.guang
    );

    let screenshotCounter = 0;
    const takeScreenshot: ScreenshotFn = async (name, page) => {
      screenshotCounter++;
      const label = `${String(screenshotCounter).padStart(2, '0')}-${name}`;
      await test.info().attach(label, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    };

    let seriesId = '';

    try {
      // ===== STEP 1: Create Series =====
      await test.step('Create series', async () => {
        await loginBothPlayers(player1, player2, users.gabriela, users.guang);
        seriesId = await createSeriesChallenge(player1, player2, 'guang');
        console.log(`[Test 29] Series created: ${seriesId}`);
      });

      // ===== STEP 2: Complete Ban/Pick Phase =====
      await test.step('Complete ban/pick phase', async () => {
        await completeBanPickPhase(player1, player2, undefined, takeScreenshot);
      });

      // ===== STEP 3: Execute 3-0 sweep =====
      await test.step('Execute series: 1 - 1 - 1 (P1 sweep)', async () => {
        await executeSeriesResult(
          player1, player2,
          'gabriela', 'guang',
          '1 - 1 - 1',
          seriesId,
          takeScreenshot
        );
      });

      // ===== STEP 4: Verify Finished Page on Desktop =====
      await test.step('Verify finished page redirect', async () => {
        await waitForFinishedPage(player1, seriesId);
        await verifyFinishedPageUI(player1, 3);
      });

      // ===== STEP 5: Switch to Mobile & Verify Scrollability =====
      await test.step('Verify score table is horizontally scrollable on mobile', async () => {
        // Switch to mobile viewport
        await player1.setViewportSize(MOBILE_VIEWPORT);
        await player1.waitForTimeout(500);

        await takeScreenshot('finished-mobile-before-scroll', player1);

        const scoreTable = player1.locator(finishedSelectors.scoreTable);
        await expect(scoreTable).toBeVisible();

        // Check that the table container allows horizontal scrolling
        const scrollInfo = await scoreTable.evaluate(el => ({
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          overflowX: getComputedStyle(el).overflowX,
        }));

        console.log(`[Test 29] Score table scroll info:`, scrollInfo);

        // overflow-x should be 'auto' (CSS fix enables scrolling when content overflows)
        expect(scrollInfo.overflowX).toBe('auto');

        await takeScreenshot('finished-mobile-scroll-check', player1);
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});
