import { test, expect } from '@playwright/test';
import { users, createTwoPlayerContexts, loginBothPlayers } from '../helpers/auth';
import { cleanupPairData } from '../helpers/cleanup';
import {
  createSeriesViaLobby,
  completeBanPickPhase,
  playOneGame,
  getSeriesData,
  type ScreenshotFn,
} from '../helpers/series';

/**
 * Lobby Matching E2E Test
 *
 * Tests the "Opening Duel with Anyone" flow:
 * - Both players click "Opening Duel with Anyone" in the lobby
 * - Server auto-matches via hook system → creates Series
 * - Both redirected to /series/{id}/pick (no challenge accept step)
 * - Completes ban/pick, plays one game, verifies series is active
 *
 * | Test | P1 | P2 | Scenario |
 * |------|----|----|----------|
 * | 27   | elizabeth | dae | Lobby hook matching → series → ban/pick → game |
 */

test.describe('Test 27: elizabeth vs dae (Lobby matching)', () => {
  test.describe.configure({ timeout: 180000 });

  const pairUsers = ['elizabeth', 'dae'];
  test.beforeAll(() => cleanupPairData(pairUsers));

  test('[Test 27] Opening Duel with Anyone → series creation → game', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } =
      await createTwoPlayerContexts(browser, users.elizabeth, users.dae);

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

      // Step 1: Login both players
      await test.step('Login both players', async () => {
        await loginBothPlayers(player1, player2, users.elizabeth, users.dae);
      });

      // Step 2: Create series via lobby hook matching (screenshots inside helper)
      await test.step('Create series via "Opening Duel with Anyone"', async () => {
        seriesId = await createSeriesViaLobby(player1, player2, 'elizabeth', 'dae', takeScreenshot);
        expect(seriesId).toBeTruthy();
        console.log(`[Lobby Test] Series created: ${seriesId}`);
      });

      // Step 3: Complete ban/pick + play 1 game to verify series works end-to-end
      await test.step('Complete ban/pick phase', async () => {
        await completeBanPickPhase(player1, player2);
      });

      await test.step('Play game 1', async () => {
        await playOneGame(player1, player2, 'elizabeth', 'dae', 'p1-resign');
      });

      // Step 4: Verify series is active (not finished after 1 game)
      await test.step('Verify series is active', async () => {
        const data = await getSeriesData(player1, seriesId);
        expect(data).not.toBeNull();
        expect(data!.status).not.toBe(30); // Not finished
        console.log(
          `[Lobby Test] Series ${seriesId} active. Phase: ${data!.phase}, Scores: ${data!.scores}`,
        );
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});
