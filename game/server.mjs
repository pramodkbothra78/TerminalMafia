#!/usr/bin/env node
// Terminal Mafia — game server. Plain TCP, no dependencies.
// Run:  node game/server.mjs [port]
import net from "node:net";
import os from "node:os";
import { Game } from "./lib/game.mjs";
import { c, rule, box, tag, banner } from "./lib/ui.mjs";
import { loadMatches, recordMatch } from "./lib/history.mjs";

const PORT = Number(process.argv[2] || process.env.PORT || 5555);
const MIN_PLAYERS = 4;

function freshGame() {
  const g = new Game();
  g.onEnd = recordMatch;
  return g;
}

let game = freshGame();

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === "IPv4" && !i.internal) out.push(i.address);
  }
  return out.length ? out : ["127.0.0.1"];
}

function renderMatchList(list) {
  const N = Math.min(list.length, 20);
  const lines = [c.bold + `MATCH HISTORY — ${list.length} game${list.length === 1 ? "" : "s"} recorded` + c.reset, ""];
  for (let i = 1; i <= N; i++) {
    const m = list[list.length - i];
    const when = new Date(m.endedAt).toLocaleString();
    const winColor = m.winner === "town" ? c.green : c.red;
    lines.push(
      `  ${c.bold}#${i}${c.reset}  ${c.gray}${when}${c.reset}  ${m.players}p  ${winColor}${m.winner.toUpperCase()} WON${c.reset}  ${c.gray}(${m.rounds} round${m.rounds === 1 ? "" : "s"})${c.reset}`,
    );
  }
  if (list.length > N) lines.push(c.gray + `  … and ${list.length - N} older match${list.length - N === 1 ? "" : "es"}.` + c.reset);
  lines.push("", c.gray + "  /history <#> to replay roles and votes for that match." + c.reset);
  return box(lines, c.gray);
}

function renderMatchDetail(m, n) {
  const when = new Date(m.endedAt).toLocaleString();
  const winColor = m.winner === "town" ? c.green : c.red;
  const lines = [
    c.bold + `MATCH #${n} — ${when}` + c.reset,
    `${m.players} players, ${m.rounds} round${m.rounds === 1 ? "" : "s"} — ` +
      winColor +
      c.bold +
      `${m.winner.toUpperCase()} WON` +
      c.reset,
    "",
    c.bold + "ROLES" + c.reset,
    ...m.roster.map((r) => {
      const teamColor = r.team === "mafia" ? c.red : r.team === "town" ? c.cyan : c.gray;
      return `  ${r.alive ? c.green + "●" + c.reset : c.gray + "✝" + c.reset} ${r.name.padEnd(12)} ${teamColor}${r.role}${c.reset}${r.isBot ? c.gray + "  ·bot" + c.reset : ""}`;
    }),
    "",
    c.bold + "NIGHTS & VOTES" + c.reset,
  ];
  for (const e of m.log) {
    if (e.type === "night") lines.push(`  ${c.blue}night ${e.round}:${c.reset} ${e.result}`);
    if (e.type === "vote") {
      lines.push(`  ${c.magenta}day ${e.round}:${c.reset} ${e.result}`);
      lines.push(`    ${c.gray}${e.record.map((r) => `${r.voter}→${r.target}`).join("  ")}${c.reset}`);
    }
  }
  return box(lines, c.white);
}

function help(p) {
  const lines = [
    c.bold + "COMMANDS" + c.reset,
    `${c.cyan}/help${c.reset}      this list`,
    `${c.cyan}/players${c.reset}   who is alive, who is gone`,
    `${c.cyan}/role${c.reset}      your secret role`,
    `${c.cyan}/history${c.reset}   past matches on this server (${c.cyan}/history <#>${c.reset} for a replay)`,
    `${c.cyan}/quit${c.reset}      leave the game`,
  ];
  if (game.phase === "lobby")
    lines.push(
      `${c.cyan}/bots <n>${c.reset}  add bot players (host)`,
      `${c.cyan}/start${c.reset}     begin the game (host, ${MIN_PLAYERS}+ players)`,
    );
  if (game.phase === "night")
    lines.push(`${c.cyan}/kill${c.reset} ${c.cyan}/save${c.reset} ${c.cyan}/check${c.reset} <name|number> — if your role allows it`);
  if (game.phase === "day") lines.push(`${c.cyan}/skip${c.reset}      ready to vote early`, `just type to speak`);
  if (game.phase === "vote") lines.push(`${c.cyan}/vote <name|number>${c.reset} or ${c.cyan}/vote skip${c.reset}`);
  if (game.phase === "over") lines.push(`${c.cyan}/restart${c.reset}   new match, same room (host)`);
  game.send(p, box(lines, c.gray));
}

function lobbyStatus() {
  const names = game.players.map((p) => p.name + (p.isBot ? c.gray + "·bot" + c.reset : "")).join(", ");
  game.broadcast(
    `${tag.sys} Lobby (${game.players.length}): ${names}` +
      (game.players.length < MIN_PLAYERS ? c.gray + `  — need ${MIN_PLAYERS - game.players.length} more` : ""),
  );
}

function startGame() {
  game.start().catch((err) => {
    console.error(err);
    game.broadcast(`${tag.warn} The game crashed. Host can /restart.`);
    game.phase = "over";
  });
}

function handleLine(p, raw) {
  const line = raw.replace(/[\r\n]/g, "").trim();
  if (!line) return;
  const [cmdRaw, ...rest] = line.split(/\s+/);
  const cmd = cmdRaw.toLowerCase();
  const arg = rest.join(" ");

  // ---- global ----
  if (cmd === "/help") return help(p);
  if (cmd === "/players") return game.send(p, "\n" + game.roster(p));
  if (cmd === "/history") {
    const list = loadMatches();
    if (!list.length) return game.send(p, `${tag.sys} No completed matches yet on this server.`);
    if (arg) {
      const n = Number(arg);
      if (!Number.isInteger(n) || n < 1 || n > list.length)
        return game.send(p, `${tag.warn} No match #${arg}. Try /history to see matches 1-${list.length}.`);
      return game.send(p, "\n" + renderMatchDetail(list[list.length - n], n));
    }
    return game.send(p, "\n" + renderMatchList(list));
  }
  if (cmd === "/role")
    return game.send(
      p,
      p.role
        ? box([`${p.role.color + c.bold + p.role.name.toUpperCase() + c.reset}`, c.gray + p.role.blurb + c.reset], p.role.color)
        : `${tag.sys} Roles aren't dealt yet.`,
    );
  if (cmd === "/quit") {
    game.send(p, `${tag.sys} Goodbye.`);
    return p.socket?.end();
  }

  // ---- lobby ----
  if (game.phase === "lobby") {
    if (cmd === "/bots") {
      if (!p.isHost) return game.send(p, `${tag.warn} Only the host can add bots.`);
      const n = Math.max(1, Math.min(8, Number(arg) || 1));
      const added = game.addBots(n);
      game.broadcast(`${tag.sys} ${added} bot${added === 1 ? "" : "s"} joined the room.`);
      return lobbyStatus();
    }
    if (cmd === "/start") {
      if (!p.isHost) return game.send(p, `${tag.warn} Only the host (${game.host()?.name}) can start.`);
      const force = arg.trim().toLowerCase() === "force";
      if (game.players.length < 2) return game.send(p, `${tag.warn} Need at least 2 players to assign roles.`);
      if (game.players.length < MIN_PLAYERS && !force)
        return game.send(
          p,
          `${tag.warn} Need at least ${MIN_PLAYERS} players. Try /bots ${MIN_PLAYERS - game.players.length}, ` +
            `or ${c.bold}/start force${c.reset}${c.yellow} to test with fewer (not for real matches — the challenge requires ${MIN_PLAYERS}+).${c.reset}`,
        );
      if (force && game.players.length < MIN_PLAYERS)
        game.broadcast(
          `${tag.warn} ${c.yellow}Starting in TEST MODE with ${game.players.length} players. Special roles may appear that wouldn't in a real ${MIN_PLAYERS}+ match.${c.reset}`,
        );
      return startGame();
    }
    game.broadcast(`  ${c.bold}${p.name}${c.reset}${c.gray}:${c.reset} ${line.slice(0, 200)}`);
    return;
  }

  // ---- over ----
  if (game.phase === "over") {
    if (cmd === "/restart") {
      if (!p.isHost) return game.send(p, `${tag.warn} Only the host can restart.`);
      const survivors = game.players.filter((x) => !x.isBot && x.connected);
      const fresh = freshGame();
      for (const s of survivors) {
        const np = fresh.addPlayer({ name: s.name, socket: s.socket });
        s.socket.__player = np;
      }
      game = fresh;
      game.broadcast("\n" + rule("NEW MATCH", c.cyan));
      return lobbyStatus();
    }
    game.broadcast(`  ${c.gray}${p.name}: ${line.slice(0, 200)}${c.reset}`);
    return;
  }

  // ---- dead players: ghost channel ----
  if (!p.alive) {
    if (cmd.startsWith("/")) return game.send(p, `${tag.ghost} The dead only watch and whisper.`);
    game.toGhosts(`  ${tag.ghost} ${c.gray}${p.name}: ${line.slice(0, 200)}${c.reset}`);
    return;
  }

  // ---- night ----
  if (game.phase === "night") {
    const map = { "/kill": "mafia", "/save": "doctor", "/check": "detective" };
    if (map[cmd]) {
      if (p.role.key !== map[cmd]) return game.send(p, `${tag.warn} That isn't your power.`);
      const t = game.byName(arg);
      if (!t || !t.alive) return game.send(p, `${tag.warn} No living player called "${arg}". Try /players.`);
      if (cmd === "/kill" && t.role.key === "mafia") return game.send(p, `${tag.warn} That's your own partner.`);
      const ok = game.applyNightAction(p, t);
      if (ok) game.nudge();
      return;
    }
    if (cmd.startsWith("/")) return game.send(p, `${tag.warn} Unknown command. /help`);
    if (p.role.key === "mafia") {
      game.toTeam("mafia", `  ${tag.mafia} ${c.red}${p.name}: ${line.slice(0, 200)}${c.reset}`);
      return;
    }
    return game.send(p, `${tag.night} It's night. Nobody can hear you.`);
  }

  // ---- day ----
  if (game.phase === "day") {
    if (cmd === "/skip") {
      game.skipVotes.add(p.id);
      game.broadcast(`${tag.day} ${p.name} is ready to vote (${game.skipVotes.size}/${game.alive().filter((x) => !x.isBot && x.connected).length}).`);
      game.nudge();
      return;
    }
    if (cmd.startsWith("/")) return game.send(p, `${tag.warn} Unknown command. /help`);
    return game.say(p, line);
  }

  // ---- vote ----
  if (game.phase === "vote") {
    if (cmd === "/vote" || !cmd.startsWith("/")) {
      if (p.vote) return game.send(p, `${tag.warn} You already voted.`);
      const target = cmd === "/vote" ? arg : line;
      if (target.toLowerCase() === "skip" || target.toLowerCase() === "abstain") {
        game.castVote(p, "skip");
        game.nudge();
        return;
      }
      const t = game.byName(target);
      if (!t || !t.alive) return game.send(p, `${tag.warn} No living player called "${target}".`);
      game.castVote(p, t);
      game.nudge();
      return;
    }
    return game.send(p, `${tag.warn} Use /vote <name|number> or /vote skip.`);
  }
}

const server = net.createServer((socket) => {
  socket.setEncoding("utf8");
  socket.setNoDelay(true);
  let buffer = "";
  let player = null;

  const write = (s) => {
    try {
      socket.write(s + "\n");
    } catch {
      /* ignore */
    }
  };

  write(banner());
  write(c.gray + "  A social deduction game for the terminal." + c.reset);
  write(`\n${tag.sys} Pick a codename (letters/numbers, up to 12):`);

  const join = (nameRaw) => {
    const name = nameRaw.replace(/[^\w-]/g, "").slice(0, 12);
    if (!name) return write(`${tag.warn} Letters and numbers only. Try again:`);
    const existing = game.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing && !existing.isBot && !existing.connected) {
      existing.connected = true;
      existing.socket = socket;
      player = existing;
      socket.__player = existing;
      game.broadcast(`${tag.sys} ${c.green}${name} reconnected.${c.reset}`);
      write("\n" + game.roster(existing));
      if (existing.role)
        write(box([`You are ${existing.role.color + c.bold + existing.role.name.toUpperCase() + c.reset}`], existing.role.color));
      return;
    }
    if (existing) return write(`${tag.warn} That name is taken. Pick another:`);
    if (game.phase !== "lobby") {
      write(`${tag.sys} A match is already running — you've joined as a ${c.gray}spectator${c.reset}.`);
      const sp = game.addPlayer({ name, socket });
      sp.alive = false;
      sp.role = { name: "Spectator", key: "spectator", team: "none", color: c.gray, blurb: "You watch.", night: null };
      player = sp;
      socket.__player = sp;
      write(game.roster());
      return;
    }
    player = game.addPlayer({ name, socket });
    socket.__player = player;
    game.broadcast(`${tag.sys} ${c.bold}${name}${c.reset} joined.`);
    if (player.isHost)
      write(
        box(
          [
            c.bold + "You are the host." + c.reset,
            `${c.cyan}/bots <n>${c.reset} to fill the lobby, ${c.cyan}/start${c.reset} when ready (${MIN_PLAYERS}+ players).`,
          ],
          c.yellow,
        ),
      );
    help(player);
    lobbyStatus();
  };

  socket.on("data", (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      try {
        const current = socket.__player || player;
        if (!current) join(line.trim());
        else handleLine(current, line);
      } catch (err) {
        console.error("input error:", err);
        write(`${tag.warn} That input didn't work. Try /help.`);
      }
    }
    if (buffer.length > 4096) buffer = "";
  });

  const drop = () => {
    const cur = socket.__player || player;
    if (!cur) return;
    cur.connected = false;
    cur.socket = null;
    if (game.phase === "lobby") {
      game.players = game.players.filter((x) => x.id !== cur.id);
      if (cur.isHost && game.humans()[0]) game.humans()[0].isHost = true;
      game.broadcast(`${tag.sys} ${cur.name} left the lobby.`);
      lobbyStatus();
    } else {
      game.broadcast(`${tag.sys} ${c.yellow}${cur.name} dropped out${c.reset}${c.gray} — they can rejoin with the same name.${c.reset}`);
      game.nudge();
    }
  };

  socket.on("close", drop);
  socket.on("error", drop);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") console.error(`Port ${PORT} is already in use. Try: node game/server.mjs 5556`);
  else console.error(err);
  process.exit(1);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(banner());
  console.log(box([
    c.bold + "Server listening" + c.reset,
    "",
    ...lanAddresses().map((ip) => `  ${c.cyan}node game/client.mjs ${ip} ${PORT}${c.reset}`),
    `  ${c.gray}same machine:${c.reset} node game/client.mjs`,
  ], c.green));
});
