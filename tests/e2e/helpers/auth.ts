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
  // Pair 10: Series forfeit during game (with moves)
  fatima: { username: 'fatima', password: 'password', storageState: '.auth/fatima.json' },
  diego: { username: 'diego', password: 'password', storageState: '.auth/diego.json' },
  // Pair 11: Series forfeit at game start (no moves)
  salma: { username: 'salma', password: 'password', storageState: '.auth/salma.json' },
  benjamin: { username: 'benjamin', password: 'password', storageState: '.auth/benjamin.json' },
  // Pair 12: Finished page + rematch
  patricia: { username: 'patricia', password: 'password', storageState: '.auth/patricia.json' },
  adriana: { username: 'adriana', password: 'password', storageState: '.auth/adriana.json' },
  // Pair 13: Countdown verification (pick/ban phase)
  mary: { username: 'mary', password: 'password', storageState: '.auth/mary.json' },
  jose: { username: 'jose', password: 'password', storageState: '.auth/jose.json' },
  // Pair 14: Countdown cancel behavior
  iryna: { username: 'iryna', password: 'password', storageState: '.auth/iryna.json' },
  pedro: { username: 'pedro', password: 'password', storageState: '.auth/pedro.json' },
  // Pair 15: Disconnect during game → series forfeit
  aaron: { username: 'aaron', password: 'password', storageState: '.auth/aaron.json' },
  jacob: { username: 'jacob', password: 'password', storageState: '.auth/jacob.json' },
  // Pair 16: Disconnect during game 3 (after 0-2 score) → series forfeit
  svetlana: { username: 'svetlana', password: 'password', storageState: '.auth/svetlana.json' },
  qing: { username: 'qing', password: 'password', storageState: '.auth/qing.json' },
  // Pair 17: Pool exhaustion → series draw
  dmitry: { username: 'dmitry', password: 'password', storageState: '.auth/dmitry.json' },
  milena: { username: 'milena', password: 'password', storageState: '.auth/milena.json' },
  // Pair 18: Resting phase - both confirm quickly
  yaroslava: { username: 'yaroslava', password: 'password', storageState: '.auth/yaroslava.json' },
  ekaterina: { username: 'ekaterina', password: 'password', storageState: '.auth/ekaterina.json' },
  // Pair 19: Resting phase - timeout (no confirm)
  margarita: { username: 'margarita', password: 'password', storageState: '.auth/margarita.json' },
  yevgeny: { username: 'yevgeny', password: 'password', storageState: '.auth/yevgeny.json' },
  // Pair 20: NoStart - white doesn't move
  yunel: { username: 'yunel', password: 'password', storageState: '.auth/yunel.json' },
  idris: { username: 'idris', password: 'password', storageState: '.auth/idris.json' },
  // Pair 21: NoStart - white moves, black doesn't
  aleksandr: { username: 'aleksandr', password: 'password', storageState: '.auth/aleksandr.json' },
  veer: { username: 'veer', password: 'password', storageState: '.auth/veer.json' },
  // Pair 22: Pool customization → verify custom openings in pick phase
  ramesh: { username: 'ramesh', password: 'password', storageState: '.auth/ramesh.json' },
  nushi: { username: 'nushi', password: 'password', storageState: '.auth/nushi.json' },
  // Pair 23: Selecting timeout → random pick (loser doesn't select)
  kwame: { username: 'kwame', password: 'password', storageState: '.auth/kwame.json' },
  sonia: { username: 'sonia', password: 'password', storageState: '.auth/sonia.json' },
  // Pair 24: Resting both DC → series abort
  tomoko: { username: 'tomoko', password: 'password', storageState: '.auth/tomoko.json' },
  renata: { username: 'renata', password: 'password', storageState: '.auth/renata.json' },
  // Pair 25: Resting 1 DC → series forfeit
  yarah: { username: 'yarah', password: 'password', storageState: '.auth/yarah.json' },
  suresh: { username: 'suresh', password: 'password', storageState: '.auth/suresh.json' },
  // Pair 26: Reconnection banner on home page
  frances: { username: 'frances', password: 'password', storageState: '.auth/frances.json' },
  emmanuel: { username: 'emmanuel', password: 'password', storageState: '.auth/emmanuel.json' },
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
