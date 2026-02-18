import { test, expect } from '@playwright/test';
import { users, createTwoPlayerContexts, loginBothPlayers } from '../helpers/auth';
import { cleanupPairData } from '../helpers/cleanup';
import {
  createSeriesChallenge,
  completeBanPickPhase,
  playBothMoves,
  playOneGame,
  makeAnyMove,
  isMyTurn,
  waitForPhase,
  waitForSnabbdomReady,
  waitForNextGame,
  waitForRestingUI,
  confirmNextInResting,
  waitForFinishedPage,
  verifyFinishedPageUI,
  selectOpenings,
  confirm,
  isSeriesAborted,
  getSeriesData,
  gameSelectors,
  type ScreenshotFn,
} from '../helpers/series';

/**
 * Series Disconnect/Abort E2E Tests
 *
 * Tests disconnect handling across different phases:
 * - Pick/Ban phase: 1 player DC → series aborted
 * - Playing phase: DC → game loss only, series continues (not forfeit)
 * - Resting phase: 1 DC → forfeit, both DC → abort
 *
 * | # | P1 | P2 | Phase | Disconnect | Expected |
 * |---|----|----|-------|------------|----------|
 * | 7 | angel | bobby | Pick | P2 disconnects after P1 confirms | Series aborted |
 * | 8 | marcel | vera | Ban | P2 disconnects after P1 confirms | Series aborted |
 * | 14 | aaron | jacob | Playing | P2 disconnects during game 1 | Game loss (P1 wins game), series continues |
 * | 15 | svetlana | qing | Playing | P2 disconnects during game 3 (score 0-2) | Game loss (score 1-2), series continues |
 * | 21 | kwame | sonia | Selecting | Loser doesn't select, timeout fires | Random pick, game 2 starts |
 * | 22 | tomoko | renata | Resting | Both players disconnect during Resting | Series aborted |
 * | 23 | yarah | suresh | Resting | P2 disconnects during Resting, P1 stays | Series forfeit (P1 wins) |
 */

// ===== Test 7: Pick Phase Disconnect =====
test.describe('Test 7: angel vs bobby (Pick disconnect)', () => {
  // 30s phase timeout + buffer
  test.describe.configure({ timeout: 120000 });

  const pairUsers = ['angel', 'bobby'];
  test.beforeAll(() => cleanupPairData(pairUsers));

  test('[Test 7] Pick phase disconnect → abort', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      users.angel,
      users.bobby
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
        await loginBothPlayers(player1, player2, users.angel, users.bobby);
        seriesId = await createSeriesChallenge(player1, player2, 'bobby');
        await takeScreenshot('series-created', player1);
      });

      // Step 2: P1 picks and confirms, P2 disconnects
      await test.step('P1 confirms picks, P2 disconnects', async () => {
        await waitForPhase(player1, 'Pick Phase');
        await waitForPhase(player2, 'Pick Phase');

        // Wait for at least one WS ping to fire (3s interval)
        // so that lastSeenAt is set in the DB. Without this,
        // isDisconnected returns false because lastSeenAt=None.
        await player2.waitForTimeout(4000);

        // P1: select 5 and confirm
        await selectOpenings(player1, 5);
        await confirm(player1);
        await takeScreenshot('p1-pick-confirmed', player1);
        await takeScreenshot('p2-before-disconnect', player2);

        // P2: close page (WebSocket disconnects)
        console.log('[Test 7] Closing P2 page to simulate disconnect...');
        await player2.close();
        await takeScreenshot('p1-after-p2-disconnect', player1);
      });

      // Step 3: Wait for timeout + abort
      await test.step('Wait for abort (30s timeout)', async () => {
        // Handle the alert that handleAborted() shows
        player1.on('dialog', dialog => dialog.dismiss());

        // Wait for series to be aborted
        // Phase timeout = 30s, disconnect detection = ~5s, server processing = ~2s
        // 25 retries × 2s interval = 50s total (covers 30s timeout + margin)
        console.log('[Test 7] Waiting for phase timeout and abort...');
        const aborted = await isSeriesAborted(player1, seriesId, 25);

        await takeScreenshot('after-abort', player1);

        expect(aborted).toBe(true);
        console.log(`[Test 7] Series ${seriesId} aborted successfully`);
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ===== Test 8: Ban Phase Disconnect =====
test.describe('Test 8: marcel vs vera (Ban disconnect)', () => {
  // Pick confirm + 30s ban timeout + buffer
  test.describe.configure({ timeout: 120000 });

  const pairUsers = ['marcel', 'vera'];
  test.beforeAll(() => cleanupPairData(pairUsers));

  test('[Test 8] Ban phase disconnect → abort', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      users.marcel,
      users.vera
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
        await loginBothPlayers(player1, player2, users.marcel, users.vera);
        seriesId = await createSeriesChallenge(player1, player2, 'vera');
        await takeScreenshot('series-created', player1);
      });

      // Step 2: Both complete pick phase
      await test.step('Both confirm picks → ban phase', async () => {
        await waitForPhase(player1, 'Pick Phase');
        await waitForPhase(player2, 'Pick Phase');

        // Both select 5 and confirm
        await Promise.all([
          (async () => { await selectOpenings(player1, 5); await confirm(player1); })(),
          (async () => { await selectOpenings(player2, 5); await confirm(player2); })(),
        ]);

        await takeScreenshot('pick-p1-confirmed', player1);
        await takeScreenshot('pick-p2-confirmed', player2);

        // Wait for ban phase
        await waitForPhase(player1, 'Ban Phase', 10000);
        await waitForPhase(player2, 'Ban Phase', 10000);

        await Promise.all([
          waitForSnabbdomReady(player1),
          waitForSnabbdomReady(player2),
        ]);

        await takeScreenshot('ban-phase-p1', player1);
        await takeScreenshot('ban-phase-p2', player2);
      });

      // Step 3: P1 bans and confirms, P2 disconnects
      await test.step('P1 confirms bans, P2 disconnects', async () => {
        // P1: select 2 bans and confirm
        await selectOpenings(player1, 2);
        await confirm(player1);
        await takeScreenshot('p1-ban-confirmed', player1);
        await takeScreenshot('p2-before-disconnect', player2);

        // P2: close page (WebSocket disconnects)
        console.log('[Test 8] Closing P2 page to simulate disconnect...');
        await player2.close();
        await takeScreenshot('p1-after-p2-disconnect', player1);
      });

      // Step 4: Wait for timeout + abort
      await test.step('Wait for abort (30s timeout)', async () => {
        // Handle the alert that handleAborted() shows
        player1.on('dialog', dialog => dialog.dismiss());

        // Wait for series to be aborted
        console.log('[Test 8] Waiting for phase timeout and abort...');
        const aborted = await isSeriesAborted(player1, seriesId, 20);

        await takeScreenshot('after-abort', player1);

        expect(aborted).toBe(true);
        console.log(`[Test 8] Series ${seriesId} aborted successfully`);
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ===== Test 14: Disconnect During Game → Game Loss (series continues) =====
test.describe('Test 14: aaron vs jacob (Game disconnect → game loss)', () => {
  // Ban/pick ~30s + game disconnect detection ~90s + buffer
  test.describe.configure({ timeout: 180000 });

  const pairUsers = ['aaron', 'jacob'];
  test.beforeAll(() => cleanupPairData(pairUsers));

  test('[Test 14] Game disconnect → game loss, series continues', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      users.aaron,
      users.jacob
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
        await loginBothPlayers(player1, player2, users.aaron, users.jacob);
        seriesId = await createSeriesChallenge(player1, player2, 'jacob');
        await takeScreenshot('series-created', player1);
      });

      // Step 2: Complete ban/pick phase
      await test.step('Complete ban/pick phase', async () => {
        await completeBanPickPhase(player1, player2, undefined, takeScreenshot);
      });

      // Step 3: Both players make moves (so game is not abortable)
      await test.step('Both players make moves', async () => {
        await expect(player1.locator(gameSelectors.board)).toBeVisible({ timeout: 10000 });
        await expect(player2.locator(gameSelectors.board)).toBeVisible({ timeout: 10000 });

        await playBothMoves(player1, player2, 'aaron', 'jacob');
        await takeScreenshot('after-moves-p1', player1);
        await takeScreenshot('after-moves-p2', player2);
      });

      // Step 4: P2 disconnects (close page)
      await test.step('P2 (jacob) disconnects during game', async () => {
        console.log('[Test 14] Closing P2 page to simulate disconnect during game...');
        await player2.close();
        await takeScreenshot('p1-after-p2-disconnect', player1);

        // The "Claim victory" button only appears when it's the opponent's turn.
        // After playBothMoves, whose turn it is depends on random color assignment.
        // If it's P1's turn, make one more move to pass turn to disconnected P2.
        const myTurn = await isMyTurn(player1, 'aaron');
        if (myTurn) {
          console.log('[Test 14] P1 makes extra move to pass turn to disconnected P2...');
          await makeAnyMove(player1, 'aaron');
          await takeScreenshot('p1-extra-move', player1);
        } else {
          console.log('[Test 14] Already P2 turn, no extra move needed');
        }
      });

      // Step 5: Wait for "Claim victory" button and claim victory
      await test.step('P1 claims victory after disconnect timeout', async () => {
        // The server detects disconnect after ~60s (blitz: 30s base * 2 multiplier).
        // The "Claim victory" button appears in div.suggestion when opponent is "long gone".
        console.log('[Test 14] Waiting for "Claim victory" button (~60s)...');

        const forceResignBtn = player1.locator('div.suggestion button.button').first();
        await expect(forceResignBtn).toBeVisible({ timeout: 120000 });

        await takeScreenshot('force-resign-visible', player1);

        // Click "Force resignation" → triggers rageQuit → Status.Timeout
        await forceResignBtn.click();
        console.log('[Test 14] Clicked "Force resignation"');

        await player1.waitForTimeout(2000);
        await takeScreenshot('after-force-resign', player1);
      });

      // Step 6: Verify series continues (NOT finished, NOT forfeited)
      await test.step('Verify series continues after game DC', async () => {
        // Wait for server to process game result → Resting phase
        await player1.waitForTimeout(3000);

        const data = await getSeriesData(player1, seriesId);
        console.log(`[Test 14] Series data: ${JSON.stringify(data)}`);

        expect(data).not.toBeNull();
        // status=20 (Started), NOT 30 (Finished) or 40 (Aborted)
        expect(data!.status).toBe(20);
        // No winner yet
        expect(data!.winner).toBeNull();
        // No forfeit
        expect(data!.forfeitBy).toBeNull();
        // 1 game played
        expect(data!.gamesCount).toBe(1);
        // P1 (aaron) won the game → one player has 1 point
        const totalScore = data!.scores[0] + data!.scores[1];
        expect(totalScore).toBe(1); // exactly 1 game result recorded

        await takeScreenshot('series-continues', player1);
        console.log(`[Test 14] Series continues with scores: ${data!.scores[0]}-${data!.scores[1]}`);
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ===== Test 15: Disconnect During Game 3 After 0-2 Score → Game Loss (series continues) =====
test.describe('Test 15: svetlana vs qing (0-2 then game 3 disconnect → game loss)', () => {
  // 2 games + resting phases + selecting phases + disconnect detection ~60s + buffer
  test.describe.configure({ timeout: 260000 });

  const pairUsers = ['svetlana', 'qing'];
  test.beforeAll(() => cleanupPairData(pairUsers));

  test('[Test 15] 0-2 then game 3 disconnect → game loss (score 1-2), series continues', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      users.svetlana,
      users.qing
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
        await loginBothPlayers(player1, player2, users.svetlana, users.qing);
        seriesId = await createSeriesChallenge(player1, player2, 'qing');
        await takeScreenshot('series-created', player1);
      });

      // Step 2: Complete ban/pick phase
      await test.step('Complete ban/pick phase', async () => {
        await completeBanPickPhase(player1, player2, undefined, takeScreenshot);
      });

      // Step 3: Game 1 - P1 resigns → P2 wins (0-1)
      let game1Id = '';
      await test.step('Game 1: P1 resigns (0-1)', async () => {
        game1Id = await playOneGame(player1, player2, 'svetlana', 'qing', 'p1-resign');
        console.log(`[Test 15] Game 1 (${game1Id}) → P1 resigned, score: 0-1`);
        await takeScreenshot('game1-resigned', player1);
      });

      // Step 4: Transition to game 2 (P2 won → P1 selects next opening as loser)
      await test.step('Wait for game 2', async () => {
        await waitForNextGame(player1, player2, null, game1Id, 30000, takeScreenshot, 2);
        await takeScreenshot('game2-started-p1', player1);
      });

      // Step 5: Game 2 - P1 resigns → P2 wins (0-2)
      let game2Id = '';
      await test.step('Game 2: P1 resigns (0-2)', async () => {
        game2Id = await playOneGame(player1, player2, 'svetlana', 'qing', 'p1-resign');
        console.log(`[Test 15] Game 2 (${game2Id}) → P1 resigned, score: 0-2`);
        await takeScreenshot('game2-resigned', player1);
      });

      // Step 6: Transition to game 3 (P2 won → P1 selects next opening as loser)
      await test.step('Wait for game 3', async () => {
        await waitForNextGame(player1, player2, null, game2Id, 30000, takeScreenshot, 3);
        await takeScreenshot('game3-started-p1', player1);
      });

      // Step 7: Game 3 - Both make moves, then P2 disconnects
      await test.step('Game 3: Both make moves', async () => {
        await expect(player1.locator(gameSelectors.board)).toBeVisible({ timeout: 10000 });
        await expect(player2.locator(gameSelectors.board)).toBeVisible({ timeout: 10000 });

        await playBothMoves(player1, player2, 'svetlana', 'qing');
        await takeScreenshot('game3-after-moves-p1', player1);
        await takeScreenshot('game3-after-moves-p2', player2);
      });

      // Step 8: P2 disconnects during game 3
      await test.step('P2 (qing) disconnects during game 3', async () => {
        console.log('[Test 15] Closing P2 page to simulate disconnect during game 3...');
        await player2.close();
        await takeScreenshot('p1-after-p2-disconnect', player1);

        // Ensure it's P2's turn so "Claim victory" button can appear
        const myTurn = await isMyTurn(player1, 'svetlana');
        if (myTurn) {
          console.log('[Test 15] P1 makes extra move to pass turn to disconnected P2...');
          await makeAnyMove(player1, 'svetlana');
          await takeScreenshot('p1-extra-move', player1);
        } else {
          console.log('[Test 15] Already P2 turn, no extra move needed');
        }
      });

      // Step 9: Wait for "Claim victory" button
      await test.step('P1 claims victory after disconnect timeout', async () => {
        console.log('[Test 15] Waiting for "Claim victory" button (~60s)...');

        const forceResignBtn = player1.locator('div.suggestion button.button').first();
        await expect(forceResignBtn).toBeVisible({ timeout: 120000 });

        await takeScreenshot('force-resign-visible', player1);

        await forceResignBtn.click();
        console.log('[Test 15] Clicked "Claim victory"');

        await player1.waitForTimeout(2000);
        await takeScreenshot('after-force-resign', player1);
      });

      // Step 10: Verify series continues (NOT finished, NOT forfeited)
      await test.step('Verify series continues after game 3 DC (score 1-2)', async () => {
        // Wait for server to process game result → Resting phase
        await player1.waitForTimeout(3000);

        const data = await getSeriesData(player1, seriesId);
        console.log(`[Test 15] Series data: ${JSON.stringify(data)}`);

        expect(data).not.toBeNull();
        // status=20 (Started), NOT 30 (Finished) or 40 (Aborted)
        expect(data!.status).toBe(20);
        // No winner yet — score is 1-2, series continues
        expect(data!.winner).toBeNull();
        // No forfeit
        expect(data!.forfeitBy).toBeNull();
        // 3 games played
        expect(data!.gamesCount).toBe(3);
        // P1 (svetlana) lost 2 games (resign), won 1 game (claim victory)
        // P2 (qing) won 2 games, lost 1 game → score should be 1-2
        const totalScore = data!.scores[0] + data!.scores[1];
        expect(totalScore).toBe(3); // 3 decisive game results

        await takeScreenshot('series-continues', player1);
        console.log(`[Test 15] Series continues with scores: ${data!.scores[0]}-${data!.scores[1]}`);
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ===== Test 21: Selecting Timeout → Random Pick (bug fix #4 + change #2) =====
test.describe('Test 21: kwame vs sonia (Selecting timeout → random pick)', () => {
  // Ban/pick + game 1 + resting + selecting timeout (30s) + game 2 start + buffer
  test.describe.configure({ timeout: 180000 });

  const pairUsers = ['kwame', 'sonia'];
  test.beforeAll(() => cleanupPairData(pairUsers));

  test('[Test 21] Selecting timeout → random pick, game 2 starts', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      users.kwame,
      users.sonia
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
        await loginBothPlayers(player1, player2, users.kwame, users.sonia);
        seriesId = await createSeriesChallenge(player1, player2, 'sonia');
        await takeScreenshot('series-created', player1);
      });

      // Step 2: Complete ban/pick phase
      await test.step('Complete ban/pick phase', async () => {
        await completeBanPickPhase(player1, player2, undefined, takeScreenshot);
      });

      // Step 3: Game 1 - P2 resigns → P1 wins (1-0)
      await test.step('Game 1: P2 resigns (P1 wins)', async () => {
        const gameId = await playOneGame(player1, player2, 'kwame', 'sonia', 'p2-resign');
        console.log(`[Test 21] Game 1 (${gameId}) → P2 resigned, score: 1-0`);
        await takeScreenshot('game1-p2-resigned', player1);
      });

      // Step 4: Resting → both confirm
      await test.step('Resting: both confirm', async () => {
        await Promise.all([
          waitForRestingUI(player1),
          waitForRestingUI(player2),
        ]);
        await takeScreenshot('resting-p1', player1);

        await Promise.all([
          confirmNextInResting(player1),
          confirmNextInResting(player2),
        ]);
        await takeScreenshot('resting-confirmed', player1);
      });

      // Step 5: Selecting phase - P2 (loser) does NOT select → wait for timeout
      await test.step('Selecting timeout (30s) → random pick', async () => {
        // Wait for Selecting phase to start (P2 is loser, should see selecting UI)
        // The server schedules a 30s timeout for Selecting phase (bug fix #4)
        console.log('[Test 21] Waiting for Selecting timeout (30s)...');

        // Poll the API until game 2 is created (gamesCount >= 2)
        // Selecting timeout = 30s, plus processing time
        // 20 retries × 2s = 40s total (covers 30s timeout + margin)
        let data = null;
        for (let i = 1; i <= 20; i++) {
          await player1.waitForTimeout(2000);
          data = await getSeriesData(player1, seriesId);
          console.log(`[Test 21] attempt=${i}, phase=${data?.phase}, games=${data?.gamesCount}`);
          if (data && data.gamesCount >= 2) break;
        }

        await takeScreenshot('after-selecting-timeout', player1);

        expect(data).not.toBeNull();
        expect(data!.gamesCount).toBe(2);
        console.log(`[Test 21] Game 2 started after Selecting timeout (random pick)`);
      });

      // Step 6: Verify series continues normally
      await test.step('Verify series state after random pick', async () => {
        const data = await getSeriesData(player1, seriesId);
        console.log(`[Test 21] Series data: ${JSON.stringify(data)}`);

        expect(data).not.toBeNull();
        expect(data!.status).toBe(20);        // Started
        expect(data!.winner).toBeNull();       // No winner yet
        expect(data!.forfeitBy).toBeNull();    // No forfeit
        expect(data!.gamesCount).toBe(2);      // 2 games (game 2 started)

        await takeScreenshot('series-continues', player1);
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ===== Test 22: Resting Both DC → Series Abort (change #3) =====
test.describe('Test 22: tomoko vs renata (Resting both DC → abort)', () => {
  // Ban/pick + game 1 + resting timeout (30s) + DC detection + buffer
  test.describe.configure({ timeout: 150000 });

  const pairUsers = ['tomoko', 'renata'];
  test.beforeAll(() => cleanupPairData(pairUsers));

  test('[Test 22] Resting both DC → series abort', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      users.tomoko,
      users.renata
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
        await loginBothPlayers(player1, player2, users.tomoko, users.renata);
        seriesId = await createSeriesChallenge(player1, player2, 'renata');
        await takeScreenshot('series-created', player1);
      });

      // Step 2: Complete ban/pick phase
      await test.step('Complete ban/pick phase', async () => {
        await completeBanPickPhase(player1, player2, undefined, takeScreenshot);
      });

      // Step 3: Game 1 - P1 resigns → P2 wins
      await test.step('Game 1: P1 resigns', async () => {
        const gameId = await playOneGame(player1, player2, 'tomoko', 'renata', 'p1-resign');
        console.log(`[Test 22] Game 1 (${gameId}) → P1 resigned`);
        await takeScreenshot('game1-resigned', player1);
      });

      // Step 4: Wait for Resting UI to appear
      await test.step('Wait for Resting UI', async () => {
        await Promise.all([
          waitForRestingUI(player1),
          waitForRestingUI(player2),
        ]);
        await takeScreenshot('resting-p1', player1);
        await takeScreenshot('resting-p2', player2);

        // Wait for WS pings to register lastSeenAt (3s interval)
        // so that isDisconnected detection works correctly
        await player1.waitForTimeout(4000);
      });

      // Step 5: Both players disconnect
      await test.step('Both players disconnect during Resting', async () => {
        console.log('[Test 22] Closing both pages to simulate both-DC...');
        await player2.close();
        await player1.close();
      });

      // Step 6: Wait for Resting timeout + both-DC → abort
      await test.step('Wait for abort (30s Resting timeout)', async () => {
        // Create a fresh page for API verification (both original pages are closed)
        const verifyPage = await player1Context.newPage();

        // Resting timeout = 30s, DC threshold = 5s, server processing = ~2s
        // 20 retries × 2s = 40s total (covers 30s timeout + margin)
        console.log('[Test 22] Waiting for Resting timeout and both-DC abort...');
        const aborted = await isSeriesAborted(verifyPage, seriesId, 20);

        await test.info().attach('after-abort', {
          body: await verifyPage.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        expect(aborted).toBe(true);
        console.log(`[Test 22] Series ${seriesId} aborted (both DC during Resting)`);

        await verifyPage.close();
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ===== Test 23: Resting 1 DC → Series Forfeit =====
test.describe('Test 23: yarah vs suresh (Resting 1 DC → forfeit)', () => {
  // Ban/pick + game 1 + resting timeout (30s) + DC detection + finished page + buffer
  test.describe.configure({ timeout: 150000 });

  const pairUsers = ['yarah', 'suresh'];
  test.beforeAll(() => cleanupPairData(pairUsers));

  test('[Test 23] Resting 1 DC → series forfeit (P1 wins)', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      users.yarah,
      users.suresh
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
        await loginBothPlayers(player1, player2, users.yarah, users.suresh);
        seriesId = await createSeriesChallenge(player1, player2, 'suresh');
        await takeScreenshot('series-created', player1);
      });

      // Step 2: Complete ban/pick phase
      await test.step('Complete ban/pick phase', async () => {
        await completeBanPickPhase(player1, player2, undefined, takeScreenshot);
      });

      // Step 3: Game 1 - P1 resigns → P2 wins
      await test.step('Game 1: P1 resigns', async () => {
        const gameId = await playOneGame(player1, player2, 'yarah', 'suresh', 'p1-resign');
        console.log(`[Test 23] Game 1 (${gameId}) → P1 resigned`);
        await takeScreenshot('game1-resigned', player1);
      });

      // Step 4: Wait for Resting UI
      await test.step('Wait for Resting UI', async () => {
        await Promise.all([
          waitForRestingUI(player1),
          waitForRestingUI(player2),
        ]);
        await takeScreenshot('resting-p1', player1);
        await takeScreenshot('resting-p2', player2);

        // Wait for ping polls to register lastSeenAt (3s interval)
        await player1.waitForTimeout(4000);
      });

      // Step 5: P2 disconnects
      await test.step('P2 (suresh) disconnects during Resting', async () => {
        console.log('[Test 23] Closing P2 page to simulate disconnect...');
        await player2.close();
        await takeScreenshot('p1-after-p2-disconnect', player1);
      });

      // Step 6: Verify DC warning UI on P1
      await test.step('Verify "Opponent left" warning on P1', async () => {
        // Wait for P1's poll to detect P2's DC (~3s poll + 5s threshold = ~8s)
        console.log('[Test 23] Waiting for DC detection on P1 poll...');

        // The poll fires every 3s and checks isOnline (5s threshold).
        // After P2 disconnects, worst case: next poll in 3s + 5s stale = 8s
        // Then another poll 3s later confirms DC. Allow ~12s total.
        await expect(
          player1.locator('.series-rest__timer:has-text("Opponent left")')
        ).toBeVisible({ timeout: 15000 });

        await expect(
          player1.locator('.series-rest__opponent-status:has-text("Opponent disconnected")')
        ).toBeVisible({ timeout: 3000 });

        await takeScreenshot('p1-opponent-left-warning', player1);
        console.log('[Test 23] DC warning UI confirmed on P1');
      });

      // Step 7: Wait for Resting timeout → forfeit → redirect to Finished
      await test.step('Wait for forfeit and redirect to Finished page', async () => {
        console.log('[Test 23] Waiting for Resting timeout → forfeit → redirect...');

        // Resting timeout = 30s from phase start.
        // We already waited ~8-12s for DC detection, so ~18-22s remaining.
        await waitForFinishedPage(player1, seriesId, 40000);

        await takeScreenshot('finished-page-p1', player1);
        console.log('[Test 23] P1 redirected to Finished page');
      });

      // Step 8: Verify Finished page shows "Victory! (forfeit)"
      await test.step('Verify Finished page UI (forfeit)', async () => {
        const { banner } = await verifyFinishedPageUI(player1, 1);

        expect(banner).toContain('Victory');
        expect(banner).toContain('forfeit');

        await takeScreenshot('finished-ui-verified', player1);
        console.log(`[Test 23] Finished page banner: "${banner}"`);
      });

      // Step 9: Verify series data via API
      await test.step('Verify series API data (forfeit)', async () => {
        const data = await getSeriesData(player1, seriesId);
        console.log(`[Test 23] Series data: ${JSON.stringify(data)}`);

        expect(data).not.toBeNull();
        expect(data!.status).toBe(30);           // Finished
        expect(data!.winner).not.toBeNull();      // Has a winner
        expect(data!.forfeitBy).not.toBeNull();   // Forfeit recorded
        expect(data!.gamesCount).toBe(1);         // 1 game played

        await takeScreenshot('api-data-verified', player1);
        console.log(`[Test 23] Series ${seriesId} forfeited successfully`);
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});
