import { test, expect } from '@playwright/test';
import { users, createTwoPlayerContexts, loginBothPlayers } from '../helpers/auth';
import { cleanupPairData } from '../helpers/cleanup';
import {
  createSeriesChallenge,
  completeBanPickPhase,
  playOneGame,
  waitForNextGame,
  waitForRestingUI,
  confirmNextInResting,
  getRestingTimeLeft,
  isSeriesFinished,
  waitForFinishedPage,
  verifyFinishedPageUI,
  gameSelectors,
  selectors,
  type ScreenshotFn,
} from '../helpers/series';

/**
 * Series Resting Phase E2E Tests
 *
 * Tests the resting period between games:
 * - After a non-final game ends, Resting UI appears (timer + "Next Game" button)
 * - Both players click "Next Game" → 3s countdown → transition to next phase
 * - 30s timeout → auto-transition without any clicks
 *
 * | # | P1 | P2 | Scenario |
 * |---|----|----|----------|
 * | 18 | yaroslava | ekaterina | Both confirm Next Game → fast transition (2 games) |
 * | 19 | margarita | yevgeny | Resting timeout → auto-transition (1 game + timeout) |
 */

// ===== Test 18: Both confirm Next Game quickly =====
test.describe('Test 18: yaroslava vs ekaterina (Resting: both confirm)', () => {
  test.describe.configure({ timeout: 120000 });

  const pairUsers = ['yaroslava', 'ekaterina'];
  test.beforeAll(() => cleanupPairData(pairUsers));

  test('[Test 18] Resting UI appears after game → both confirm → next game starts', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      users.yaroslava,
      users.ekaterina
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
      // Step 1: Create series and complete ban/pick
      await test.step('Create series and ban/pick', async () => {
        await loginBothPlayers(player1, player2, users.yaroslava, users.ekaterina);
        seriesId = await createSeriesChallenge(player1, player2, 'ekaterina');
        await completeBanPickPhase(player1, player2, undefined, takeScreenshot);
      });

      // Step 2: Play game 1 (P2 resigns → P1 wins)
      let game1Id = '';
      await test.step('Play game 1 (P2 resigns)', async () => {
        game1Id = await playOneGame(player1, player2, 'yaroslava', 'ekaterina', 'p2-resign');
        console.log(`[Test 18] Game 1 finished: ${game1Id}`);
        await takeScreenshot('game1-result-p1', player1);
        await takeScreenshot('game1-result-p2', player2);
      });

      // Step 3: Verify Resting UI appears
      await test.step('Resting UI appears on both players', async () => {
        // Wait for resting UI to appear on both sides
        await waitForRestingUI(player1);
        await waitForRestingUI(player2);

        await takeScreenshot('resting-ui-p1', player1);
        await takeScreenshot('resting-ui-p2', player2);

        // Verify timer is visible and counting down
        const timeLeft = await getRestingTimeLeft(player1);
        expect(timeLeft).toBeGreaterThan(0);
        expect(timeLeft).toBeLessThanOrEqual(30);
        console.log(`[Test 18] Resting timer: ${timeLeft}s`);

        // Verify "Next Game" button is visible
        await expect(player1.locator(selectors.restingConfirmBtn)).toBeVisible();
        await expect(player2.locator(selectors.restingConfirmBtn)).toBeVisible();

        // Verify "Waiting for opponent..." text
        await expect(player1.locator(selectors.restingOpponentStatus)).toBeVisible();
      });

      // Step 4: P1 clicks "Next Game"
      await test.step('P1 confirms Next Game', async () => {
        await confirmNextInResting(player1);
        await takeScreenshot('p1-confirmed-next', player1);

        // P1 should now see Cancel button instead of Next Game
        await expect(player1.locator(selectors.restingCancelBtn)).toBeVisible({ timeout: 3000 });

        // P2 should see "Opponent is Ready!"
        await expect(player2.locator(selectors.restingOpponentReady)).toBeVisible({ timeout: 5000 });
        await takeScreenshot('p2-sees-opponent-ready', player2);
      });

      // Step 5: P2 clicks "Next Game" → both confirmed → countdown
      await test.step('P2 confirms Next Game → countdown starts', async () => {
        await confirmNextInResting(player2);
        await takeScreenshot('p2-confirmed-next', player2);

        // Countdown should appear on both sides
        await expect(player1.locator(selectors.restingCountdown)).toBeVisible({ timeout: 5000 });
        await expect(player2.locator(selectors.restingCountdown)).toBeVisible({ timeout: 5000 });

        await takeScreenshot('countdown-p1', player1);
        await takeScreenshot('countdown-p2', player2);
      });

      // Step 6: Wait for transition to next game
      await test.step('Transition to next game (Selecting or RandomSelecting → game)', async () => {
        // waitForNextGame handles the redirect from resting → pick page → game
        // Since we already confirmed, it should just wait for the redirect
        await waitForNextGame(player1, player2, null, game1Id, 30000, takeScreenshot, 2);

        // Verify both are on a new game page
        const p1Url = player1.url();
        expect(p1Url).not.toContain(game1Id);
        await expect(player1.locator(gameSelectors.board)).toBeVisible({ timeout: 5000 });

        await takeScreenshot('game2-started-p1', player1);
        await takeScreenshot('game2-started-p2', player2);
        console.log(`[Test 18] Game 2 started successfully`);
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ===== Test 19: Resting timeout (no confirm) =====
test.describe('Test 19: margarita vs yevgeny (Resting: timeout auto-transition)', () => {
  // 30s resting timeout + phase transition + game start + buffer
  test.describe.configure({ timeout: 120000 });

  const pairUsers = ['margarita', 'yevgeny'];
  test.beforeAll(() => cleanupPairData(pairUsers));

  test('[Test 19] No one clicks Next Game → 30s timeout → auto-transition', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      users.margarita,
      users.yevgeny
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
      // Step 1: Create series and complete ban/pick
      await test.step('Create series and ban/pick', async () => {
        await loginBothPlayers(player1, player2, users.margarita, users.yevgeny);
        seriesId = await createSeriesChallenge(player1, player2, 'yevgeny');
        await completeBanPickPhase(player1, player2, undefined, takeScreenshot);
      });

      // Step 2: Play game 1 (P1 resigns → P2 wins)
      let game1Id = '';
      await test.step('Play game 1 (P1 resigns)', async () => {
        game1Id = await playOneGame(player1, player2, 'margarita', 'yevgeny', 'p1-resign');
        console.log(`[Test 19] Game 1 finished: ${game1Id}`);
        await takeScreenshot('game1-result-p1', player1);
      });

      // Step 3: Verify Resting UI appears
      await test.step('Resting UI appears', async () => {
        await waitForRestingUI(player1);
        await waitForRestingUI(player2);

        const timeLeft = await getRestingTimeLeft(player1);
        console.log(`[Test 19] Resting timer: ${timeLeft}s`);
        expect(timeLeft).toBeGreaterThan(0);

        await takeScreenshot('resting-ui-p1', player1);
        await takeScreenshot('resting-ui-p2', player2);
      });

      // Step 4: Wait for timeout (don't click anything) → auto-transition
      await test.step('Wait for 30s timeout → auto-transition to next game', async () => {
        console.log('[Test 19] NOT clicking Next Game - waiting for 30s timeout...');

        // Use skipResting=true so waitForNextGame doesn't click the button
        await waitForNextGame(player1, player2, null, game1Id, 50000, takeScreenshot, 2, true);

        // Verify both are on a new game page
        await expect(player1.locator(gameSelectors.board)).toBeVisible({ timeout: 5000 });
        await expect(player2.locator(gameSelectors.board)).toBeVisible({ timeout: 5000 });

        await takeScreenshot('game2-auto-started-p1', player1);
        await takeScreenshot('game2-auto-started-p2', player2);
        console.log(`[Test 19] Game 2 started via timeout auto-transition`);
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});
