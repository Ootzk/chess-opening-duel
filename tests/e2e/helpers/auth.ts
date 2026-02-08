import { Page, BrowserContext, Browser } from '@playwright/test';

export interface TestUser {
  username: string;
  password: string;
  storageState: string;
}

// 테스트 계정 (lila-docker Full mode에서 생성됨)
// storageState는 global-setup에서 생성됨
export const users = {
  // Pair 1: Happy path (pick confirm → ban confirm → game)
  elena: { username: 'elena', password: 'password', storageState: '.auth/elena.json' },
  hans: { username: 'hans', password: 'password', storageState: '.auth/hans.json' },
  // Pair 2: Pick OK → Ban timeout
  boris: { username: 'boris', password: 'password', storageState: '.auth/boris.json' },
  david: { username: 'david', password: 'password', storageState: '.auth/david.json' },
  // Pair 3: Pick OK → Disconnect during ban
  yulia: { username: 'yulia', password: 'password', storageState: '.auth/yulia.json' },
  luis: { username: 'luis', password: 'password', storageState: '.auth/luis.json' },
  // Pair 4: Pick timeout
  mei: { username: 'mei', password: 'password', storageState: '.auth/mei.json' },
  ivan: { username: 'ivan', password: 'password', storageState: '.auth/ivan.json' },
  // Pair 5: Smoke tests (quick sanity checks)
  ana: { username: 'ana', password: 'password', storageState: '.auth/ana.json' },
  lola: { username: 'lola', password: 'password', storageState: '.auth/lola.json' },
  // Pair 6: Victory condition - 3-2 comeback
  carlos: { username: 'carlos', password: 'password', storageState: '.auth/carlos.json' },
  nina: { username: 'nina', password: 'password', storageState: '.auth/nina.json' },
  // Pair 7: Victory condition - 2.5-0.5 early win
  oscar: { username: 'oscar', password: 'password', storageState: '.auth/oscar.json' },
  petra: { username: 'petra', password: 'password', storageState: '.auth/petra.json' },
  // Pair 8: Pick phase disconnect abort
  angel: { username: 'angel', password: 'password', storageState: '.auth/angel.json' },
  bobby: { username: 'bobby', password: 'password', storageState: '.auth/bobby.json' },
  // Pair 9: Ban phase disconnect abort
  marcel: { username: 'marcel', password: 'password', storageState: '.auth/marcel.json' },
  vera: { username: 'vera', password: 'password', storageState: '.auth/vera.json' },
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
