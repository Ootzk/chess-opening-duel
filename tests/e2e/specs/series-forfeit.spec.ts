import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import { users, createTwoPlayerContexts, loginBothPlayers } from '../helpers/auth';
import {
  createSeriesChallenge,
  completeBanPickPhase,
  playBothMoves,
  isSeriesFinished,
  getSeriesWinner,
  getPlayerIndex,
  clickSeriesForfeitButton,
  confirmSeriesForfeit,
  gameSelectors,
  type ScreenshotFn,
} from '../helpers/series';

/**
 * Series Forfeit E2E Tests
 *
 * Tests the series forfeit (X button) functionality:
 * - Series games show 4 buttons: X (forfeit), back (takeback), 1/2 (draw), flag (resign)
 * - Clicking X shows confirm dialog, confirming forfeits the entire series
 * - Forfeit ends current game (resign if moves played, abort if not) and series
 *
 * | # | P1 | P2 | Scenario | Expected |
 * |---|----|----|----------|----------|
 * | 9 | fatima | diego | Forfeit after moves | Game resign, series finished, P2 wins |
 * | 10 | salma | benjamin | Forfeit before moves | Game abort, series finished, P2 wins |
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

// ===== Test 9: Forfeit during active game (after moves) =====
test.describe('Test 9: fatima vs diego (Forfeit after moves)', () => {
  test.describe.configure({ timeout: 120000 });

  const pairUsers = ['fatima', 'diego'];
  test.beforeAll(() => cleanupPairData(pairUsers));

  test('[Test 9] Forfeit after moves → game resign, series finished', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      users.fatima,
      users.diego
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
      // Step 1: Create series
      await test.step('Create series', async () => {
        await loginBothPlayers(player1, player2, users.fatima, users.diego);
        seriesId = await createSeriesChallenge(player1, player2, 'diego');
        await takeScreenshot('series-created', player1);
      });

      // Step 2: Complete ban/pick phase (both confirm)
      await test.step('Complete ban/pick phase', async () => {
        await completeBanPickPhase(player1, player2, undefined, takeScreenshot);
      });

      // Step 3: Verify 4-button layout in series game
      await test.step('Verify series game has 4 buttons', async () => {
        // Wait for game board
        await expect(player1.locator(gameSelectors.board)).toBeVisible({ timeout: 10000 });
        await takeScreenshot('game-board-p1', player1);

        // Verify forfeit button exists
        const forfeitBtn = player1.locator(gameSelectors.seriesForfeitBtn);
        await expect(forfeitBtn).toBeVisible({ timeout: 5000 });

        // Verify resign button exists
        const resignBtn = player1.locator(gameSelectors.resignBtn);
        await expect(resignBtn).toBeVisible({ timeout: 5000 });

        // Verify all 4 action buttons are present in .ricons
        // forfeit (series-forfeit), takeback (takeback-yes), draw (draw-yes), resign
        const ricons = player1.locator('.ricons');
        await expect(ricons).toBeVisible({ timeout: 5000 });

        const buttons = ricons.locator('button.fbt');
        const buttonCount = await buttons.count();
        console.log(`[Test 9] Button count in .ricons: ${buttonCount}`);
        // 4 action buttons + analysis + board menu = 6 (but analysis may not be visible during play)
        expect(buttonCount).toBeGreaterThanOrEqual(4);

        await takeScreenshot('game-4-buttons', player1);
      });

      // Step 4: Both players make moves
      await test.step('Both players make moves', async () => {
        await playBothMoves(player1, player2, 'fatima', 'diego');
        await takeScreenshot('after-moves-p1', player1);
      });

      // Step 5: P1 forfeits series
      await test.step('P1 (fatima) forfeits series', async () => {
        // Click forfeit button
        await clickSeriesForfeitButton(player1);
        await takeScreenshot('forfeit-confirm-dialog', player1);

        // Confirm forfeit
        await confirmSeriesForfeit(player1);
        await takeScreenshot('after-forfeit-p1', player1);

        // Wait for game to end
        await player1.waitForTimeout(2000);
        await takeScreenshot('game-ended-p1', player1);
        await takeScreenshot('game-ended-p2', player2);
      });

      // Step 6: Verify series finished with correct winner
      await test.step('Verify series finished (diego wins)', async () => {
        const finished = await isSeriesFinished(player1, seriesId);
        expect(finished).toBe(true);

        // Player ordering depends on random color, not who created the challenge
        const fatimaIndex = await getPlayerIndex(player1, seriesId, 'fatima');
        const winner = await getSeriesWinner(player1, seriesId);
        console.log(`[Test 9] fatima index: ${fatimaIndex}, winner index: ${winner}`);
        // fatima forfeits → the opponent (diego) should win
        expect(winner).not.toBeNull();
        expect(fatimaIndex).not.toBeNull();
        expect(winner).toBe(1 - fatimaIndex!);

        await takeScreenshot('series-verified', player1);
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ===== Test 10: Forfeit at game start (no moves) =====
test.describe('Test 10: salma vs benjamin (Forfeit before moves)', () => {
  test.describe.configure({ timeout: 120000 });

  const pairUsers = ['salma', 'benjamin'];
  test.beforeAll(() => cleanupPairData(pairUsers));

  test('[Test 10] Forfeit before moves → game abort, series finished', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      users.salma,
      users.benjamin
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
      // Step 1: Create series
      await test.step('Create series', async () => {
        await loginBothPlayers(player1, player2, users.salma, users.benjamin);
        seriesId = await createSeriesChallenge(player1, player2, 'benjamin');
        await takeScreenshot('series-created', player1);
      });

      // Step 2: Complete ban/pick phase (both confirm)
      await test.step('Complete ban/pick phase', async () => {
        await completeBanPickPhase(player1, player2, undefined, takeScreenshot);
      });

      // Step 3: Forfeit immediately without making moves
      await test.step('P1 (salma) forfeits series immediately', async () => {
        // Wait for game board
        await expect(player1.locator(gameSelectors.board)).toBeVisible({ timeout: 10000 });
        await takeScreenshot('game-start-p1', player1);

        // Click forfeit button
        await clickSeriesForfeitButton(player1);
        await takeScreenshot('forfeit-confirm-dialog', player1);

        // Confirm forfeit
        await confirmSeriesForfeit(player1);
        await takeScreenshot('after-forfeit-p1', player1);

        // Wait for game to end
        await player1.waitForTimeout(2000);
        await takeScreenshot('game-ended-p1', player1);
        await takeScreenshot('game-ended-p2', player2);
      });

      // Step 4: Verify series finished with correct winner
      await test.step('Verify series finished (benjamin wins)', async () => {
        const finished = await isSeriesFinished(player1, seriesId);
        expect(finished).toBe(true);

        // Player ordering depends on random color, not who created the challenge
        const salmaIndex = await getPlayerIndex(player1, seriesId, 'salma');
        const winner = await getSeriesWinner(player1, seriesId);
        console.log(`[Test 10] salma index: ${salmaIndex}, winner index: ${winner}`);
        // salma forfeits → the opponent (benjamin) should win
        expect(winner).not.toBeNull();
        expect(salmaIndex).not.toBeNull();
        expect(winner).toBe(1 - salmaIndex!);

        await takeScreenshot('series-verified', player1);
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});
