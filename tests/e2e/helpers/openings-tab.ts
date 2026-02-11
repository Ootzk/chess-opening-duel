import { Page, expect } from '@playwright/test';

/**
 * Openings Tab Verification Helpers
 *
 * Verifies the "Openings" tab in the game chat panel during series games.
 * Checks that each sub-tab (my picks, opponent picks) displays
 * the correct remaining openings with matching names and FEN positions.
 */

export type ScreenshotFn = (name: string, page: Page) => Promise<void>;

// ===== Selectors =====

export const openingsTabSelectors = {
  // Chat main tabs (from renderChat.ts: 'div.mchat__tab.' + tab.key)
  openingsTab: 'div.mchat__tab.seriesOpenings',
  chatRoomTab: 'div.mchat__tab.discussion',

  // Sub-tabs within Openings plugin
  subTab: '.series-openings__tab',
  activeSubTab: '.series-openings__tab.active',

  // Opening cards
  card: '.series-openings__card',
  cardName: '.series-openings__name',
  cardBoard: '.series-openings__board',

  // Empty state
  empty: '.series-openings__empty',
};

// ===== Types =====

interface SeriesOpeningData {
  name: string;
  fen: string;
  source: string; // 'pick' | 'ban'
  owner: number; // 0 or 1
  usedInRound?: number | null;
}

interface DisplayedOpening {
  name: string;
  fen: string;
}

// ===== Internal Helpers =====

/**
 * Fetch series openings and players from API
 */
async function fetchSeriesOpenings(
  page: Page,
  seriesId: string,
): Promise<{
  openings: SeriesOpeningData[];
  players: Array<{ user?: { id: string }; index: number }>;
}> {
  const response = await page.request.get(`http://localhost:8080/series/${seriesId}`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok()) {
    throw new Error(`Failed to fetch series data: ${response.status()}`);
  }

  const data = await response.json();
  return {
    openings: data.openings || [],
    players: data.players || [],
  };
}

/**
 * Compute remaining picks for a player.
 * Same logic as seriesOpenings.ts → remainingPicks()
 */
function computeRemainingPicks(openings: SeriesOpeningData[], playerIndex: number): SeriesOpeningData[] {
  const picks = openings.filter(o => o.owner === playerIndex && o.source === 'pick');
  const oppBanNames = new Set(
    openings.filter(o => o.owner === (1 - playerIndex) && o.source === 'ban').map(o => o.name),
  );
  return picks.filter(p => !oppBanNames.has(p.name) && !p.usedInRound);
}

/**
 * Read displayed openings from the currently active sub-tab
 */
async function getDisplayedOpenings(page: Page): Promise<DisplayedOpening[]> {
  const cards = page.locator(openingsTabSelectors.card);
  const count = await cards.count();
  const result: DisplayedOpening[] = [];

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const name = (await card.locator(openingsTabSelectors.cardName).textContent()) || '';
    const board = card.locator(openingsTabSelectors.cardBoard);
    const dataState = (await board.getAttribute('data-state')) || '';
    // data-state format: "FEN,white," → extract FEN (first comma-separated part)
    const fen = dataState.split(',')[0];
    result.push({ name: name.trim(), fen });
  }

  return result;
}

/**
 * Verify a single sub-tab's content against expected openings
 */
async function verifySubTabContent(
  page: Page,
  tabIndex: number,
  expected: SeriesOpeningData[],
  label: string,
): Promise<void> {
  // Click the sub-tab
  const subTabs = page.locator(openingsTabSelectors.subTab);
  await subTabs.nth(tabIndex).click();
  await page.waitForTimeout(500); // Wait for re-render + mini-board init

  if (expected.length === 0) {
    // Should show empty state
    const emptyVisible = await page.locator(openingsTabSelectors.empty).isVisible().catch(() => false);
    expect(emptyVisible).toBe(true);
    console.log(`[verifyOpeningsTab] ${label}: empty (correct, 0 expected)`);
    return;
  }

  const displayed = await getDisplayedOpenings(page);

  // Log details for debugging
  console.log(
    `[verifyOpeningsTab] ${label}: displayed=${JSON.stringify(displayed.map(d => d.name))}, ` +
      `expected=${JSON.stringify(expected.map(e => e.name))}`,
  );

  // Verify count
  expect(displayed.length).toBe(expected.length);

  // Build lookup maps
  const expectedNames = new Set(expected.map(o => o.name));
  const expectedFenMap = new Map(expected.map(o => [o.name, o.fen]));

  // Verify each displayed opening has matching name and FEN
  for (const d of displayed) {
    expect(expectedNames.has(d.name)).toBe(true);
    const expectedFen = expectedFenMap.get(d.name);
    expect(d.fen).toBe(expectedFen);
  }

  console.log(`[verifyOpeningsTab] ${label}: ${displayed.length} openings verified`);
}

// ===== Public API =====

/**
 * Full Openings tab verification for one player on a game page.
 *
 * 1. Fetches series data from API
 * 2. Clicks the Openings tab in chat panel
 * 3. Verifies each sub-tab (my picks, opponent picks)
 * 4. Takes a screenshot
 * 5. Switches back to Chat room tab
 */
export async function verifyOpeningsTab(
  page: Page,
  seriesId: string,
  username: string,
  screenshot?: ScreenshotFn,
  gameNum?: number,
): Promise<void> {
  // 1. Fetch series data
  const { openings, players } = await fetchSeriesOpenings(page, seriesId);

  // 2. Determine POV index
  const povIndex = players.findIndex(p => p.user?.id === username.toLowerCase());
  if (povIndex === -1) {
    throw new Error(`Player ${username} not found in series ${seriesId}`);
  }
  const oppIndex = 1 - povIndex;

  // 3. Compute expected openings for each tab
  const expectedMy = computeRemainingPicks(openings, povIndex);
  const expectedOpp = computeRemainingPicks(openings, oppIndex);
  console.log(
    `[verifyOpeningsTab] ${username} (idx=${povIndex}): ` +
      `my=${expectedMy.length}, opp=${expectedOpp.length}`,
  );

  // 4. Click Openings tab in chat
  const openingsTab = page.locator(openingsTabSelectors.openingsTab);
  await expect(openingsTab).toBeVisible({ timeout: 5000 });
  await openingsTab.click();
  await page.waitForTimeout(500); // Wait for lazy CSS load + render

  // 5. Verify each sub-tab with individual screenshots
  await verifySubTabContent(page, 0, expectedMy, `${username}-my`);
  if (screenshot && gameNum) {
    await screenshot(`game${gameNum}-openings-my-${username}`, page);
  }

  await verifySubTabContent(page, 1, expectedOpp, `${username}-opp`);
  if (screenshot && gameNum) {
    await screenshot(`game${gameNum}-openings-opp-${username}`, page);
  }

  // 7. Switch back to Chat room tab
  const chatTab = page.locator(openingsTabSelectors.chatRoomTab);
  await chatTab.click();
  await page.waitForTimeout(200);
}
