# Chess Opening Duel

A custom 1v1 chess game mode built on [lichess](https://github.com/lichess-org) [components](https://github.com/lichess-org/lila-docker). Players ban and pick from a pool of chess openings, then compete in a best-of-5 series starting from those positions.

## Screenshots

| Pick Phase | Ban Phase |
|:---:|:---:|
| ![Pick Phase](docs/screenshots/01-pick-phase.png) | ![Ban Phase](docs/screenshots/02-ban-phase.png) |

| Random Select | Loser's Choice |
|:---:|:---:|
| ![Random Select](docs/screenshots/03-game-starting.png) | ![Loser Select](docs/screenshots/04-loser-select.png) |

| Game Play | Series Finished |
|:---:|:---:|
| ![Game Play](docs/screenshots/05-game-play.png) | ![Finished](docs/screenshots/06-finished.png) |

## How It Works

```mermaid
flowchart LR
    subgraph Pre["Pre-game"]
        PICK[Pick Phase] -->|confirm| BAN[Ban Phase]
    end

    subgraph Game["Game Loop"]
        RS[Random Select] --> PLAY[Playing]
        PLAY -->|draw| REST[Resting]
        PLAY -->|winner| REST
        REST -->|next game<br/>draw| RS
        REST -->|next game<br/>winner| SEL[Loser Selects]
        SEL --> PLAY
    end

    BAN --> RS
    REST -->|series done| FIN[Finished]
```

### 1. Pick Phase (30s)

Each player simultaneously selects 5 openings from a pool of 10. If time runs out, remaining slots are filled randomly.

### 2. Ban Phase (30s)

Each player bans 2 of their opponent's picks. After bans, each player has 3 openings remaining.

### 3. Playing

After each game ends, a **30-second resting period** gives both players time to review the game. Both can click to proceed early, or wait for the timer to expire.

The next opening is then determined by the result:
- **Draw** — randomly selected from the combined remaining pool
- **Winner decided** — the loser picks from their own remaining pool

After the final game, the resting period shows a **"View result"** button instead, leading to the finished page.

### 4. Series Result

First to **2.5 points** with a lead wins. If tied after 5 games (e.g. 2.5–2.5), sudden death games continue until one player pulls ahead.

## Scoring

Standard chess scoring applies to each game:

| Result | Points |
|--------|--------|
| Win | 1 |
| Draw | 0.5 |
| Loss | 0 |

First to **2.5 points** with a lead wins the series. Tied at 2.5–2.5? **Sudden death** continues until someone breaks the tie.

## Opening Pool

10 openings from classical chess theory:

| ECO | Opening | Chooser Plays |
|-----|---------|:---:|
| C89 | [Ruy Lopez: Marshall Attack](https://lichess.org/opening/Ruy_Lopez_Marshall_Attack) | Black |
| C54 | [Italian Game: Classical Variation, Giuoco Pianissimo](https://lichess.org/opening/Italian_Game_Classical_Variation_Giuoco_Pianissimo) | White |
| D35 | [Queen's Gambit Declined: Normal Defense](https://lichess.org/opening/Queens_Gambit_Declined_Normal_Defense) | White |
| E05 | [Catalan Opening: Open Defense, Classical Line](https://lichess.org/opening/Catalan_Opening_Open_Defense_Classical_Line) | White |
| A22 | [English Opening: King's English, Two Knights](https://lichess.org/opening/English_Opening_Kings_English_Variation_Two_Knights_Variation) | White |
| B90 | [Sicilian Defense: Najdorf Variation](https://lichess.org/opening/Sicilian_Defense_Najdorf_Variation) | Black |
| E20 | [Nimzo-Indian Defense](https://lichess.org/opening/Nimzo-Indian_Defense) | Black |
| A56 | [Benoni Defense](https://lichess.org/opening/Benoni_Defense) | Black |
| B19 | [Caro-Kann Defense: Classical Variation](https://lichess.org/opening/Caro-Kann_Defense_Classical_Variation) | Black |
| C18 | [French Defense: Winawer Variation](https://lichess.org/opening/French_Defense_Winawer_Variation) | Black |

## Quick Start

### Play (Docker)

```bash
docker run -d --name chess-duel \
  -p 8080:8080 \
  -v chess-data:/seeded \
  ghcr.io/ootzk/chess-opening-duel:latest
```

Open http://localhost:8080 and log in with any seeded account (password: `password`).

### Development

See [CLAUDE.md](CLAUDE.md) for the full development guide, including Docker Compose setup, build commands, and project architecture.

```bash
git clone --recursive https://github.com/Ootzk/chess-opening-duel.git
cd chess-opening-duel
./lila-docker start
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Scala, Play Framework, MongoDB, Redis |
| Frontend | TypeScript, Snabbdom |
| Chess Logic | scalachess |
| Board UI | chessground |
| Real-time | WebSocket (lila-ws) |
| Infrastructure | Docker, Caddy |

## Credits

Built on top of [lichess-org/lila](https://github.com/lichess-org/lila), the free and open-source chess server. Development environment based on [lila-docker](https://github.com/lichess-org/lila-docker).
