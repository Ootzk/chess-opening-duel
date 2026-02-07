import { Page, expect } from '@playwright/test';

/**
 * Series Challenge 생성 (Player1이 Player2에게)
 */
export async function createSeriesChallenge(
  challenger: Page,
  opponentUsername: string
): Promise<string> {
  // 상대 프로필로 이동
  await challenger.goto(`/@/${opponentUsername}`);

  // Challenge 버튼 클릭 (Series Match)
  await challenger.click('a[href*="challenge"][data-series="true"], button:has-text("Series")');

  // 챌린지 URL에서 ID 추출 또는 시리즈 페이지 대기
  await challenger.waitForURL(/\/series\//, { timeout: 10000 });
  const url = challenger.url();
  const seriesId = url.match(/\/series\/(\w+)/)?.[1];

  if (!seriesId) {
    throw new Error('Failed to extract series ID from URL');
  }

  return seriesId;
}

/**
 * Pick Phase: 5개 오프닝 선택
 */
export async function selectPicks(page: Page, count: number = 5): Promise<void> {
  // 선택 가능한 오프닝 카드들
  const openingCards = page.locator('.series-pick__opening-card:not(.selected)');

  for (let i = 0; i < count; i++) {
    await openingCards.first().click();
    // 선택 반영 대기
    await page.waitForTimeout(100);
  }
}

/**
 * Ban Phase: 2개 오프닝 밴
 */
export async function selectBans(page: Page, count: number = 2): Promise<void> {
  // 상대의 픽 중 선택 가능한 것들
  const banCards = page.locator('.series-pick__opponent-opening:not(.banned)');

  for (let i = 0; i < count; i++) {
    await banCards.first().click();
    await page.waitForTimeout(100);
  }
}

/**
 * Confirm 버튼 클릭
 */
export async function confirm(page: Page): Promise<void> {
  const confirmBtn = page.locator('button.confirm:not(:disabled)');
  await confirmBtn.click();
}

/**
 * Cancel 버튼 클릭
 */
export async function cancel(page: Page): Promise<void> {
  const cancelBtn = page.locator('button.cancel');
  await cancelBtn.click();
}

/**
 * 현재 Phase 확인
 */
export async function getCurrentPhase(page: Page): Promise<string> {
  const phaseElement = page.locator('.series-pick__phase-name');
  return await phaseElement.textContent() || '';
}

/**
 * 타이머 값 확인
 */
export async function getTimeLeft(page: Page): Promise<number> {
  const timerElement = page.locator('.series-pick__timer');
  const text = await timerElement.textContent() || '0';
  return parseInt(text, 10);
}

/**
 * 상대 상태 확인
 */
export async function getOpponentStatus(page: Page): Promise<'ready' | 'waiting' | 'disconnected' | null> {
  const statusElement = page.locator('.series-pick__opponent-status');
  if (await statusElement.locator('.ready').count() > 0) return 'ready';
  if (await statusElement.locator('.waiting').count() > 0) return 'waiting';
  if (await statusElement.locator('.disconnected').count() > 0) return 'disconnected';
  return null;
}

/**
 * 게임 화면으로 전환 대기
 */
export async function waitForGameStart(page: Page): Promise<void> {
  await page.waitForURL(/\/[a-zA-Z0-9]{8}/, { timeout: 30000 });
}

/**
 * 시리즈 페이지로 이동
 */
export async function goToSeriesPick(page: Page, seriesId: string): Promise<void> {
  await page.goto(`/series/${seriesId}/pick`);
  await page.waitForSelector('.series-pick', { timeout: 10000 });
}
