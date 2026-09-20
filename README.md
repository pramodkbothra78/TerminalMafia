# Terminal Mafia

A local-hosted, terminal-only social deduction game. No GUI, no cloud, no dependencies — just Node.js, TCP, and people lying to each other.

## Quick start

```bash
# 1. Host the game (prints the LAN address to share)
node game/server.mjs
# or: npm start

# 2. Every player, in their own terminal (same machine or same Wi-Fi/hotspot)
node game/client.mjs                 # same machine
node game/client.mjs 192.168.1.42    # over LAN, use the IP the server printed
# or: npm run client -- 192.168.1.42
```

No dependencies to install — just Node.js 18+ and the files in this repo.

First player to join is the **host**: `/bots 3` fills the lobby, `/start` begins the match. Minimum 4 players (humans + bots).

## Standalone executable

If you have [Bun](https://bun.sh) installed (fastest, one command):

```bash
npm run game:build     # writes dist/terminal-mafia-server and dist/terminal-mafia-client
```

If you don't have Bun, Node 20+ can build the executables itself, no extra
install beyond the tiny `postject` helper (fetched automatically via `npx`):

```bash
npm run game:build:node
```

Either way you get `dist/terminal-mafia-server` and `dist/terminal-mafia-client`
— double-click or run directly, no `node` command needed:

```bash
./dist/terminal-mafia-server 5555
./dist/terminal-mafia-client 192.168.1.42 5555
```

## Roles

| Role | Team | Power |
| --- | --- | --- |
| Villager | Town | None. Read people. |
| Detective | Town | Investigates one player each night: MAFIA or CLEAN |
| Doctor | Town | Protects one player each night; may self-protect once per game |
| Bodyguard | Town | Guards one *other* player each night. If the Mafia attacks that player, the Bodyguard dies in their place — the target survives |
| Mafia | Mafia | Kills one player each night; has a private night chat |
| Double Agent | Mafia | Wins with Mafia and knows them, but has no kill. Reads **CLEAN** to the Detective — the safest cover in the room |
| Jester | Neutral | No powers, no allies. Wins **alone and instantly** if the town votes them out — everyone else's game keeps going |

The Mafia team is always about one third of the room (`floor(n/3)`), and the
Double Agent **occupies** a Mafia slot rather than adding one. This guarantees
the town still outnumbers the Mafia after the first night kill, so no match can
be decided before anyone has spoken. The deck is validated at deal time and a
game that would start at (or one kill from) Mafia parity is refused outright.
The Jester is neutral and is never counted as Town for that balance check —
only Bodyguard, Doctor, Detective and Villager are.

| Players | Mafia team | Town | Roles |
| --- | --- | --- | --- |
| 4–5 | 1 | 3–4 | Mafia, Detective, Doctor, Villagers |
| 6 | 2 | 4 | Mafia, Double Agent, Detective, Doctor, Villagers |
| 7–8 | 2 | 4–5 | Mafia, Double Agent, Detective, Doctor, Bodyguard, Jester, Villagers |
| 9–11 | 3 | 5–7 | 2× Mafia, Double Agent, Detective, Doctor, Bodyguard, Jester, Villagers |
| 12 | 4 | 7 | 3× Mafia, Double Agent, Detective, Doctor, Bodyguard, Jester, Villagers |

(Jester counts as neither Town nor Mafia once dealt, which is why it waits
for 7 players — at 6 it would quietly eat the town's safety margin.)

For local testing with fewer than 4 players, the host can force-start with `/start force` — the game will still assign roles and run, but this is for testing only; the challenge spec requires 4+ players for a real match.

## Game loop

`Night` (45s) → mafia kill / doctor save / detective check →
`Dawn` reveal → `Day` discussion (90s, `/skip` to move on) →
`Vote` (45s, ties = no elimination) → repeat.

**Win conditions**

- Town wins when every Mafia-team player is dead.
- Mafia wins when Mafia-team players equal or outnumber the remaining Town.
- Jester wins instantly, alone, the moment the town votes them out — the match ends right there, regardless of who else was still alive.

## Commands

| Command | When |
| --- | --- |
| `/help` `/players` `/role` `/quit` | always |
| `/history` `/history <#>` | always — past matches on this server, or a full role/vote replay of one |
| `/bots <n>` `/start` `/start force` | lobby, host only (`force` bypasses the 4-player minimum, for testing) |
| `/kill <name\|#>` | night, Mafia (plain text = mafia-only chat) |
| `/save <name\|#>` | night, Doctor |
| `/guard <name\|#>` | night, Bodyguard (can't target yourself) |
| `/check <name\|#>` | night, Detective |
| plain text, `/skip` | day discussion |
| `/vote <name\|#>` `/vote skip` | voting |
| `/restart` | after the game, host only |

Targets accept a name, a name prefix, or the number shown in the roster.

## Resilience

- **Disconnects**: a dropped player is marked disconnected and stops blocking the phase timer. They rejoin with the same codename and get their role back.
- **Invalid input**: unknown commands, bad targets, dead targets and duplicate votes all get a friendly `[!]` message; nothing crashes the round.
- **Late joiners**: anyone connecting mid-match joins as a spectator.

## Testing

```bash
npm test                  # full suite, ~5 minutes
npm test disconnect       # run only tests whose name matches
```

35 automated tests drive a **real server over real TCP sockets** — nothing is
mocked. Every test asserts that the server process produced no stderr output
and never exited, on top of its gameplay assertions.

Coverage:

| Area | Tests |
| --- | --- |
| Full matches | 4, 5, 6, 7 and 8 players, all-human |
| Bot/human mixes | 1h+5b, 3h+4b, 2h+6b |
| Role mechanics | Doctor save, self-protect limit, Detective MAFIA/CLEAN reads, Double Agent reading CLEAN, two Mafia on one target |
| Win conditions | Mafia lynched → Town wins; Mafia parity → Mafia wins; tied vote → no elimination |
| Bad input | invalid/duplicate/oversized names, invalid vote targets, duplicate votes, dead-player commands, 22 kinds of junk fired at every phase |
| Lobby screen | render, bot marking, readiness at the 4-player minimum, redraw on departure |
| Bot personalities | stable assignment, all four types in use, dialogue variety, reaction to deaths, personality shown in the final reveal |
| Resilience | disconnect during night, disconnect during voting, host handover, reconnect restores role, reconnect mid-vote, all humans leaving at once |
| Lifecycle | `/restart` second match, history persistence and replay |

The suite is regression-proofed: it was verified by deliberately reintroducing
four bugs (unbalanced deck, missing duplicate-vote guard, inverted tie
detection, missing dead-player block) and confirming the relevant test failed
each time.

Phase lengths and role assignment can be pinned via environment variables so
scenarios are reproducible:

```bash
MAFIA_NIGHT=4 MAFIA_DAY=2 MAFIA_VOTE=4 \
MAFIA_ROLES="alpha=mafia,bravo=doctor,charlie=detective" \
node game/server.mjs
```

`MAFIA_DATA_DIR` relocates the match-history file, which matters for the
standalone executable.

## Extras

- **AI bots with personalities** — four temperaments (analytical, aggressive,
  defensive, chaotic), fixed per codename so `grim` always shouts and `juno`
  always slows the room down. Personality changes what a bot says, who it
  suspects, how predictably it votes, and how it uses night powers: an
  aggressive mafioso silences the loudest player, a quiet one kills whoever
  nobody is watching. Bots also react by name to the previous night's death
  or save. No LLM, no API keys — it all runs inside the server.
- **Spectator mode** — eliminated players see everything, including a ghost-only chat channel.
- **Match history** — every game ends with a full role reveal plus the night results and per-day voting record, and it's saved permanently to `data/match-history.json`. Type `/history` any time (lobby, mid-game as a spectator, or after the match) to see every game ever played on this server, and `/history <#>` to replay a specific one — roles, night kills/saves, and every vote. History survives server restarts.
