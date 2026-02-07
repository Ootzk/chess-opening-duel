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
  resignGame,
  sendDrawViaApi,
  waitForSeriesRedirect,
  selectNextOpening,
  waitForGamePage,
  waitForRandomSelecting,
  playOneGame,
  playBothMoves,
  isSeriesFinished,
  waitForNextGame,
  completeBanPickPhase,
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
  test.describe.configure({ timeout: 120000 }); // 120 seconds for full series completion
  const pair = testPairs.happyPath;
  const pairUsers = ['elena', 'hans'];

  test.beforeAll(() => cleanupPairData(pairUsers));

  test('Full series with comeback victory (2.5-1.5) @🟢pick:both-confirmed @🔴ban:both-confirmed @🎮game:resign→select→draw→random→resign→select→resign', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      pair.player1,
      pair.player2
    );

    let seriesId = '';

    try {
      // ===== STEP 1: Create Series =====
      await test.step('Create series and reach Pick Phase', async () => {
        await loginBothPlayers(player1, player2, pair.player1, pair.player2);
        seriesId = await createSeriesChallenge(player1, player2, pair.player2.username);
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
        await waitForOpponentStatus(player1, 'ready', 15000);
        await waitForOpponentStatus(player2, 'ready', 15000);

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
        await waitForOpponentStatus(player1, 'ready', 15000);
        await waitForOpponentStatus(player2, 'ready', 15000);

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
        // playBothMoves handles turn order automatically via API
        await playBothMoves(player1, player2, pair.player1.username, pair.player2.username);

        // Screenshot: 양측 1수씩 둔 상태
        await test.info().attach('7.5-both-moved', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });

      // ===== STEP 6: Player 1 Resigns =====
      await test.step('Player 1 resigns Game 1', async () => {
        // Resign via Board API
        const resigned = await resignGame(player1, pair.player1.username);
        expect(resigned).toBe(true);

        await player1.waitForTimeout(500);

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
        await playBothMoves(player1, player2, pair.player1.username, pair.player2.username);
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

      // ===== STEP 14: Game 3 - Player 2 Resigns =====
      // Score after: P1: 1.5, P2: 1.5 (P1 started 0.5 from draw, now +1 from win)
      await test.step('Game 3: Player 2 resigns (score: 1.5-1.5)', async () => {
        // Both players make one move
        await playBothMoves(player1, player2, pair.player1.username, pair.player2.username);

        // Player 2 resigns
        const resigned = await resignGame(player2, pair.player2.username);
        expect(resigned).toBe(true);

        await player1.waitForTimeout(500);

        // Screenshot: Game 3 종료
        await test.info().attach('15-game3-p2-resigned-player1', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });

      // ===== STEP 15: Selecting Phase (P2 lost → P2 selects) =====
      await test.step('Player 2 selects next opening for Game 4', async () => {
        // P2 lost, so P2 selects next opening
        await waitForSeriesRedirect(player2, 15000);

        // Screenshot: Selecting phase
        await test.info().attach('16-selecting-player2', {
          body: await player2.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        // Select first available opening
        await selectNextOpening(player2, 0);
      });

      // ===== STEP 16: Game 4 Starts =====
      await test.step('Game 4 starts', async () => {
        await waitForGamePage(player1, 15000);
        await waitForGamePage(player2, 15000);

        await expect(player1.locator(gameSelectors.board)).toBeVisible({ timeout: 5000 });

        // Screenshot: Game 4 시작
        await test.info().attach('17-game4-started-player1', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });

      // ===== STEP 17: Game 4 - Player 2 Resigns → Series End =====
      // Score after: P1: 2.5, P2: 1.5 → P1 WINS SERIES
      await test.step('Game 4: Player 2 resigns, series ends (score: 2.5-1.5)', async () => {
        // Both players make one move
        await playBothMoves(player1, player2, pair.player1.username, pair.player2.username);

        // Player 2 resigns - this should end the series
        const resigned = await resignGame(player2, pair.player2.username);
        expect(resigned).toBe(true);

        await player1.waitForTimeout(1000);

        // Screenshot: Series 종료
        await test.info().attach('18-series-finished-player1', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
        await test.info().attach('18-series-finished-player2', {
          body: await player2.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        // Verify series is finished (P1 has 2.5 points, P2 has 1.5 points)
        // Use Series API to check status directly
        const finished = await isSeriesFinished(player1, seriesId);
        expect(finished).toBe(true);
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

// ===== 3-0 Sweep Victory (yulia + luis) =====
test.describe('3-0 Sweep Victory', () => {
  test.describe.configure({ timeout: 90000 });
  const pair = testPairs.sweep;
  const pairUsers = ['yulia', 'luis'];

  test.beforeAll(() => cleanupPairData(pairUsers));

  /**
   * 3-0 스윕 테스트: 최단 시리즈 승리
   *
   * Game 1: P2 resign → P1: 1, P2: 0
   * Game 2: P2 resign → P1: 2, P2: 0
   * Game 3: P2 resign → P1: 3, P2: 0 (시리즈 종료)
   */
  test('P1 wins 3-0 sweep @🎮game:resign→select→resign→select→resign', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      pair.player1,
      pair.player2
    );

    let seriesId = '';
    let lastGameId = '';

    try {
      // ===== STEP 1: Create Series and Complete Ban/Pick =====
      await test.step('Create series and complete ban/pick', async () => {
        await loginBothPlayers(player1, player2, pair.player1, pair.player2);
        seriesId = await createSeriesChallenge(player1, player2, pair.player2.username);
        await completeBanPickPhase(player1, player2);

        await test.info().attach('01-game1-started', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });

      // ===== STEP 2: Game 1 - P2 resign =====
      await test.step('Game 1: P2 resigns (score: 1-0)', async () => {
        lastGameId = await playOneGame(player1, player2, pair.player1.username, pair.player2.username, 'p2-resign');

        await test.info().attach('02-game1-resigned', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        // Wait for next game (P2 lost → P2 selects)
        await waitForNextGame(player1, player2, null, lastGameId, 20000);
      });

      // ===== STEP 3: Game 2 - P2 resign =====
      await test.step('Game 2: P2 resigns (score: 2-0)', async () => {
        await test.info().attach('03-game2-started', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        lastGameId = await playOneGame(player1, player2, pair.player1.username, pair.player2.username, 'p2-resign');

        await test.info().attach('04-game2-resigned', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        // Wait for next game (P2 lost → P2 selects)
        await waitForNextGame(player1, player2, null, lastGameId, 20000);
      });

      // ===== STEP 4: Game 3 - P2 resign → Series End =====
      await test.step('Game 3: P2 resigns, series ends (score: 3-0)', async () => {
        await test.info().attach('05-game3-started', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        await playOneGame(player1, player2, pair.player1.username, pair.player2.username, 'p2-resign');

        await player1.waitForTimeout(1000);

        await test.info().attach('06-series-finished', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        // Verify series is finished (P1: 3, P2: 0) via Series API
        const finished = await isSeriesFinished(player1, seriesId);
        expect(finished).toBe(true);
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
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

// ===== Sudden Death Victory (ana + lola) =====
test.describe('Sudden Death Victory', () => {
  test.describe.configure({ timeout: 180000 }); // 180 seconds for 6 games
  const pair = testPairs.smoke;
  const pairUsers = ['ana', 'lola'];

  test.beforeAll(() => cleanupPairData(pairUsers));

  /**
   * Sudden Death Scenario:
   * - Game 1: P1 resign (0-1) → P1 selects from picks
   * - Game 2: P2 resign (1-1) → P2 selects from picks
   * - Game 3: P1 resign (1-2) → P1 selects from picks
   * - Game 4: P2 resign (2-2) → P2 selects from picks
   * - Game 5: Draw (2.5-2.5) → Uses ban pool (4 remaining)
   * - Game 6: P2 resign (3.5-2.5) → P1 wins series!
   *
   * This works because picks are used (not exhausted) and ban pool isn't depleted.
   */
  test('2.5-2.5 tie leads to sudden death game 6 @🎮game:alternating→draw→suddendeath', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      pair.player1,
      pair.player2
    );

    let seriesId = '';

    try {
      // ===== STEP 1: Create Series and Complete Ban/Pick =====
      await test.step('Create series and complete ban/pick', async () => {
        await loginBothPlayers(player1, player2, pair.player1, pair.player2);
        seriesId = await createSeriesChallenge(player1, player2, pair.player2.username);
        await completeBanPickPhase(player1, player2);

        await test.info().attach('01-game1-started', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });

      let lastGameId = '';

      // ===== STEP 2: Game 1 - P1 resign (0-1) =====
      await test.step('Game 1: P1 resigns (score: 0-1)', async () => {
        lastGameId = await playOneGame(player1, player2, pair.player1.username, pair.player2.username, 'p1-resign');

        await test.info().attach('02-game1-p1-resign', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        // P1 lost, so P1 selects next opening
        await waitForSeriesRedirect(player1, 15000);
        await selectNextOpening(player1, 0);
        await waitForGamePage(player1, 15000);
        await waitForGamePage(player2, 15000);
      });

      // ===== STEP 3: Game 2 - P2 resign (1-1) =====
      await test.step('Game 2: P2 resigns (score: 1-1)', async () => {
        lastGameId = await playOneGame(player1, player2, pair.player1.username, pair.player2.username, 'p2-resign');

        await test.info().attach('03-game2-p2-resign', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        // P2 lost, so P2 selects next opening
        await waitForSeriesRedirect(player2, 15000);
        await selectNextOpening(player2, 0);
        await waitForGamePage(player1, 15000);
        await waitForGamePage(player2, 15000);
      });

      // ===== STEP 4: Game 3 - P1 resign (1-2) =====
      await test.step('Game 3: P1 resigns (score: 1-2)', async () => {
        lastGameId = await playOneGame(player1, player2, pair.player1.username, pair.player2.username, 'p1-resign');

        await test.info().attach('04-game3-p1-resign', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        // P1 lost, so P1 selects
        await waitForSeriesRedirect(player1, 15000);
        await selectNextOpening(player1, 0);
        await waitForGamePage(player1, 15000);
        await waitForGamePage(player2, 15000);
      });

      // ===== STEP 5: Game 4 - P2 resign (2-2) =====
      await test.step('Game 4: P2 resigns (score: 2-2)', async () => {
        lastGameId = await playOneGame(player1, player2, pair.player1.username, pair.player2.username, 'p2-resign');

        await test.info().attach('05-game4-p2-resign', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        // P2 lost, so P2 selects
        await waitForSeriesRedirect(player2, 15000);
        await selectNextOpening(player2, 0);
        await waitForGamePage(player1, 15000);
        await waitForGamePage(player2, 15000);
      });

      // ===== STEP 6: Game 5 - Draw (2.5-2.5) =====
      await test.step('Game 5: Draw (score: 2.5-2.5)', async () => {
        lastGameId = await playOneGame(player1, player2, pair.player1.username, pair.player2.username, 'draw');

        await test.info().attach('06-game5-draw', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        // At 2.5-2.5 tie, series continues with sudden death
        // Wait for next game (draw triggers RandomSelecting from ban pool)
        await waitForNextGame(player1, player2, null, lastGameId, 25000);
      });

      // ===== STEP 7: Game 6 - P2 resign → Series End =====
      await test.step('Game 6: P2 resigns, series ends (score: 3.5-2.5)', async () => {
        await test.info().attach('07-game6-started', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        await playOneGame(player1, player2, pair.player1.username, pair.player2.username, 'p2-resign');

        await player1.waitForTimeout(1000);

        await test.info().attach('08-series-finished', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        // Verify series is finished (P1: 3.5, P2: 2.5) via Series API
        const finished = await isSeriesFinished(player1, seriesId);
        expect(finished).toBe(true);
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ===== 3-2 Dramatic Comeback (carlos + nina) =====
test.describe('3-2 Dramatic Comeback', () => {
  test.describe.configure({ timeout: 150000 });
  const pair = testPairs.comeback;
  const pairUsers = ['carlos', 'nina'];

  test.beforeAll(() => cleanupPairData(pairUsers));

  /**
   * 드라마틱 역전승 테스트: 0-2에서 3연승으로 역전
   *
   * Game 1: P1 resign → P1: 0, P2: 1
   * Game 2: P1 resign → P1: 0, P2: 2
   * Game 3: P2 resign → P1: 1, P2: 2
   * Game 4: P2 resign → P1: 2, P2: 2
   * Game 5: P2 resign → P1: 3, P2: 2 (시리즈 종료)
   */
  test('P1 comes back from 0-2 to win 3-2 @🎮game:resign×5', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      pair.player1,
      pair.player2
    );

    let seriesId = '';
    let lastGameId = '';

    try {
      // ===== STEP 1: Create Series and Complete Ban/Pick =====
      await test.step('Create series and complete ban/pick', async () => {
        await loginBothPlayers(player1, player2, pair.player1, pair.player2);
        seriesId = await createSeriesChallenge(player1, player2, pair.player2.username);
        await completeBanPickPhase(player1, player2);

        await test.info().attach('01-game1-started', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });

      // ===== STEP 2: Game 1 - P1 resign (0-1) =====
      await test.step('Game 1: P1 resigns (score: 0-1)', async () => {
        lastGameId = await playOneGame(player1, player2, pair.player1.username, pair.player2.username, 'p1-resign');

        // P1 lost → P1 selects next opening
        await waitForSeriesRedirect(player1, 15000);
        await selectNextOpening(player1, 0);
        await waitForGamePage(player1, 15000);
        await waitForGamePage(player2, 15000);
      });

      // ===== STEP 3: Game 2 - P1 resign (0-2) =====
      await test.step('Game 2: P1 resigns (score: 0-2)', async () => {
        lastGameId = await playOneGame(player1, player2, pair.player1.username, pair.player2.username, 'p1-resign');

        await test.info().attach('02-game2-0-2', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        // P1 lost → P1 selects next opening
        await waitForSeriesRedirect(player1, 15000);
        await selectNextOpening(player1, 0);
        await waitForGamePage(player1, 15000);
        await waitForGamePage(player2, 15000);
      });

      // ===== STEP 4: Game 3 - P2 resign (1-2) =====
      await test.step('Game 3: P2 resigns (score: 1-2)', async () => {
        lastGameId = await playOneGame(player1, player2, pair.player1.username, pair.player2.username, 'p2-resign');

        // P2 lost → P2 selects
        await waitForNextGame(player1, player2, null, lastGameId, 20000);
      });

      // ===== STEP 5: Game 4 - P2 resign (2-2) =====
      await test.step('Game 4: P2 resigns (score: 2-2)', async () => {
        await test.info().attach('03-game4-tied', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        lastGameId = await playOneGame(player1, player2, pair.player1.username, pair.player2.username, 'p2-resign');

        // P2 lost → P2 selects
        await waitForNextGame(player1, player2, null, lastGameId, 20000);
      });

      // ===== STEP 6: Game 5 - P2 resign → Series End (3-2) =====
      await test.step('Game 5: P2 resigns, P1 wins 3-2', async () => {
        await test.info().attach('04-game5-started', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        await playOneGame(player1, player2, pair.player1.username, pair.player2.username, 'p2-resign');

        await player1.waitForTimeout(1000);

        await test.info().attach('05-series-finished-3-2', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        // Verify series is finished (P1: 3, P2: 2)
        const finished = await isSeriesFinished(player1, seriesId);
        expect(finished).toBe(true);
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ===== 2.5-0.5 Early Win (oscar + petra) =====
test.describe('2.5-0.5 Early Win', () => {
  test.describe.configure({ timeout: 90000 });
  const pair = testPairs.earlyWin;
  const pairUsers = ['oscar', 'petra'];

  test.beforeAll(() => cleanupPairData(pairUsers));

  /**
   * 조기 승리 테스트: 2승 1무로 최소 게임 승리
   *
   * Game 1: P2 resign → P1: 1, P2: 0
   * Game 2: Draw      → P1: 1.5, P2: 0.5
   * Game 3: P2 resign → P1: 2.5, P2: 0.5 (시리즈 종료)
   */
  test('P1 wins 2.5-0.5 with early finish @🎮game:resign→draw→resign', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      pair.player1,
      pair.player2
    );

    let seriesId = '';
    let lastGameId = '';

    try {
      // ===== STEP 1: Create Series and Complete Ban/Pick =====
      await test.step('Create series and complete ban/pick', async () => {
        await loginBothPlayers(player1, player2, pair.player1, pair.player2);
        seriesId = await createSeriesChallenge(player1, player2, pair.player2.username);
        await completeBanPickPhase(player1, player2);

        await test.info().attach('01-game1-started', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      });

      // ===== STEP 2: Game 1 - P2 resign (1-0) =====
      await test.step('Game 1: P2 resigns (score: 1-0)', async () => {
        lastGameId = await playOneGame(player1, player2, pair.player1.username, pair.player2.username, 'p2-resign');

        await test.info().attach('02-game1-resigned', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        // P2 lost → P2 selects
        await waitForNextGame(player1, player2, null, lastGameId, 20000);
      });

      // ===== STEP 3: Game 2 - Draw (1.5-0.5) =====
      await test.step('Game 2: Draw (score: 1.5-0.5)', async () => {
        await test.info().attach('03-game2-started', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        lastGameId = await playOneGame(player1, player2, pair.player1.username, pair.player2.username, 'draw');

        await test.info().attach('04-game2-draw', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        // Draw → RandomSelecting from ban pool
        await waitForNextGame(player1, player2, null, lastGameId, 25000);
      });

      // ===== STEP 4: Game 3 - P2 resign → Series End (2.5-0.5) =====
      await test.step('Game 3: P2 resigns, series ends (score: 2.5-0.5)', async () => {
        await test.info().attach('05-game3-started', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        await playOneGame(player1, player2, pair.player1.username, pair.player2.username, 'p2-resign');

        await player1.waitForTimeout(1000);

        await test.info().attach('06-series-finished-early', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });

        // Verify series is finished (P1: 2.5, P2: 0.5)
        const finished = await isSeriesFinished(player1, seriesId);
        expect(finished).toBe(true);
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});
