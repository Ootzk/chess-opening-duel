import { test, expect } from '@playwright/test';
import { users } from '../helpers/auth';
import { cleanupPairData } from '../helpers/cleanup';
import {
  selectOpenings,
  confirm,
  waitForPhase,
  waitForSnabbdomReady,
  waitForGamePage,
  getGameIdFromUrl,
  getGameState,
  makeAnyMove,
  clickSeriesForfeitButton,
  confirmSeriesForfeit,
  isSeriesFinished,
  getSeriesData,
  abortExistingGames,
  gameSelectors,
  type ScreenshotFn,
} from '../helpers/series';

/**
 * AI Opening Duel E2E Test
 *
 * Tests the "Opening Duel with Computer" (Stockfish) feature:
 * - Creates an AI series from the lobby modal
 * - Completes pick/ban phases (AI auto-confirms instantly)
 * - Verifies Stockfish makes a move via fishnet
 * - Forfeits the series and verifies finished state
 *
 * Requires: fishnet services running (lila_fishnet + fishnet_play)
 *
 * | User | Scenario |
 * |------|----------|
 * | mateo | Solo vs Stockfish level 1, verify AI move, then forfeit |
 */

test.describe('AI Opening Duel: mateo vs Stockfish', () => {
  test.describe.configure({ timeout: 180000 });

  const testUsers = ['mateo'];
  test.beforeAll(() => cleanupPairData(testUsers));

  test('Stockfish makes a move, then series forfeit', async ({ browser }) => {
    const context = await browser.newContext({ storageState: users.mateo.storageState });
    const page = await context.newPage();

    let screenshotCounter = 0;
    const takeScreenshot: ScreenshotFn = async (name, p) => {
      screenshotCounter++;
      const label = `${String(screenshotCounter).padStart(2, '0')}-${name}`;
      await test.info().attach(label, {
        body: await p.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    };

    try {
      let seriesId = '';

      // Step 1: Navigate to lobby and clean up existing games
      await test.step('Navigate to lobby', async () => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await abortExistingGames(page);
        await page.goto('/');
        await page.waitForLoadState('networkidle');
      });

      // Step 2: Open AI Opening Duel modal and submit
      await test.step('Create AI series from lobby', async () => {
        // Click "Opening Duel with Computer" button
        const aiBtn = page.locator('.lobby__start button:has-text("Opening Duel with Computer")');
        await expect(aiBtn).toBeVisible({ timeout: 5000 });
        await aiBtn.click();

        // Wait for modal
        const gameSetup = page.locator('.game-setup');
        await expect(gameSetup).toBeVisible({ timeout: 5000 });
        await takeScreenshot('ai-modal', page);

        // Submit with default settings (5+3, level 1)
        const submitBtn = page.locator('.game-setup button.lobby__start__button');
        await expect(submitBtn).toBeVisible({ timeout: 3000 });
        await submitBtn.click();

        // Wait for redirect to series pick page
        await page.waitForURL(/\/series\/\w+\/pick/, { timeout: 15000 });
        const match = page.url().match(/\/series\/(\w+)/);
        seriesId = match?.[1] || '';
        expect(seriesId).toBeTruthy();
        console.log(`[AI Test] Series created: ${seriesId}`);
        await takeScreenshot('pick-page', page);
      });

      // Step 3: Pick phase (AI picks already confirmed on creation)
      await test.step('Complete pick phase', async () => {
        await waitForPhase(page, 'Pick Phase');
        await selectOpenings(page, 5);
        await takeScreenshot('picks-selected', page);
        await confirm(page);
      });

      // Step 4: Ban phase (AI auto-bans on phase transition)
      await test.step('Complete ban phase', async () => {
        await waitForPhase(page, 'Ban Phase', 15000);
        await waitForSnabbdomReady(page);
        await selectOpenings(page, 2);
        await takeScreenshot('bans-selected', page);
        await confirm(page);
      });

      // Step 5: Wait for game to start (RandomSelecting → game page)
      await test.step('Wait for game to start', async () => {
        await waitForGamePage(page, 45000);
        await expect(page.locator(gameSelectors.board)).toBeVisible({ timeout: 5000 });
        await takeScreenshot('game-started', page);
      });

      // Step 6: Verify Stockfish makes a move via fishnet
      // fishnet can take 10-30s to respond (Redis → lila_fishnet → fishnet_play → Stockfish → back)
      await test.step('Verify Stockfish makes a move', async () => {
        const gameId = getGameIdFromUrl(page.url());
        expect(gameId).toBeTruthy();

        // Determine our color from board orientation
        const cgWrap = page.locator('.cg-wrap');
        const weAreWhite = await cgWrap.evaluate(el => el.classList.contains('orientation-white'));
        console.log(`[AI Test] We are ${weAreWhite ? 'white' : 'black'}, gameId=${gameId}`);

        if (weAreWhite) {
          // We're white → make our move first, then wait for AI response
          await makeAnyMove(page);
          await takeScreenshot('human-moved', page);

          let aiResponded = false;
          for (let i = 0; i < 60; i++) {
            const state = await getGameState(page, gameId!);
            const moveCount = state.moves ? state.moves.trim().split(' ').length : 0;
            if (moveCount >= 2) {
              aiResponded = true;
              console.log(`[AI Test] Stockfish responded after ${i + 1} poll(s): ${state.moves}`);
              break;
            }
            await page.waitForTimeout(1000);
          }
          expect(aiResponded).toBe(true);
        } else {
          // We're black → AI (white) moves first, wait for it via fishnet
          let aiMovedFirst = false;
          for (let i = 0; i < 60; i++) {
            const state = await getGameState(page, gameId!);
            const moveCount = state.moves ? state.moves.trim().split(' ').length : 0;
            if (moveCount >= 1) {
              aiMovedFirst = true;
              console.log(`[AI Test] Stockfish moved first after ${i + 1} poll(s): ${state.moves}`);
              break;
            }
            await page.waitForTimeout(1000);
          }
          expect(aiMovedFirst).toBe(true);

          // Now make our move (so forfeit can work on an active game)
          await makeAnyMove(page);
          await takeScreenshot('human-moved', page);
        }
        await takeScreenshot('ai-verified', page);
      });

      // Step 7: Forfeit the series
      await test.step('Forfeit series', async () => {
        await clickSeriesForfeitButton(page);
        await takeScreenshot('forfeit-confirm', page);
        await confirmSeriesForfeit(page);
        await page.waitForTimeout(2000);
        await takeScreenshot('after-forfeit', page);
      });

      // Step 8: Verify series finished with AI as winner
      await test.step('Verify series finished', async () => {
        const finished = await isSeriesFinished(page, seriesId);
        expect(finished).toBe(true);

        const data = await getSeriesData(page, seriesId);
        expect(data).not.toBeNull();
        expect(data!.status).toBe(30); // Finished
        expect(data!.forfeitBy).toBe(0); // Human (index 0) forfeited
        expect(data!.winner).toBe(1); // AI (index 1) wins

        console.log(
          `[AI Test] Series ${seriesId} finished. Winner: ${data!.winner}, ForfeitBy: ${data!.forfeitBy}, Scores: ${data!.scores}`,
        );
        await takeScreenshot('series-verified', page);
      });
    } finally {
      await context.close();
    }
  });
});
