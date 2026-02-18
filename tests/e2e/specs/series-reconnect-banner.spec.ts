import { test, expect } from '@playwright/test';
import { users, createTwoPlayerContexts, loginBothPlayers } from '../helpers/auth';
import { cleanupPairData } from '../helpers/cleanup';
import {
  createSeriesChallenge,
  selectOpenings,
  confirm,
  waitForPhase,
  waitForSnabbdomReady,
  type ScreenshotFn,
} from '../helpers/series';

/**
 * Series Reconnection Banner E2E Tests
 *
 * Verifies that when a player leaves a series (navigates away or browser closes),
 * returning to the home page shows a "Series in Progress" banner with a
 * "Return to Series" button that redirects back to the correct series page.
 *
 * | # | P1 | P2 | Phase | Action | Expected |
 * |---|----|----|-------|--------|----------|
 * | 26a | frances | emmanuel | Pick | P2 navigates to home | Banner visible, click returns to pick page |
 * | 26b | frances | emmanuel | Ban | P2 navigates to home | Banner visible, click returns to pick page |
 */

test.describe('Test 26: frances vs emmanuel (Reconnection banner)', () => {
  test.describe.configure({ timeout: 90000 });

  const pairUsers = ['frances', 'emmanuel'];
  test.beforeAll(() => cleanupPairData(pairUsers));

  test('[Test 26] Reconnection banner shows on home page during Pick/Ban phases', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      users.frances,
      users.emmanuel
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
        await loginBothPlayers(player1, player2, users.frances, users.emmanuel);
        seriesId = await createSeriesChallenge(player1, player2, 'emmanuel');
        await takeScreenshot('series-created-p1', player1);
        await takeScreenshot('series-created-p2', player2);
      });

      // Step 2: Verify banner during Pick phase
      await test.step('Pick phase: P2 navigates to home → banner visible', async () => {
        await waitForPhase(player1, 'Pick Phase');
        await waitForPhase(player2, 'Pick Phase');

        // P2 navigates to home page
        await player2.goto('/');
        await player2.waitForLoadState('networkidle');
        await takeScreenshot('p2-home-during-pick', player2);

        // Verify "Hang on!" banner is visible
        await expect(player2.locator('.lobby__nope')).toBeVisible({ timeout: 10000 });
        await expect(player2.locator('text="Hang on!"')).toBeVisible();
        await expect(player2.locator('text="A series is in progress with"')).toBeVisible();
        await expect(player2.locator('text="Return to Series"')).toBeVisible();
        await expect(player2.locator('text="Forfeit the Series"')).toBeVisible();

        await takeScreenshot('p2-banner-visible', player2);
      });

      // Step 3: Click "Return to Series" → verify redirect to pick page
      await test.step('Click "Return to Series" → returns to pick page', async () => {
        const returnBtn = player2.locator('a:has-text("Return to Series")');
        await expect(returnBtn).toBeVisible();
        await returnBtn.click();

        // Should redirect to /series/{id}/pick
        await player2.waitForURL(/\/series\/\w+\/pick/, { timeout: 10000 });
        await expect(player2.locator('main.series-pick')).toBeVisible({ timeout: 10000 });

        await takeScreenshot('p2-returned-to-pick', player2);

        // Verify it's the same series
        expect(player2.url()).toContain(seriesId);
      });

      // Step 4: Both confirm picks → transition to Ban phase
      await test.step('Both confirm picks → ban phase', async () => {
        await Promise.all([
          (async () => { await selectOpenings(player1, 5); await confirm(player1); })(),
          (async () => { await selectOpenings(player2, 5); await confirm(player2); })(),
        ]);

        await waitForPhase(player1, 'Ban Phase', 15000);
        await waitForPhase(player2, 'Ban Phase', 15000);

        await Promise.all([
          waitForSnabbdomReady(player1),
          waitForSnabbdomReady(player2),
        ]);

        await takeScreenshot('ban-phase-reached', player1);
      });

      // Step 5: Verify banner during Ban phase
      await test.step('Ban phase: P2 navigates to home → banner visible', async () => {
        // P2 navigates to home page during Ban phase
        await player2.goto('/');
        await player2.waitForLoadState('networkidle');
        await takeScreenshot('p2-home-during-ban', player2);

        // Verify banner is visible
        await expect(player2.locator('.lobby__nope')).toBeVisible({ timeout: 10000 });
        await expect(player2.locator('text="Hang on!"')).toBeVisible();
        await expect(player2.locator('text="Return to Series"')).toBeVisible();

        await takeScreenshot('p2-banner-during-ban', player2);
      });

      // Step 6: Click "Return to Series" during Ban phase
      await test.step('Click "Return to Series" during Ban → returns to pick page', async () => {
        const returnBtn = player2.locator('a:has-text("Return to Series")');
        await returnBtn.click();

        await player2.waitForURL(/\/series\/\w+\/pick/, { timeout: 10000 });
        await expect(player2.locator('main.series-pick')).toBeVisible({ timeout: 10000 });

        await takeScreenshot('p2-returned-to-ban', player2);

        expect(player2.url()).toContain(seriesId);
      });

    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});
