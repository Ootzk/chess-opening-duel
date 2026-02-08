import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import { testScenarios, createTwoPlayerContexts, loginBothPlayers } from '../helpers/auth';
import {
  createSeriesChallenge,
  completeBanPickPhase,
  executeSeriesResult,
  isSeriesFinished,
  type ScreenshotFn,
} from '../helpers/series';

/**
 * Series Ban/Pick E2E Tests
 *
 * Test Scenario Matrix:
 *
 * | # | P1 | P2 | pick-p1 | pick-p2 | ban-p1 | ban-p2 | series result (p1) |
 * |---|----|----|---------|---------|--------|--------|-------------------|
 * | 0 | elena | hans | confirm | confirm | confirm | confirm | 0 - 1/2 - 1 - 1 |
 * | 1 | yulia | luis | confirm | full-timeout | confirm | none-timeout | 1 - 1 - 1 |
 * | 2 | ana | lola | full-timeout | confirm | none-timeout | confirm | 0 - 1 - 0 - 1 - 1/2 - 1 |
 * | 3 | carlos | nina | partial-timeout | confirm | confirm | partial-timeout | 0 - 0 - 1 - 1 - 1 |
 * | 4 | oscar | petra | confirm | partial-timeout | partial-timeout | confirm | 1 - 1/2 - 1 |
 * | 5 | boris | david | none-timeout | confirm | confirm | full-timeout | 1 - 0 - 1 - 0 - 1/2 - 1 |
 * | 6 | mei | ivan | confirm | none-timeout | full-timeout | confirm | 0 - 1 - 1 - 1 |
 *
 * Pick/Ban Behaviors:
 * - confirm: Select required amount and confirm button
 * - full-timeout: Select all but don't confirm (wait for timeout)
 * - partial-timeout: Select some (wait for timeout + server auto-fill)
 * - none-timeout: Select nothing (wait for timeout + server auto-fill)
 *
 * Series Result (P1 perspective):
 * - 1 = P1 win (P2 resigns)
 * - 0 = P1 loss (P1 resigns)
 * - 1/2 = Draw
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

// Count timeout behaviors in pick/ban options
function countTimeoutBehaviors(
  pick: { p1: string; p2: string },
  ban: { p1: string; p2: string }
): number {
  let count = 0;
  if (pick.p1 !== 'confirm') count++;
  if (pick.p2 !== 'confirm') count++;
  if (ban.p1 !== 'confirm') count++;
  if (ban.p2 !== 'confirm') count++;
  return count;
}

// Calculate timeout based on series result length and timeout behaviors
function calculateTimeout(
  seriesResult: string,
  pick: { p1: string; p2: string },
  ban: { p1: string; p2: string }
): number {
  const gameCount = seriesResult.split(' - ').length;
  const timeoutBehaviorCount = countTimeoutBehaviors(pick, ban);

  // Base 60s + 20s per game + 35s per timeout behavior
  // Each timeout behavior adds ~30s server-side wait
  const timeout = 60000 + gameCount * 20000 + timeoutBehaviorCount * 35000;

  return timeout;
}

// Generate tests from scenario matrix
for (const scenario of testScenarios) {
  const { id, player1: p1User, player2: p2User, pick, ban, seriesResult, description } = scenario;
  const pairUsers = [p1User.username, p2User.username];

  const timeout = calculateTimeout(seriesResult, pick, ban);

  test.describe(`Test ${id}: ${p1User.username} vs ${p2User.username}`, () => {
    test.describe.configure({ timeout });

    test.beforeAll(() => cleanupPairData(pairUsers));

    test(`[Test ${id}] ${description}`, async ({ browser }) => {
      const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(
        browser,
        p1User,
        p2User
      );

      // Screenshot helper: attaches screenshot to test report with sequential numbering
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
        // ===== STEP 1: Create Series =====
        await test.step('Create series and reach Pick Phase', async () => {
          await loginBothPlayers(player1, player2, p1User, p2User);
          seriesId = await createSeriesChallenge(player1, player2, p2User.username);
          await takeScreenshot('series-created', player1);
        });

        // ===== STEP 2: Complete Ban/Pick Phase =====
        await test.step(`Ban/Pick: pick(${pick.p1}/${pick.p2}) ban(${ban.p1}/${ban.p2})`, async () => {
          await completeBanPickPhase(player1, player2, { pick, ban }, takeScreenshot);
        });

        // ===== STEP 3: Execute Series =====
        await test.step(`Execute series: ${seriesResult}`, async () => {
          await executeSeriesResult(
            player1,
            player2,
            p1User.username,
            p2User.username,
            seriesResult,
            seriesId,
            takeScreenshot
          );
        });

        // ===== STEP 4: Verify Series Finished =====
        await test.step('Verify series finished', async () => {
          const finished = await isSeriesFinished(player1, seriesId);
          expect(finished).toBe(true);
        });
      } finally {
        await player1Context.close();
        await player2Context.close();
      }
    });
  });
}
