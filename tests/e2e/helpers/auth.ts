import { Page, BrowserContext, Browser } from '@playwright/test';

export interface TestUser {
  username: string;
  password: string;
  storageState: string;
}

// 기본 테스트 계정 (lila-docker Full mode에서 생성됨)
// storageState는 global-setup에서 생성됨
export const users = {
  elena: { username: 'elena', password: 'password', storageState: '.auth/elena.json' },
  hans: { username: 'hans', password: 'password', storageState: '.auth/hans.json' },
} as const;

/**
 * 두 플레이어를 위한 독립적인 브라우저 컨텍스트 생성 (저장된 세션 사용)
 */
export async function createTwoPlayerContexts(
  browser: Browser,
  user1: TestUser = users.elena,
  user2: TestUser = users.hans
): Promise<{
  player1Context: BrowserContext;
  player2Context: BrowserContext;
  player1: Page;
  player2: Page;
}> {
  // 저장된 로그인 세션으로 컨텍스트 생성
  const player1Context = await browser.newContext({ storageState: user1.storageState });
  const player2Context = await browser.newContext({ storageState: user2.storageState });

  const player1 = await player1Context.newPage();
  const player2 = await player2Context.newPage();

  return { player1Context, player2Context, player1, player2 };
}

/**
 * 두 플레이어 모두 로그인 (이미 세션이 로드되어 있으므로 홈페이지로 이동만)
 */
export async function loginBothPlayers(
  player1: Page,
  player2: Page,
  _user1: TestUser = users.elena,
  _user2: TestUser = users.hans
): Promise<void> {
  // 세션이 이미 로드되어 있으므로 홈페이지로 이동만 하면 됨
  await Promise.all([
    player1.goto('/'),
    player2.goto('/'),
  ]);
  await Promise.all([
    player1.waitForLoadState('networkidle'),
    player2.waitForLoadState('networkidle'),
  ]);
}
