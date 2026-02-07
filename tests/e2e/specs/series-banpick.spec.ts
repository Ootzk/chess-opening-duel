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
} from '../helpers/series';

/**
 * Series Ban/Pick E2E Tests
 *
 * Tags describe phase outcomes:
 *   @🟢pick:{state} - Pick phase (green)
 *   @🔴ban:{state}  - Ban phase (red)
 *
 * States:
 *   both-confirmed          - Both players confirmed
 *   one-confirmed-one-timeout - One confirmed, other timed out
 *   both-partial-timeout    - Both partially selected, then timed out
 *   both-timeout            - Neither confirmed, server auto-filled
 *   one-confirmed-one-disconnected - One confirmed, other disconnected
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
  test.describe.configure({ timeout: 120000 }); // 2 minutes for full flow
  const pair = testPairs.happyPath;
  const pairUsers = ['elena', 'hans'];

  test.beforeAll(() => cleanupPairData(pairUsers));

  test('Game starts @🟢pick:both-confirmed @🔴ban:both-confirmed', async ({ browser }) => {
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
      await test.step('Game starts successfully', async () => {
        // Wait for redirect to game page (URL may end with /white or /black)
        await player1.waitForURL(/\/[a-zA-Z0-9]{8,12}(\/white|\/black)?$/, { timeout: 15000 });
        await player2.waitForURL(/\/[a-zA-Z0-9]{8,12}(\/white|\/black)?$/, { timeout: 15000 });

        // Verify we're on a game page (should have board)
        await expect(player1.locator('cg-board, .cg-board')).toBeVisible({ timeout: 5000 });

        // Screenshot: 게임 시작
        await test.info().attach('7-game-started-player1', {
          body: await player1.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
        await test.info().attach('7-game-started-player2', {
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
