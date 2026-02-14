import { Page, expect } from '@playwright/test';
import { Chess } from 'chess.js';
import type { PickBanBehavior } from './scenarios';
import { verifyOpeningsTab } from './openings-tab';

// Selectors matching view.ts structure
export const selectors = {
  // Page structure
  seriesPick: '.series-pick',
  header: '.series-pick__header h1',
  timer: '.series-pick__timer .timer-display',

  // Opening cards
  opening: '.series-pick__opening',
  openingSelected: '.series-pick__opening.selected',
  openingDisabled: '.series-pick__opening.disabled',
  openingName: '.series-pick__name .opening-name',

  // Action buttons (Pick phase - green, Ban phase - red)
  confirmBtn: 'button.button-green.series-pick__action-btn:not([disabled])',
  confirmBtnDisabled: 'button.button-green.series-pick__action-btn[disabled]',
  confirmBtnBan: 'button.button-red.series-pick__action-btn:not([disabled])',
  confirmBtnBanDisabled: 'button.button-red.series-pick__action-btn[disabled]',
  cancelBtn: 'button.button-metal.series-pick__action-btn',
  anyConfirmBtn: '.series-pick__action-btn:not(.button-metal)',

  // Opponent status
  opponentStatus: '.series-pick__opponent-status',
  opponentReady: '.series-pick__opponent-status.ready',
  opponentWaiting: '.series-pick__opponent-status.waiting',
  opponentDisconnected: '.series-pick__opponent-status.disconnected',

  // Random selecting phase
  randomSelecting: '.series-pick.random-selecting',
  countdown: '.series-pick__countdown',

  // Roulette animation (RandomSelecting spinning phase)
  rouletteCard: '.series-pick__roulette-card',
  playerBoxes: '.series-pick__player-boxes',

  // Showcase (RandomSelecting result + Selecting showcase)
  showcase: '.series-pick__selected-showcase',
  showcaseText: '.series-pick__selected-text',

  // Countdown text (3-second delay after both confirm)
  countdownText: '.series-pick__countdown-text',

  // Resting phase (between games, shown on round game page)
  restingFollowUp: '.follow-up.series-rest',
  restingConfirmBtn: 'button.button-green.series-rest__confirm',
  restingCancelBtn: 'button.button-metal.series-rest__cancel',
  restingTimer: '.series-rest__timer',
  restingOpponentStatus: '.series-rest__opponent-status',
  restingOpponentReady: '.series-rest__opponent-status.ready',
  restingCountdown: '.series-rest__timer:has-text("Game starting in")',
};

/**
 * Wait for Snabbdom to initialize (the server-rendered HTML lacks .series-pick__action-btn)
 * This prevents clicking on server-rendered elements that have no event handlers.
 */
export async function waitForSnabbdomReady(page: Page, timeout = 10000): Promise<void> {
  await expect(page.locator('.series-pick__action-btn')).toBeVisible({ timeout });
}

/**
 * Select N openings (clicks on unselected, non-disabled openings)
 */
export async function selectOpenings(page: Page, count: number): Promise<void> {
  // Ensure Snabbdom has taken over from server-rendered HTML
  await waitForSnabbdomReady(page);

  for (let i = 0; i < count; i++) {
    const openings = page.locator(`${selectors.opening}:not(.selected):not(.disabled)`);
    const openingCount = await openings.count();
    if (openingCount === 0) {
      throw new Error(`No more openings available to select (tried to select ${count}, got ${i})`);
    }
    await openings.first().click();
    await page.waitForTimeout(150); // Wait for state update and redraw
  }
}

/**
 * Get the count of currently selected openings
 */
export async function getSelectedCount(page: Page): Promise<number> {
  return await page.locator(selectors.openingSelected).count();
}

/**
 * Click the Confirm button (works for both pick and ban phases)
 */
export async function confirm(page: Page): Promise<void> {
  const confirmBtn = page.locator(`${selectors.confirmBtn}, ${selectors.confirmBtnBan}`);
  await expect(confirmBtn).toBeVisible({ timeout: 5000 });
  await confirmBtn.click();
}

/**
 * Click the Cancel button
 */
export async function cancel(page: Page): Promise<void> {
  await page.click(selectors.cancelBtn);
}

/**
 * Check if Confirm button is enabled
 */
export async function isConfirmEnabled(page: Page): Promise<boolean> {
  const enabledBtn = page.locator(`${selectors.confirmBtn}, ${selectors.confirmBtnBan}`);
  return (await enabledBtn.count()) > 0;
}

/**
 * Get current phase name from header
 */
export async function getCurrentPhase(page: Page): Promise<string> {
  const header = page.locator(selectors.header);
  return (await header.textContent()) || '';
}

/**
 * Wait for a specific phase
 */
export async function waitForPhase(page: Page, phaseName: string, timeout = 10000): Promise<void> {
  await expect(page.locator(selectors.header)).toContainText(phaseName, { timeout });
}

/**
 * Get remaining time from timer
 */
export async function getTimeLeft(page: Page): Promise<number> {
  const timer = page.locator(selectors.timer);
  const text = await timer.textContent();
  return parseInt(text || '0', 10);
}

/**
 * Get opponent status: 'ready' | 'waiting' | 'disconnected' | null
 */
export async function getOpponentStatus(page: Page): Promise<'ready' | 'waiting' | 'disconnected' | null> {
  if (await page.locator(selectors.opponentReady).count() > 0) return 'ready';
  if (await page.locator(selectors.opponentWaiting).count() > 0) return 'waiting';
  if (await page.locator(selectors.opponentDisconnected).count() > 0) return 'disconnected';
  return null;
}

/**
 * Wait for opponent to be in a specific status
 */
export async function waitForOpponentStatus(
  page: Page,
  status: 'ready' | 'waiting' | 'disconnected',
  timeout = 10000
): Promise<void> {
  const selector =
    status === 'ready'
      ? selectors.opponentReady
      : status === 'waiting'
        ? selectors.opponentWaiting
        : selectors.opponentDisconnected;
  await expect(page.locator(selector)).toBeVisible({ timeout });
}

/**
 * Navigate to series pick page
 */
export async function goToSeriesPick(page: Page, seriesId: string): Promise<void> {
  await page.goto(`/series/${seriesId}/pick`);
  await expect(page.locator(selectors.seriesPick)).toBeVisible({ timeout: 10000 });
}

/**
 * Wait for game to start (URL changes to game ID)
 */
export async function waitForGameStart(page: Page, timeout = 30000): Promise<string> {
  await page.waitForURL(/\/[a-zA-Z0-9]{8}/, { timeout });
  const match = page.url().match(/\/([a-zA-Z0-9]{8})/);
  return match?.[1] || '';
}

/**
 * Wait for random selecting phase
 */
export async function waitForRandomSelecting(page: Page, timeout = 10000): Promise<void> {
  await expect(page.locator(selectors.randomSelecting)).toBeVisible({ timeout });
}

/**
 * Check if currently in random selecting phase
 */
export async function isRandomSelectingPhase(page: Page): Promise<boolean> {
  return (await page.locator(selectors.randomSelecting).count()) > 0;
}

/**
 * Perform full pick phase: select 5, confirm
 */
export async function completePickPhase(page: Page): Promise<void> {
  await waitForPhase(page, 'Pick Phase');
  await selectOpenings(page, 5);
  await confirm(page);
}

/**
 * Perform full ban phase: select 2, confirm
 */
export async function completeBanPhase(page: Page): Promise<void> {
  await waitForPhase(page, 'Ban Phase');
  await selectOpenings(page, 2);
  await confirm(page);
}

/**
 * Deselect an opening by clicking on a selected one
 */
export async function deselectOpening(page: Page): Promise<void> {
  const selected = page.locator(selectors.openingSelected);
  if ((await selected.count()) > 0) {
    await selected.first().click();
    await page.waitForTimeout(100);
  }
}

/**
 * Get names of all selected openings
 */
export async function getSelectedOpeningNames(page: Page): Promise<string[]> {
  const selected = page.locator(`${selectors.openingSelected} ${selectors.openingName}`);
  const names: string[] = [];
  const count = await selected.count();
  for (let i = 0; i < count; i++) {
    const name = await selected.nth(i).textContent();
    if (name) names.push(name);
  }
  return names;
}

/**
 * Screenshot callback type for E2E test evidence
 * Takes a descriptive name and the page to screenshot
 */
export type ScreenshotFn = (name: string, page: Page) => Promise<void>;

// ===== Countdown Helpers =====

/**
 * Wait for countdown text to appear (e.g., "Game 1 starting in 3...")
 * Returns the countdown text content.
 */
export async function waitForCountdownText(page: Page, timeout = 10000): Promise<string> {
  const loc = page.locator(selectors.countdownText);
  await expect(loc).toBeVisible({ timeout });
  return (await loc.textContent()) || '';
}

/**
 * Get current countdown text if visible, or null if not visible.
 */
export async function getCountdownText(page: Page): Promise<string | null> {
  const loc = page.locator(selectors.countdownText);
  const isVisible = await loc.isVisible().catch(() => false);
  if (!isVisible) return null;
  return (await loc.textContent()) || null;
}

/**
 * Verify countdown text matches the expected pattern: "Game {N} starting in {sec}..."
 * Returns the parsed seconds value.
 */
export async function parseCountdownSeconds(page: Page): Promise<number | null> {
  const text = await getCountdownText(page);
  if (!text) return null;
  const match = text.match(/starting in (\d+)\.\.\./);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Wait for countdown text to disappear (e.g., after cancel or phase transition).
 */
export async function waitForCountdownGone(page: Page, timeout = 10000): Promise<void> {
  await expect(page.locator(selectors.countdownText)).not.toBeVisible({ timeout });
}

/**
 * Verify the countdown decrements over time.
 * Waits for countdown to appear, records initial value, waits ~1.5s, then checks it decreased.
 */
export async function verifyCountdownDecrements(page: Page, timeout = 10000): Promise<{ initial: number; after: number }> {
  // Wait for countdown to appear
  await waitForCountdownText(page, timeout);

  const initial = await parseCountdownSeconds(page);
  if (initial === null) throw new Error('Could not parse initial countdown seconds');

  // Wait ~1.5 seconds for it to decrement
  await page.waitForTimeout(1500);

  const after = await parseCountdownSeconds(page);
  if (after === null) {
    // Countdown may have finished (reached 0 and stopped) - that's OK if initial was small
    return { initial, after: 0 };
  }

  return { initial, after };
}

// ===== Resting Phase Helpers =====

/**
 * Click "Next Game" button in the Resting phase (shown on game page after game ends).
 * Waits for the button to appear, then clicks it.
 */
export async function confirmNextInResting(page: Page, timeout = 15000): Promise<void> {
  const nextBtn = page.locator(selectors.restingConfirmBtn);
  await expect(nextBtn).toBeVisible({ timeout });
  await nextBtn.click();
}

/**
 * Click "Cancel" button in the Resting phase (revoke a previous "Next Game" confirmation).
 */
export async function cancelNextInResting(page: Page, timeout = 5000): Promise<void> {
  const cancelBtn = page.locator(selectors.restingCancelBtn);
  await expect(cancelBtn).toBeVisible({ timeout });
  await cancelBtn.click();
}

/**
 * Wait for the Resting phase UI to appear on the game page.
 */
export async function waitForRestingUI(page: Page, timeout = 15000): Promise<void> {
  await expect(page.locator(selectors.restingFollowUp)).toBeVisible({ timeout });
}

/**
 * Get the resting timer value (seconds remaining).
 */
export async function getRestingTimeLeft(page: Page): Promise<number> {
  const timer = page.locator(selectors.restingTimer);
  const text = await timer.textContent() || '';
  const match = text.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : NaN;
}

// ===== Series Creation via Challenge Flow =====

// Lobby and Setup selectors
export const lobbySelectors = {
  // Lobby table buttons
  openingDuelBtn: '.lobby__app__content button:has-text("Opening Duel"), .lobby__start button:has-text("Opening Duel")',

  // Setup modal
  setupModal: '.game-setup, .modal-content',
  timeInput: 'input[name="time"], .time-choice input',
  incrementInput: 'input[name="increment"]',
  submitBtn: 'button[type="submit"], .submit',

  // Challenge page
  challengeAcceptBtn: 'button.accept, form.accept button, button:has-text("Accept")',
  challengeDeclineBtn: 'button.decline, button:has-text("Decline")',

  // After challenge acceptance - redirect to series
  seriesRedirectBtn: 'a:has-text("Ban/Pick"), a[href*="/series/"][href*="/pick"]',
  autoRedirect: '#challenge-redirect',
};

/**
 * Abort any existing games in progress for a player
 */
export async function abortExistingGames(page: Page): Promise<void> {
  // Wait a moment for any dialogs to appear
  await page.waitForTimeout(1000);

  for (let i = 0; i < 5; i++) {
    // Try to find and click the abort button directly using getByRole
    // The button contains text "ABORT THE GAME" or "Abort the game"
    try {
      const abortBtn = page.getByRole('button', { name: /abort/i });
      const isVisible = await abortBtn.isVisible({ timeout: 1000 }).catch(() => false);

      if (isVisible) {
        await abortBtn.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
      } else {
        // No abort button visible - check if dialog is present
        const hangOnVisible = await page.locator('text="Hang on!"').isVisible({ timeout: 500 }).catch(() => false);
        if (!hangOnVisible) {
          break; // No dialog, we're done
        }
        // Dialog present but button not found, wait and retry
        await page.waitForTimeout(500);
      }
    } catch {
      // Click failed, try again
      await page.waitForTimeout(500);
    }
  }
}

/**
 * Cleanup: Navigate to lobby and abort any existing games
 * Call this in finally blocks to clean up after tests
 */
export async function cleanupGames(page: Page): Promise<void> {
  try {
    await page.goto('/');
    await page.waitForLoadState('networkidle').catch(() => {});
    await abortExistingGames(page);
  } catch {
    // Ignore errors during cleanup
  }
}

export async function createSeriesChallenge(
  player1: Page,
  player2: Page,
  player2Username: string,
  _timeMinutes = 5,
  _incrementSeconds = 3
): Promise<string> {
  // Step 1: Navigate to lobby and abort any existing games for both players
  await Promise.all([
    player1.goto('/'),
    player2.goto('/'),
  ]);
  await Promise.all([
    player1.waitForLoadState('networkidle'),
    player2.waitForLoadState('networkidle'),
  ]);

  // Abort existing games on both sides
  await abortExistingGames(player1);
  await abortExistingGames(player2);

  // Re-navigate player1 to lobby after potential abort
  await player1.goto('/');
  await player1.waitForLoadState('networkidle');
  await abortExistingGames(player1);

  // Step 2: Click "Opening Duel" button in lobby
  const openingDuelBtn = player1.locator('.lobby__start button:has-text("Opening Duel")').first();
  await expect(openingDuelBtn).toBeVisible({ timeout: 5000 });
  await openingDuelBtn.click();

  // Step 3: Game setup popup - wait for it to appear
  const gameSetup = player1.locator('.game-setup');
  await expect(gameSetup).toBeVisible({ timeout: 5000 });

  // Select "Real time" mode (click the tab)
  const realTimeTab = player1.locator('.game-setup .tabs-horiz button:has-text("Real time")');
  await realTimeTab.first().click();

  // Wait for tab content to update
  await player1.waitForLoadState('domcontentloaded');

  // Click the "Opening Duel" submit button in the modal
  const submitBtn = player1.locator('.game-setup button:has-text("Opening Duel"), .game-setup .submit:has-text("Opening Duel")');
  await expect(submitBtn.first()).toBeVisible({ timeout: 3000 });
  await submitBtn.first().click();

  // Step 4: Wait for navigation after form submission
  // The modal should close and either:
  // - Redirect to challenge page
  // - Show friend list to challenge
  // - Redirect directly to series pick page

  // Wait for modal to close (indicates form was processed)
  // Increased timeout for parallel test execution (server may be slow with concurrent challenges)
  await expect(gameSetup).not.toBeVisible({ timeout: 30000 });

  // Wait for page to stabilize
  await player1.waitForLoadState('networkidle');

  // Search for opponent and invite them
  // Look for the search textbox in "Or invite a Lichess user" section
  const searchBox = player1.locator('input.friend-autocomplete');
  const searchVisible = await searchBox.isVisible({ timeout: 3000 }).catch(() => false);

  if (searchVisible) {
    // Type opponent's username
    await searchBox.fill(player2Username);
    await player1.waitForTimeout(500);

    // Click on the opponent in the dropdown
    // The dropdown items have class "complete-result" and are <span> elements
    // See: repos/lila/ui/lib/src/view/userComplete.ts (renderUserEntry)
    // See: repos/lila/ui/bits/src/bits.challengePage.ts (tag: 'span')
    const dropdownItem = player1.locator('.complete-result').filter({ hasText: new RegExp(player2Username, 'i') });
    await expect(dropdownItem.first()).toBeVisible({ timeout: 3000 });
    await dropdownItem.first().click();

    // Wait for challenge to be sent and page to update
    await player1.waitForLoadState('networkidle');
    await player1.waitForTimeout(500);
  }

  // Step 5: Determine current state and extract series ID
  let seriesId: string | undefined;

  // Wait for redirect to series or challenge page
  // Use Promise.race to detect whichever happens first
  const seriesRedirect = player1.waitForURL(/\/series\//, { timeout: 10000 }).catch(() => null);
  const challengeRedirect = player1.waitForURL(/\/challenge\//, { timeout: 10000 }).catch(() => null);

  await Promise.race([seriesRedirect, challengeRedirect]);

  // Check current state
  const currentUrl = player1.url();

  if (currentUrl.includes('/series/')) {
    // Already on series page
    const match = currentUrl.match(/\/series\/(\w+)/);
    seriesId = match?.[1];
  } else if (currentUrl.includes('/challenge/')) {
    // On challenge page - player2 needs to accept
    await player2.goto(currentUrl);
    await player2.waitForLoadState('networkidle');

    const acceptBtn = player2.locator(lobbySelectors.challengeAcceptBtn);
    await expect(acceptBtn.first()).toBeVisible({ timeout: 5000 });
    await acceptBtn.first().click();

    // Wait for redirect to series pick page
    await player2.waitForURL(/\/series\/.*\/pick/, { timeout: 15000 });
    const match = player2.url().match(/\/series\/(\w+)/);
    seriesId = match?.[1];
  } else {
    // May still be on lobby - check for challenge element or wait for redirect
    const challengeVisible = await player1.locator('.challenge, h1:has-text("Challenge")').first().isVisible({ timeout: 2000 }).catch(() => false);

    if (challengeVisible) {
      await player2.goto(currentUrl);
      await player2.waitForLoadState('networkidle');

      const acceptBtn = player2.locator(lobbySelectors.challengeAcceptBtn);
      await expect(acceptBtn.first()).toBeVisible({ timeout: 5000 });
      await acceptBtn.first().click();

      await player2.waitForURL(/\/series\/.*\/pick/, { timeout: 15000 });
      const match = player2.url().match(/\/series\/(\w+)/);
      seriesId = match?.[1];
    } else {
      // Last resort: check if player1 eventually got redirected
      await player1.waitForURL(/\/series\/.*\/pick/, { timeout: 10000 }).catch(() => {});
      const match = player1.url().match(/\/series\/(\w+)/);
      seriesId = match?.[1];
    }
  }

  if (!seriesId) {
    throw new Error(`Failed to get series ID. Player1 URL: ${player1.url()}, Player2 URL: ${player2.url()}`);
  }

  // Navigate both players to pick page
  const pickUrl = `/series/${seriesId}/pick`;
  await Promise.all([
    player1.goto(pickUrl),
    player2.goto(pickUrl),
  ]);

  // Wait for pick page to load on both (use .first() to handle multiple matching elements)
  await Promise.all([
    expect(player1.locator(selectors.seriesPick).first()).toBeVisible({ timeout: 10000 }),
    expect(player2.locator(selectors.seriesPick).first()).toBeVisible({ timeout: 10000 }),
  ]);

  return seriesId;
}

/**
 * Alternative: Create series via direct POST request (faster for testing)
 * Uses the Opening Duel API directly
 */
export async function createSeriesViaApi(
  player1: Page,
  player2Username: string,
  timeMinutes = 5,
  incrementSeconds = 3
): Promise<string> {
  // Get CSRF token
  const csrfToken = await player1.evaluate(() => {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta?.getAttribute('content') || '';
  });

  // Create challenge via API
  const response = await player1.request.post(`/setup/openingDuel?user=${player2Username}`, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
    },
    form: {
      time: String(timeMinutes),
      increment: String(incrementSeconds),
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to create challenge: ${response.status()}`);
  }

  // Parse response to get challenge ID
  const data = await response.json();
  const challengeId = data.challenge?.id;

  if (!challengeId) {
    throw new Error('No challenge ID in response');
  }

  return challengeId;
}

/**
 * Check if currently on series pick page
 */
export async function isOnSeriesPickPage(page: Page): Promise<boolean> {
  return (await page.locator(selectors.seriesPick).count()) > 0;
}

/**
 * Get series ID from current URL
 */
export function getSeriesIdFromUrl(url: string): string | null {
  const match = url.match(/\/series\/(\w+)/);
  return match?.[1] || null;
}

// ===== Game Action Helpers =====

/**
 * Game action selectors
 */
export const gameSelectors = {
  // Chessboard
  board: 'cg-board, .cg-board',
  piece: 'piece',
  square: 'square',

  // Game controls
  resignBtn: 'button.fbt.resign',
  resignConfirm: '.act-confirm button.fbt.yes',
  drawOfferBtn: 'button.fbt.draw-yes',
  drawConfirm: '.act-confirm button.fbt.yes.draw-yes',
  drawAcceptBtn: 'button.draw-yes',

  // Series forfeit controls
  seriesForfeitBtn: 'button.fbt.series-forfeit',
  seriesForfeitConfirm: '.act-confirm button.fbt.yes',

  // Game end
  gameOverlay: '.result-wrap',
  rematchBtn: 'button.fbt.rematch',
};

/**
 * Extract game ID from URL
 */
export function getGameIdFromUrl(url: string): string | null {
  // URL format: /GAMEID or /GAMEID/white or /GAMEID/black
  const match = url.match(/\/([a-zA-Z0-9]{8,12})(\/(?:white|black))?$/);
  return match?.[1] || null;
}

/**
 * Get username from page (from user menu)
 */
export async function getUsername(page: Page): Promise<string> {
  const userTag = page.locator('#user_tag');
  const text = await userTag.textContent().catch(() => '');
  return text?.trim().toLowerCase() || '';
}

/**
 * Full game state from Board API including player colors
 */
export interface GameFullState {
  initialFen: string;
  moves: string;
  whitePlayer: string;  // Username of white player
  blackPlayer: string;  // Username of black player
}

/**
 * Get current game state via Board API streaming
 * Returns the initial FEN, moves, and player color assignments
 * Note: Uses timeout since streaming endpoint never closes
 */
export async function getGameStateViaApi(
  page: Page,
  username: string,
  gameId: string
): Promise<GameFullState> {
  const token = `lip_${username.toLowerCase()}`;
  const url = `http://localhost:8080/api/board/game/stream/${gameId}`;

  // Use fetch with AbortController for timeout on streaming response
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/x-ndjson',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to get game state: ${response.status}`);
    }

    // Read only the first chunk (gameFull event)
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    // Read until we get a complete first line
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex !== -1) {
        // Got the first complete line
        const firstLine = buffer.slice(0, newlineIndex);
        reader.cancel(); // Stop reading
        const gameFull = JSON.parse(firstLine);
        return {
          initialFen: gameFull.initialFen || 'startpos',
          moves: gameFull.state?.moves || '',
          whitePlayer: gameFull.white?.id?.toLowerCase() || gameFull.white?.name?.toLowerCase() || '',
          blackPlayer: gameFull.black?.id?.toLowerCase() || gameFull.black?.name?.toLowerCase() || '',
        };
      }
    }

    throw new Error('Stream ended without data');
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Compute current FEN by applying moves to initial FEN
 */
export function computeCurrentFen(initialFen: string, moves: string): string {
  const chess = new Chess();

  // Handle initialFen ('startpos' means standard starting position)
  if (initialFen && initialFen !== 'startpos') {
    chess.load(initialFen);
  }

  // Apply moves (space-separated UCI notation)
  if (moves) {
    const moveList = moves.trim().split(' ').filter(m => m);
    for (const uci of moveList) {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.length > 4 ? uci.slice(4) : undefined;
      chess.move({ from, to, promotion });
    }
  }

  return chess.fen();
}

/**
 * Make a move using the Board API
 * This is more reliable than UI clicking
 *
 * @param page - Playwright page
 * @param username - Username to get token (e.g., 'elena' -> 'lip_elena')
 * @param uci - UCI move string (e.g., 'e2e4', 'g1f3')
 */
export async function makeMoveViaApi(
  page: Page,
  username: string,
  uci: string
): Promise<boolean> {
  const gameId = getGameIdFromUrl(page.url());
  if (!gameId) {
    throw new Error('Could not extract game ID from URL');
  }

  const token = `lip_${username.toLowerCase()}`;
  const url = `http://localhost:8080/api/board/game/${gameId}/move/${uci}`;

  const response = await page.request.post(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    console.log(`[makeMoveViaApi] FAILED: ${url} token=${token} status=${response.status()} body=${body}`);
  }

  return response.ok();
}

/**
 * Check if it's our turn to move
 * Uses Board API streaming to get accurate current game state and color assignment
 */
export async function isMyTurn(
  page: Page,
  username: string
): Promise<boolean> {
  const gameId = getGameIdFromUrl(page.url());
  if (!gameId) return true; // Assume it's our turn if we can't determine

  try {
    const gameState = await getGameStateViaApi(page, username, gameId);
    const currentFen = computeCurrentFen(gameState.initialFen, gameState.moves);
    const chess = new Chess(currentFen);
    const turnColor = chess.turn(); // 'w' or 'b'

    // Check if this user is the one whose turn it is
    const userIsWhite = gameState.whitePlayer === username.toLowerCase();
    const whiteToMove = turnColor === 'w';

    return (userIsWhite && whiteToMove) || (!userIsWhite && !whiteToMove);
  } catch {
    return true; // Assume it's our turn if we can't determine
  }
}

/**
 * Make any legal move on the board using Board API
 * Uses Board API streaming to get current game state, then chess.js to compute legal moves
 */
export async function makeAnyMove(page: Page, username?: string): Promise<void> {
  // Wait for board to be ready
  await expect(page.locator(gameSelectors.board)).toBeVisible({ timeout: 5000 });

  // Get username if not provided
  const user = username || (await getUsername(page));
  const gameId = getGameIdFromUrl(page.url());

  if (!user || !gameId) {
    throw new Error(`Could not determine username (${user}) or gameId (${gameId})`);
  }

  // Get current game state via Board API
  const { initialFen, moves } = await getGameStateViaApi(page, user, gameId);

  // Compute current FEN by applying moves to initial FEN
  const currentFen = computeCurrentFen(initialFen, moves);

  // Use chess.js to get legal moves from current position
  const chess = new Chess(currentFen);
  const legalMoves = chess.moves({ verbose: true });

  if (legalMoves.length === 0) {
    throw new Error('No legal moves available');
  }

  // Make the first legal move
  const move = legalMoves[0];
  const uci = move.from + move.to + (move.promotion || '');

  console.log(`[makeAnyMove] user=${user}, gameId=${gameId}, currentFen=${currentFen}, move=${uci}`);

  const success = await makeMoveViaApi(page, user, uci);
  if (!success) {
    throw new Error(`Move ${uci} rejected by API for ${user} (gameId=${gameId})`);
  }

  await page.waitForTimeout(300);
}

/**
 * Resign the current game via Board API
 * Note: Both players must have moved at least once before resign is available
 */
export async function resignGame(page: Page, username: string): Promise<boolean> {
  const gameId = getGameIdFromUrl(page.url());
  if (!gameId) {
    throw new Error('Could not extract game ID from URL');
  }

  const token = `lip_${username.toLowerCase()}`;
  const url = `http://localhost:8080/api/board/game/${gameId}/resign`;

  console.log(`[resignGame] user=${username}, gameId=${gameId}, url=${url}`);

  const response = await page.request.post(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const body = await response.text();
  console.log(`[resignGame] user=${username}, status=${response.status()}, body=${body}`);

  return response.ok();
}

/**
 * Offer or accept a draw via Board API
 * Both players sending draw/yes results in a draw
 */
export async function sendDrawViaApi(page: Page, username: string): Promise<boolean> {
  const gameId = getGameIdFromUrl(page.url());
  if (!gameId) {
    throw new Error('Could not extract game ID from URL');
  }

  const token = `lip_${username.toLowerCase()}`;
  const url = `http://localhost:8080/api/board/game/${gameId}/draw/yes`;

  console.log(`[sendDrawViaApi] user=${username}, gameId=${gameId}, url=${url}`);

  const response = await page.request.post(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const body = await response.text();
  console.log(`[sendDrawViaApi] user=${username}, status=${response.status()}, body=${body}`);

  return response.ok();
}

/**
 * Offer a draw (deprecated - use sendDrawViaApi)
 */
export async function offerDraw(page: Page): Promise<void> {
  // Click draw button to show confirmation
  const drawBtn = page.locator('button.fbt:has([data-icon])').filter({ hasText: /½|draw/i }).first();
  if (await drawBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await drawBtn.click();
    // Confirm draw offer
    const confirmBtn = page.locator('.act-confirm button.fbt.yes');
    await expect(confirmBtn).toBeVisible({ timeout: 3000 });
    await confirmBtn.click();
  }
}

/**
 * Accept a draw offer (deprecated - use sendDrawViaApi)
 */
export async function acceptDraw(page: Page): Promise<void> {
  // Look for draw accept button (appears when opponent offered)
  const drawAcceptBtn = page.locator('button.draw-yes, button:has-text("Accept draw")');
  await expect(drawAcceptBtn.first()).toBeVisible({ timeout: 10000 });
  await drawAcceptBtn.first().click();
}

/**
 * Wait for redirect to series pick page (after game ends)
 */
export async function waitForSeriesRedirect(page: Page, timeout = 15000): Promise<string> {
  await page.waitForURL(/\/series\/\w+\/pick/, { timeout });
  const match = page.url().match(/\/series\/(\w+)/);
  return match?.[1] || '';
}

/**
 * Wait for game page to load
 */
export async function waitForGamePage(page: Page, timeout = 15000): Promise<void> {
  await page.waitForURL(/\/[a-zA-Z0-9]{8,12}(\/white|\/black)?$/, { timeout });
  await expect(page.locator(gameSelectors.board)).toBeVisible({ timeout: 5000 });
}

/**
 * Check if on game page
 */
export async function isOnGamePage(page: Page): Promise<boolean> {
  const url = page.url();
  return /\/[a-zA-Z0-9]{8,12}(\/white|\/black)?$/.test(url);
}

/**
 * Check current series phase from the pick page (detailed)
 */
export async function getSeriesPhase(page: Page): Promise<string> {
  // Check for specific phase indicators
  if (await page.locator(selectors.randomSelecting).isVisible({ timeout: 500 }).catch(() => false)) {
    return 'RandomSelecting';
  }
  // Check header text for phase
  const header = await page.locator(selectors.header).textContent().catch(() => '');
  if (header?.includes('Pick')) return 'Picking';
  if (header?.includes('Ban')) return 'Banning';
  if (header?.includes('Select')) return 'Selecting';
  return 'Unknown';
}

/**
 * Select next opening in Selecting phase (loser selects)
 */
export async function selectNextOpening(page: Page, openingIndex = 0): Promise<void> {
  // Wait for Snabbdom to initialize after page redirect
  await waitForSnabbdomReady(page);

  // Wait for selecting phase
  const openings = page.locator(`${selectors.opening}:not(.disabled)`);
  await expect(openings.first()).toBeVisible({ timeout: 5000 });

  // Click on the specified opening
  await openings.nth(openingIndex).click();
  await page.waitForTimeout(500);

  // Confirm selection
  const confirmBtn = page.locator(selectors.anyConfirmBtn);
  await expect(confirmBtn).toBeVisible({ timeout: 3000 });
  await confirmBtn.click();
}

// ===== Victory Condition Helpers =====

/**
 * Play both moves (one from each player) required before resign/draw
 * Handles turn order based on actual color assignments from the API
 */
export async function playBothMoves(
  player1: Page,
  player2: Page,
  p1Username: string,
  p2Username: string
): Promise<void> {
  // Ensure both players are on a game page with board visible
  await expect(player1.locator(gameSelectors.board)).toBeVisible({ timeout: 10000 });
  await expect(player2.locator(gameSelectors.board)).toBeVisible({ timeout: 10000 });

  const gameId = getGameIdFromUrl(player1.url());
  if (!gameId) {
    throw new Error(`Could not get game ID from URL: ${player1.url()}`);
  }

  // Verify player2 is also on the same game
  const p2GameId = getGameIdFromUrl(player2.url());
  if (p2GameId !== gameId) {
    console.log(`[playBothMoves] Waiting for P2 to join game ${gameId} (currently on ${p2GameId})`);
    await player2.waitForURL((url) => url.pathname.includes(gameId), { timeout: 10000 });
  }

  // Get current game state including player color assignments
  const gameState = await getGameStateViaApi(player1, p1Username, gameId);
  const currentFen = computeCurrentFen(gameState.initialFen, gameState.moves);
  const chess = new Chess(currentFen);
  const turnColor = chess.turn(); // 'w' or 'b'

  // Determine which player is which color
  const p1IsWhite = gameState.whitePlayer === p1Username.toLowerCase();
  const p2IsWhite = gameState.whitePlayer === p2Username.toLowerCase();

  // Determine who should move first based on turn and color assignment
  const whiteToMove = turnColor === 'w';
  const p1ToMove = (p1IsWhite && whiteToMove) || (!p1IsWhite && !whiteToMove);

  console.log(`[playBothMoves] gameId=${gameId}, white=${gameState.whitePlayer}, black=${gameState.blackPlayer}, turn=${turnColor}, p1IsWhite=${p1IsWhite}, p1ToMove=${p1ToMove}`);

  // Make moves in correct order based on who should move
  if (p1ToMove) {
    await makeAnyMove(player1, p1Username);
    await makeAnyMove(player2, p2Username);
  } else {
    await makeAnyMove(player2, p2Username);
    await makeAnyMove(player1, p1Username);
  }

  await player1.waitForTimeout(300);
}

/**
 * Play one complete game with specified result
 * @param result - 'p1-resign' | 'p2-resign' | 'draw'
 * @returns The game ID of the completed game
 */
export async function playOneGame(
  player1: Page,
  player2: Page,
  p1Username: string,
  p2Username: string,
  result: 'p1-resign' | 'p2-resign' | 'draw'
): Promise<string> {
  // Wait for game board to be visible
  await expect(player1.locator(gameSelectors.board)).toBeVisible({ timeout: 5000 });
  await expect(player2.locator(gameSelectors.board)).toBeVisible({ timeout: 5000 });

  // Get current game ID to track this game
  const gameId = getGameIdFromUrl(player1.url()) || '';
  console.log(`[playOneGame] Starting game ${gameId} with result=${result}`);

  // Both players make one move (required for resign/draw)
  await playBothMoves(player1, player2, p1Username, p2Username);

  // Execute the result
  switch (result) {
    case 'p1-resign':
      await resignGame(player1, p1Username);
      break;
    case 'p2-resign':
      await resignGame(player2, p2Username);
      break;
    case 'draw':
      // Both players send draw/yes
      await Promise.all([
        sendDrawViaApi(player1, p1Username),
        sendDrawViaApi(player2, p2Username),
      ]);
      break;
  }

  await player1.waitForTimeout(500);
  return gameId;
}

/**
 * Check if series is finished by calling the Series API directly
 *
 * Status values (from Series.scala):
 * - Created: 10
 * - Started: 20
 * - Finished: 30
 * - Aborted: 40
 *
 * @param retries - 서버가 상태 업데이트할 시간을 주기 위한 재시도 횟수
 */
export async function isSeriesFinished(
  page: Page,
  seriesId?: string,
  retries = 3
): Promise<boolean> {
  // Get series ID from URL if not provided
  let id = seriesId;
  if (!id) {
    const url = page.url();
    const match = url.match(/\/series\/(\w+)/);
    if (match) {
      id = match[1];
    } else {
      console.log(`[isSeriesFinished] No series ID found in URL: ${url}`);
      // 게임 페이지에 있고 pick 페이지로 리다이렉트되지 않으면 종료로 간주
      await page.waitForTimeout(3000);
      const stillOnGame = !page.url().includes('/series/');
      console.log(`[isSeriesFinished] Fallback check: stillOnGame=${stillOnGame}`);
      return stillOnGame;
    }
  }

  // 재시도 로직: 서버가 게임 결과를 처리할 시간 확보
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await page.request.get(`http://localhost:8080/series/${id}`, {
        headers: { Accept: 'application/json' },
      });

      if (response.ok()) {
        const data = await response.json();

        // 첫 번째 시도에서만 전체 구조 출력
        if (attempt === 1) {
          console.log(`[isSeriesFinished] Full response keys: ${Object.keys(data).join(', ')}`);
          console.log(`[isSeriesFinished] status type: ${typeof data.status}, value: ${JSON.stringify(data.status)}`);
          console.log(`[isSeriesFinished] players type: ${typeof data.players}, isArray: ${Array.isArray(data.players)}`);
        }

        // status가 숫자일 수도 있고 객체일 수도 있음
        const statusId = typeof data.status === 'number' ? data.status : data.status?.id;
        const phaseId = typeof data.phase === 'number' ? data.phase : data.phase?.id;

        // players가 배열인지 튜플인지 확인
        const p1 = Array.isArray(data.players) ? data.players[0] : data.players?._1 || data.players?.player1;
        const p2 = Array.isArray(data.players) ? data.players[1] : data.players?._2 || data.players?.player2;
        const p1Score = p1?.score ?? 0;
        const p2Score = p2?.score ?? 0;
        const gamesCount = data.games?.length ?? 0;

        console.log(`[isSeriesFinished] attempt=${attempt}, status=${statusId}, phase=${phaseId}, scores=${p1Score / 2}-${p2Score / 2}, games=${gamesCount}`);

        // status.id === 30 means Finished
        if (statusId === 30) {
          return true;
        }

        // 아직 안 끝났으면 잠시 대기 후 재시도
        if (attempt < retries) {
          await page.waitForTimeout(1000);
        }
      }
    } catch (err) {
      console.log(`[isSeriesFinished] API error on attempt ${attempt}:`, err);
    }
  }

  console.log(`[isSeriesFinished] Series ${id} not finished after ${retries} attempts`);
  return false;
}

/**
 * Check if series is aborted by calling the Series API directly
 * Status 40 = Aborted
 */
export async function isSeriesAborted(
  page: Page,
  seriesId: string,
  retries = 5
): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await page.request.get(`http://localhost:8080/series/${seriesId}`, {
        headers: { Accept: 'application/json' },
      });

      if (response.ok()) {
        const data = await response.json();
        const statusId = typeof data.status === 'number' ? data.status : data.status?.id;
        console.log(`[isSeriesAborted] attempt=${attempt}, status=${statusId}`);

        if (statusId === 40) {
          return true;
        }

        if (attempt < retries) {
          await page.waitForTimeout(2000);
        }
      }
    } catch (err) {
      console.log(`[isSeriesAborted] API error on attempt ${attempt}:`, err);
    }
  }

  console.log(`[isSeriesAborted] Series ${seriesId} not aborted after ${retries} attempts`);
  return false;
}

/**
 * Wait for next game to start after a game ends
 *
 * Phase transitions (with Resting):
 * - PLAY → RESTING (30s) → |winner| SEL (Selecting) → 5s showcase → PLAY
 * - PLAY → RESTING (30s) → |draw| RS (RandomSelecting: roulette + 5s showcase) → PLAY
 * - PLAY →|series done| FIN (no resting)
 *
 * Resting phase:
 * - Shown on the game page as .follow-up.series-rest
 * - "Next Game" button → both confirm → 3s countdown → phase transition
 * - 30s timeout → auto-transition (no confirm needed)
 *
 * Showcase:
 * - After RandomSelecting roulette or Selecting confirm, a 5s showcase displays
 *   the selected opening (enlarged card + "{player}'s {opening} selected!" text)
 * - The showcase renders with .series-pick.random-selecting class
 *
 * @param skipResting - If true, don't click "Next Game" (let timeout handle it)
 */
export async function waitForNextGame(
  player1: Page,
  player2: Page,
  _loserPage: Page | null,  // Deprecated, kept for API compatibility
  previousGameId?: string,
  timeout = 45000,
  screenshot?: ScreenshotFn,
  gameNum?: number,
  skipResting = false
): Promise<void> {
  console.log(`[waitForNextGame] previousGameId=${previousGameId}, skipResting=${skipResting}, starting...`);

  const startTime = Date.now();
  let hasSelected = false; // 패자가 오프닝을 선택했는지 추적
  let screenshotTaken = { selecting: false, randomSelecting: false, showcase: false, resting: false }; // prevent duplicate screenshots

  // Helper: 한 플레이어의 상태를 체크하고 필요시 행동
  const handlePlayer = async (page: Page, label: string, otherPage: Page): Promise<void> => {
    let restingConfirmed = false;

    while (Date.now() - startTime < timeout) {
      const path = new URL(page.url()).pathname;

      // 새 게임 페이지에 도착하면 완료
      const gameMatch = path.match(/\/([a-zA-Z0-9]{8,12})(\/white|\/black)?$/);
      if (gameMatch && gameMatch[1] !== previousGameId) {
        console.log(`[waitForNextGame] ${label} arrived at game: ${gameMatch[1]}`);
        return;
      }

      // Resting phase: 이전 게임 페이지에서 Rest UI 표시
      if (gameMatch && gameMatch[1] === previousGameId && !restingConfirmed) {
        const restNextBtn = page.locator(selectors.restingConfirmBtn);
        const isRestVisible = await restNextBtn.isVisible().catch(() => false);
        if (isRestVisible) {
          // Screenshot: resting UI
          if (screenshot && !screenshotTaken.resting) {
            screenshotTaken.resting = true;
            await screenshot(`game${gameNum}-resting`, page);
          }
          if (!skipResting) {
            console.log(`[waitForNextGame] ${label} clicking "Next Game" in Resting phase`);
            await restNextBtn.click();
            restingConfirmed = true;
          }
          await page.waitForTimeout(500);
          continue;
        }
      }

      // Pick 페이지에 있을 때
      if (/\/series\/\w+\/pick/.test(path)) {
        // UI가 렌더링될 때까지 잠시 대기
        await page.waitForTimeout(300);

        // 1. RandomSelecting or Showcase: roulette animation / showcase countdown, 행동 불필요
        //    Both RandomSelecting (roulette + result) and Selecting showcase render with .random-selecting
        const isRandomSelecting = await page.locator(selectors.randomSelecting).isVisible().catch(() => false);
        if (isRandomSelecting) {
          // Check if showcase is showing (enlarged card + "{player}'s {opening} selected!")
          const isShowcase = await page.locator(selectors.showcase).isVisible().catch(() => false);
          if (isShowcase) {
            console.log(`[waitForNextGame] ${label} in Showcase (5s countdown)`);
            if (screenshot && !screenshotTaken.showcase) {
              screenshotTaken.showcase = true;
              await screenshot(`game${gameNum}-showcase`, page);
            }
          } else {
            console.log(`[waitForNextGame] ${label} in RandomSelecting (roulette)`);
            if (screenshot && !screenshotTaken.randomSelecting) {
              screenshotTaken.randomSelecting = true;
              await screenshot(`game${gameNum}-random-selecting`, page);
            }
          }
          await page.waitForTimeout(500);
          continue;
        }

        // 2. Selecting phase: 양측 동일 그리드, 패자만 클릭 가능
        //    - 패자: selectable openings > 0 → 선택 + confirm → 3초 후 WS redirect
        //    - 승자: all disabled → 그냥 대기 (WS redirect)
        //    Screenshot: 패자 감지 시 양측 캡처
        if (!hasSelected) {
          const selectableOpenings = page.locator(`${selectors.opening}:not(.disabled)`);
          const count = await selectableOpenings.count();
          if (count > 0) {
            console.log(`[waitForNextGame] ${label} is loser, selecting opening (${count} available)...`);
            // Screenshot: both players' views during Selecting
            if (screenshot && !screenshotTaken.selecting) {
              screenshotTaken.selecting = true;
              await screenshot(`game${gameNum}-loser-selecting`, page);
              await screenshot(`game${gameNum}-winner-watching`, otherPage);
            }
            await selectNextOpening(page, 0);
            hasSelected = true;
            // After confirm, 3s cancel window → WS phase event → 5s showcase → redirect
            continue;
          }
        }
      }

      await page.waitForTimeout(300);
    }
    throw new Error(`[waitForNextGame] ${label} timeout - did not reach game page`);
  };

  // 양 플레이어 병렬로 처리
  await Promise.all([
    handlePlayer(player1, 'P1', player2),
    handlePlayer(player2, 'P2', player1),
  ]);

  // 보드 표시 확인
  await expect(player1.locator(gameSelectors.board)).toBeVisible({ timeout: 5000 });
  await expect(player2.locator(gameSelectors.board)).toBeVisible({ timeout: 5000 });

  const newGameId = getGameIdFromUrl(player1.url());
  console.log(`[waitForNextGame] Both players on game ${newGameId}`);

  // Screenshot: next game board loaded
  if (screenshot && gameNum) {
    await screenshot(`game${gameNum}-board`, player1);
  }
}

/**
 * Execute pick/ban behavior for a single player
 *
 * Behavior types:
 * - confirm: Select required amount and confirm
 * - full-timeout: Select required amount but don't confirm (wait for timeout)
 * - partial-timeout: Select some but not all (wait for timeout + server auto-fill)
 * - none-timeout: Select nothing (wait for timeout + server auto-fill)
 */
async function executePickBanBehavior(
  page: Page,
  behavior: PickBanBehavior,
  phase: 'pick' | 'ban'
): Promise<void> {
  const requiredCount = phase === 'pick' ? 5 : 2;
  const partialCount = phase === 'pick' ? 2 : 1; // For partial-timeout

  switch (behavior) {
    case 'confirm':
      await selectOpenings(page, requiredCount);
      await confirm(page);
      break;
    case 'full-timeout':
      await selectOpenings(page, requiredCount);
      // Don't confirm - wait for timeout
      break;
    case 'partial-timeout':
      await selectOpenings(page, partialCount);
      // Don't confirm - wait for timeout + auto-fill
      break;
    case 'none-timeout':
      // Don't select anything - wait for timeout + auto-fill
      break;
  }
}

/**
 * Check if a behavior requires waiting for server timeout
 */
function needsTimeout(behavior: PickBanBehavior): boolean {
  return behavior !== 'confirm';
}

/**
 * Options for ban/pick phase behaviors
 */
export interface BanPickOptions {
  pick: { p1: PickBanBehavior; p2: PickBanBehavior };
  ban: { p1: PickBanBehavior; p2: PickBanBehavior };
}

/**
 * Complete ban/pick phase with configurable behaviors for both players
 *
 * @param player1 - Player 1's page
 * @param player2 - Player 2's page
 * @param options - Pick/ban behavior options (defaults to confirm for all)
 */
export async function completeBanPickPhase(
  player1: Page,
  player2: Page,
  options?: BanPickOptions,
  screenshot?: ScreenshotFn
): Promise<void> {
  // Default to confirm for all if no options provided
  const opts: BanPickOptions = options || {
    pick: { p1: 'confirm', p2: 'confirm' },
    ban: { p1: 'confirm', p2: 'confirm' },
  };

  console.log(`[completeBanPickPhase] pick: p1=${opts.pick.p1}, p2=${opts.pick.p2}, ban: p1=${opts.ban.p1}, p2=${opts.ban.p2}`);

  // ===== Pick Phase =====
  await waitForPhase(player1, 'Pick Phase');
  await waitForPhase(player2, 'Pick Phase');

  // Execute pick behaviors in parallel
  await Promise.all([
    executePickBanBehavior(player1, opts.pick.p1, 'pick'),
    executePickBanBehavior(player2, opts.pick.p2, 'pick'),
  ]);

  // Screenshot: after pick selections
  if (screenshot) {
    await Promise.all([
      screenshot('pick-p1-selected', player1),
      screenshot('pick-p2-selected', player2),
    ]);
  }

  // If any player needs timeout, wait for phase transition
  const pickNeedsTimeout = needsTimeout(opts.pick.p1) || needsTimeout(opts.pick.p2);
  if (pickNeedsTimeout) {
    console.log('[completeBanPickPhase] Waiting for pick timeout...');
    // Wait for Ban Phase (server auto-fills and transitions after 30s timeout)
    // Extra buffer for server load during parallel test execution
    await waitForPhase(player1, 'Ban Phase', 50000);
    await waitForPhase(player2, 'Ban Phase', 50000);
  } else {
    // Both confirmed - wait for phase transition
    // bothConfirmedDelay (3s) + screenshot overhead + server load → 15s buffer
    await waitForPhase(player1, 'Ban Phase', 15000);
    await waitForPhase(player2, 'Ban Phase', 15000);
  }

  // ===== Ban Phase =====
  // Wait for Snabbdom to re-initialize after page reload/redirect
  await Promise.all([
    waitForSnabbdomReady(player1),
    waitForSnabbdomReady(player2),
  ]);

  // Screenshot: ban phase reached (shows opponent's picks)
  if (screenshot) {
    await Promise.all([
      screenshot('ban-p1-phase', player1),
      screenshot('ban-p2-phase', player2),
    ]);
  }

  // Execute ban behaviors in parallel
  await Promise.all([
    executePickBanBehavior(player1, opts.ban.p1, 'ban'),
    executePickBanBehavior(player2, opts.ban.p2, 'ban'),
  ]);

  // Screenshot: after ban selections
  if (screenshot) {
    await Promise.all([
      screenshot('ban-p1-selected', player1),
      screenshot('ban-p2-selected', player2),
    ]);
  }

  // If any player needs timeout, wait for phase transition
  const banNeedsTimeout = needsTimeout(opts.ban.p1) || needsTimeout(opts.ban.p2);
  if (banNeedsTimeout) {
    console.log('[completeBanPickPhase] Waiting for ban timeout...');
  }

  // Wait for RandomSelecting phase (Game 1 random selection)
  // After ban timeout (30s) + bothConfirmedDelay (3s) → RandomSelecting → game
  // Even confirm/confirm path needs 30s under parallel test server load
  const gameWaitTimeout = banNeedsTimeout ? 50000 : 30000;
  const reachedRandomSelecting = await waitForRandomSelecting(player1, gameWaitTimeout).then(() => true).catch(() => false);

  // Screenshot: random selecting phase
  if (screenshot && reachedRandomSelecting) {
    await screenshot('random-selecting', player1);
  }

  // Wait for game to start (after RandomSelecting ~13s: roulette animation + 5s showcase countdown)
  await waitForGamePage(player1, gameWaitTimeout);
  await waitForGamePage(player2, gameWaitTimeout);

  // Screenshot: game 1 board loaded
  if (screenshot) {
    await Promise.all([
      screenshot('game1-p1-board', player1),
      screenshot('game1-p2-board', player2),
    ]);
  }
}

/**
 * Parse series result string into game outcomes
 *
 * @param seriesResult - e.g., '0 - 1/2 - 1 - 1'
 * @returns Array of outcomes: 'p1-resign' | 'p2-resign' | 'draw'
 */
export function parseSeriesResult(seriesResult: string): Array<'p1-resign' | 'p2-resign' | 'draw'> {
  const parts = seriesResult.split(' - ').map(s => s.trim());
  return parts.map(part => {
    if (part === '1') return 'p2-resign'; // P1 wins = P2 resigns
    if (part === '0') return 'p1-resign'; // P1 loses = P1 resigns
    if (part === '1/2') return 'draw';
    throw new Error(`Invalid series result part: ${part}`);
  });
}

/**
 * Execute a full series based on the series result string
 *
 * @param player1 - Player 1's page
 * @param player2 - Player 2's page
 * @param p1Username - Player 1's username
 * @param p2Username - Player 2's username
 * @param seriesResult - e.g., '0 - 1/2 - 1 - 1'
 * @param seriesId - Series ID for verification
 */
export async function executeSeriesResult(
  player1: Page,
  player2: Page,
  p1Username: string,
  p2Username: string,
  seriesResult: string,
  seriesId: string,
  screenshot?: ScreenshotFn
): Promise<void> {
  const outcomes = parseSeriesResult(seriesResult);
  console.log(`[executeSeriesResult] Playing ${outcomes.length} games: ${seriesResult}`);

  let lastGameId = '';

  for (let i = 0; i < outcomes.length; i++) {
    const outcome = outcomes[i];
    const isLastGame = i === outcomes.length - 1;
    const gameNum = i + 1;

    console.log(`[executeSeriesResult] Game ${gameNum}/${outcomes.length}: ${outcome}`);

    // Verify Openings tab for both players before each game
    await Promise.all([
      verifyOpeningsTab(player1, seriesId, p1Username, screenshot, gameNum),
      verifyOpeningsTab(player2, seriesId, p2Username, screenshot, gameNum),
    ]);

    // Play the game
    lastGameId = await playOneGame(player1, player2, p1Username, p2Username, outcome);

    // Screenshot: game result (both players' views)
    if (screenshot) {
      await player1.waitForTimeout(300);
      await Promise.all([
        screenshot(`game${gameNum}-result-p1`, player1),
        screenshot(`game${gameNum}-result-p2`, player2),
      ]);
    }

    // Wait for next game if not the last game
    // Includes resting phase (~5s: both confirm + 3s countdown) +
    // selecting (~10s: confirm + countdown + 5s showcase) or randomSelecting (~13s: roulette + 5s showcase)
    if (!isLastGame) {
      await player1.waitForTimeout(500);
      await waitForNextGame(player1, player2, null, lastGameId, 45000, screenshot, gameNum + 1);
    }
  }

  // Handle final resting phase (last game now enters Resting for recap)
  await player1.waitForTimeout(500);
  await Promise.all([
    waitForRestingUI(player1),
    waitForRestingUI(player2),
  ]);

  if (screenshot) {
    await Promise.all([
      screenshot('final-resting-p1', player1),
      screenshot('final-resting-p2', player2),
    ]);
  }

  // Both players confirm ("View result" button)
  await Promise.all([
    confirmNextInResting(player1),
    confirmNextInResting(player2),
  ]);

  // Wait for countdown (3s) + transition to finished
  await player1.waitForTimeout(5000);

  // Verify series finished
  const finished = await isSeriesFinished(player1, seriesId);
  if (!finished) {
    throw new Error(`Series ${seriesId} did not finish after ${outcomes.length} games`);
  }
  console.log(`[executeSeriesResult] Series ${seriesId} finished successfully`);

  // Screenshot: series finished (both players' final views)
  if (screenshot) {
    await Promise.all([
      screenshot('series-finished-p1', player1),
      screenshot('series-finished-p2', player2),
    ]);
  }
}

// ===== Series Forfeit Helpers =====

/**
 * Forfeit a series via the API endpoint
 * Uses the page's session cookies for authentication
 */
export async function forfeitSeriesViaApi(
  page: Page,
  seriesId: string
): Promise<boolean> {
  const response = await page.request.post(`http://localhost:8080/series/${seriesId}/forfeit`, {
    headers: { Accept: 'application/json' },
  });

  const body = await response.text();
  console.log(`[forfeitSeriesViaApi] status=${response.status()}, body=${body}`);

  return response.ok();
}

/**
 * Click the series forfeit button on the game page
 * This triggers the confirm dialog (or immediate forfeit if confirmResign is off)
 */
export async function clickSeriesForfeitButton(page: Page): Promise<void> {
  const forfeitBtn = page.locator(gameSelectors.seriesForfeitBtn);
  await expect(forfeitBtn).toBeVisible({ timeout: 5000 });
  await forfeitBtn.click();
}

/**
 * Confirm the series forfeit (click the confirm button in the act-confirm dialog)
 * Must be called after clickSeriesForfeitButton
 */
export async function confirmSeriesForfeit(page: Page): Promise<void> {
  const confirmBtn = page.locator(gameSelectors.seriesForfeitConfirm);
  await expect(confirmBtn).toBeVisible({ timeout: 5000 });
  await confirmBtn.click();
}

/**
 * Get series winner index from API
 * Returns 0, 1, or null if no winner
 */
export async function getSeriesWinner(
  page: Page,
  seriesId: string
): Promise<number | null> {
  const response = await page.request.get(`http://localhost:8080/series/${seriesId}`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok()) return null;

  const data = await response.json();
  return data.winner ?? null;
}

/**
 * Get a player's index in the series (0 or 1) by username.
 * Player ordering depends on random color assignment, NOT on who created the challenge.
 * Returns 0, 1, or null if not found.
 */
export async function getPlayerIndex(
  page: Page,
  seriesId: string,
  username: string
): Promise<number | null> {
  const response = await page.request.get(`http://localhost:8080/series/${seriesId}`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok()) return null;

  const data = await response.json();
  const players = data.players as Array<{ user?: { id: string } }>;
  for (let i = 0; i < players.length; i++) {
    if (players[i].user?.id === username) return i;
  }
  return null;
}

// ===== Series Finished Page Helpers =====

export const finishedSelectors = {
  container: '.series-finished',
  resultBanner: '.series-finished__result-banner',
  victoryBanner: '.series-finished__result-banner.victory',
  defeatBanner: '.series-finished__result-banner.defeat',
  drawBanner: '.series-finished__result-banner.draw',
  players: '.series-finished__players',
  playerScore: '.series-finished__score',
  vs: '.series-finished__vs',
  scoreTable: '.series-finished__score-table',
  scoreRow: 'tr.series-score__row',
  scoreLabel: '.series-score__label',
  actions: '.series-finished__actions',
  rematchBtn: 'button.series-finished__rematch',
  rematchGlowing: 'button.series-finished__rematch.glowing',
  rematchDisabled: 'button.series-finished__rematch[disabled]',
  homeBtn: 'a.series-finished__home',
};

/**
 * Wait for finished page redirect after series ends.
 * The game page sends a WS redirect to /series/{id}/finished.
 */
export async function waitForFinishedPage(
  page: Page,
  seriesId: string,
  timeout = 15000
): Promise<void> {
  await page.waitForURL(new RegExp(`/series/${seriesId}/finished`), { timeout });
  await expect(page.locator(finishedSelectors.container)).toBeVisible({ timeout: 10000 });
}

/**
 * Verify finished page has the expected UI elements.
 * Returns the banner text, player scores, and game row count.
 */
export async function verifyFinishedPageUI(
  page: Page,
  expectedGameCount: number
): Promise<{ banner: string; scores: string[]; gameRows: number }> {
  // Wait for Snabbdom rendering
  await expect(page.locator(finishedSelectors.resultBanner)).toBeVisible({ timeout: 10000 });

  // Banner text (Victory! or Defeat)
  const banner = (await page.locator(finishedSelectors.resultBanner).textContent()) || '';

  // Player scores (winner on left, loser on right)
  const scoreElements = page.locator(finishedSelectors.playerScore);
  const scoreCount = await scoreElements.count();
  const scores: string[] = [];
  for (let i = 0; i < scoreCount; i++) {
    scores.push((await scoreElements.nth(i).textContent()) || '');
  }

  // Score table rows
  const gameRows = await page.locator(finishedSelectors.scoreRow).count();

  // Verify essential elements are present
  await expect(page.locator(finishedSelectors.rematchBtn)).toBeVisible({ timeout: 5000 });
  await expect(page.locator(finishedSelectors.homeBtn)).toBeVisible({ timeout: 5000 });
  await expect(page.locator(finishedSelectors.scoreLabel)).toContainText('Opening Duel');
  await expect(page.locator(finishedSelectors.vs)).toBeVisible();

  console.log(`[verifyFinishedPageUI] banner="${banner}", scores=${JSON.stringify(scores)}, gameRows=${gameRows}, expected=${expectedGameCount}`);

  return { banner, scores, gameRows };
}

/**
 * Click the Rematch button on the finished page
 */
export async function clickRematchButton(page: Page): Promise<void> {
  const btn = page.locator(`${finishedSelectors.rematchBtn}:not([disabled])`);
  await expect(btn).toBeVisible({ timeout: 5000 });
  await btn.click();
}

/**
 * Check if the rematch button shows "Rematch Offer Sent" state.
 * Uses auto-retrying expect() since the POST is async.
 */
export async function isRematchOfferSent(page: Page): Promise<boolean> {
  try {
    await expect(page.locator(finishedSelectors.rematchDisabled)).toBeVisible({ timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the rematch button is glowing (opponent offered rematch).
 * Uses auto-retrying expect() since the WS notification is async.
 */
export async function isRematchGlowing(page: Page): Promise<boolean> {
  try {
    await expect(page.locator(finishedSelectors.rematchGlowing)).toBeVisible({ timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for rematch redirect to a new series pick page
 */
export async function waitForRematchRedirect(page: Page, timeout = 15000): Promise<string> {
  await page.waitForURL(/\/series\/\w+\/pick/, { timeout });
  const match = page.url().match(/\/series\/(\w+)/);
  return match?.[1] || '';
}
