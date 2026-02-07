import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import { testPairs, createTwoPlayerContexts, loginBothPlayers } from '../helpers/auth';
import {
  selectors,
  selectOpenings,
  getSelectedCount,
  confirm,
  waitForPhase,
  waitForOpponentStatus,
  createSeriesChallenge,
  gameSelectors,
  makeAnyMove,
  resignGame,
  sendDrawViaApi,
  waitForSeriesRedirect,
  selectNextOpening,
  waitForGamePage,
  waitForRandomSelecting,
  isMyTurn,
} from '../helpers/series';

/**
 * Series Ban/Pick E2E Tests
 *
 * Tags describe phase outcomes:
 *   @🟢pick:{state} - Pick phase (green)
 *   @🔴ban:{state}  - Ban phase (red)
 *   @🎮game:{flow}  - Game phase flow (blue)
 *
 * Pick/Ban States:
 *   both-confirmed          - Both players confirmed
 *   one-confirmed-one-timeout - One confirmed, other timed out
 *   both-partial-timeout    - Both partially selected, then timed out
 *   both-timeout            - Neither confirmed, server auto-filled
 *   one-confirmed-one-disconnected - One confirmed, other disconnected
 *
 * Game Flows:
 *   resign→select           - Player resigns, loser selects next opening
 *   draw→random             - Game draws, random selection for next game
 */

// Cleanup helper for specific user pair
function cleanupPairData(users: string[]) {
  try {
    const mongoCommand = `
      db.game5.deleteMany({ "players.user.id": { $in: ${JSON.stringify(users)} } });
      db.series.deleteMany({ "players.userId": { $in: ${JSON.stringify(users)} } });
      db.challenge.deleteMany({ $or: [
        { "challenger.user.id": { $in: ${JSON.stringify(users)} } },
        { "destUser.id": { $in: ${JSON.stringify(users)} } }
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

// ===== Complete Flow (elena + hans) =====
test.describe('Complete Flow', () => {
  test.describe.configure({ timeout: 90000 }); // 90 seconds for full flow through Game 3
  const pair = testPairs.happyPath;
  const pairUsers = ['elena', 'hans'];

  test.beforeAll(() => cleanupPairData(pairUsers));

  test('Full flow through Game 3 @🟢pick:both-confirmed @🔴ban:both-confirmed @🎮game:resign→select→draw→random', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      pair.player1,
      pair.player2
    );

    try {
      // ===== STEP 1: Create Series =====
      await test.step('Create series and reach Pick Phase', async () => {
        await loginBothPlayers(player1, player2, pair.player1, pair.player2);
        await createSeriesChallenge(player1, player2, pair.player2.username);
        await waitForPhase(player1, 'Pick Phase');
        await waitForPhase(player2, 'Pick Phase');

        // Screenshot: Pick Phase 진입 (fullPage로 Confirm 버튼까지 캡처)
        await test.info().attach('1-pick-phase-player1', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
        await test.info().attach('1-pick-phase-player2', {
          body: await player2.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });

      // ===== STEP 2: Pick Phase =====
      await test.step('Pick Phase: Select 5 openings each', async () => {
        // Initially confirm should be disabled (0 picks)
        await expect(player1.locator(selectors.confirmBtnDisabled)).toBeVisible();

        // Select 4 openings - confirm still disabled
        await selectOpenings(player1, 4);
        expect(await getSelectedCount(player1)).toBe(4);
        await expect(player1.locator(selectors.confirmBtnDisabled)).toBeVisible();

        // Select 5th opening - confirm enabled
        await selectOpenings(player1, 1);
        expect(await getSelectedCount(player1)).toBe(5);
        await expect(player1.locator(selectors.confirmBtn)).toBeVisible();

        // Player 2 also selects 5
        await selectOpenings(player2, 5);
        expect(await getSelectedCount(player2)).toBe(5);

        // Screenshot: 5개 선택 완료
        await test.info().attach('2-pick-selected-player1', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
        await test.info().attach('2-pick-selected-player2', {
          body: await player2.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });

      await test.step('Pick Phase: Both confirm and transition to Ban Phase', async () => {
        // Both confirm
        await confirm(player1);
        await confirm(player2);

        // Should see opponent "Ready!" status
        await waitForOpponentStatus(player1, 'ready', 5000);
        await waitForOpponentStatus(player2, 'ready', 5000);

        // Screenshot: Ready 상태
        await test.info().attach('3-pick-ready-player1', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        // Wait for 3-second delay + phase transition
        await waitForPhase(player1, 'Ban Phase', 10000);
        await waitForPhase(player2, 'Ban Phase', 10000);

        // Screenshot: Ban Phase 진입
        await test.info().attach('4-ban-phase-player1', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
        await test.info().attach('4-ban-phase-player2', {
          body: await player2.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });

      // ===== STEP 3: Ban Phase =====
      await test.step('Ban Phase: Select 2 bans each', async () => {
        // Initially confirm should be disabled (0 bans)
        await expect(player1.locator(selectors.confirmBtnBanDisabled)).toBeVisible();

        // Select 1 ban - confirm still disabled
        await selectOpenings(player1, 1);
        await expect(player1.locator(selectors.confirmBtnBanDisabled)).toBeVisible();

        // Select 2nd ban - confirm enabled
        await selectOpenings(player1, 1);
        expect(await getSelectedCount(player1)).toBe(2);
        await expect(player1.locator(selectors.confirmBtnBan)).toBeVisible();

        // Player 2 also selects 2 bans
        await selectOpenings(player2, 2);
        expect(await getSelectedCount(player2)).toBe(2);

        // Screenshot: 2개 밴 선택 완료
        await test.info().attach('5-ban-selected-player1', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
        await test.info().attach('5-ban-selected-player2', {
          body: await player2.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });

      await test.step('Ban Phase: Both confirm and transition to RandomSelecting', async () => {
        // Both confirm
        await confirm(player1);
        await confirm(player2);

        // Should see opponent "Ready!" status
        await waitForOpponentStatus(player1, 'ready', 5000);
        await waitForOpponentStatus(player2, 'ready', 5000);

        // Screenshot: Ban Ready 상태
        await test.info().attach('6-ban-ready-player1', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        // Wait for RandomSelecting phase or game redirect
        const randomSelectingVisible = player1
          .locator(selectors.randomSelecting)
          .waitFor({ timeout: 10000 })
          .catch(() => false);
        const gameRedirect = player1
          .waitForURL(/\/[a-zA-Z0-9]{8,12}$/, { timeout: 10000 })
          .catch(() => false);

        await Promise.race([randomSelectingVisible, gameRedirect]);

        // Screenshot: RandomSelecting 상태 (오프닝 룰렛)
        await test.info().attach('6.5-random-selecting', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });

      // ===== STEP 4: Game Start =====
      await test.step('Game 1 starts successfully', async () => {
        // Wait for redirect to game page (URL may end with /white or /black)
        await player1.waitForURL(/\/[a-zA-Z0-9]{8,12}(\/white|\/black)?$/, { timeout: 15000 });
        await player2.waitForURL(/\/[a-zA-Z0-9]{8,12}(\/white|\/black)?$/, { timeout: 15000 });

        // Verify we're on a game page (should have board)
        await expect(player1.locator(gameSelectors.board)).toBeVisible({ timeout: 5000 });
        await expect(player2.locator(gameSelectors.board)).toBeVisible({ timeout: 5000 });

        // Screenshot: 게임 시작
        await test.info().attach('7-game1-started-player1', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
        await test.info().attach('7-game1-started-player2', {
          body: await player2.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });

      // ===== STEP 5: Both players make a move (required for resign) =====
      await test.step('Both players make one move each via Board API', async () => {
        // Resign requires bothPlayersHavePlayed (turns > 1)
        // So we need each player to make at least one move
        // Using Board API for reliability

        // Determine colors from URL
        const player1Url = player1.url();
        const player1Color: 'white' | 'black' = player1Url.endsWith('/white')
          ? 'white'
          : player1Url.endsWith('/black')
            ? 'black'
            : 'white'; // default assumption if no color in URL
        const player2Color: 'white' | 'black' = player1Color === 'white' ? 'black' : 'white';

        // Check whose turn it is from FEN (opening presets may start with black to move)
        const player1Turn = await isMyTurn(player1, pair.player1.username, player1Color);
        const player2Turn = await isMyTurn(player2, pair.player2.username, player2Color);

        // Make moves in correct order based on actual turn
        // After first move, reload other player's page to get fresh FEN (editor link doesn't update via WebSocket)
        if (player1Turn) {
          await makeAnyMove(player1, pair.player1.username);
          await player2.reload();
          await player2.waitForLoadState('networkidle');
          await makeAnyMove(player2, pair.player2.username);
        } else if (player2Turn) {
          await makeAnyMove(player2, pair.player2.username);
          await player1.reload();
          await player1.waitForLoadState('networkidle');
          await makeAnyMove(player1, pair.player1.username);
        } else {
          // Fallback: assume white (player1) moves first
          await makeAnyMove(player1, pair.player1.username);
          await player2.reload();
          await player2.waitForLoadState('networkidle');
          await makeAnyMove(player2, pair.player2.username);
        }

        await player1.waitForTimeout(500);

        // Screenshot: 양측 1수씩 둔 상태
        await test.info().attach('7.5-both-moved', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });

      // ===== STEP 6: Player 1 Resigns =====
      await test.step('Player 1 resigns Game 1', async () => {
        // Now resign should be available
        await resignGame(player1);

        // Screenshot: Game 1 종료 (Player 1 패배)
        await test.info().attach('8-game1-resigned-player1', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
        await test.info().attach('8-game1-resigned-player2', {
          body: await player2.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });

      // ===== STEP 7: Selecting Phase (Loser Selects) =====
      await test.step('Loser (Player 1) enters Selecting Phase', async () => {
        // Player 1 (loser) should be redirected to series pick page in Selecting phase
        // Player 2 (winner) should see waiting screen
        await waitForSeriesRedirect(player1, 20000);
        await waitForSeriesRedirect(player2, 20000);

        // Screenshot: Selecting Phase
        await test.info().attach('9-selecting-phase-player1', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
        await test.info().attach('9-selecting-phase-player2', {
          body: await player2.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        // Player 1 (loser) should see openings to select from
        // Player 2 (winner) should be in waiting mode
        const player1HasOpenings = await player1.locator(selectors.opening).count();
        expect(player1HasOpenings).toBeGreaterThan(0);
      });

      // ===== STEP 8: Loser Selects Next Opening =====
      await test.step('Loser selects next opening for Game 2', async () => {
        // Player 1 selects an opening for Game 2
        await selectNextOpening(player1, 0);

        // Screenshot: 오프닝 선택 완료
        await test.info().attach('10-opening-selected', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });

      // ===== STEP 9: Game 2 Starts =====
      await test.step('Game 2 starts successfully', async () => {
        // Wait for redirect to game page
        await waitForGamePage(player1, 15000);
        await waitForGamePage(player2, 15000);

        // Verify we're on a game page
        await expect(player1.locator(gameSelectors.board)).toBeVisible({ timeout: 5000 });
        await expect(player2.locator(gameSelectors.board)).toBeVisible({ timeout: 5000 });

        // Screenshot: Game 2 시작
        await test.info().attach('11-game2-started-player1', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
        await test.info().attach('11-game2-started-player2', {
          body: await player2.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });

      // ===== STEP 10: Both players make a move in Game 2 =====
      await test.step('Both players make one move each in Game 2', async () => {
        // Determine colors from URL
        const player1Url = player1.url();
        const player1Color: 'white' | 'black' = player1Url.endsWith('/white')
          ? 'white'
          : player1Url.endsWith('/black')
            ? 'black'
            : 'white';
        const player2Color: 'white' | 'black' = player1Color === 'white' ? 'black' : 'white';

        // Check whose turn it is
        const player1Turn = await isMyTurn(player1, pair.player1.username, player1Color);

        // Make moves in correct order
        if (player1Turn) {
          await makeAnyMove(player1, pair.player1.username);
          await makeAnyMove(player2, pair.player2.username);
        } else {
          await makeAnyMove(player2, pair.player2.username);
          await makeAnyMove(player1, pair.player1.username);
        }

        await player1.waitForTimeout(500);
      });

      // ===== STEP 11: Draw by agreement =====
      await test.step('Players agree to a draw in Game 2', async () => {
        // Both players send draw/yes via Board API - results in draw
        const draw1 = await sendDrawViaApi(player1, pair.player1.username);
        const draw2 = await sendDrawViaApi(player2, pair.player2.username);

        expect(draw1).toBe(true);
        expect(draw2).toBe(true);

        // Screenshot immediately after draw API call (before redirect)
        await test.info().attach('12-game2-draw-player1', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
        await test.info().attach('12-game2-draw-player2', {
          body: await player2.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });

      // ===== STEP 12: RandomSelecting Phase (after draw) =====
      await test.step('RandomSelecting phase after draw', async () => {
        // After draw, server sends redirect to /series/{id}/pick (RandomSelecting phase)
        // Then after 5-second countdown, redirects to game URL
        // We need to handle both cases: catching RandomSelecting OR already on game page

        // Wait for either series/pick URL or game URL
        const waitForPostDrawRedirect = async (page: typeof player1) => {
          await page.waitForURL(
            (url) => {
              const path = url.pathname;
              return /\/series\/\w+\/pick/.test(path) || /\/[a-zA-Z0-9]{8,12}(\/white|\/black)?$/.test(path);
            },
            { timeout: 20000 }
          );
        };

        await Promise.all([
          waitForPostDrawRedirect(player1),
          waitForPostDrawRedirect(player2),
        ]);

        // Check if we're on RandomSelecting page (might have already moved to game)
        const player1OnSeriesPage = player1.url().includes('/series/');
        const player2OnSeriesPage = player2.url().includes('/series/');

        // Screenshot whatever state we're in
        await test.info().attach('13-post-draw-player1', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
        await test.info().attach('13-post-draw-player2', {
          body: await player2.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        // If on series page, wait for RandomSelecting countdown to finish
        if (player1OnSeriesPage) {
          await waitForRandomSelecting(player1, 10000).catch(() => {});
        }
      });

      // ===== STEP 13: Game 3 Starts =====
      await test.step('Game 3 starts after random selection', async () => {
        // Wait for redirect to game page
        await waitForGamePage(player1, 15000);
        await waitForGamePage(player2, 15000);

        // Verify we're on a game page
        await expect(player1.locator(gameSelectors.board)).toBeVisible({ timeout: 5000 });
        await expect(player2.locator(gameSelectors.board)).toBeVisible({ timeout: 5000 });

        // Screenshot: Game 3 시작
        await test.info().attach('14-game3-started-player1', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
        await test.info().attach('14-game3-started-player2', {
          body: await player2.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ===== Ban Timeout (boris + david) =====
test.describe('Ban Timeout', () => {
  test.describe.configure({ timeout: 120000 });
  const pair = testPairs.banTimeout;
  const pairUsers = ['boris', 'david'];

  test.beforeAll(() => cleanupPairData(pairUsers));

  test('Server auto-fills @🟢pick:both-confirmed @🔴ban:one-confirmed-one-timeout', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      pair.player1,
      pair.player2
    );

    try {
      // ===== STEP 1: Create Series =====
      await test.step('Create series and reach Pick Phase', async () => {
        await loginBothPlayers(player1, player2, pair.player1, pair.player2);
        await createSeriesChallenge(player1, player2, pair.player2.username);
        await waitForPhase(player1, 'Pick Phase');
      });

      // ===== STEP 2: Complete Pick Phase normally =====
      await test.step('Pick Phase: Both players confirm', async () => {
        await selectOpenings(player1, 5);
        await selectOpenings(player2, 5);
        await confirm(player1);
        await confirm(player2);
        await waitForPhase(player1, 'Ban Phase', 10000);

        // Screenshot: Ban Phase 진입
        await test.info().attach('1-ban-phase-entered', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });

      // ===== STEP 3: Ban Phase - Player 1 confirms, Player 2 doesn't =====
      await test.step('Ban Phase: Player 1 confirms, Player 2 times out', async () => {
        // Player 1 selects and confirms bans
        await selectOpenings(player1, 2);
        await confirm(player1);

        // Screenshot: Player1 확정, Player2 대기 중
        await test.info().attach('2-player1-confirmed-player2-waiting', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
        await test.info().attach('2-player2-not-confirmed', {
          body: await player2.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        // Player 2 does nothing - server will auto-fill after timeout
        // Wait for either: RandomSelecting phase OR redirect to game
        const randomSelectingVisible = player1
          .locator(selectors.randomSelecting)
          .waitFor({ timeout: 20000 })
          .catch(() => false);
        const gameRedirect = player1
          .waitForURL(/\/[a-zA-Z0-9]{8,12}$/, { timeout: 20000 })
          .catch(() => false);
        const phaseChange = waitForPhase(player1, 'Random', 20000).catch(() => false);

        const result = await Promise.race([randomSelectingVisible, gameRedirect, phaseChange]);

        // Screenshot: 타임아웃 후 결과
        await test.info().attach('3-after-timeout', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        // Any of these outcomes indicates the timeout + auto-fill worked
        expect(result !== false || player1.url().match(/\/[a-zA-Z0-9]{8,12}$/)).toBeTruthy();
      });

      // ===== STEP 4: Game Start =====
      await test.step('Game starts after timeout', async () => {
        // Wait for redirect to game page
        await player1.waitForURL(/\/[a-zA-Z0-9]{8,12}(\/white|\/black)?$/, { timeout: 15000 });

        // Verify we're on a game page
        await expect(player1.locator('cg-board, .cg-board')).toBeVisible({ timeout: 5000 });

        // Screenshot: 게임 시작
        await test.info().attach('4-game-started', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ===== Disconnect Abort (yulia + luis) - SKIPPED =====
test.describe('Disconnect Abort', () => {
  const pair = testPairs.disconnect;
  const pairUsers = ['yulia', 'luis'];

  test.beforeAll(() => cleanupPairData(pairUsers));

  // TODO: WebSocket disconnect detection doesn't work reliably in headless mode
  test.skip('Series aborted @🟢pick:one-confirmed-one-disconnected', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      pair.player1,
      pair.player2
    );

    try {
      await loginBothPlayers(player1, player2, pair.player1, pair.player2);
      await createSeriesChallenge(player1, player2, pair.player2.username);
      await waitForPhase(player1, 'Pick Phase');

      // Player 1 confirms
      await selectOpenings(player1, 5);
      await confirm(player1);

      // Player 2 disconnects
      await player2Context.close();

      // Player 1 should see "Disconnected!" status
      await waitForOpponentStatus(player1, 'disconnected', 15000);

      // Series should be aborted
      await player1.waitForTimeout(10000);
      const aborted = player1.locator('text=aborted, text=Aborted');
      expect((await aborted.count()) > 0 || !player1.url().includes('/series/')).toBeTruthy();
    } finally {
      await player1Context?.close().catch(() => {});
    }
  });
});

// ===== Pick Timeout (mei + ivan) =====
test.describe('Pick Timeout', () => {
  test.describe.configure({ timeout: 120000 });
  const pair = testPairs.pickTimeout;
  const pairUsers = ['mei', 'ivan'];

  test.beforeAll(() => cleanupPairData(pairUsers));

  test('Server auto-fills all @🟢pick:both-partial-timeout @🔴ban:both-timeout', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      pair.player1,
      pair.player2
    );

    try {
      // ===== STEP 1: Create Series =====
      await test.step('Create series and reach Pick Phase', async () => {
        await loginBothPlayers(player1, player2, pair.player1, pair.player2);
        await createSeriesChallenge(player1, player2, pair.player2.username);
        await waitForPhase(player1, 'Pick Phase');
      });

      // ===== STEP 2: Pick Phase - Neither confirms =====
      await test.step('Pick Phase: Partial selection, no confirm, wait for timeout', async () => {
        // Select some but not all openings
        await selectOpenings(player1, 2);
        await selectOpenings(player2, 3);

        // Screenshot: 부분 선택 상태 (확정 안 함)
        await test.info().attach('1-partial-selection-player1', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
        await test.info().attach('1-partial-selection-player2', {
          body: await player2.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        // Don't confirm - wait for server-side timeout
        // After timeout: picks auto-filled → Ban Phase → (if no bans) ban timeout → Game
        const banPhaseReached = waitForPhase(player1, 'Ban Phase', 15000).catch(() => false);
        const gameStarted = player1
          .waitForURL(/\/[a-zA-Z0-9]{8,12}$/, { timeout: 15000 })
          .catch(() => false);
        const randomSelecting = waitForPhase(player1, 'Random', 15000).catch(() => false);

        const result = await Promise.race([banPhaseReached, gameStarted, randomSelecting]);

        // Screenshot: 타임아웃 후 결과
        await test.info().attach('2-after-timeout', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        expect(result !== false || player1.url().match(/\/[a-zA-Z0-9]{8,12}$/)).toBeTruthy();
      });

      // ===== STEP 3: Game Start =====
      await test.step('Game starts after timeout', async () => {
        // Wait for redirect to game page
        await player1.waitForURL(/\/[a-zA-Z0-9]{8,12}(\/white|\/black)?$/, { timeout: 20000 });

        // Verify we're on a game page
        await expect(player1.locator('cg-board, .cg-board')).toBeVisible({ timeout: 5000 });

        // Screenshot: 게임 시작
        await test.info().attach('3-game-started', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ===== Smoke Tests (ana + lola) =====
test.describe('Smoke Tests', () => {
  test.describe.configure({ mode: 'serial', timeout: 60000 });
  const pair = testPairs.smoke;
  const pairUsers = ['ana', 'lola'];

  test.beforeAll(() => cleanupPairData(pairUsers));

  test('Can login with test account', async ({ browser }) => {
    // Single player login test - just need to verify auth works
    const context = await browser.newContext({
      storageState: pair.player1.storageState,
    });
    const page = await context.newPage();

    try {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Verify login by checking for user menu
      await expect(page.locator('#user_tag')).toBeVisible({ timeout: 10000 });

      // Screenshot: 로그인 성공
      await test.info().attach('login-success', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    } finally {
      await context.close();
    }
  });

  test('Homepage loads correctly', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/lichess|chess/i);
  });
});
