import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import { users, createTwoPlayerContexts, loginBothPlayers } from '../helpers/auth';
import {
  createSeriesChallenge,
  completeBanPickPhase,
  executeSeriesResult,
  isSeriesFinished,
  waitForFinishedPage,
  verifyFinishedPageUI,
  clickRematchButton,
  isRematchOfferSent,
  isRematchGlowing,
  waitForRematchRedirect,
  finishedSelectors,
  selectors,
  type ScreenshotFn,
} from '../helpers/series';

/**
 * Series Finished Page & Rematch E2E Tests
 *
 * Tests the finished page UI and rematch flow:
 * - Auto-redirect from game to finished page
 * - Victory/Defeat banner, score table, player scores
 * - Rematch offer → opponent sees glowing button → accept → new series
 * - Home button navigation
 *
 * | # | P1 | P2 | Scenario |
 * |---|----|----|----------|
 * | 11 | patricia | adriana | 3-0 sweep → finished page + rematch flow |
 */

function cleanupPairData(usernames: string[]) {
  try {
    const mongoCommand = `
      db.game5.deleteMany({ "players.user.id": { $in: ${JSON.stringify(usernames)} } });
      db.series.deleteMany({ "players.userId": { $in: ${JSON.stringify(usernames)} } });
      db.challenge.deleteMany({ $or: [
        { "challenger.user.id": { $in: ${JSON.stringify(usernames)} } },
        { "destUser.id": { $in: ${JSON.stringify(usernames)} } }
      ]});
    `.replace(/\n/g, ' ');
    execSync(
      `docker exec chess-opening-duel-mongodb-1 mongosh lichess --quiet --eval '${mongoCommand}'`,
      { encoding: 'utf-8', timeout: 10000 }
    );
  } catch {
    // Ignore cleanup errors
  }
}

// ===== Test 11: Finished Page + Rematch =====
test.describe('Test 11: patricia vs adriana (Finished page + Rematch)', () => {
  // 3-game sweep (fast) + rematch flow
  test.describe.configure({ timeout: 120000 });

  const pairUsers = ['patricia', 'adriana'];
  test.beforeAll(() => cleanupPairData(pairUsers));

  test('[Test 11] Finished page UI + rematch offer/accept', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      users.patricia,
      users.adriana
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
        await loginBothPlayers(player1, player2, users.patricia, users.adriana);
        seriesId = await createSeriesChallenge(player1, player2, 'adriana');
        await takeScreenshot('series-created', player1);
        console.log(`[Test 11] Series created: ${seriesId}`);
        console.log(`[Test 11] P1 URL: ${player1.url()}`);
        console.log(`[Test 11] P2 URL: ${player2.url()}`);
      });

      // ===== STEP 2: Complete Ban/Pick Phase =====
      await test.step('Complete ban/pick phase', async () => {
        await completeBanPickPhase(player1, player2, undefined, takeScreenshot);
      });

      // ===== STEP 3: Execute 3-0 sweep =====
      await test.step('Execute series: 1 - 1 - 1 (P1 sweep)', async () => {
        await executeSeriesResult(
          player1, player2,
          'patricia', 'adriana',
          '1 - 1 - 1',
          seriesId,
          takeScreenshot
        );
      });

      // ===== STEP 4: Verify Finished Page Redirect =====
      await test.step('Verify auto-redirect to finished page', async () => {
        // Both players should be redirected to /series/{id}/finished
        await waitForFinishedPage(player1, seriesId);
        await waitForFinishedPage(player2, seriesId);

        await takeScreenshot('finished-redirect-p1', player1);
        await takeScreenshot('finished-redirect-p2', player2);

        // Verify URL
        expect(player1.url()).toContain(`/series/${seriesId}/finished`);
        expect(player2.url()).toContain(`/series/${seriesId}/finished`);
      });

      // ===== STEP 5: Verify Finished Page UI =====
      await test.step('Verify finished page UI elements', async () => {
        // P1 won (3-0 sweep) → should see Victory!
        const p1UI = await verifyFinishedPageUI(player1, 3);
        expect(p1UI.banner).toBe('Victory!');
        expect(p1UI.gameRows).toBeGreaterThanOrEqual(3);
        expect(p1UI.scores.length).toBe(2); // Two player scores

        // P2 lost → should see Defeat
        const p2UI = await verifyFinishedPageUI(player2, 3);
        expect(p2UI.banner).toBe('Defeat');
        expect(p2UI.gameRows).toBeGreaterThanOrEqual(3);

        // Score table label
        await expect(player1.locator(finishedSelectors.scoreLabel)).toContainText('Opening Duel');

        await takeScreenshot('finished-ui-p1', player1);
        await takeScreenshot('finished-ui-p2', player2);
      });

      // ===== STEP 6: Rematch Offer =====
      await test.step('P1 offers rematch', async () => {
        // Verify rematch button is enabled
        const rematchBtn = player1.locator(`${finishedSelectors.rematchBtn}:not([disabled])`);
        await expect(rematchBtn).toBeVisible({ timeout: 5000 });

        // P1 clicks Rematch
        await clickRematchButton(player1);

        // P1 should see "Rematch Offer Sent" (disabled spinner)
        const offerSent = await isRematchOfferSent(player1);
        expect(offerSent).toBe(true);

        await takeScreenshot('rematch-offer-sent-p1', player1);
      });

      // ===== STEP 7: Opponent Sees Glowing Rematch =====
      await test.step('P2 sees glowing rematch button', async () => {
        // P2 should see glowing "Accept Rematch" button
        const glowing = await isRematchGlowing(player2);
        expect(glowing).toBe(true);

        await takeScreenshot('rematch-glowing-p2', player2);
      });

      // ===== STEP 8: Accept Rematch → New Series =====
      await test.step('P2 accepts rematch → redirect to new series', async () => {
        // P2 clicks the glowing Accept Rematch button
        await clickRematchButton(player2);

        // Both should be redirected to a new series pick page
        const newSeriesIdP1 = await waitForRematchRedirect(player1, 15000);
        const newSeriesIdP2 = await waitForRematchRedirect(player2, 15000);

        // New series should be the same for both
        expect(newSeriesIdP1).toBeTruthy();
        expect(newSeriesIdP1).toBe(newSeriesIdP2);

        // New series should be different from old one
        expect(newSeriesIdP1).not.toBe(seriesId);

        // Both should be on the pick page
        await expect(player1.locator(selectors.seriesPick).first()).toBeVisible({ timeout: 10000 });
        await expect(player2.locator(selectors.seriesPick).first()).toBeVisible({ timeout: 10000 });

        await takeScreenshot('rematch-new-series-p1', player1);
        await takeScreenshot('rematch-new-series-p2', player2);

        console.log(`[Test 11] Rematch: old series=${seriesId}, new series=${newSeriesIdP1}`);
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});
