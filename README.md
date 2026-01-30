# Chess Opening Duel

Lichess 기반 커스텀 체스 게임. **특정 오프닝으로 승리해야 하는** 1:1 대결 모드.

> 이 프로젝트는 [lila-docker](https://github.com/lichess-org/lila-docker)를 포크하여 개발됩니다.

## 게임 컨셉

- 1v1 매칭 → 오프닝 밴픽 → 5판 3선승
- 정해진 오프닝 풀에서 각자 밴 → 남은 오프닝으로 대결
- 기본 체스 룰 유지, 승리 조건만 커스텀 (특정 오프닝 완성 시 승리)

## 설치 방법

### 요구사항

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (실행 중이어야 함)
- Git
- 12GB+ RAM (lila 빌드용)

### 저장소 클론

```bash
# --recursive로 submodule까지 함께 클론
git clone --recursive https://github.com/Ootzk/chess-opening-duel.git
cd chess-opening-duel

# 이미 클론했다면 submodule 초기화
git submodule update --init --recursive
```

### 서비스 시작

```bash
./lila-docker start
```

설정 마법사가 나타나면 **Advanced** 모드를 선택하세요 (코드 수정을 위해).

첫 시작 시 5-15분 소요됩니다. 완료되면 http://localhost:8080/ 에서 사이트를 확인할 수 있습니다.

## 프로젝트 구조

```
chess-opening-duel/                 # 메인 저장소 (lila-docker 포크)
├── compose.yml                     # Docker 구성
├── conf/                           # 설정 파일
├── docker/                         # Dockerfile들
└── repos/                          # Git submodules
    ├── lila/                       → chess-opening-duel-lila (메인 서버)
    ├── chessground/                → chess-opening-duel-chessground (보드 UI)
    └── scalachess/                 → chess-opening-duel-scalachess (체스 엔진)
```

자세한 개발 가이드는 [CLAUDE.md](CLAUDE.md)를 참고하세요.

### Stopping

To stop the containers, for later resuming via `./lila-docker start`:

```bash
./lila-docker stop
```

To remove the containers:

```bash
./lila-docker down
```

### Adding a new service

To add a new optional service after the initial setup has already been done:

```bash
./lila-docker add-services
```

Select the service you want to add from the list of options.

NOTE: This will not affect the existing services, only the new ones among the selected services will be added.

## URLs

Always available:

| Service            | URL                    |
| ------------------ | ---------------------- |
| Main lila instance | http://localhost:8080/ |

Depending on which optional services you start:

| Service               | URL                                                      |
| --------------------- | -------------------------------------------------------- |
| Mongodb manager       | http://localhost:8081/                                   |
| Email inbox           | http://localhost:8025/                                   |
| lila-gif              | http://localhost:6175/image.gif?fen=4k3/6KP/8/8/8/8/7p/8 |
| Picfit                | http://localhost:3001/healthcheck                        |
| Elasticsearch manager | http://localhost:8092/                                   |
| lila-search docs      | http://localhost:9673/docs/                              |
| API docs              | http://localhost:8089/                                   |
| Chessground           | http://localhost:8090/demo.html                          |
| PGN Viewer            | http://localhost:8091/                                   |
| Prometheus            | http://localhost:9090/                                   |
| InfluxDB              | http://localhost:8086/ (admin/password)                  |

## Usage

### Scala development:

To restart lila (after making changes to any Scala code):

```bash
./lila-docker lila restart
```

### UI (JS/CSS) development:

To watch for Typescript/SCSS changes and automatically recompile:

```bash
./lila-docker ui --watch
```

### Updating Routes

If you edit the `conf/routes` file, you'll need to update the route cache.

```bash
docker compose exec lila ./lila.sh playRoutes
```

### To update translation keys:

After modifying a `translation/source/*.xml` file, run:

```bash
docker compose run --rm -w /lila ui pnpm run i18n-file-gen
```

### Code formatting:

```bash
./lila-docker format
```

### Optional: Make the database persistent

```bash
docker compose cp mongodb:/data/db ./database
```

Then, in `compose.yml`,  under `services.mongodb.volumes`: 

Add `- ./database:/data/db`

### Berserk (Python library):

To install the development version of [Berserk](https://github.com/lichess-org/berserk) and run a sample script against your local development site:

```bash
docker compose run --rm -w /berserk python sh -c "pip install -e . && python /scripts/berserk-example.py"
docker compose run --rm -w /berserk python sh -c "pip install -e . && python /scripts/berserk-connect-bots.py"
```

### Scala Metals (IDE helper):

1. In VS Code, open this `lila-docker` project and install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
2. Cmd+Shift+P > "Dev Containers: Rebuild and Reopen in Container"
3. A new VS Code window will open, attached to the container instead of your host machine
4. File > Open Folder > "/workspaces/lila-docker/repos/lila" (or whichever Scala project you want to work on)
5. Install + Enable the Scala Metals extension (Cmd+Shift+X > "Scala (Metals)")
6. Cmd+Shift+P > "Metals: Import build"

Once the build has been imported, you should have code completion, go to definition, etc when you open a Scala file.

### Scalachess:

If you're making changes to the Scalachess library, you can have lila use it instead of the published Maven version:

1. Update the `build.sbt` file in the scalachess repo:

    ```diff
    -  ThisBuild / version           := "15.6.7"
    +  ThisBuild / version           := "my-test-1"  # give it a custom version
    ```

2. Update the `Dependencies.scala` file in the lila repo:

    ```diff
    -  val chess = "org.lichess" %% "scalachess" % "15.6.7"
    +  val chess = "org.lichess" %% "scalachess" % "my-test-1"
    ```

3. Publish the local scalachess changes and restart lila:

    ```bash
    docker compose exec -w /scalachess lila sbt publishLocal
    docker compose restart lila
    ```

Other Scalachess commands:

```bash
## formatting
docker compose run --rm -w /scalachess --entrypoint="sbt check" lila
docker compose run --rm -w /scalachess --entrypoint="sbt prepare" lila

## compile
docker compose run --rm -w /scalachess --entrypoint="sbt compile" lila

## test
docker compose run --rm -w /scalachess --entrypoint="sbt testKit/test" lila

## package
docker compose run --rm -w /scalachess --entrypoint="sbt package" lila
```

### Developing Chessground or PGN-Viewer locally

By default, your local lila instance will use the version of chessground + pgn-viewer that are published to npm. If you want to make changes to either library and see them reflected in your local lila instance, you can do the following:

1. Start lila-docker with the optional chessground and/or pgn-viewer services

1. Have lila use the local copy:

    ```bash
    docker compose run --rm -w /lila ui bash -c "pnpm link /chessground"
    ```

1. Start the compilers in watch mode:

    ```bash
    docker compose run --rm -w /chessground ui bash -c "pnpm install && pnpm run bundle && pnpm run compile --watch"

    docker compose run --rm -w /pgn-viewer ui bash -c "pnpm install && pnpm run dist"
    ```

    See the updated chessground demo: http://localhost:8090/demo.html
    See the updated pgn-viewer demo: http://localhost:8091/

1. Start the lila ui build in watch mode:

    ```bash
    ./lila-docker ui
    ```

    and when you refresh lila, it will use the local copy of chessground and/or pgn-viewer.

### Monitoring

To view the monitoring dashboards, start your environment with the `Monitoring` optional services enabled. You can view the metrics at:

| Service      | URL                                        |
| ------------ | ------------------------------------------ |
| lila metrics | http://localhost:8080/prometheus-metrics/x |
| Prometheus   | http://localhost:9090/                     |
| InfluxDB     | http://localhost:8086/ (admin/password)    |

You can run queries against the InfluxDB database using curl:

```bash
curl --get http://localhost:8086/query \
    --header "Authorization: Token secret" \
    --data-urlencode 'db=kamon'  \
    --data-urlencode 'q=show measurements;'

curl --get http://localhost:8086/query \
    --header "Authorization: Token secret" \
    --data-urlencode 'db=kamon'  \
    --data-urlencode 'q=show field keys'

curl --get http://localhost:8086/query \
    --header "Authorization: Token secret" \
    --data-urlencode 'db=kamon' \
    --data-urlencode 'q=show tag keys'
```
