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
 * Series Pool Exhaustion E2E Tests
 *
 * Tests the scenario where all openings are exhausted via consecutive draws,
 * forcing the series to end as a draw (score tied, no winner).
 *
 * Each player has 3 remaining picks after ban/pick (5 picked - 2 banned = 3).
 * Total pool = 6 openings. After 6 consecutive draws, all openings are used
 * and the pool is empty. The series finishes with a tied score (3-3).
 *
 * | # | P1 | P2 | Scenario |
 * |---|----|----|----------|
 * | 17 | dmitry | milena | 6 draws → pool exhaustion → series Draw |
 */

// ===== Test 17: Pool Exhaustion → Series Draw =====
test.describe('Test 17: dmitry vs milena (Pool exhaustion → series Draw)', () => {
  // 6 games (draws) + ban/pick phase + buffer
  test.describe.configure({ timeout: 180000 });

  const pairUsers = ['dmitry', 'milena'];
  test.beforeAll(() => cleanupPairData(pairUsers));

  test('[Test 17] 6 consecutive draws → pool exhaustion → Draw banner', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      users.dmitry,
      users.milena
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
        await loginBothPlayers(player1, player2, users.dmitry, users.milena);
        seriesId = await createSeriesChallenge(player1, player2, 'milena');
        await takeScreenshot('series-created', player1);
        console.log(`[Test 17] Series created: ${seriesId}`);
      });

      // ===== STEP 2: Complete Ban/Pick Phase =====
      await test.step('Complete ban/pick phase', async () => {
        await completeBanPickPhase(player1, player2, undefined, takeScreenshot);
      });

      // ===== STEP 3: Execute 6 consecutive draws =====
      await test.step('Execute series: 1/2 - 1/2 - 1/2 - 1/2 - 1/2 - 1/2', async () => {
        await executeSeriesResult(
          player1, player2,
          'dmitry', 'milena',
          '1/2 - 1/2 - 1/2 - 1/2 - 1/2 - 1/2',
          seriesId,
          takeScreenshot
        );
      });

      // ===== STEP 4: Verify Finished Page Redirect =====
      await test.step('Verify auto-redirect to finished page', async () => {
        await waitForFinishedPage(player1, seriesId);
        await waitForFinishedPage(player2, seriesId);

        expect(player1.url()).toContain(`/series/${seriesId}/finished`);
        expect(player2.url()).toContain(`/series/${seriesId}/finished`);

        await takeScreenshot('finished-redirect-p1', player1);
        await takeScreenshot('finished-redirect-p2', player2);
      });

      // ===== STEP 5: Verify Draw Banner =====
      await test.step('Verify Draw banner on finished page', async () => {
        // Both players should see "Draw" (not Victory/Defeat)
        const p1UI = await verifyFinishedPageUI(player1, 6);
        expect(p1UI.banner).toBe('Draw');
        expect(p1UI.gameRows).toBeGreaterThanOrEqual(6);

        const p2UI = await verifyFinishedPageUI(player2, 6);
        expect(p2UI.banner).toBe('Draw');
        expect(p2UI.gameRows).toBeGreaterThanOrEqual(6);

        // Verify .draw CSS class is applied (yellow styling)
        await expect(player1.locator(finishedSelectors.drawBanner)).toBeVisible();
        await expect(player2.locator(finishedSelectors.drawBanner)).toBeVisible();

        // Victory/Defeat banners should NOT be visible
        await expect(player1.locator(finishedSelectors.victoryBanner)).not.toBeVisible();
        await expect(player1.locator(finishedSelectors.defeatBanner)).not.toBeVisible();

        await takeScreenshot('finished-draw-p1', player1);
        await takeScreenshot('finished-draw-p2', player2);

        console.log(`[Test 17] Both players see Draw banner. Series ${seriesId} ended as draw.`);
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});
