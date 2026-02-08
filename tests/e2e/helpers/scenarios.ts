import { TestUser, users } from './auth';

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
