# E2E 테스트 (Playwright)

두 플레이어 동시 제어를 위한 브라우저 자동화 테스트.

## 실행 방법

```bash
cd tests/e2e
npm install              # 최초 1회
npm test                 # 전체 테스트 (headless, HTML 리포트 생성)
npm run test:headed      # 브라우저 표시
npm run test:debug       # 디버그 모드
npm run test:ui          # Playwright UI 모드
npm run report           # HTML 테스트 리포트 보기
```

## 테스트 구조

```
tests/e2e/
├── package.json           # npm 스크립트
├── playwright.config.ts   # Playwright 설정 (workers: 3, rate limiting OFF)
├── global-setup.ts        # 18개 테스트 계정 로그인 + 세션 저장
├── global-teardown.ts     # DB 리셋 (MongoDB + Redis)
├── helpers/
│   ├── auth.ts            # 로그인 헬퍼, testPairs 정의
│   └── series.ts          # 시리즈 조작 헬퍼 (selectOpenings, confirm 등)
└── specs/
    ├── series-banpick.spec.ts     # 밴픽 플로우 테스트 (Test 0~6)
    └── series-disconnect.spec.ts  # Disconnect/Abort 테스트 (Test 7~8)
```

## 테스트 계정 생성

새 테스트 계정을 추가하려면 3개 파일 수정 후 DB 리셋 필요:

**1. `repos/lila-db-seed/spamdb/data/uids.txt`** - 사용자명 추가
```
elena
hans
newuser1
newuser2
```

**2. `tests/e2e/helpers/auth.ts`** - users 객체에 추가
```typescript
export const users = {
  // ... 기존 유저
  newuser1: { username: 'newuser1', password: 'password', storageState: '.auth/newuser1.json' },
  newuser2: { username: 'newuser2', password: 'password', storageState: '.auth/newuser2.json' },
} as const;
```

**3. `tests/e2e/global-setup.ts`** - users 배열에 추가
```typescript
const users = [
  // ... 기존 유저
  { username: 'newuser1', password: 'password', file: '.auth/newuser1.json' },
  { username: 'newuser2', password: 'password', file: '.auth/newuser2.json' },
];
```

**4. DB 리셋**
```bash
./lila-docker db
```

> **참고**: 모든 테스트 계정의 비밀번호는 `password`

## 테스트 시나리오 매트릭스

각 테스트는 고유한 계정 쌍을 사용하며, pick/ban 행동과 시리즈 결과를 정의함.

| # | P1 | P2 | pick | ban | series result | games | score | 특징 |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---|
| 0 | elena | hans | ✅/✅ | ✅/✅ | 0 - ½ - 1 - 1 | 4 | 2.5-1.5 | 역전승 |
| 1 | yulia | luis | ✅/⏰ | ✅/🚫 | 1 - 1 - 1 | 3 | 3-0 | 3연승 |
| 2 | ana | lola | ⏰/✅ | 🚫/✅ | 0 - 1 - 0 - 1 - ½ - 1 | 6 | 3.5-2.5 | 서든데스 |
| 3 | carlos | nina | ⚠️/✅ | ✅/⚠️ | 0 - 0 - 1 - 1 - 1 | 5 | 3-2 | 0-2 역전 |
| 4 | oscar | petra | ✅/⚠️ | ⚠️/✅ | 1 - ½ - 1 | 3 | 2.5-0.5 | 조기승리 |
| 5 | boris | david | 🚫/✅ | ✅/⏰ | 1 - 0 - 1 - 0 - ½ - 1 | 6 | 3.5-2.5 | 서든데스 |
| 6 | mei | ivan | ✅/🚫 | ⏰/✅ | 0 - 1 - 1 - 1 | 4 | 3-1 | 4경기 |
| 7 | angel | bobby | ✅/🔌 | - | - | - | abort | Pick disconnect |
| 8 | marcel | vera | ✅/✅ | ✅/🔌 | - | - | abort | Ban disconnect |

## Pick/Ban 행동 타입

| | 타입 | pick (5개 필요) | ban (2개 필요) |
|:---:|:---:|:---|:---|
| ✅ | `confirm` | 5개 선택 + confirm 버튼 클릭 | 2개 선택 + confirm 버튼 클릭 |
| ⏰ | `full-timeout` | 5개 선택, confirm 안 함 → 타임아웃 | 2개 선택, confirm 안 함 → 타임아웃 |
| ⚠️ | `partial-timeout` | 1~4개 선택 → 타임아웃 (서버가 랜덤 채움) | 1개 선택 → 타임아웃 (서버가 랜덤 채움) |
| 🚫 | `none-timeout` | 0개 선택 → 타임아웃 (서버가 전부 랜덤) | 0개 선택 → 타임아웃 (서버가 전부 랜덤) |
| 🔌 | `disconnected` | WebSocket 연결 끊김 → 시리즈 abort | WebSocket 연결 끊김 → 시리즈 abort |

**커버리지 검증:**

| 행동 | pick-p1 | pick-p2 | ban-p1 | ban-p2 |
|:---:|:---:|:---:|:---:|:---:|
| confirm | 0,1,4,6 | 0,2,3,5 | 0,1,3,5 | 0,2,4,6 |
| full-timeout | 2 | 1 | 6 | 5 |
| partial-timeout | 3 | 4 | 4 | 3 |
| none-timeout | 5 | 6 | 2 | 1 |
| disconnected | - | 7 | - | 8 |

→ 16개 조합 (4 행동 × 4 위치) 모두 커버됨 + disconnect 2개

## Series Result 표기법

P1 관점에서 각 게임 결과를 `-`로 구분:
- `1` = P1 승리 (1점)
- `0` = P1 패배 (0점)
- `1/2` = 무승부 (0.5점)

예시: `0 - 1/2 - 1 - 1` = P1이 G1 패배, G2 무승부, G3 승리, G4 승리 → 2.5점

## 테스트 작성 가이드

**1. 테스트 이름 형식:**
```typescript
test('[Test 0] 역전승 4게임', async ({ browser }) => {...});
```

**2. 테스트 구조:**
```typescript
test.describe('Test 0: elena vs hans', () => {
  test.describe.configure({ timeout: 120000 });
  const pair = testPairs[0];  // 또는 testPairs.test0
  const pairUsers = ['elena', 'hans'];

  test.beforeAll(() => cleanupPairData(pairUsers));

  test('[Test 0] 역전승 4게임', async ({ browser }) => {
    // 1. 시리즈 생성 + 밴픽 완료
    await completeBanPickPhase(player1, player2, {
      pick: { p1: 'confirm', p2: 'confirm' },
      ban: { p1: 'confirm', p2: 'confirm' },
    });

    // 2. 게임 진행 (series result에 따라)
    // 0 - 1/2 - 1 - 1 = P1 패배, 무승부, 승리, 승리
    await playOneGame(..., 'p1-resign');  // G1: P1 패배
    await playOneGame(..., 'draw');        // G2: 무승부
    await playOneGame(..., 'p2-resign');  // G3: P1 승리
    await playOneGame(..., 'p2-resign');  // G4: P1 승리

    // 3. 시리즈 종료 확인
    expect(await isSeriesFinished(player1, seriesId)).toBe(true);
  });
});
```

**3. 새 테스트 추가 시:**
1. 매트릭스에 새 행 추가 (# 증가)
2. 새 계정 쌍 추가 (uids.txt, global-setup.ts, auth.ts)
3. 기존 테스트와 중복되지 않는 pick/ban 조합 선택
4. series result로 테스트할 시나리오 정의

**주의사항:**
- 독립적인 테스트 → 같은 계정 쌍은 하나의 테스트에서만 사용
- `beforeAll`로 해당 쌍의 데이터만 정리 (전체 DB 리셋 X)
- `globalTeardown`에서 전체 DB 리셋 (`./lila-docker db`)
- 비밀번호: 전부 `password`

## 실행 설정

**최적 설정 (권장):**
- `ENABLE_RATE_LIMITING=false` (settings.env)
- `workers: 3` (playwright.config.ts)

| Rate Limiting | Workers | 통과 | 시간 |
|:---:|:---:|:---:|:---:|
| ON | 7 | 4/7 | ~2m |
| OFF | 7 | 5/7 | 2.1m |
| ON | 1 | 7/7 | 5.6m |
| **OFF** | **3** | **7/7** | **3.0m** |

## Claude 가이드라인

- 테스트 실행 시 항상 HTML 리포트 사용 (`npm test` 후 `npm run report`)
- 테스트 실패 시 리포트 확인을 유저에게 안내
- 새 시나리오 추가 시 매트릭스 기반으로 설계
- 테스트 이름은 `[Test #] 설명` 형식 유지

## 실전 팁

- **병렬 실행**: 9개 테스트가 독립적 → `workers: 3`으로 안정적 병렬 실행
- **API 기반 검증**: UI 대신 Series API로 상태 확인 (`isSeriesFinished`)
- **게임 상태 조회**: Board API streaming으로 정확한 FEN 조회 (`/api/board/game/stream/{gameId}`)
- **스크린샷**: 주요 시점마다 `test.info().attach()`로 첨부
- **Disconnect 테스트**: `page.close()`로 WS 연결 끊김 시뮬레이션 → 30s timeout 후 abort 검증
