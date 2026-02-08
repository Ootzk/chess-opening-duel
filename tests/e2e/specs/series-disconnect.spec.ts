import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import { users, createTwoPlayerContexts, loginBothPlayers } from '../helpers/auth';
import {
  createSeriesChallenge,
  waitForPhase,
  waitForSnabbdomReady,
  selectOpenings,
  confirm,
  isSeriesAborted,
  type ScreenshotFn,
} from '../helpers/series';

/**
 * Series Disconnect/Abort E2E Tests
 *
 * Tests that a series is properly aborted when a player disconnects
 * during pick or ban phase. The server detects the disconnect via
 * WebSocket gone events and aborts when the phase timeout fires.
 *
 * | # | P1 | P2 | Phase | Disconnect | Expected |
 * |---|----|----|-------|------------|----------|
 * | 7 | angel | bobby | Pick | P2 disconnects after P1 confirms | Series aborted |
 * | 8 | marcel | vera | Ban | P2 disconnects after P1 confirms | Series aborted |
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
