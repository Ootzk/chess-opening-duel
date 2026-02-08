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

// Typed user pairs for different test scenarios
export type UserKey = keyof typeof users;

// Pick/Ban behavior types
export type PickBanBehavior = 'confirm' | 'full-timeout' | 'partial-timeout' | 'none-timeout';

// Test scenario definition
export interface TestScenario {
  id: number;
  player1: TestUser;
  player2: TestUser;
  pick: { p1: PickBanBehavior; p2: PickBanBehavior };
  ban: { p1: PickBanBehavior; p2: PickBanBehavior };
  seriesResult: string; // e.g., '0 - 1/2 - 1 - 1'
  description: string;
}

/**
 * Test Scenario Matrix
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
 */
export const testScenarios: TestScenario[] = [
  {
    id: 0,
    player1: users.elena,
    player2: users.hans,
    pick: { p1: 'confirm', p2: 'confirm' },
    ban: { p1: 'confirm', p2: 'confirm' },
    seriesResult: '0 - 1/2 - 1 - 1',
    description: '역전승 4게임',
  },
  {
    id: 1,
    player1: users.yulia,
    player2: users.luis,
    pick: { p1: 'confirm', p2: 'full-timeout' },
    ban: { p1: 'confirm', p2: 'none-timeout' },
    seriesResult: '1 - 1 - 1',
    description: '3연승',
  },
  {
    id: 2,
    player1: users.ana,
    player2: users.lola,
    pick: { p1: 'full-timeout', p2: 'confirm' },
    ban: { p1: 'none-timeout', p2: 'confirm' },
    seriesResult: '0 - 1 - 0 - 1 - 1/2 - 1',
    description: '서든데스 (P2 선행)',
  },
  {
    id: 3,
    player1: users.carlos,
    player2: users.nina,
    pick: { p1: 'partial-timeout', p2: 'confirm' },
    ban: { p1: 'confirm', p2: 'partial-timeout' },
    seriesResult: '0 - 0 - 1 - 1 - 1',
    description: '0-2 역전',
  },
  {
    id: 4,
    player1: users.oscar,
    player2: users.petra,
    pick: { p1: 'confirm', p2: 'partial-timeout' },
    ban: { p1: 'partial-timeout', p2: 'confirm' },
    seriesResult: '1 - 1/2 - 1',
    description: '조기승리',
  },
  {
    id: 5,
    player1: users.boris,
    player2: users.david,
    pick: { p1: 'none-timeout', p2: 'confirm' },
    ban: { p1: 'confirm', p2: 'full-timeout' },
    seriesResult: '1 - 0 - 1 - 0 - 1/2 - 1',
    description: '서든데스 (P1 선행)',
  },
  {
    id: 6,
    player1: users.mei,
    player2: users.ivan,
    pick: { p1: 'confirm', p2: 'none-timeout' },
    ban: { p1: 'full-timeout', p2: 'confirm' },
    seriesResult: '0 - 1 - 1 - 1',
    description: '4경기',
  },
];

// Legacy compatibility - deprecated, use testScenarios instead
export const testPairs = {
  happyPath: { player1: users.elena, player2: users.hans },
  banTimeout: { player1: users.boris, player2: users.david },
  sweep: { player1: users.yulia, player2: users.luis },
  pickTimeout: { player1: users.mei, player2: users.ivan },
  smoke: { player1: users.ana, player2: users.lola },
  comeback: { player1: users.carlos, player2: users.nina },
  earlyWin: { player1: users.oscar, player2: users.petra },
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
