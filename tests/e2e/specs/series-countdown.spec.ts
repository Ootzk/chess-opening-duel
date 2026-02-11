import { test, expect } from '@playwright/test';
import { createTwoPlayerContexts, loginBothPlayers, users } from '../helpers/auth';
import { cleanupPairData } from '../helpers/cleanup';
import {
  createSeriesChallenge,
  selectOpenings,
  confirm,
  cancel,
  waitForPhase,
  waitForSnabbdomReady,
  waitForCountdownText,
  getCountdownText,
  parseCountdownSeconds,
  waitForCountdownGone,
  verifyCountdownDecrements,
  waitForRandomSelecting,
  waitForGamePage,
  selectors,
  type ScreenshotFn,
} from '../helpers/series';
import { verifyOpeningsTab } from '../helpers/openings-tab';

/**
 * Series Countdown E2E Tests
 *
 * Tests the 3-second countdown timer that appears after both players confirm
 * in pick/ban phases, and when the selecting player confirms.
 *
 * Test 1 (mary vs jose): Countdown appears and decrements in pick/ban phases
 * Test 2 (iryna vs pedro): Countdown cancel + re-confirm behavior
 */

// ===== Test 1: Countdown appears and decrements =====
test.describe('Test 1: Countdown appears in pick/ban phases (mary vs jose)', () => {
  test.describe.configure({ timeout: 90000 });

  const pairUsers = ['mary', 'jose'];
  test.beforeAll(() => cleanupPairData(pairUsers));

  test('Both confirm → countdown text appears and decrements → phase transitions', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      users.mary,
      users.jose,
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

    try {
      // ===== STEP 1: Create Series =====
      let seriesId = '';
      await test.step('Create series', async () => {
        await loginBothPlayers(player1, player2, users.mary, users.jose);
        seriesId = await createSeriesChallenge(player1, player2, 'jose');
        await takeScreenshot('series-created', player1);
      });

      // ===== STEP 2: Pick Phase - Both confirm → countdown =====
      await test.step('Pick phase: both confirm → countdown appears', async () => {
        await waitForPhase(player1, 'Pick Phase');
        await waitForPhase(player2, 'Pick Phase');

        // Both select 5 openings
        await Promise.all([selectOpenings(player1, 5), selectOpenings(player2, 5)]);

        // P1 confirms first
        await confirm(player1);
        await takeScreenshot('pick-p1-confirmed', player1);

        // No countdown yet (only one confirmed)
        const p1TextBefore = await getCountdownText(player1);
        expect(p1TextBefore).toBeNull();

        // P2 confirms → both confirmed → countdown should appear on BOTH sides
        await confirm(player2);

        // Wait for countdown text on both players
        const [p1Text, p2Text] = await Promise.all([
          waitForCountdownText(player1, 5000),
          waitForCountdownText(player2, 5000),
        ]);

        // Verify text format: "Ban phase starting in N..." (pick → ban transition)
        expect(p1Text).toMatch(/Ban phase starting in \d+\.\.\./);
        expect(p2Text).toMatch(/Ban phase starting in \d+\.\.\./);

        await takeScreenshot('pick-countdown-p1', player1);
        await takeScreenshot('pick-countdown-p2', player2);

        // Verify countdown decrements on at least one side
        const { initial, after } = await verifyCountdownDecrements(player1);
        expect(after).toBeLessThan(initial);

        await takeScreenshot('pick-countdown-decremented', player1);
      });

      // ===== STEP 3: Wait for Ban Phase =====
      await test.step('Phase transitions to Ban after countdown', async () => {
        await waitForPhase(player1, 'Ban Phase', 15000);
        await waitForPhase(player2, 'Ban Phase', 15000);

        // Countdown text should be gone after phase transition
        await waitForCountdownGone(player1, 5000);
        await waitForCountdownGone(player2, 5000);

        await Promise.all([waitForSnabbdomReady(player1), waitForSnabbdomReady(player2)]);
        await takeScreenshot('ban-phase-reached', player1);
      });

      // ===== STEP 4: Ban Phase - Both confirm → countdown =====
      await test.step('Ban phase: both confirm → countdown appears', async () => {
        // Both select 2 bans
        await Promise.all([selectOpenings(player1, 2), selectOpenings(player2, 2)]);

        // Both confirm
        await confirm(player1);
        await confirm(player2);

        // Countdown should appear
        const [banP1Text, banP2Text] = await Promise.all([
          waitForCountdownText(player1, 5000),
          waitForCountdownText(player2, 5000),
        ]);

        expect(banP1Text).toMatch(/Game 1 starting in \d+\.\.\./);
        expect(banP2Text).toMatch(/Game 1 starting in \d+\.\.\./);

        await takeScreenshot('ban-countdown-p1', player1);
        await takeScreenshot('ban-countdown-p2', player2);
      });

      // ===== STEP 5: Game starts after countdown =====
      await test.step('Game starts after ban countdown', async () => {
        // Wait for RandomSelecting or game page
        const reachedRS = await waitForRandomSelecting(player1, 15000)
          .then(() => true)
          .catch(() => false);
        if (reachedRS) {
          await takeScreenshot('random-selecting', player1);
        }

        await waitForGamePage(player1, 30000);
        await waitForGamePage(player2, 30000);
        await takeScreenshot('game-started', player1);
      });

      // ===== STEP 6: Verify Openings tab =====
      await test.step('Verify Openings tab for both players', async () => {
        await Promise.all([
          verifyOpeningsTab(player1, seriesId, 'mary', takeScreenshot, 1),
          verifyOpeningsTab(player2, seriesId, 'jose', takeScreenshot, 1),
        ]);
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});

// ===== Test 2: Countdown cancel behavior =====
test.describe('Test 2: Countdown cancel + re-confirm (iryna vs pedro)', () => {
  test.describe.configure({ timeout: 90000 });

  const pairUsers = ['iryna', 'pedro'];
  test.beforeAll(() => cleanupPairData(pairUsers));

  test('Cancel during countdown → text disappears → re-confirm → countdown restarts', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
      browser,
      users.iryna,
      users.pedro,
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

    try {
      // ===== STEP 1: Create Series =====
      let seriesId = '';
      await test.step('Create series', async () => {
        await loginBothPlayers(player1, player2, users.iryna, users.pedro);
        seriesId = await createSeriesChallenge(player1, player2, 'pedro');
        await takeScreenshot('series-created', player1);
      });

      // ===== STEP 2: Both confirm → countdown appears =====
      await test.step('Pick phase: both confirm → countdown appears', async () => {
        await waitForPhase(player1, 'Pick Phase');
        await waitForPhase(player2, 'Pick Phase');

        await Promise.all([selectOpenings(player1, 5), selectOpenings(player2, 5)]);

        // Confirm sequentially to avoid race condition
        await confirm(player1);
        await confirm(player2);

        // Wait for countdown on both sides
        await waitForCountdownText(player1, 5000);
        await waitForCountdownText(player2, 5000);

        await takeScreenshot('countdown-both-visible', player1);
      });

      // ===== STEP 3: P1 cancels → countdown disappears =====
      await test.step('P1 cancels → countdown disappears on P1', async () => {
        // Verify Cancel button is visible during countdown
        const cancelBtn = player1.locator(selectors.cancelBtn);
        await expect(cancelBtn).toBeVisible({ timeout: 3000 });

        // P1 cancels
        await cancel(player1);
        await takeScreenshot('p1-cancelled', player1);

        // P1 countdown should disappear
        await waitForCountdownGone(player1, 5000);

        // P1 should see the confirm button again (not countdown text)
        const p1CountdownAfterCancel = await getCountdownText(player1);
        expect(p1CountdownAfterCancel).toBeNull();

        // P2 countdown should also disappear (opponent cancelled)
        await waitForCountdownGone(player2, 5000);

        await takeScreenshot('countdown-gone-p1', player1);
        await takeScreenshot('countdown-gone-p2', player2);
      });

      // ===== STEP 4: P1 re-confirms → countdown restarts =====
      await test.step('P1 re-confirms → countdown restarts', async () => {
        // P1 should still have 5 picks selected, re-confirm
        await confirm(player1);

        // Both confirmed again → countdown should restart on both sides
        const [reP1, reP2] = await Promise.all([
          waitForCountdownText(player1, 5000),
          waitForCountdownText(player2, 5000),
        ]);

        expect(reP1).toMatch(/Ban phase starting in \d+\.\.\./);
        expect(reP2).toMatch(/Ban phase starting in \d+\.\.\./);

        // Verify countdown restarted from 3 (not continued from before)
        const seconds = await parseCountdownSeconds(player1);
        expect(seconds).toBeGreaterThanOrEqual(2); // Should be 3 or 2 (timing)

        await takeScreenshot('countdown-restarted-p1', player1);
        await takeScreenshot('countdown-restarted-p2', player2);
      });

      // ===== STEP 5: Phase transitions normally =====
      await test.step('Phase transitions to Ban after countdown', async () => {
        await waitForPhase(player1, 'Ban Phase', 15000);
        await waitForPhase(player2, 'Ban Phase', 15000);

        await Promise.all([waitForSnabbdomReady(player1), waitForSnabbdomReady(player2)]);
        await takeScreenshot('ban-phase-reached', player1);
      });

      // ===== STEP 6: Complete ban phase to verify full flow =====
      await test.step('Complete ban phase', async () => {
        await Promise.all([selectOpenings(player1, 2), selectOpenings(player2, 2)]);

        // Confirm sequentially
        await confirm(player1);
        await confirm(player2);

        // Countdown appears in ban phase too
        await waitForCountdownText(player1, 5000);
        await takeScreenshot('ban-countdown', player1);

        // Wait for game
        const reachedRS = await waitForRandomSelecting(player1, 15000)
          .then(() => true)
          .catch(() => false);
        if (reachedRS) {
          await takeScreenshot('random-selecting', player1);
        }

        await waitForGamePage(player1, 30000);
        await waitForGamePage(player2, 30000);
        await takeScreenshot('game-started', player1);
      });

      // ===== STEP 7: Verify Openings tab =====
      await test.step('Verify Openings tab for both players', async () => {
        await Promise.all([
          verifyOpeningsTab(player1, seriesId, 'iryna', takeScreenshot, 1),
          verifyOpeningsTab(player2, seriesId, 'pedro', takeScreenshot, 1),
        ]);
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});
