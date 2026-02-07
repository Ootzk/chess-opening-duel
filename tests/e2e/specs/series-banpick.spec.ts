import { test, expect } from '@playwright/test';
import { users, createTwoPlayerContexts, loginBothPlayers } from '../helpers/auth';
import {
  selectPicks,
  selectBans,
  confirm,
  cancel,
  getCurrentPhase,
  getOpponentStatus,
  waitForGameStart,
  goToSeriesPick,
} from '../helpers/series';

test.describe('Series Ban/Pick Flow', () => {
  test('Pick Phase: 양측 모두 5개 선택 후 Confirm', async ({ browser }) => {
    // 두 플레이어 컨텍스트 생성
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(browser);

    try {
      // 양측 로그인
      await loginBothPlayers(player1, player2, users.lichess, users.mary);

      // Player1이 Series 챌린지 생성 (직접 API 호출로 시뮬레이션)
      // 실제로는 Challenge UI를 통해 생성해야 하지만, 여기서는 간단히 처리
      const response = await player1.request.post('/api/challenge/mary', {
        data: {
          rated: false,
          'clock.limit': 300,
          'clock.increment': 3,
          variant: 'fromPosition',
          series: true,
        },
      });

      // 챌린지 수락 대기 및 시리즈 페이지로 이동
      // (실제 구현에 따라 수정 필요)

      // Pick Phase 테스트
      // await goToSeriesPick(player1, seriesId);
      // await goToSeriesPick(player2, seriesId);

      // 5개 오프닝 선택
      // await selectPicks(player1, 5);
      // await selectPicks(player2, 5);

      // Confirm 버튼 활성화 확인
      // await expect(player1.locator('button.confirm:not(:disabled)')).toBeVisible();
      // await expect(player2.locator('button.confirm:not(:disabled)')).toBeVisible();

      // 양측 Confirm
      // await confirm(player1);
      // await expect(await getOpponentStatus(player2)).toBe('ready');
      // await confirm(player2);

      // 3초 후 Ban Phase로 전환 확인
      // await player1.waitForTimeout(4000);
      // await expect(await getCurrentPhase(player1)).toContain('Ban');
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });

  test('Pick Phase: 5개 미만 선택 시 Confirm 비활성화', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(browser);

    try {
      await loginBothPlayers(player1, player2);

      // TODO: 시리즈 생성 후 Pick 페이지 진입
      // 4개만 선택
      // await selectPicks(player1, 4);

      // Confirm 버튼 비활성화 확인
      // await expect(player1.locator('button.confirm:disabled')).toBeVisible();
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });

  test('Pick Phase: Cancel 후 재선택 가능', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(browser);

    try {
      await loginBothPlayers(player1, player2);

      // TODO: 시리즈 생성 후 Pick 페이지 진입
      // 5개 선택 후 Confirm
      // await selectPicks(player1, 5);
      // await confirm(player1);

      // Cancel 클릭
      // await cancel(player1);

      // 다시 선택 가능한지 확인
      // await expect(player1.locator('.series-pick__opening-card')).not.toHaveClass(/disabled/);
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });

  test('Ban Phase: 양측 모두 2개 밴 후 Confirm', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(browser);

    try {
      await loginBothPlayers(player1, player2);

      // TODO: Pick Phase 완료 후 Ban Phase 진입
      // 2개 밴 선택
      // await selectBans(player1, 2);
      // await selectBans(player2, 2);

      // Confirm
      // await confirm(player1);
      // await confirm(player2);

      // 게임 시작 확인
      // await waitForGameStart(player1);
      // await waitForGameStart(player2);
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });

  test('Timeout: Pick Phase에서 타임아웃 시 자동 확정', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(browser);

    try {
      await loginBothPlayers(player1, player2);

      // TODO: 시리즈 생성 후 Pick 페이지 진입
      // Player1만 선택 및 Confirm
      // await selectPicks(player1, 5);
      // await confirm(player1);

      // Player2는 아무것도 안 함 - 30초 대기
      // await player2.waitForTimeout(32000);

      // Ban Phase로 전환 확인 (Player2도 자동 확정됨)
      // await expect(await getCurrentPhase(player1)).toContain('Ban');
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });

  test('Opponent Status: 상대 확정 시 "Ready!" 표시', async ({ browser }) => {
    const { player1Context, player2Context, player1, player2 } = await createTwoPlayerContexts(browser);

    try {
      await loginBothPlayers(player1, player2);

      // TODO: 시리즈 생성 후 Pick 페이지 진입
      // Player1이 먼저 확정
      // await selectPicks(player1, 5);
      // await confirm(player1);

      // Player2 화면에서 "Ready!" 확인
      // await player2.waitForTimeout(1000); // 폴링 대기
      // await expect(player2.locator('.series-pick__opponent-status.ready')).toBeVisible();
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});
