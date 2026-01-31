# Chess Opening Duel - Claude Development Guide

## 프로젝트 개요

lichess 오픈소스 기반의 커스텀 체스 게임. 특정 오프닝으로만 승리 가능한 1:1 대결 모드.

### 게임 컨셉
- 1v1 매칭 → 오프닝 밴픽 → 5판 3선승
- 정해진 오프닝 풀에서 각자 밴 → 남은 오프닝으로 대결
- 기본 체스 룰 유지, 승리 조건만 커스텀

## 저장소 구조

```
chess-opening-duel/                 # lila-docker 포크 (메인)
├── compose.yml                     # Docker 구성 (간소화)
├── conf/                           # 설정 파일
│   ├── lila.conf                   # lila 설정
│   ├── Caddyfile                   # 웹서버 설정
│   └── lila-ws.conf                # WebSocket 설정
├── docker/                         # Dockerfile들
├── scripts/                        # 헬퍼 스크립트
├── lila-docker                     # 실행 스크립트
└── repos/                          # Git submodules
    ├── lila/                       → chess-opening-duel-lila
    ├── scalachess/                 → chess-opening-duel-scalachess
    └── chessground/                → chess-opening-duel-chessground
```

## 핵심 컴포넌트

### 1. lila (메인 서버)
- **언어**: Scala (Play Framework)
- **역할**: 게임 로직, API, 웹 렌더링
- **주요 경로**:
  ```
  repos/lila/
  ├── app/controllers/      # API 엔드포인트
  │   ├── Lobby.scala       # 로비
  │   ├── Round.scala       # 게임 진행
  │   └── Challenge.scala   # 대결 생성
  ├── app/views/            # HTML 템플릿 (Twirl)
  ├── modules/              # 비즈니스 로직
  │   ├── game/             # 게임 모델
  │   ├── round/            # 라운드 관리
  │   └── challenge/        # 챌린지 시스템
  ├── ui/                   # 프론트엔드 (TypeScript)
  │   ├── lobby/            # 로비 UI
  │   ├── round/            # 게임 화면 UI
  │   └── common/           # 공통 컴포넌트
  └── conf/routes           # URL 라우팅
  ```

### 2. scalachess (체스 엔진)
- **언어**: Scala
- **역할**: 체스 규칙, 변형(Variant), 합법 수 계산
- **주요 경로**:
  ```
  repos/scalachess/src/main/scala/
  ├── variant/              # 체스 변형 정의
  │   ├── Standard.scala
  │   ├── Chess960.scala    # 참고용
  │   └── Crazyhouse.scala  # 참고용
  ├── Game.scala            # 게임 상태
  ├── Situation.scala       # 현재 상황 (승리 조건)
  └── opening/              # 오프닝 데이터
  ```

### 3. chessground (보드 UI)
- **언어**: TypeScript
- **역할**: 체스보드 렌더링, 드래그&드롭
- **주요 경로**:
  ```
  repos/chessground/
  ├── src/
  │   ├── api.ts            # 외부 API
  │   ├── board.ts          # 보드 렌더링
  │   ├── config.ts         # 설정
  │   └── state.ts          # 상태 관리
  └── assets/
      └── chessground.css   # 스타일
  ```

## 개발 명령어

### 환경 시작/중지
```bash
./lila-docker start          # 시작 (첫 실행시 설정)
./lila-docker stop           # 중지
./lila-docker restart        # 재시작
./lila-docker down           # 완전 삭제
./lila-docker logs           # 로그 확인
```

### 코드 변경 반영
```bash
# 프론트엔드 (TypeScript/SCSS) - 자동 재컴파일
./lila-docker ui --watch

# 백엔드 (Scala) - 재시작 필요
./lila-docker lila restart

# Scalachess 변경시 - 로컬 퍼블리시 후 재시작
docker compose exec -w /scalachess lila sbt publishLocal
docker compose restart lila

# 라우트 변경시
docker compose exec lila ./lila.sh playRoutes
```

### 코드 포맷팅
```bash
./lila-docker format
```

### 데이터베이스 리셋
```bash
./lila-docker db
```

## 구현 계획

### Phase 1: 환경 설정 ✅
- [x] GitHub 포크 (chess-opening-duel, lila, scalachess, chessground)
- [x] Submodule 연결
- [x] Full 모드 설정 및 빌드 확인

### Phase 2: 코드베이스 분석 ✅
- [x] 기존 variant 구현 분석 (Chess960, Crazyhouse)
- [x] 게임 생성 → 진행 → 종료 플로우 추적
- [x] Challenge 시스템 이해

### Phase 3: 백엔드 구현 (진행중)
- [ ] OpeningChallenge variant 생성 (scalachess)
- [ ] 오프닝 검증 로직
- [x] Match 모델 (5판 3선승) - v1.1.0
- [ ] 랜덤 오프닝 프리셋 - v1.3.0 (계획)
- [ ] 밴픽 시스템

### Phase 4: UI 구현 (진행중)
- [ ] 불필요한 UI 제거 (퍼즐, 대회, 학습 등)
- [ ] 오프닝 밴픽 UI
- [x] 매치 진행 상황 표시 - v1.2.0
- [ ] 브랜딩 변경

### Phase 5: 배포
- [ ] Docker 이미지 빌드
- [ ] 클라우드 배포 (Railway/Fly.io)

## 릴리스 내역

### v1.3.0 - Random Opening Presets (계획)
- 각 게임이 랜덤 오프닝 프리셋(FEN)으로 시작
- 10개 오프닝 풀에서 매치당 5개 선택 (중복 없음)
- FromPosition variant 사용
- Match Score UI에 오프닝 이름 표시 (테이블 전치)

### v1.2.0 - Match Score UI
- 게임 화면에서 crosstable 대신 Match Score 테이블 표시
- 각 게임 결과(1/0/½)를 클릭 가능한 링크로 표시
- "Opening Duel - Game n of 5" 라벨
- 게임 종료 시 실시간 UI 업데이트 (race condition 수정)

### v1.1.0 - Match 모듈
- Match 모델 및 MongoDB 컬렉션
- Challenge에 matchType 필드 추가
- 5판 3선승 자동 다음 게임 생성
- Round API에 match 정보 포함

### v1.0.0 - 초기 설정
- lichess 포크 및 submodule 구성
- Docker 개발 환경 설정

## 핵심 파일

### Match 모듈 (v1.1.0)
```
repos/lila/modules/match/
├── src/main/
│   ├── Match.scala           # Match 모델 (5판 3선승)
│   ├── MatchApi.scala        # 비즈니스 로직
│   ├── MatchRepo.scala       # MongoDB 저장소
│   └── Env.scala             # 의존성 주입
```

### Match Score UI (v1.2.0)
```
repos/lila/app/views/match/ui.scala              # Match Score 컴포넌트
repos/lila/ui/lib/css/component/_match-score.scss # 스타일
repos/lila/ui/round/css/build/round.scss         # CSS import
repos/lila/ui/round/src/round.ts                 # endData() 수정
```

### 수정된 파일
```
repos/lila/app/controllers/Round.scala           # match 데이터 조회
repos/lila/app/views/round/player.scala          # Match Score 렌더링
repos/lila/app/views/round/watcher.scala         # Match Score 렌더링
repos/lila/app/views/game/ui.scala               # sides 함수
repos/lila/modules/round/src/main/RoundApi.scala # JSON에 match 정보
repos/lila/modules/challenge/                    # matchType 필드
```

### 향후 생성 예정
```
repos/scalachess/src/main/scala/variant/OpeningChallenge.scala  # 커스텀 변형
repos/lila/modules/openingduel/                                 # 밴픽 로직
```

## 기술 스택

| 영역 | 기술 |
|------|------|
| 백엔드 | Scala, Play Framework, MongoDB, Redis |
| 프론트엔드 | TypeScript, Snabbdom (Virtual DOM) |
| 체스 로직 | scalachess (Scala) |
| 보드 UI | chessground (TypeScript) |
| 실시간 통신 | WebSocket (lila-ws) |
| 컨테이너 | Docker, Docker Compose |
| 웹서버 | Caddy |

## URL

| 서비스 | URL |
|--------|-----|
| 메인 | http://localhost:8080 |
| DB 관리 | http://localhost:8081 (mongo-express 활성화시) |
| 이메일 테스트 | http://localhost:8025 (mailpit 활성화시) |

## 테스트 계정

Full 모드 설정시 자동 생성됨. 기본 비밀번호: `password`

## 버전 관리 정책

**Release Branch Workflow** 사용:
```
feature/* ──(squash merge)──► release/{version} ──(merge commit)──► main
```

- **메인 저장소 (chess-opening-duel)**
  - 태그로 버전 관리 (`v1.0.0`, `v1.1.0` 등)
  - main, release/* 브랜치 보호 (직접 push 금지)
  - feature → release: **Squash merge**
  - release → main: **Merge commit**
- **컴포넌트 (lila, chessground, scalachess)**
  - 별도 태그 없이 master에 직접 커밋
  - 메인 저장소가 submodule 커밋을 추적하므로 버전 정보 보존됨

### GitHub Branch Rulesets

| Ruleset | 대상 | 규칙 |
|---------|------|------|
| Protect main | `main` | deletion 금지, force push 금지, PR 필수 (merge commit only) |
| Features to release | `release/*` | deletion 금지, force push 금지, PR 필수 (squash only) |

## 커밋 메시지 규칙

[Gitmoji](https://gitmoji.dev/) 사용. 커밋 메시지 앞에 이모지 붙이기.

| 이모지 | 용도 |
|--------|------|
| ✨ | 새 기능 추가 |
| 🐛 | 버그 수정 |
| 📝 | 문서 추가/수정 |
| ♻️ | 코드 리팩토링 |
| 💄 | UI/스타일 변경 |
| ✅ | 테스트 추가/수정 |
| 🔧 | 설정 파일 변경 |
| 📦 | 패키지/의존성 변경 |
| 🚀 | 배포 |
| 🎨 | 코드 구조/포맷 개선 |
| 🔥 | 코드/파일 삭제 |
| 🚧 | 작업 중 (WIP) |

예시: `📝 Update CLAUDE.md with gitmoji guide`

## Git 워크플로우

### 저장소 클론
```bash
git clone --recursive https://github.com/Ootzk/chess-opening-duel.git
cd chess-opening-duel
```

### 메인 저장소 작업
```bash
# 1. release 브랜치가 없으면 생성
git switch -c release/{next_version}
git push -u origin release/{next_version}

# 2. feature 브랜치에서 작업
git switch -c feature/my-feature
git add .
git commit -m "✨ Add feature"
git push -u origin feature/my-feature

# 3. GitHub에서 PR 생성: feature → release (squash merge)
# 4. 릴리스 준비 완료시 PR 생성: release → main (merge commit)
```

### Submodule 작업 (예: lila)
```bash
cd repos/lila
# master에서 직접 작업
git add .
git commit -m "✨ Add feature"
git push origin master

# 메인 저장소에 submodule 변경 반영
cd ../..
git add repos/lila
git commit -m "📦 Update lila submodule"
```

### Upstream (lichess-org) 동기화
```bash
cd repos/lila
git remote add upstream https://github.com/lichess-org/lila.git
git fetch upstream
git merge upstream/master
```

### 릴리스 절차
```bash
# 1. release → main PR merge (merge commit) 후
# 2. 태그 생성 + GitHub Release 작성
gh release create v{version} --target main --generate-notes --notes "## Summary
- 주요 변경 사항 요약
"

# --generate-notes: PR 기반 자동 변경 내역 생성
# --notes: 추가 설명 (요약)
# --draft: 초안으로 생성 (검토 후 publish)
```

## 참고 자료

- [Lichess GitHub](https://github.com/lichess-org)
- [lila-docker 문서](https://github.com/lichess-org/lila-docker)
- [Chessground 데모](http://localhost:8090/demo.html)

## 주의사항

- lila 빌드에 12GB+ RAM 필요
- 첫 빌드는 5-15분 소요
- Scala 코드 변경시 반드시 `./lila-docker lila restart`
- scalachess 변경시 `sbt publishLocal` 후 lila 재시작