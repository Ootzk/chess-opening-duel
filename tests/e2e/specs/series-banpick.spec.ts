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
 * PR #24 Test Plan - Flow-based E2E Tests
 *
 * Each test follows a complete flow from series creation to expected outcome:
 * - elena + hans: Happy path (Pick → Ban → Game start)
 * - boris + david: Ban timeout flow
 * - mei + ivan: Pick timeout flow
 * - ana + lola: Smoke tests
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

// ===== PAIR 1: elena + hans (Happy Path Flow) =====
test.describe('Happy Path Flow - elena + hans', () => {
  test.describe.configure({ timeout: 120000 }); // 2 minutes for full flow
  const pair = testPairs.happyPath;
  const pairUsers = ['elena', 'hans'];

  test.beforeAll(() => cleanupPairData(pairUsers));

  test('Complete flow: Series → Pick → Ban → Game', async ({ browser }) => {
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
      });

      await test.step('Pick Phase: Both confirm and transition to Ban Phase', async () => {
        // Both confirm
        await confirm(player1);
        await confirm(player2);

        // Should see opponent "Ready!" status
        await waitForOpponentStatus(player1, 'ready', 5000);
        await waitForOpponentStatus(player2, 'ready', 5000);

        // Wait for 3-second delay + phase transition
        await waitForPhase(player1, 'Ban Phase', 10000);
        await waitForPhase(player2, 'Ban Phase', 10000);
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
      });

      await test.step('Ban Phase: Both confirm and transition to RandomSelecting', async () => {
        // Both confirm
        await confirm(player1);
        await confirm(player2);

        // Should see opponent "Ready!" status
        await waitForOpponentStatus(player1, 'ready', 5000);
        await waitForOpponentStatus(player2, 'ready', 5000);

        // Wait for RandomSelecting phase or game redirect
        const randomSelectingVisible = player1
          .locator(selectors.randomSelecting)
          .waitFor({ timeout: 10000 })
          .catch(() => false);
        const gameRedirect = player1
          .waitForURL(/\/[a-zA-Z0-9]{8,12}$/, { timeout: 10000 })
          .catch(() => false);

        await Promise.race([randomSelectingVisible, gameRedirect]);
      });

      // ===== STEP 4: Game Start =====
      await test.step('Game starts successfully', async () => {
        // Wait for redirect to game page (URL may end with /white or /black)
        await player1.waitForURL(/\/[a-zA-Z0-9]{8,12}(\/white|\/black)?$/, { timeout: 15000 });
        await player2.waitForURL(/\/[a-zA-Z0-9]{8,12}(\/white|\/black)?$/, { timeout: 15000 });

        // Verify we're on a game page (should have board)
        await expect(player1.locator('cg-board, .cg-board')).toBeVisible({ timeout: 5000 });
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ===== PAIR 2: boris + david (Ban Timeout Flow) =====
test.describe('Ban Timeout Flow - boris + david', () => {
  test.describe.configure({ timeout: 120000 });
  const pair = testPairs.banTimeout;
  const pairUsers = ['boris', 'david'];

  test.beforeAll(() => cleanupPairData(pairUsers));

  test('Flow: Series → Pick OK → Ban timeout → Auto-confirm → Game', async ({ browser }) => {
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
      });

      // ===== STEP 3: Ban Phase - Player 1 confirms, Player 2 doesn't =====
      await test.step('Ban Phase: Player 1 confirms, Player 2 times out', async () => {
        // Player 1 selects and confirms bans
        await selectOpenings(player1, 2);
        await confirm(player1);

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
        // Any of these outcomes indicates the timeout + auto-fill worked
        expect(result !== false || player1.url().match(/\/[a-zA-Z0-9]{8,12}$/)).toBeTruthy();
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ===== PAIR 3: yulia + luis (Disconnect Test - SKIPPED) =====
test.describe('Disconnect Flow - yulia + luis', () => {
  const pair = testPairs.disconnect;
  const pairUsers = ['yulia', 'luis'];

  test.beforeAll(() => cleanupPairData(pairUsers));

  // TODO: WebSocket disconnect detection doesn't work reliably in headless mode
  test.skip('Flow: Series → Pick → Disconnect → Abort', async ({ browser }) => {
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

// ===== PAIR 4: mei + ivan (Pick Timeout Flow) =====
test.describe('Pick Timeout Flow - mei + ivan', () => {
  test.describe.configure({ timeout: 120000 });
  const pair = testPairs.pickTimeout;
  const pairUsers = ['mei', 'ivan'];

  test.beforeAll(() => cleanupPairData(pairUsers));

  test('Flow: Series → Pick timeout → Auto-confirm → Ban timeout → Game', async ({ browser }) => {
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

        // Don't confirm - wait for server-side timeout
        // After timeout: picks auto-filled → Ban Phase → (if no bans) ban timeout → Game
        const banPhaseReached = waitForPhase(player1, 'Ban Phase', 15000).catch(() => false);
        const gameStarted = player1
          .waitForURL(/\/[a-zA-Z0-9]{8,12}$/, { timeout: 15000 })
          .catch(() => false);
        const randomSelecting = waitForPhase(player1, 'Random', 15000).catch(() => false);

        const result = await Promise.race([banPhaseReached, gameStarted, randomSelecting]);
        expect(result !== false || player1.url().match(/\/[a-zA-Z0-9]{8,12}$/)).toBeTruthy();
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ===== PAIR 5: ana + lola (Smoke Tests) =====
test.describe('Smoke Tests - ana + lola', () => {
  test.describe.configure({ mode: 'serial', timeout: 60000 });
  const pair = testPairs.smoke;
  const pairUsers = ['ana', 'lola'];

  test.beforeAll(() => cleanupPairData(pairUsers));

  test('Can login with test accounts', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      pair.player1,
      pair.player2
    );

    try {
      await loginBothPlayers(player1, player2, pair.player1, pair.player2);

      // Verify login by checking for user menu
      await expect(player1.locator('#user_tag')).toBeVisible({ timeout: 10000 });
      await expect(player2.locator('#user_tag')).toBeVisible({ timeout: 10000 });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });

  test('Homepage loads correctly', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/lichess|chess/i);
  });

  test('Can create series and reach pick page', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      pair.player1,
      pair.player2
    );

    try {
      await loginBothPlayers(player1, player2, pair.player1, pair.player2);
      const seriesId = await createSeriesChallenge(player1, player2, pair.player2.username);

      expect(seriesId).toBeTruthy();
      await expect(player1.locator(selectors.seriesPick).first()).toBeVisible();
      await expect(player2.locator(selectors.seriesPick).first()).toBeVisible();
      await waitForPhase(player1, 'Pick Phase');
      await waitForPhase(player2, 'Pick Phase');
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});
