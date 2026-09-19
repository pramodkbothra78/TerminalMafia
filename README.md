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
| Mafia | Mafia | Kills one player each night; has a private night chat |
| Double Agent | Mafia | Wins with Mafia, reads CLEAN, but doesn't know who the Mafia are — and they don't know them |

Role table scales with lobby size: 1 Mafia at 4+, Detective at 5+, Doctor at 6+, Double Agent at 8+, 2 Mafia at 7+, 3 at 11+.

## Game loop

`Night` (45s) → mafia kill / doctor save / detective check →
`Dawn` reveal → `Day` discussion (90s, `/skip` to move on) →
`Vote` (45s, ties = no elimination) → repeat.

**Win conditions**

- Town wins when every Mafia-team player is dead.
- Mafia wins when Mafia-team players equal or outnumber the remaining Town.

## Commands

| Command | When |
| --- | --- |
| `/help` `/players` `/role` `/quit` | always |
| `/bots <n>` `/start` | lobby, host only |
| `/kill <name\|#>` | night, Mafia (plain text = mafia-only chat) |
| `/save <name\|#>` | night, Doctor |
| `/check <name\|#>` | night, Detective |
| plain text, `/skip` | day discussion |
| `/vote <name\|#>` `/vote skip` | voting |
| `/restart` | after the game, host only |

Targets accept a name, a name prefix, or the number shown in the roster.

## Resilience

- **Disconnects**: a dropped player is marked disconnected and stops blocking the phase timer. They rejoin with the same codename and get their role back.
- **Invalid input**: unknown commands, bad targets, dead targets and duplicate votes all get a friendly `[!]` message; nothing crashes the round.
- **Late joiners**: anyone connecting mid-match joins as a spectator.

## Extras

- **AI bots** — heuristic bot players chat, accuse, vote and use night powers with human-like delays.
- **Spectator mode** — eliminated players see everything, including a ghost-only chat channel.
- **Match history** — every game ends with a full role reveal plus the night results and per-day voting record.
