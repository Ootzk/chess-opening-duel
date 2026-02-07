import { Page, expect } from '@playwright/test';
import { Chess } from 'chess.js';

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

  // Selecting phase (loser selects)
  selectingWaiting: '.series-pick.selecting-waiting',
};

/**
 * Select N openings (clicks on unselected, non-disabled openings)
 */
export async function selectOpenings(page: Page, count: number): Promise<void> {
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
  const realTimeTab = player1.locator('.game-setup .tabs-horiz span:has-text("Real time")');
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
  await expect(gameSetup).not.toBeVisible({ timeout: 10000 });

  // Wait for page to stabilize
  await player1.waitForLoadState('networkidle');

  // Search for opponent and invite them
  // Look for the search textbox in "Or invite a Lichess user" section
  const searchBox = player1.locator('input[placeholder="Search"], input[type="text"]').last();
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
 * Get current game state via Board API streaming
 * Returns the initial FEN and all moves played so far
 * Note: Uses timeout since streaming endpoint never closes
 */
export async function getGameStateViaApi(
  page: Page,
  username: string,
  gameId: string
): Promise<{ initialFen: string; moves: string }> {
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
 * Returns true if it's the specified color's turn
 * Uses Board API streaming to get accurate current game state
 */
export async function isMyTurn(
  page: Page,
  username: string,
  myColor: 'white' | 'black'
): Promise<boolean> {
  const gameId = getGameIdFromUrl(page.url());
  if (!gameId) return myColor === 'white';

  try {
    const { initialFen, moves } = await getGameStateViaApi(page, username, gameId);
    const currentFen = computeCurrentFen(initialFen, moves);
    const chess = new Chess(currentFen);
    const turnColor = chess.turn(); // 'w' or 'b'

    return (turnColor === 'w' && myColor === 'white') ||
           (turnColor === 'b' && myColor === 'black');
  } catch {
    return myColor === 'white';
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
  if (await page.locator(selectors.selectingWaiting).isVisible({ timeout: 500 }).catch(() => false)) {
    return 'SelectingWaiting';
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
