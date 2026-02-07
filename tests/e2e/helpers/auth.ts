import { Page, BrowserContext } from '@playwright/test';

export interface TestUser {
  username: string;
  password: string;
}

// 기본 테스트 계정 (lila-docker Full mode에서 생성됨)
export const users = {
  lichess: { username: 'lichess', password: 'password' },
  mary: { username: 'mary', password: 'password' },
  peter: { username: 'peter', password: 'password' },
} as const;

/**
 * 로그인 수행
 */
export async function login(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  await page.fill('input[name="username"]', user.username);
  await page.fill('input[name="password"]', user.password);
  await page.click('button[type="submit"]');

  // 로그인 완료 대기 (로비 또는 홈으로 리다이렉트)
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 });
}

/**
 * 두 플레이어를 위한 독립적인 브라우저 컨텍스트 생성
 */
export async function createTwoPlayerContexts(browser: import('@playwright/test').Browser): Promise<{
  player1Context: BrowserContext;
  player2Context: BrowserContext;
  player1: Page;
  player2: Page;
}> {
  const player1Context = await browser.newContext();
  const player2Context = await browser.newContext();

  const player1 = await player1Context.newPage();
  const player2 = await player2Context.newPage();

  return { player1Context, player2Context, player1, player2 };
}

/**
 * 두 플레이어 모두 로그인
 */
export async function loginBothPlayers(
  player1: Page,
  player2: Page,
  user1: TestUser = users.lichess,
  user2: TestUser = users.mary
): Promise<void> {
  await Promise.all([
    login(player1, user1),
    login(player2, user2),
  ]);
}
