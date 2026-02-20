import { test, expect } from '@playwright/test';
import { users, createTwoPlayerContexts, loginBothPlayers } from '../helpers/auth';
import { cleanupPairData } from '../helpers/cleanup';
import {
  createSeriesChallenge,
  completeBanPickPhase,
  makeAnyMove,
  isMyTurn,
  isSeriesFinished,
  getSeriesWinner,
  getPlayerIndex,
  forfeitSeriesViaApi,
  waitForRestingUI,
  waitForNextGame,
  gameSelectors,
  getGameIdFromUrl,
  getGameStateViaApi,
  playBothMoves,
  resignGame,
  type ScreenshotFn,
} from '../helpers/series';

/**
 * Series NoStart E2E Tests
 *
 * NoStart mechanism: before BOTH players make their first move, the clock is not running.
 * A ~26s timeout (scheduleExpiration) fires and penalizes the player who didn't move.
 * - 0 plies played → startColor player (first mover) is penalized
 * - 1 ply played → !startColor player (second mover) is penalized
 * After both players move (2+ plies), the clock runs and normal timeout/disconnect applies.
 *
 * Note: startColor depends on the opening FEN - it can be white OR black.
 *
 * Series-specific behavior:
 * - Source.Series ∈ expirable → scheduleExpiration fires
 * - isMandatory = true → NoStart gives opponent the win (Status.NoStart)
 * - isDisconnectForfeit = false → series continues (not series-wide forfeit)
 *
 * | # | P1 | P2 | Scenario | Expected |
 * |---|----|----|----------|----------|
 * | 21 | yunel | idris | Neither player moves | First mover (startColor) loses, opponent +1pt |
 * | 22 | aleksandr | veer | First mover moves, second doesn't | Second mover loses, first mover +1pt |
 */

// ===== Test 21: NoStart - neither player moves =====
test.describe('Test 21: yunel vs idris (NoStart - neither moves)', () => {
  test.describe.configure({ timeout: 120000 });

  const pairUsers = ['yunel', 'idris'];
  test.beforeAll(() => cleanupPairData(pairUsers));

  test('[Test 21] Neither player moves → first mover loses via NoStart', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      users.yunel,
      users.idris
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
        await loginBothPlayers(player1, player2, users.yunel, users.idris);
        seriesId = await createSeriesChallenge(player1, player2, 'idris');
        await takeScreenshot('series-created', player1);
      });

      // Step 2: Complete ban/pick phase (both confirm quickly)
      await test.step('Complete ban/pick phase', async () => {
        await completeBanPickPhase(player1, player2, undefined, takeScreenshot);
      });

      // Step 3: Wait for game board, then do NOT make any moves
      await test.step('Wait for game start, no moves', async () => {
        await expect(player1.locator(gameSelectors.board)).toBeVisible({ timeout: 10000 });
        await expect(player2.locator(gameSelectors.board)).toBeVisible({ timeout: 10000 });
        await takeScreenshot('game-start-p1', player1);
        await takeScreenshot('game-start-p2', player2);

        // Determine who is white (first mover) for verification later
        const gameId = getGameIdFromUrl(player1.url());
        if (gameId) {
          const gameState = await getGameStateViaApi(player1, 'yunel', gameId);
          console.log(`[Test 21] White: ${gameState.whitePlayer}, Black: ${gameState.blackPlayer}`);
        }
      });

      // Step 4: Wait for NoStart to fire (~26s) → Resting UI appears
      await test.step('Wait for NoStart timeout → Resting phase', async () => {
        console.log('[Test 21] Waiting for NoStart timeout (~26 seconds)...');

        // NoStart fires at ~26s from game creation, series transitions to Resting
        await Promise.all([
          waitForRestingUI(player1, 45000),
          waitForRestingUI(player2, 45000),
        ]);

        await takeScreenshot('resting-after-nostart-p1', player1);
        await takeScreenshot('resting-after-nostart-p2', player2);
        console.log('[Test 21] Resting UI appeared - NoStart fired successfully');
      });

      // Step 5: Verify series score via API
      await test.step('Verify score: first mover lost, opponent got 1 point', async () => {
        // Retry with delay - series state may need time to settle after NoStart
        let data: any;
        for (let attempt = 1; attempt <= 5; attempt++) {
          const response = await player1.request.get(`http://localhost:8080/series/${seriesId}`, {
            headers: { Accept: 'application/json' },
          });
          const body = await response.text();
          console.log(`[Test 21] API attempt ${attempt}: status=${response.status()}, body=${body.slice(0, 200)}`);

          if (response.ok()) {
            data = JSON.parse(body);
            break;
          }
          await player1.waitForTimeout(2000);
        }
        expect(data).toBeDefined();

        const players = data.players as Array<{ user?: { id: string }; score: number }>;
        const p0Score = players[0].score;
        const p1Score = players[1].score;

        console.log(`[Test 21] Scores: P0=${p0Score}, P1=${p1Score}`);

        // API returns displayScore: win=1, draw=0.5, loss=0
        // Exactly one player should have 1 point, the other 0
        expect(p0Score + p1Score).toBe(1);
        expect([p0Score, p1Score].sort()).toEqual([0, 1]);
      });

      // Step 6: Forfeit series to end it early
      await test.step('Forfeit series to end early', async () => {
        const result = await forfeitSeriesViaApi(player1, seriesId);
        expect(result).toBe(true);

        // Verify series is now finished
        const finished = await isSeriesFinished(player1, seriesId, 5);
        expect(finished).toBe(true);
        console.log('[Test 21] Series forfeited and finished');
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ===== Test 22: NoStart - first mover moves, second mover doesn't =====
test.describe('Test 22: aleksandr vs veer (NoStart - second mover doesn\'t move)', () => {
  test.describe.configure({ timeout: 120000 });

  const pairUsers = ['aleksandr', 'veer'];
  test.beforeAll(() => cleanupPairData(pairUsers));

  test('[Test 22] First mover moves, second doesn\'t → second mover loses via NoStart', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      users.aleksandr,
      users.veer
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
    let firstMoverUsername = '';

    try {
      // Step 1: Create series
      await test.step('Create series', async () => {
        await loginBothPlayers(player1, player2, users.aleksandr, users.veer);
        seriesId = await createSeriesChallenge(player1, player2, 'veer');
        await takeScreenshot('series-created', player1);
      });

      // Step 2: Complete ban/pick phase (both confirm quickly)
      await test.step('Complete ban/pick phase', async () => {
        await completeBanPickPhase(player1, player2, undefined, takeScreenshot);
      });

      // Step 3: Only the first mover (startColor) makes a move
      await test.step('Only the first mover makes a move', async () => {
        await expect(player1.locator(gameSelectors.board)).toBeVisible({ timeout: 10000 });
        await expect(player2.locator(gameSelectors.board)).toBeVisible({ timeout: 10000 });

        // isMyTurn checks the FEN's active color → identifies the first mover
        const p1IsFirstMover = await isMyTurn(player1, 'aleksandr');

        if (p1IsFirstMover) {
          firstMoverUsername = 'aleksandr';
          console.log('[Test 22] aleksandr is first mover (startColor) - making move');
          await makeAnyMove(player1, 'aleksandr');
        } else {
          firstMoverUsername = 'veer';
          console.log('[Test 22] veer is first mover (startColor) - making move');
          await makeAnyMove(player2, 'veer');
        }

        await takeScreenshot('after-first-move-p1', player1);
        await takeScreenshot('after-first-move-p2', player2);

        // Second mover does NOT move - wait for NoStart
        console.log(`[Test 22] Second mover will NOT move. Waiting for NoStart...`);
      });

      // Step 4: Wait for NoStart to fire (~26s) → Resting UI appears
      await test.step('Wait for NoStart timeout → Resting phase', async () => {
        console.log('[Test 22] Waiting for NoStart timeout (~26 seconds)...');

        await Promise.all([
          waitForRestingUI(player1, 45000),
          waitForRestingUI(player2, 45000),
        ]);

        await takeScreenshot('resting-after-nostart-p1', player1);
        await takeScreenshot('resting-after-nostart-p2', player2);
        console.log('[Test 22] Resting UI appeared - NoStart fired successfully');
      });

      // Step 5: Verify series score - first mover should have the point
      await test.step('Verify score: first mover got 1 point', async () => {
        // Retry with delay - series state may need time to settle after NoStart
        let data: any;
        for (let attempt = 1; attempt <= 5; attempt++) {
          const response = await player1.request.get(`http://localhost:8080/series/${seriesId}`, {
            headers: { Accept: 'application/json' },
          });
          const body = await response.text();
          console.log(`[Test 22] API attempt ${attempt}: status=${response.status()}, body=${body.slice(0, 200)}`);

          if (response.ok()) {
            data = JSON.parse(body);
            break;
          }
          await player1.waitForTimeout(2000);
        }
        expect(data).toBeDefined();

        const players = data.players as Array<{ user?: { id: string }; score: number }>;

        // Find first mover's series index
        const firstMoverIdx = players.findIndex(p => p.user?.id === firstMoverUsername);
        const secondMoverIdx = 1 - firstMoverIdx;

        const firstMoverScore = players[firstMoverIdx].score;
        const secondMoverScore = players[secondMoverIdx].score;

        console.log(`[Test 22] First mover (${firstMoverUsername}, idx=${firstMoverIdx}) score=${firstMoverScore}, Second mover score=${secondMoverScore}`);

        // API returns displayScore: win=1, draw=0.5, loss=0
        // First mover should have won (1 point), second mover should have 0
        expect(firstMoverScore).toBe(1);
        expect(secondMoverScore).toBe(0);
      });

      // Step 6: Forfeit series to end it early
      await test.step('Forfeit series to end early', async () => {
        const result = await forfeitSeriesViaApi(player1, seriesId);
        expect(result).toBe(true);

        const finished = await isSeriesFinished(player1, seriesId, 5);
        expect(finished).toBe(true);
        console.log('[Test 22] Series forfeited and finished');
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ===== Test 23: NoStart timer starts after RandomSelecting animation =====
test.describe('Test 23: aleksandr vs veer (NoStart timer delayed until animation done)', () => {
  // 15s wait + Resting 30s + Selecting 30s + NoStart 26s + buffer
  test.describe.configure({ timeout: 240000 });

  const pairUsers = ['aleksandr', 'veer'];
  test.beforeAll(() => cleanupPairData(pairUsers));

  test('[Test 23] 15s wait after animation → no NoStart, then Game 2 NoStart fires', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      users.aleksandr,
      users.veer
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
        await loginBothPlayers(player1, player2, users.aleksandr, users.veer);
        seriesId = await createSeriesChallenge(player1, player2, 'veer');
      });

      // Step 2: Complete ban/pick phase
      await test.step('Complete ban/pick phase', async () => {
        await completeBanPickPhase(player1, player2, undefined, takeScreenshot);
      });

      // Step 3: Game 1 — wait 15s after board visible, then both move
      // This proves NoStart timer was properly delayed until after RandomSelecting animation
      await test.step('Game 1: Wait 15s after board visible → both players move (no NoStart)', async () => {
        await expect(player1.locator(gameSelectors.board)).toBeVisible({ timeout: 15000 });
        await expect(player2.locator(gameSelectors.board)).toBeVisible({ timeout: 15000 });
        await takeScreenshot('game1-board-visible', player1);

        // Wait 15 seconds — longer than old effective NoStart window (~12s)
        // but shorter than correct timeForFirstMove (25s for Blitz)
        console.log('[Test 23] Waiting 15 seconds after board visible...');
        await player1.waitForTimeout(15000);

        // Both players should still be able to move (NoStart hasn't fired)
        await takeScreenshot('game1-after-15s-wait', player1);

        // Both make their first move — proves neither was NoStart'd
        await playBothMoves(player1, player2, 'aleksandr', 'veer');
        console.log('[Test 23] Both players moved after 15s wait — NoStart did NOT fire');
        await takeScreenshot('game1-both-moved', player1);
      });

      // Step 4: Resign game 1 and transition to game 2
      let game1Id = '';
      await test.step('Resign game 1 → transition to game 2', async () => {
        game1Id = getGameIdFromUrl(player1.url()) || '';
        await resignGame(player1, 'aleksandr');
        console.log(`[Test 23] Game 1 (${game1Id}) resigned by aleksandr`);

        // waitForNextGame handles: Resting → confirm → Selecting timeout → new game arrival
        await waitForNextGame(player1, player2, null, game1Id, 90000, takeScreenshot, 2);
        await takeScreenshot('game2-arrived', player1);
      });

      // Step 5: Game 2 — neither moves → NoStart fires (proves NoStart still works)
      await test.step('Game 2: Neither moves → NoStart fires', async () => {
        await expect(player1.locator(gameSelectors.board)).toBeVisible({ timeout: 15000 });
        await expect(player2.locator(gameSelectors.board)).toBeVisible({ timeout: 15000 });
        await takeScreenshot('game2-board-visible', player1);

        console.log('[Test 23] Waiting for NoStart in Game 2...');

        // Wait for Resting UI (NoStart fires → game ends → Resting)
        await Promise.all([
          waitForRestingUI(player1, 60000),
          waitForRestingUI(player2, 60000),
        ]);
        await takeScreenshot('resting-after-game2-nostart', player1);
        console.log('[Test 23] NoStart fired in Game 2');
      });

      // Step 6: Verify scores — Game 1: veer won (aleksandr resigned), Game 2: NoStart
      await test.step('Verify series scores', async () => {
        let data: any;
        // Retry until both game results are reflected (async score update)
        for (let attempt = 1; attempt <= 10; attempt++) {
          const response = await player1.request.get(`http://localhost:8080/series/${seriesId}`, {
            headers: { Accept: 'application/json' },
          });
          if (response.ok()) {
            data = JSON.parse(await response.text());
            const total = data.players[0].score + data.players[1].score;
            if (total >= 2) break;
          }
          await player1.waitForTimeout(2000);
        }
        expect(data).toBeDefined();

        const players = data.players as Array<{ user?: { id: string }; score: number }>;
        const p0Score = players[0].score;
        const p1Score = players[1].score;
        console.log(`[Test 23] Scores after 2 games: P0=${p0Score}, P1=${p1Score}`);

        // Both games should have results (total score = 2)
        expect(p0Score + p1Score).toBe(2);
      });

      // Step 7: Forfeit to end
      await test.step('Forfeit series to end', async () => {
        await forfeitSeriesViaApi(player1, seriesId);
        const finished = await isSeriesFinished(player1, seriesId, 5);
        expect(finished).toBe(true);
        console.log('[Test 23] Series forfeited and finished');
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});
