import { Page, expect } from '@playwright/test';

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
 * Create a series by having player1 challenge player2
 * Returns the series ID
 */
export async function createSeriesChallenge(
  player1: Page,
  player2: Page,
  player2Username: string,
  timeMinutes = 5,
  incrementSeconds = 3
): Promise<string> {
  // Player1: Navigate to player2's profile and challenge
  await player1.goto(`/@/${player2Username}`);
  await player1.waitForLoadState('networkidle');

  // Click the challenge button
  const challengeBtn = player1.locator('a.user-challenge, button.challenge, a:has-text("Challenge")');
  await expect(challengeBtn.first()).toBeVisible({ timeout: 5000 });
  await challengeBtn.first().click();

  // Wait for setup modal/page
  await player1.waitForTimeout(500);

  // Check if we're on a setup page or in a modal
  // Try to find "Opening Duel" option or matchType selector
  const openingDuelOption = player1.locator(
    'input[value="openingDuel"], ' +
    'select option[value="openingDuel"], ' +
    'label:has-text("Opening Duel"), ' +
    '.radio-group label:has-text("Opening Duel")'
  );

  if (await openingDuelOption.count() > 0) {
    await openingDuelOption.first().click();
  }

  // Submit the challenge form
  const submitBtn = player1.locator('button[type="submit"], button:has-text("Create"), .submit');
  await submitBtn.first().click();

  // Wait for challenge page
  await player1.waitForURL(/\/(challenge|series)\//, { timeout: 10000 });

  // Get challenge URL for player2 if on challenge page
  let challengeUrl = player1.url();
  let seriesId: string | undefined;

  if (challengeUrl.includes('/challenge/')) {
    // Player2 needs to accept the challenge
    await player2.goto(challengeUrl);
    await player2.waitForLoadState('networkidle');

    // Accept the challenge
    const acceptBtn = player2.locator(lobbySelectors.challengeAcceptBtn);
    await expect(acceptBtn.first()).toBeVisible({ timeout: 5000 });
    await acceptBtn.first().click();

    // Wait for redirect to series pick page
    await player2.waitForURL(/\/series\/.*\/pick/, { timeout: 15000 });

    // Extract series ID from player2's URL
    const match = player2.url().match(/\/series\/(\w+)/);
    seriesId = match?.[1];
  } else if (challengeUrl.includes('/series/')) {
    // Already redirected to series
    const match = challengeUrl.match(/\/series\/(\w+)/);
    seriesId = match?.[1];
  }

  if (!seriesId) {
    throw new Error(`Failed to get series ID. Current URL: ${player1.url()}`);
  }

  // Navigate both players to pick page
  const pickUrl = `/series/${seriesId}/pick`;
  await Promise.all([
    player1.goto(pickUrl),
    player2.goto(pickUrl),
  ]);

  // Wait for pick page to load on both
  await Promise.all([
    expect(player1.locator(selectors.seriesPick)).toBeVisible({ timeout: 10000 }),
    expect(player2.locator(selectors.seriesPick)).toBeVisible({ timeout: 10000 }),
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
