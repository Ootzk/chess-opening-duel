# Series Forfeit (X Button) Implementation Plan

## Context

Series 게임에서 플레이어가 피치 못할 사정으로 전체 시리즈를 포기할 수 있는 기능이 필요하다. 현재 일반 게임에서는 abort(X)/takeback(뒤로 가기)가 한 슬롯을 공유하지만, 시리즈 게임에서는 **4개 버튼이 상시 표시**되어야 한다:

1. **X (시리즈 포기)** - 항상 활성, 전체 시리즈를 presser 패배로 종료
2. **뒤로 가기 (takeback)** - 양측 1수 이상 둔 후 활성 (기존과 동일)
3. **1/2 (무승부 제안)** - 기존과 동일
4. **깃발 (이번 판 항복)** - 기존과 동일

포기 시 현재 게임도 resign 처리, confirm 단계 포함 (resign과 동일한 패턴).

---

## Step 1: Series 모델에 forfeitBy 필드 추가

**파일**: `repos/lila/modules/series/src/main/Series.scala`

- `forfeitBy: Option[Int] = None` 필드 추가 (case class 파라미터)
- `winner` 메서드 수정: `forfeitBy`가 있으면 상대방을 winner로 반환
  ```scala
  def winner: Option[Int] =
      forfeitBy.map(1 - _).orElse {
          // 기존 점수 기반 로직
      }
  ```
- `make()` 팩토리에 `forfeitBy = None` 기본값 확인

**파일**: `repos/lila/modules/series/src/main/BsonHandlers.scala`

- Series BSON reads에 `forfeitBy = r.getO[Int]("fb")` 추가
- Series BSON writes에 `"fb" -> s.forfeitBy` 추가

---

## Step 2: SeriesApi에 forfeitSeries 메서드 추가

**파일**: `repos/lila/modules/series/src/main/SeriesApi.scala`

새 메서드:
```scala
def forfeitSeries(seriesId: SeriesId, userId: UserId): Fu[Option[Series]] =
    repo.byId(seriesId).flatMap:
      case None => fuccess(None)
      case Some(s) =>
        if s.isFinished || s.isAborted then fuccess(None)
        else
          s.playerIndex(userId) match
            case None => fuccess(None)
            case Some(loserIdx) =>
              val forfeited = s.copy(
                forfeitBy = Some(loserIdx),
                phase = Series.Phase.Finished,
                status = Series.Status.Finished,
                finishedAt = Some(nowInstant)
              )
              repo.update(forfeited).map: _ =>
                Bus.pub(SeriesForfeited(forfeited))
                Some(forfeited)
```

`finishGame` 메서드 시작부에 early return 추가:
```scala
case Some(s) =>
    if s.isFinished || s.isAborted then funit  // <-- 추가: forfeit로 이미 종료됨
    else
        // 기존 로직
```

---

## Step 3: SeriesForfeited 이벤트 및 게임 종료 메커니즘

### 3a. 이벤트 정의

**파일**: `repos/lila/modules/series/src/main/SeriesApi.scala` (하단 이벤트 목록)

- `case class SeriesForfeited(s: Series)` 추가

**파일**: `repos/lila/modules/game/src/main/actorApi.scala`

- `case class NotifySeriesForfeited(gameId: GameId, loserColor: chess.Color)` 추가

### 3b. Env에서 이벤트 구독

**파일**: `repos/lila/modules/series/src/main/Env.scala`

```scala
Bus.sub[SeriesForfeited]:
    case SeriesForfeited(s) =>
        socket.reload(s.id)
        // 현재 게임 resign 처리
        s.currentGame.foreach: sg =>
            val loserIdx = s.forfeitBy.get
            val loserColor = if sg.whitePlayerIndex == loserIdx then chess.Color.White
                             else chess.Color.Black
            Bus.pub(lila.game.actorApi.NotifySeriesForfeited(sg.gameId, loserColor))
```

### 3c. Round 모듈에서 게임 종료 처리

**파일**: `repos/lila/modules/round/src/main/RoundSocket.scala`

`NotifySeriesForfeited` 구독 추가 (기존 `NotifySeriesSelecting` 패턴 따름):
```scala
Bus.sub[lila.game.actorApi.NotifySeriesForfeited]: forfeited =>
    rounds.tellIfPresent(forfeited.gameId, forfeited)
```

**파일**: `repos/lila/modules/round/src/main/RoundAsyncActor.scala`

핸들러 추가 (기존 NotifySeriesSelecting 바로 아래):
```scala
case lila.game.actorApi.NotifySeriesForfeited(_, loserColor) =>
    handle: game =>
        if game.playable then
            if game.abortable then finisher.abortForce(game)
            else finisher.other(game, _.Resign, Some(!loserColor))
        else fuccess(Nil)
```

- `abortable` (< 2수): abort 처리 (결과 없음)
- 그 외: resign 처리 (상대방 승리)
- finishGame에서 series가 이미 Finished이므로 추가 처리 없음 (Step 2의 early return)

---

## Step 4: Series Controller + Routes

**파일**: `repos/lila/app/controllers/Series.scala`

```scala
def forfeit(id: SeriesId) = Auth { ctx ?=> me ?=>
    Found(api.byId(id)): s =>
        if !isPlayer(s, me.userId) then
            JsonBadRequest(jsonError("Not a player of this series"))
        else
            api.forfeitSeries(id, me.userId).map:
                case Some(_) => JsonOk(Json.obj("ok" -> true))
                case None => JsonBadRequest(jsonError("Cannot forfeit"))
}
```

**파일**: `repos/lila/conf/routes`

Series Ban/Pick API 섹션에 추가:
```
POST  /series/$id<\w{8}>/forfeit           controllers.Series.forfeit(id: SeriesId)
```

---

## Step 5: Frontend - mandatory에 series 추가

**파일**: `repos/lila/ui/lib/src/game/index.ts` (line 18)

```typescript
export const mandatory = (data: GameData): boolean =>
    !!data.tournament || !!data.simul || !!data.swiss || !!data.series;
```

이렇게 하면:
- `abortable` → 시리즈 게임에서 항상 false (일반 abort 비활성화)
- `resignable` → playable이면 항상 true (0수부터 resign 가능)
- takeback은 기존대로 `bothPlayersHavePlayed` 체크

---

## Step 6: Frontend - 시리즈 포기 컨트롤러 로직

**파일**: `repos/lila/ui/round/src/ctrl.ts`

1. `seriesForfeitConfirm?: Timeout` 속성 추가 (line 79-80 근처)
2. `seriesForfeit` 메서드 추가 (resign 패턴 복제):
```typescript
seriesForfeitConfirm?: Timeout = undefined;

seriesForfeit = (v: boolean, immediately?: boolean): void => {
    if (v) {
        if (this.seriesForfeitConfirm || !this.data.pref.confirmResign || immediately) {
            clearTimeout(this.seriesForfeitConfirm);
            this.seriesForfeitConfirm = undefined;
            this.performSeriesForfeit();
        } else {
            this.seriesForfeitConfirm = setTimeout(() => this.seriesForfeit(false), 3000);
        }
        this.redraw();
    } else if (this.seriesForfeitConfirm) {
        clearTimeout(this.seriesForfeitConfirm);
        this.seriesForfeitConfirm = undefined;
        this.redraw();
    }
};

private performSeriesForfeit = (): void => {
    const seriesId = this.data.series?.id;
    if (!seriesId) return;
    fetch(`/series/${seriesId}/forfeit`, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
    });
    // 게임 종료는 서버에서 Bus 이벤트로 자동 처리됨
};
```

---

## Step 7: Frontend - 시리즈 게임 버튼 렌더링

**파일**: `repos/lila/ui/round/src/view/button.ts`

`seriesForfeitConfirm` 컴포넌트 추가 (resignConfirm 패턴 복제):
```typescript
export const seriesForfeitConfirm = (ctrl: RoundController): VNode =>
    hl('div.act-confirm', [
        hl('button.fbt.yes', {
            attrs: { title: 'Forfeit series', 'data-icon': licon.X },
            hook: bind('click', () => ctrl.seriesForfeit(true)),
        }),
        fbtCancel(ctrl.seriesForfeit),
    ]);
```

**파일**: `repos/lila/ui/round/src/view/table.ts`

`renderTablePlay` 수정 - `icons` 배열에서 시리즈 분기:
```typescript
icons = loading || isQuestion ? [] : d.series ? [
    // 시리즈 게임: 4개 버튼
    !!ctrl.seriesForfeitConfirm
        ? button.seriesForfeitConfirm(ctrl)
        : hl('button.fbt.series-forfeit', {
            attrs: { title: 'Forfeit series', disabled: false },
            hook: bind('click', () => ctrl.seriesForfeit(true)),
        }, [hl('span', justIcon(licon.X))]),
    button.standard(ctrl, d => ({ enabled: takebackable(d) }),
        licon.Back, i18n.site.proposeATakeback, 'takeback-yes', ctrl.takebackYes),
    // draw 버튼 (기존과 동일)
    drawButton(ctrl, d),
    // resign 버튼 (기존과 동일)
    resignButton(ctrl),
    analysisButton(ctrl),
    boardMenuToggleButton(ctrl.menu, i18n.site.menu),
] : [
    // 일반 게임: 기존 3개 버튼 (변경 없음)
    abortable(d) ? ... : ...,
    drawButton(ctrl, d),
    resignButton(ctrl),
    analysisButton(ctrl),
    boardMenuToggleButton(ctrl.menu, i18n.site.menu),
];
```

`confirm` 클래스에 `ctrl.seriesForfeitConfirm` 추가:
```typescript
class: { confirm: !!(ctrl.drawConfirm || ctrl.resignConfirm || ctrl.seriesForfeitConfirm), ... }
```

draw/resign 버튼 로직은 로컬 헬퍼 함수로 추출하여 중복 제거.

---

## 수정 파일 요약

| 모듈 | 파일 | 변경 내용 |
|------|------|-----------|
| series | `Series.scala` | `forfeitBy` 필드 + `winner` 수정 |
| series | `BsonHandlers.scala` | `fb` 필드 매핑 |
| series | `SeriesApi.scala` | `forfeitSeries()` + `finishGame()` guard |
| series | `Env.scala` | `SeriesForfeited` 이벤트 구독 |
| game | `actorApi.scala` | `NotifySeriesForfeited` 정의 |
| round | `RoundSocket.scala` | Bus 구독 추가 |
| round | `RoundAsyncActor.scala` | 핸들러 추가 |
| controller | `Series.scala` | `forfeit()` 엔드포인트 |
| config | `routes` | `POST /series/{id}/forfeit` |
| ui/lib | `game/index.ts` | `mandatory`에 series 추가 |
| ui/round | `ctrl.ts` | `seriesForfeit()` + confirm 로직 |
| ui/round | `view/button.ts` | `seriesForfeitConfirm()` 컴포넌트 |
| ui/round | `view/table.ts` | 시리즈 4-button 레이아웃 |

---

## Verification

1. **Docker 환경 시작**: `./lila-docker start`
2. **Scala 재시작**: `./lila-docker lila restart`
3. **UI 빌드**: `./lila-docker ui`
4. **테스트 시나리오**:
   - 시리즈 게임 진입 → 4개 버튼 표시 확인
   - X 버튼 클릭 → confirm UI 표시 확인
   - 3초 후 confirm 자동 취소 확인
   - X 버튼 더블클릭 → 시리즈 Finished, 현재 게임 종료 확인
   - 상대방도 시리즈 종료 알림 수신 확인
   - Takeback/Draw/Resign 버튼 기존 동작 확인
   - 시리즈 결과에 forfeit winner 정상 표시 확인
5. **E2E 테스트**: 기존 시리즈 테스트 통과 확인
