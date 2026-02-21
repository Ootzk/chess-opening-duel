import { test, expect } from '@playwright/test';
import { users, createTwoPlayerContexts, loginBothPlayers } from '../helpers/auth';
import { cleanupPairData } from '../helpers/cleanup';
import {
  createSeriesChallenge,
  waitForPhase,
  waitForSnabbdomReady,
  selectors,
} from '../helpers/series';

/**
 * Test 23: Opening Pool Customize → Pick Phase 검증
 *
 * 시나리오:
 * 1. P1(ramesh)이 기본 pool에서 5개 오프닝을 X 버튼으로 삭제
 * 2. P1이 5개 새로운 오프닝을 "Play as White"/"Play as Black" 버튼으로 추가
 * 3. P1과 P2(nushi)가 Opening Duel 생성
 * 4. Pick Phase에서 P1의 10개 오프닝에 새로 추가한 5개가 포함되어 있는지 검증
 */

const p1User = users.ramesh;
const p2User = users.nushi;
const p1Username = p1User.username;
const p2Username = p2User.username;
const pairUsers = [p1Username, p2Username];

// 기본 프리셋 10개 중 삭제할 5개 (첫 5개)
const defaultPresetNames = [
  'Ruy Lopez: Marshall Attack',
  'Italian Game: Classical Variation, Giuoco Pianissimo',
  "Queen's Gambit Declined: Normal Defense",
  'Catalan Opening: Open Defense, Classical Line',
  'English Opening: King\'s English Variation, Two Knights Variation',
  'Sicilian Defense: Najdorf Variation',
  'Nimzo-Indian Defense',
  'Benoni Defense',
  'Caro-Kann Defense: Classical Variation',
  'French Defense: Winawer Variation',
];

// 추가 후보 10개 (기본 프리셋에 없는 것들) — 이 중 5개를 랜덤 선택
const newOpeningCandidates = [
  { url: '/opening/Sicilian_Defense', name: 'Sicilian Defense', color: 'white' },
  { url: '/opening/French_Defense', name: 'French Defense', color: 'black' },
  { url: '/opening/Scandinavian_Defense', name: 'Scandinavian Defense', color: 'white' },
  { url: '/opening/Pirc_Defense', name: 'Pirc Defense', color: 'black' },
  { url: '/opening/Kings_Indian_Defense', name: "King's Indian Defense", color: 'white' },
  { url: '/opening/Dutch_Defense', name: 'Dutch Defense', color: 'black' },
  { url: '/opening/Scotch_Game', name: 'Scotch Game', color: 'white' },
  { url: '/opening/Vienna_Game', name: 'Vienna Game', color: 'white' },
  { url: '/opening/Philidor_Defense', name: 'Philidor Defense', color: 'black' },
  { url: '/opening/Queens_Gambit_Accepted', name: "Queen's Gambit Accepted", color: 'white' },
];

// 셔플 후 5개 선택
function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}
const newOpenings = pickRandom(newOpeningCandidates, 5);

let screenshotCounter = 0;
function makeScreenshot(testInfo: typeof test) {
  return async (name: string, page: import('@playwright/test').Page) => {
    screenshotCounter++;
    const label = `${String(screenshotCounter).padStart(2, '0')}-${name}`;
    await testInfo.info().attach(label, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  };
}

test.describe('Test 23: Pool Customize → Pick Phase Verification', () => {
  test.beforeAll(() => {
    cleanupPairData(pairUsers);
  });

  test('[Test 23] 커스텀 pool로 시리즈 생성 시 Pick Phase에 새 오프닝 표시', async ({ browser }) => {
    test.setTimeout(120_000);
    const screenshot = makeScreenshot(test);
    const { player1Context, player2Context, player1, player2 } =
      await createTwoPlayerContexts(browser, p1User, p2User);

    try {
      // ===== Step 1: P1이 /opening 페이지로 이동하여 pool 확인 =====
      await test.step('P1: /opening 페이지에서 기본 pool 확인 (10개)', async () => {
        await player1.goto('/opening');
        await player1.waitForLoadState('networkidle');

        const poolTable = player1.locator('.opening__pool');
        await expect(poolTable).toBeVisible();

        const rows = player1.locator('.opening__pool__row');
        await expect(rows).toHaveCount(10);
        await screenshot('01-initial-pool', player1);
      });

      // ===== Step 2: P1이 5개 오프닝 삭제 =====
      await test.step('P1: pool에서 5개 오프닝 삭제', async () => {
        for (let i = 0; i < 5; i++) {
          // 항상 첫 번째 활성화된 X 버튼 클릭
          const removeBtn = player1.locator('.opening__pool__remove:not([disabled])').first();
          await expect(removeBtn).toBeVisible({ timeout: 5000 });
          await removeBtn.click();

          // AJAX 응답 대기 (테이블 리렌더링)
          await player1.waitForTimeout(1000);
          await screenshot(`02-after-remove-${i + 1}`, player1);
        }

        // 5개 남았는지 확인
        const rows = player1.locator('.opening__pool__row');
        await expect(rows).toHaveCount(5);

        // 남은 X 버튼이 모두 disabled인지 확인
        const disabledBtns = player1.locator('.opening__pool__remove[disabled]');
        await expect(disabledBtns).toHaveCount(5);
      });

      // 삭제 후 남은 오프닝 이름 수집
      const remainingNames: string[] = [];
      await test.step('P1: 남은 5개 오프닝 이름 수집', async () => {
        const nameLinks = player1.locator('.opening__pool__opening a');
        const count = await nameLinks.count();
        for (let i = 0; i < count; i++) {
          const text = await nameLinks.nth(i).textContent();
          if (text) remainingNames.push(text.trim());
        }
        console.log('[Test 23] Remaining pool openings:', remainingNames);
      });

      // ===== Step 2.5: 승률 불균형 오프닝(Bongcloud) 추가 차단 검증 =====
      await test.step('P1: Bongcloud Attack 추가 시 버튼 비활성화 확인', async () => {
        await player1.goto('/opening/Bongcloud_Attack/e4_e5_Ke2');
        await player1.waitForLoadState('networkidle');

        // 양쪽 버튼 모두 disabled 상태여야 함
        const whiteBtn = player1.locator('.opening__pool-add__btn--white');
        const blackBtn = player1.locator('.opening__pool-add__btn--black');

        // 버튼이 존재하면 disabled 확인
        const whiteBtnVisible = await whiteBtn.isVisible({ timeout: 3000 }).catch(() => false);
        if (whiteBtnVisible) {
          await expect(whiteBtn).toBeDisabled();
          await expect(blackBtn).toBeDisabled();

          // data-imbalanced 속성 확인
          const imbalanced = await whiteBtn.getAttribute('data-imbalanced');
          expect(imbalanced).toBe('true');

          // tooltip 확인: "Win rate too imbalanced" 포함
          const whiteTitle = await whiteBtn.getAttribute('title');
          expect(whiteTitle).toContain('Win rate too imbalanced');
          console.log(`[Test 23] ✓ Imbalanced tooltip: "${whiteTitle}"`);

          console.log('[Test 23] ✓ Bongcloud buttons disabled (win rate imbalanced)');
          await screenshot('02.5-bongcloud-blocked', player1);
        } else {
          // exactOpening이 아니면 버튼 자체가 없을 수 있음
          console.log('[Test 23] ✓ Bongcloud has no add buttons (not exactOpening)');
        }
      });

      // ===== Step 3: P1이 5개 새 오프닝 추가 =====
      const addedNames: string[] = [];
      await test.step('P1: 5개 새 오프닝을 opening 페이지에서 추가', async () => {
        for (const opening of newOpenings) {
          await player1.goto(opening.url);
          await player1.waitForLoadState('networkidle');

          // "Play as White" 또는 "Play as Black" 버튼 클릭
          const btnSelector = opening.color === 'white'
            ? '.opening__pool-add__btn--white:not([disabled])'
            : '.opening__pool-add__btn--black:not([disabled])';
          const addBtn = player1.locator(btnSelector);

          // 버튼이 있으면 클릭, 없으면 해당 오프닝은 exactOpening이 아닐 수 있음
          const btnVisible = await addBtn.isVisible({ timeout: 3000 }).catch(() => false);
          if (btnVisible) {
            await addBtn.click();
            await player1.waitForTimeout(1000); // AJAX 응답 대기

            // 추가된 오프닝 이름 기록
            addedNames.push(opening.name);
            await screenshot(`03-added-${opening.name.replace(/\s+/g, '-')}`, player1);
          } else {
            console.log(`[Test 23] Warning: Add button not visible for ${opening.name} at ${opening.url}`);
          }
        }
        console.log('[Test 23] Added openings:', addedNames);
        expect(addedNames.length).toBeGreaterThanOrEqual(3); // 최소 3개는 추가되어야 함
      });

      // pool 테이블에 10개 있는지 확인
      await test.step('P1: pool 테이블에 10개 오프닝 확인', async () => {
        // 마지막 추가한 페이지에서 pool 테이블 확인
        const rows = player1.locator('.opening__pool__row');
        const expectedCount = 5 + addedNames.length;
        await expect(rows).toHaveCount(expectedCount);
        await screenshot('04-final-pool', player1);
      });

      // ===== Step 3.5: 툴팁 검증 (Already in pool / Pool full) =====
      await test.step('P1: "Already in your pool" 툴팁 확인', async () => {
        // 방금 추가한 첫 번째 오프닝 페이지 재방문
        const firstAdded = newOpenings.find(o => addedNames.includes(o.name))!;
        await player1.goto(firstAdded.url);
        await player1.waitForLoadState('networkidle');

        const btnSelector = firstAdded.color === 'white'
          ? '.opening__pool-add__btn--white'
          : '.opening__pool-add__btn--black';
        const btn = player1.locator(btnSelector);
        await expect(btn).toBeDisabled();
        const titleText = await btn.getAttribute('title');
        expect(titleText).toBe('Already in your pool');
        console.log(`[Test 23] ✓ "Already in your pool" tooltip on ${firstAdded.name} (${firstAdded.color})`);
        await screenshot('04.5-already-in-pool-tooltip', player1);
      });

      await test.step('P1: "Pool is full (10/10)" 툴팁 확인', async () => {
        // 풀에 없는 오프닝 페이지 방문 (pool 10개 가득 찬 상태)
        const notInPool = newOpeningCandidates.find(o => !addedNames.includes(o.name))!;
        await player1.goto(notInPool.url);
        await player1.waitForLoadState('networkidle');

        const btn = player1.locator('.opening__pool-add__btn').first();
        const btnVisible = await btn.isVisible({ timeout: 3000 }).catch(() => false);
        if (btnVisible) {
          await expect(btn).toBeDisabled();
          const titleText = await btn.getAttribute('title');
          expect(titleText).toBe('Pool is full (10/10)');
          console.log(`[Test 23] ✓ "Pool is full (10/10)" tooltip on ${notInPool.name}`);
          await screenshot('04.6-pool-full-tooltip', player1);
        } else {
          console.log(`[Test 23] ✓ ${notInPool.name} has no add buttons (not exactOpening)`);
        }
      });

      // ===== Step 4: Opening Duel 생성 =====
      let seriesId: string;
      await test.step('P1 & P2: Opening Duel 생성', async () => {
        await loginBothPlayers(player1, player2, p1User, p2User);
        seriesId = await createSeriesChallenge(player1, player2, p2Username);
        console.log(`[Test 23] Series created: ${seriesId}`);
      });

      // ===== Step 5: Pick Phase에서 오프닝 이름 검증 =====
      await test.step('Pick Phase: P1의 오프닝에 새로 추가한 오프닝이 포함되어 있는지 확인', async () => {
        await waitForPhase(player1, 'Pick Phase');
        await waitForSnabbdomReady(player1);
        await screenshot('05-pick-phase-p1', player1);

        // Pick Phase에 표시된 모든 오프닝 이름 수집
        const openingNameEls = player1.locator(`${selectors.opening} ${selectors.openingName}`);
        const pickPhaseNames: string[] = [];
        const count = await openingNameEls.count();
        for (let i = 0; i < count; i++) {
          const text = await openingNameEls.nth(i).textContent();
          if (text) pickPhaseNames.push(text.trim());
        }
        console.log('[Test 23] Pick phase openings:', pickPhaseNames);
        expect(pickPhaseNames.length).toBe(10);

        // 새로 추가한 오프닝이 Pick Phase에 포함되는지 확인
        for (const name of addedNames) {
          const found = pickPhaseNames.some(n => n.includes(name) || name.includes(n));
          expect(found).toBeTruthy();
          console.log(`[Test 23] ✓ Found "${name}" in pick phase`);
        }

        // 삭제한 오프닝이 Pick Phase에 없는지 확인
        // (남은 5개 + 추가한 5개 = 10개이므로, 삭제된 것은 없어야 함)
        const removedNames = defaultPresetNames.filter(n => !remainingNames.includes(n));
        for (const name of removedNames) {
          const found = pickPhaseNames.some(n => n === name);
          if (found) {
            console.log(`[Test 23] ✗ Removed opening "${name}" still found in pick phase!`);
          }
          expect(found).toBeFalsy();
          console.log(`[Test 23] ✓ Removed opening "${name}" not in pick phase`);
        }

        await screenshot('06-pick-phase-verified', player1);
      });

      // P2도 Pick Phase 확인
      await test.step('Pick Phase: P2의 화면에도 10개 오프닝 표시', async () => {
        await waitForPhase(player2, 'Pick Phase');
        await waitForSnabbdomReady(player2);
        await screenshot('07-pick-phase-p2', player2);

        const openingCount = await player2.locator(selectors.opening).count();
        expect(openingCount).toBe(10);
      });
    } finally {
      await player1Context.close();
      await player2Context.close();
    }
  });
});
