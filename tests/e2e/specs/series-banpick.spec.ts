import { test, expect } from '@playwright/test';
import { users, createTwoPlayerContexts, loginBothPlayers } from '../helpers/auth';
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
 * PR #24 Test Plan:
 * - [ ] Pick phase: Select 5 openings → Confirm enabled
 * - [ ] Pick phase: Timeout → Random fill + auto-confirm
 * - [ ] Ban phase: Select 2 bans → Confirm enabled
 * - [ ] Ban phase: Timeout → Random fill + auto-confirm
 * - [ ] Both confirm → 3-second delay → Phase transition
 * - [ ] Cancel during 3-second wait → Re-select and confirm
 * - [ ] Opponent disconnect → "Your opponent is Disconnected!" → Series abort
 */

test.describe('Series Ban/Pick - PR #24 Test Plan', () => {
  test.describe.configure({ mode: 'serial' });

  test('Pick phase: Select 5 openings → Confirm enabled', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(browser);

    try {
      await loginBothPlayers(player1, player2, users.lichess, users.mary);

      // Create series through challenge flow
      await createSeriesChallenge(player1, player2, users.mary.username);

      // Wait for Pick Phase
      await waitForPhase(player1, 'Pick Phase');

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
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });

  test('Pick phase: Timeout → Random fill + auto-confirm', async ({ browser }) => {
    // This test requires 30+ second wait for timeout
    test.slow(); // Mark as slow test (3x timeout)

    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(browser);

    try {
      await loginBothPlayers(player1, player2, users.lichess, users.mary);

      // Create series
      await createSeriesChallenge(player1, player2, users.mary.username);

      await waitForPhase(player1, 'Pick Phase');

      // Select only 2 openings (less than required 5)
      await selectOpenings(player1, 2);
      await selectOpenings(player2, 3);

      // Wait for 30 second timeout + buffer
      await player1.waitForTimeout(32000);

      // Should auto-transition to Ban Phase (server fills random picks)
      await waitForPhase(player1, 'Ban Phase', 5000);
      await waitForPhase(player2, 'Ban Phase', 5000);
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });

  test('Ban phase: Select 2 bans → Confirm enabled', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(browser);

    try {
      await loginBothPlayers(player1, player2, users.lichess, users.mary);

      // Create series
      await createSeriesChallenge(player1, player2, users.mary.username);

      // Complete pick phase first
      await waitForPhase(player1, 'Pick Phase');
      await selectOpenings(player1, 5);
      await selectOpenings(player2, 5);
      await confirm(player1);
      await confirm(player2);

      // Wait for phase transition (3 second delay after both confirm)
      await waitForPhase(player1, 'Ban Phase', 10000);

      // Initially confirm should be disabled (0 bans)
      await expect(player1.locator(selectors.confirmBtnBanDisabled)).toBeVisible();

      // Select 1 ban - confirm still disabled
      await selectOpenings(player1, 1);
      await expect(player1.locator(selectors.confirmBtnBanDisabled)).toBeVisible();

      // Select 2nd ban - confirm enabled
      await selectOpenings(player1, 1);
      expect(await getSelectedCount(player1)).toBe(2);
      await expect(player1.locator(selectors.confirmBtnBan)).toBeVisible();
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });

  test('Ban phase: Timeout → Random fill + auto-confirm', async ({ browser }) => {
    // This test requires 30+ second wait for timeout
    test.slow(); // Mark as slow test (3x timeout)

    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(browser);

    try {
      await loginBothPlayers(player1, player2, users.lichess, users.mary);

      // Create series
      await createSeriesChallenge(player1, player2, users.mary.username);

      // Complete pick phase first
      await waitForPhase(player1, 'Pick Phase');
      await selectOpenings(player1, 5);
      await selectOpenings(player2, 5);
      await confirm(player1);
      await confirm(player2);

      // Wait for Ban Phase
      await waitForPhase(player1, 'Ban Phase', 10000);

      // Player1 confirms with 2 bans
      await selectOpenings(player1, 2);
      await confirm(player1);

      // Player2 doesn't do anything - wait for 30 second timeout
      await player1.waitForTimeout(32000);

      // Should auto-transition to game (RandomSelecting)
      await expect(player1.locator(selectors.randomSelecting)).toBeVisible({ timeout: 10000 });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });

  test('Both confirm → 3-second delay → Phase transition', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(browser);

    try {
      await loginBothPlayers(player1, player2, users.lichess, users.mary);

      // Create series
      await createSeriesChallenge(player1, player2, users.mary.username);

      await waitForPhase(player1, 'Pick Phase');

      // Both select 5 and confirm
      await selectOpenings(player1, 5);
      await selectOpenings(player2, 5);

      await confirm(player1);
      await confirm(player2);

      // Should see opponent "Ready!" status on both sides
      await waitForOpponentStatus(player1, 'ready', 5000);
      await waitForOpponentStatus(player2, 'ready', 5000);

      // Wait 3 seconds for phase transition + buffer
      await player1.waitForTimeout(4000);

      // Should be in Ban Phase
      await waitForPhase(player1, 'Ban Phase');
      await waitForPhase(player2, 'Ban Phase');
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });

  test('Cancel during 3-second wait → Re-select and confirm', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(browser);

    try {
      await loginBothPlayers(player1, player2, users.lichess, users.mary);

      // Create series
      await createSeriesChallenge(player1, player2, users.mary.username);

      await waitForPhase(player1, 'Pick Phase');

      // Both select 5 and confirm
      await selectOpenings(player1, 5);
      await selectOpenings(player2, 5);

      await confirm(player1);
      await confirm(player2);

      // Wait 1 second, then player1 cancels
      await player1.waitForTimeout(1000);
      await player1.click(selectors.cancelBtn);

      // Player1 should be able to change selection (cards not disabled)
      const openingCards = player1.locator(selectors.opening);
      await expect(openingCards.first()).not.toHaveClass(/disabled/);

      // Player1 deselects one and selects another
      await player1.locator(selectors.openingSelected).first().click();
      await selectOpenings(player1, 1);

      // Confirm again
      await confirm(player1);

      // Should eventually transition to Ban Phase (after 3-second delay)
      await waitForPhase(player1, 'Ban Phase', 10000);
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });

  test('Opponent disconnect → "Disconnected!" → Series abort', async ({ browser }) => {
    // This test requires waiting for disconnect detection + timeout
    test.slow(); // Mark as slow test (3x timeout)

    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(browser);

    try {
      await loginBothPlayers(player1, player2, users.lichess, users.mary);

      // Create series
      await createSeriesChallenge(player1, player2, users.mary.username);

      await waitForPhase(player1, 'Pick Phase');

      // Player1 confirms
      await selectOpenings(player1, 5);
      await confirm(player1);

      // Simulate Player2 disconnect by closing the context
      await player2Context.close();

      // Wait for disconnect detection (polling interval ~3 seconds)
      await player1.waitForTimeout(5000);

      // Player1 should see "Disconnected!" status
      await waitForOpponentStatus(player1, 'disconnected', 10000);

      // Wait for timeout and series abort (30 second phase timeout)
      await player1.waitForTimeout(32000);

      // Should show abort message or redirect
      // Check for abort notification or redirect to lobby
      const aborted = player1.locator('text=aborted, text=Aborted, .series-pick__aborted');
      const redirected = await player1.url().includes('/lobby') || !player1.url().includes('/series/');

      expect(await aborted.count() > 0 || redirected).toBeTruthy();
    } finally {
      await player1Context?.close().catch(() => {});
      // player2Context already closed
    }
  });
});

test.describe('Series Ban/Pick - Quick Smoke Tests', () => {
  test('Can login with test accounts', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(browser);

    try {
      await loginBothPlayers(player1, player2, users.lichess, users.mary);

      // Verify login by checking for user menu or username
      await expect(player1.locator('#user_tag, .user-link')).toBeVisible({ timeout: 10000 });
      await expect(player2.locator('#user_tag, .user-link')).toBeVisible({ timeout: 10000 });
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
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(browser);

    try {
      await loginBothPlayers(player1, player2, users.lichess, users.mary);

      // Create series
      const seriesId = await createSeriesChallenge(player1, player2, users.mary.username);

      // Verify both are on pick page
      expect(seriesId).toBeTruthy();
      await expect(player1.locator(selectors.seriesPick)).toBeVisible();
      await expect(player2.locator(selectors.seriesPick)).toBeVisible();

      // Verify Pick Phase is active
      await waitForPhase(player1, 'Pick Phase');
      await waitForPhase(player2, 'Pick Phase');
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});
