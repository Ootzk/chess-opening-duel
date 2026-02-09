import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import { users, createTwoPlayerContexts, loginBothPlayers } from '../helpers/auth';
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
  selectOpenings,
  confirm,
  isSeriesAborted,
  isSeriesFinished,
  getSeriesWinner,
  getPlayerIndex,
  waitForFinishedPage,
  verifyFinishedPageUI,
  gameSelectors,
  type ScreenshotFn,
} from '../helpers/series';

/**
 * Series Disconnect/Abort E2E Tests
 *
 * Tests that a series is properly aborted when a player disconnects
 * during pick or ban phase, and that a series is forfeited when a
 * player disconnects during a game (Playing phase).
 *
 * | # | P1 | P2 | Phase | Disconnect | Expected |
 * |---|----|----|-------|------------|----------|
 * | 7 | angel | bobby | Pick | P2 disconnects after P1 confirms | Series aborted |
 * | 8 | marcel | vera | Ban | P2 disconnects after P1 confirms | Series aborted |
 * | 14 | aaron | jacob | Playing | P2 disconnects during game 1 | Series forfeit (P1 wins) |
 * | 15 | svetlana | qing | Playing | P2 disconnects during game 3 (score 0-2) | Series forfeit (P1 wins despite losing) |
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

// ===== Test 14: Disconnect During Game → Series Forfeit =====
test.describe('Test 14: aaron vs jacob (Game disconnect → forfeit)', () => {
  // Ban/pick ~30s + game disconnect detection ~90s + buffer
  test.describe.configure({ timeout: 180000 });

  const pairUsers = ['aaron', 'jacob'];
  test.beforeAll(() => cleanupPairData(pairUsers));

  test('[Test 14] Game disconnect → series forfeit', async ({ browser }) => {
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

      // Step 6: Verify series is finished (not just the game)
      await test.step('Verify series finished with disconnect forfeit', async () => {
        const finished = await isSeriesFinished(player1, seriesId, 10);
        expect(finished).toBe(true);

        // aaron should win (jacob disconnected)
        const aaronIndex = await getPlayerIndex(player1, seriesId, 'aaron');
        const winner = await getSeriesWinner(player1, seriesId);
        console.log(`[Test 14] aaron index: ${aaronIndex}, winner index: ${winner}`);

        expect(winner).not.toBeNull();
        expect(aaronIndex).not.toBeNull();
        expect(winner).toBe(aaronIndex);

        await takeScreenshot('series-verified', player1);
      });

      // Step 7: Verify finished page redirect with forfeit banner
      await test.step('Verify finished page with forfeit message', async () => {
        await waitForFinishedPage(player1, seriesId);

        const p1UI = await verifyFinishedPageUI(player1, 1);

        // P1 (aaron) won → should see "Victory! (forfeit)"
        expect(p1UI.banner).toBe('Victory! (forfeit)');
        console.log(`[Test 14] Finished page banner: "${p1UI.banner}"`);

        await takeScreenshot('finished-page-p1', player1);
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ===== Test 15: Disconnect During Game 3 After 0-2 Score → Series Forfeit =====
test.describe('Test 15: svetlana vs qing (0-2 then game 3 disconnect → forfeit)', () => {
  // 2 games + selecting phases + disconnect detection ~60s + buffer
  test.describe.configure({ timeout: 240000 });

  const pairUsers = ['svetlana', 'qing'];
  test.beforeAll(() => cleanupPairData(pairUsers));

  test('[Test 15] 0-2 then game 3 disconnect → series forfeit (P1 wins despite score)', async ({ browser }) => {
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

      // Step 4: Transition to game 2 (P1 lost → P1 selects next opening)
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

      // Step 6: Transition to game 3 (P1 lost → P1 selects next opening)
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

      // Step 10: Verify series finished with forfeit (P1 wins despite 0-2 score)
      await test.step('Verify series finished with disconnect forfeit', async () => {
        const finished = await isSeriesFinished(player1, seriesId, 10);
        expect(finished).toBe(true);

        // svetlana (P1) should win by forfeit, despite losing 0-2 in score
        const svetlanaIndex = await getPlayerIndex(player1, seriesId, 'svetlana');
        const winner = await getSeriesWinner(player1, seriesId);
        console.log(`[Test 15] svetlana index: ${svetlanaIndex}, winner index: ${winner}`);

        expect(winner).not.toBeNull();
        expect(svetlanaIndex).not.toBeNull();
        expect(winner).toBe(svetlanaIndex);

        await takeScreenshot('series-verified', player1);
      });

      // Step 11: Verify finished page
      await test.step('Verify finished page with forfeit message', async () => {
        await waitForFinishedPage(player1, seriesId);

        const p1UI = await verifyFinishedPageUI(player1, 3);

        // P1 (svetlana) won by forfeit → "Victory! (forfeit)"
        expect(p1UI.banner).toBe('Victory! (forfeit)');
        console.log(`[Test 15] Finished page banner: "${p1UI.banner}"`);

        await takeScreenshot('finished-page-p1', player1);
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});
