import { c, rule, box, tag, banner, bar, countdown, icon, bigBanner } from "./ui.mjs";
import { ROLES, buildRoleDeck } from "./roles.mjs";
import { botChat, botVote, botNightTarget, BOT_NAMES } from "./bots.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Phase lengths can be compressed via env vars — used by the test suite to
// run a full match in seconds instead of minutes.
export const TIMINGS = {
  night: Number(process.env.MAFIA_NIGHT) || 45,
  day: Number(process.env.MAFIA_DAY) || 60,
  vote: Number(process.env.MAFIA_VOTE) || 45,
};

// Pins specific players to specific roles for reproducible test scenarios,
// e.g. MAFIA_ROLES="alpha=mafia,bravo=doctor,charlie=detective,delta=villager".
// Never used in a real match — only the harness sets this env var.
function parsePinnedRoles(str) {
  const map = {};
  for (const pair of str.split(",")) {
    const [name, role] = pair.split("=").map((s) => s?.trim().toLowerCase());
    if (name && role) map[name] = role;
  }
  return map;
}

let nextId = 1;

export class Game {
  constructor() {
    this.players = [];
    this.phase = "lobby"; // lobby | night | day | vote | over
    this.round = 0;
    this.suspicion = {};
    this.log = []; // match history
    this._resolve = null;
    this._timer = null;
    this._tick = null;
    this.onEnd = null; // (summary) => void — set by the server to persist match history
  }

  /* ---------------- players ---------------- */

  addPlayer({ name, socket = null, isBot = false }) {
    const p = {
      id: nextId++,
      name,
      socket,
      isBot,
      connected: true,
      alive: true,
      role: null,
      checked: new Set(),
      selfSaved: false,
      acted: false,
      vote: null,
      isHost: this.players.length === 0,
    };
    this.players.push(p);
    return p;
  }

  byName(str) {
    if (!str) return null;
    const q = str.trim().toLowerCase();
    const n = Number(q);
    if (Number.isInteger(n) && n > 0) {
      const list = this.alive();
      if (n <= list.length) return list[n - 1];
    }
    return (
      this.players.find((p) => p.name.toLowerCase() === q) ||
      this.players.find((p) => p.name.toLowerCase().startsWith(q)) ||
      null
    );
  }

  alive() {
    return this.players.filter((p) => p.alive);
  }
  dead() {
    return this.players.filter((p) => !p.alive);
  }
  humans() {
    return this.players.filter((p) => !p.isBot);
  }
  host() {
    return this.players.find((p) => p.isHost && p.connected) || this.humans()[0];
  }

  /* ---------------- messaging ---------------- */

  send(p, msg = "") {
    if (p.isBot || !p.socket || !p.connected) return;
    try {
      p.socket.write(msg + "\n");
    } catch {
      /* socket died mid-write */
    }
  }

  broadcast(msg, filter = () => true) {
    for (const p of this.players) if (filter(p)) this.send(p, msg);
  }

  toTeam(team, msg) {
    // Double Agent shares team "mafia", so this already reaches both —
    // that's intentional: Mafia and Double Agent are in on it together.
    this.broadcast(msg, (p) => p.alive && p.role?.team === team);
  }

  toGhosts(msg) {
    this.broadcast(msg, (p) => !p.alive);
  }

  roster(forPlayer = null) {
    const nameWidth = Math.max(8, ...this.players.map((p) => p.name.length));
    const lines = this.alive().map((p, i) => {
      const mark =
        forPlayer && forPlayer.role?.team === "mafia" && p.role?.team === "mafia"
          ? p.role.key === "double_agent"
            ? c.magenta + ` ${icon.mafia} agent` + c.reset
            : c.red + ` ${icon.mafia} mafia` + c.reset
          : "";
      const dot = p.connected ? c.green + icon.alive + c.reset : c.gray + icon.offline + c.reset;
      const bot = p.isBot ? c.gray + " " + icon.bot + "bot" + c.reset : "";
      const votedFlag =
        this.phase === "vote" ? (p.vote ? c.green + " " + icon.voted + c.reset : c.gray + " …" + c.reset) : "";
      const host = p.isHost ? c.yellow + " " + icon.host + c.reset : "";
      const name = p.name.padEnd(nameWidth);
      return ` ${c.bold}${String(i + 1).padStart(2)}${c.reset} ${dot} ${name}${host}${bot}${mark}${votedFlag}`;
    });
    const dead = this.dead().map(
      (p) => c.gray + `    ${icon.dead}  ${p.name.padEnd(nameWidth)} ${p.role ? p.role.name : "?"}` + c.reset,
    );
    return [
      c.bold + `ALIVE (${this.alive().length})` + c.reset,
      ...lines,
      ...(dead.length ? [c.gray + `DEAD (${dead.length})` + c.reset, ...dead] : []),
    ].join("\n");
  }

  /* ---------------- lobby ---------------- */

  addBots(n) {
    const used = new Set(this.players.map((p) => p.name.toLowerCase()));
    let added = 0;
    for (const name of BOT_NAMES) {
      if (added >= n) break;
      if (used.has(name)) continue;
      this.addPlayer({ name, isBot: true });
      used.add(name);
      added++;
    }
    return added;
  }

  /* ---------------- lifecycle ---------------- */

  async start() {
    const pinnedStr = process.env.MAFIA_ROLES;
    let deck;
    if (pinnedStr) {
      const map = parsePinnedRoles(pinnedStr);
      deck = this.players.map((p) => (ROLES[map[p.name.toLowerCase()]] ? map[p.name.toLowerCase()] : "villager"));
    } else {
      deck = buildRoleDeck(this.players.length);
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
    }
    this.players.forEach((p, i) => {
      p.role = ROLES[deck[i]];
    });

    this.phase = "night";
    this.broadcast(banner());
    this.broadcast(
      box(
        [
          c.bold + "The terminal goes quiet. Someone here is lying." + c.reset,
          "",
          `Players: ${c.bold}${this.players.length}${c.reset}   Roles in play: ${[...new Set(deck)]
            .map((k) => ROLES[k].color + ROLES[k].name + c.reset)
            .join(", ")}`,
          c.gray + "Type /help at any time. /players lists the room." + c.reset,
        ],
        c.red,
      ),
    );

    for (const p of this.players) {
      if (p.isBot) continue;
      // Mafia and Double Agent share team "mafia" and know each other from the start.
      const isConspirator = p.role.team === "mafia";
      const mates = isConspirator
        ? this.players
            .filter((o) => o.id !== p.id && o.role.team === "mafia")
            .map((o) => `${o.name} (${o.role.name})`)
        : [];
      this.send(
        p,
        "\n" +
          box(
            [
              `You are ${p.role.color + c.bold + p.role.name.toUpperCase() + c.reset}`,
              c.gray + p.role.blurb + c.reset,
              ...(isConspirator
                ? [
                    mates.length
                      ? c.red + "Your partners: " + mates.join(", ") + c.reset
                      : c.red + "You work alone." + c.reset,
                  ]
                : []),
            ],
            p.role.color,
          ),
      );
    }

    this.log.push({
      type: "start",
      roles: this.players.map((p) => ({ name: p.name, role: p.role.name })),
    });

    await sleep(2500);
    await this.loop();
  }

  async loop() {
    while (this.phase !== "over") {
      await this.night();
      if (this.checkWin()) break;
      await this.day();
      if (this.checkWin()) break;
      await this.voting();
      if (this.checkWin()) break;
    }
  }

  /* ---------------- phase waiting ---------------- */

  waitPhase(seconds, isDone) {
    return new Promise((resolve) => {
      let left = seconds;
      const finish = () => {
        clearInterval(this._tick);
        this._tick = null;
        this._resolve = null;
        resolve();
      };
      this._resolve = () => {
        if (isDone()) finish();
      };
      this._force = finish;
      this._tick = setInterval(() => {
        left--;
        if (left === 30 || left === 15 || left === 5) {
          this.broadcast(countdown(left, seconds), (p) => p.connected);
        }
        if (left <= 0 || isDone()) finish();
      }, 1000);
    });
  }

  nudge() {
    if (this._resolve) this._resolve();
  }

  force() {
    if (this._force && this._tick) this._force();
  }

  /* ---------------- night ---------------- */

  async night() {
    this.phase = "night";
    this.round++;
    this.actions = { mafiaVotes: {}, save: null, check: null, guard: null };
    this.players.forEach((p) => (p.acted = false));

    this.broadcast("\n" + rule(`NIGHT ${this.round}`, c.blue));
    this.broadcast(
      c.blue + "  The lights go out. Everyone closes their eyes.\n" + c.reset + c.gray + "  " + this.alive().length + " still breathing." + c.reset,
    );
    this.broadcast("\n" + this.roster());

    for (const p of this.alive()) {
      if (p.isBot) continue;
      if (p.role.key === "mafia") {
        this.send(
          p,
          `\n${tag.mafia} Choose a target: ${c.bold}/kill <name|number>${c.reset}. Anything else you type reaches your partners — Mafia and Double Agent — privately.`,
        );
      } else if (p.role.key === "detective") {
        this.send(p, `\n${tag.night} Investigate someone: ${c.bold}/check <name|number>${c.reset}`);
      } else if (p.role.key === "doctor") {
        this.send(p, `\n${tag.night} Protect someone: ${c.bold}/save <name|number>${c.reset}`);
      } else if (p.role.key === "bodyguard") {
        this.send(p, `\n${tag.night} Guard someone (not yourself): ${c.bold}/guard <name|number>${c.reset}`);
      } else if (p.role.key === "double_agent") {
        this.send(
          p,
          `\n${tag.night} No kill of your own tonight — but anything you type reaches your Mafia partners privately. Use the day to work out who the Detective is.`,
        );
      } else {
        this.send(p, `\n${tag.night} You sleep. Listen to the silence.`);
      }
      p.acted = !p.role.night;
    }
    for (const p of this.alive()) if (p.isBot) p.acted = !p.role.night;

    // bots act on a human-feeling delay
    for (const b of this.alive().filter((p) => p.isBot && p.role.night)) {
      setTimeout(
        () => {
          if (this.phase !== "night" || !b.alive) return;
          const t = botNightTarget(b, this);
          if (t) this.applyNightAction(b, t);
          this.nudge();
        },
        1500 + Math.random() * 6000,
      );
    }

    await this.waitPhase(TIMINGS.night, () => this.alive().every((p) => p.acted || !p.connected));
    this.resolveNight();
  }

  applyNightAction(actor, target) {
    if (!target || !target.alive) return false;
    if (actor.role.key === "mafia") {
      this.actions.mafiaVotes[actor.id] = target.id;
      this.toTeam("mafia", `${tag.mafia} ${c.bold}${actor.name}${c.reset} marks ${c.red + target.name + c.reset}.`);
    } else if (actor.role.key === "doctor") {
      if (target.id === actor.id) {
        if (actor.selfSaved) {
          this.send(actor, `${tag.warn} You already used your self-protection.`);
          return false;
        }
        actor.selfSaved = true;
      }
      this.actions.save = target.id;
      this.send(actor, `${tag.night} You will watch over ${c.bold}${target.name}${c.reset} tonight.`);
    } else if (actor.role.key === "bodyguard") {
      if (target.id === actor.id) {
        this.send(actor, `${tag.warn} You can't guard yourself.`);
        return false;
      }
      this.actions.guard = target.id;
      this.send(actor, `${tag.night} You'll stand between ${c.bold}${target.name}${c.reset} and whoever comes for them.`);
    } else if (actor.role.key === "detective") {
      this.actions.check = { by: actor.id, target: target.id };
      actor.checked.add(target.id);
      const reads = target.role.team === "mafia" && target.role.key !== "double_agent";
      this.send(
        actor,
        `${tag.night} Your file on ${c.bold}${target.name}${c.reset} reads ` +
          (reads ? c.red + c.bold + "MAFIA" + c.reset : c.green + c.bold + "CLEAN" + c.reset) +
          c.gray +
          "  (files can be misleading)" +
          c.reset,
      );
    } else return false;
    actor.acted = true;
    return true;
  }

  resolveNight() {
    const tally = {};
    for (const tid of Object.values(this.actions.mafiaVotes)) tally[tid] = (tally[tid] || 0) + 1;
    let victimId = null;
    let best = 0;
    for (const [id, n] of Object.entries(tally)) {
      if (n > best) {
        best = n;
        victimId = Number(id);
      } else if (n === best && Math.random() < 0.5) victimId = Number(id);
    }

    this.broadcast("\n" + rule("DAWN", c.yellow));
    const victim = this.players.find((p) => p.id === victimId);
    if (!victim) {
      this.broadcast(c.gray + "  No one was marked. The night passed without a sound." + c.reset);
      this.log.push({ type: "night", round: this.round, result: "no kill" });
    } else if (this.actions.save === victim.id) {
      this.broadcast(
        c.green + `  ${victim.name} was attacked — and survived. Someone was watching over them.` + c.reset,
      );
      this.log.push({ type: "night", round: this.round, result: `${victim.name} saved` });
    } else if (this.actions.guard === victim.id && this.alive().some((p) => p.role.key === "bodyguard")) {
      const guard = this.alive().find((p) => p.role.key === "bodyguard");
      guard.alive = false;
      this.broadcast(
        c.green +
          `  ${victim.name} was attacked — but ${guard.name} took the bullet for them.` +
          c.reset +
          c.gray +
          `  ${guard.name} was the Bodyguard.` +
          c.reset,
      );
      this.send(
        guard,
        "\n" +
          bigBanner("YOU DIED", c.red) +
          "\n\n" +
          box(
            [
              c.red + `You gave your life to protect ${victim.name}.` + c.reset,
              c.gray + "You are now a spectator. You can see everything — the living cannot hear you." + c.reset,
            ],
            c.gray,
          ),
      );
      this.log.push({
        type: "night",
        round: this.round,
        result: `${victim.name} attacked — ${guard.name} died protecting them (Bodyguard)`,
      });
    } else {
      victim.alive = false;
      this.broadcast(
        c.red + c.bold + `  ${victim.name} is dead.` + c.reset + c.gray + `  They were a ${victim.role.name}.` + c.reset,
      );
      this.send(
        victim,
        "\n" +
          bigBanner("YOU DIED", c.red) +
          "\n\n" +
          box(
            [c.red + "You were killed in the night." + c.reset, c.gray + "You are now a spectator. You can see everything — the living cannot hear you." + c.reset],
            c.gray,
          ),
      );
      this.log.push({ type: "night", round: this.round, result: `${victim.name} killed (${victim.role.name})` });
    }
  }

  /* ---------------- day ---------------- */

  async day() {
    this.phase = "day";
    this.suspicion = {};
    this.broadcast("\n" + rule(`DAY ${this.round} — DISCUSSION`, c.yellow));
    this.broadcast(
      `${tag.day} Talk. Accuse. Defend. ${c.gray}Just type to speak. ${c.bold}/skip${c.reset}${c.gray} when you're ready to vote.${c.reset}`,
    );
    this.broadcast("\n" + this.roster());
    this.skipVotes = new Set();

    for (const p of this.alive().filter((x) => x.role.team === "mafia")) {
      this.send(
        p,
        `${tag.mafia} Private channel is open: ${c.bold}/m <message>${c.reset} reaches only your Mafia + Double Agent partners — the town can't see it.`,
      );
    }

    const bots = this.alive().filter((p) => p.isBot);
    for (const b of bots) {
      const msgs = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < msgs; i++) {
        setTimeout(
          () => {
            if (this.phase !== "day" || !b.alive) return;
            const line = botChat(b, this);
            if (line) this.say(b, line);
          },
          3000 + Math.random() * (TIMINGS.day * 600),
        );
      }
    }

    await this.waitPhase(TIMINGS.day, () => {
      const humans = this.alive().filter((p) => !p.isBot && p.connected);
      return humans.length > 0 && humans.every((p) => this.skipVotes.has(p.id));
    });
  }

  say(player, text) {
    const clean = text.slice(0, 240);
    for (const p of this.alive()) {
      if (clean.toLowerCase().includes(p.name.toLowerCase()) && p.id !== player.id)
        this.suspicion[p.id] = (this.suspicion[p.id] || 0) + 1;
    }
    const botMark = player.isBot ? c.gray + "·" + c.reset : "";
    this.broadcast(`  ${c.bold}${player.name}${botMark}${c.reset}${c.gray}:${c.reset} ${clean}`);
    this.log.push({ type: "chat", round: this.round, name: player.name, text: clean });
  }

  /* ---------------- voting ---------------- */

  async voting() {
    this.phase = "vote";
    this.players.forEach((p) => (p.vote = null));
    this.broadcast("\n" + rule(`DAY ${this.round} — VOTE`, c.magenta));
    this.broadcast(`${tag.vote} ${c.bold}/vote <name|number>${c.reset} or ${c.bold}/vote skip${c.reset}. No changing your mind.`);
    this.broadcast("\n" + this.roster());

    for (const b of this.alive().filter((p) => p.isBot)) {
      setTimeout(
        () => {
          if (this.phase !== "vote" || !b.alive || b.vote) return;
          const t = botVote(b, this);
          if (t) this.castVote(b, t);
          this.nudge();
        },
        2000 + Math.random() * 10000,
      );
    }

    await this.waitPhase(TIMINGS.vote, () => this.alive().every((p) => p.vote || !p.connected));
    this.resolveVote();
  }

  castVote(voter, target) {
    voter.vote = target === "skip" ? "skip" : target.id;
    const label = target === "skip" ? c.gray + "abstain" + c.reset : c.bold + target.name + c.reset;
    // Secret ballot: only the voter learns who they picked.
    this.send(voter, `  ${c.magenta}▸${c.reset} ${c.gray}Your vote is locked in:${c.reset} ${label}`);
    const cast = this.alive().filter((p) => p.vote).length;
    const total = this.alive().length;
    this.broadcast(`  ${c.magenta}▸${c.reset} ${bar(cast, total, 14, c.magenta)} ${c.gray}${cast}/${total} ballots in${c.reset}`);
    return true;
  }

  resolveVote() {
    const tally = {};
    const record = [];
    for (const p of this.alive()) {
      const t = p.vote;
      record.push({ voter: p.name, target: t === "skip" || !t ? "—" : this.players.find((x) => x.id === t)?.name });
      if (!t || t === "skip") continue;
      tally[t] = (tally[t] || 0) + 1;
    }
    let top = null;
    let best = 0;
    let tie = false;
    for (const [id, n] of Object.entries(tally)) {
      if (n > best) {
        best = n;
        top = Number(id);
        tie = false;
      } else if (n === best) tie = true;
    }

    // Counts only — never who voted for whom.
    const counts = Object.entries(tally)
      .map(([id, n]) => ({ name: this.players.find((x) => x.id === Number(id))?.name, n }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
    const abstained = this.alive().filter((p) => !p.vote || p.vote === "skip").length;
    const totalBallots = this.alive().length;
    const maxN = Math.max(1, ...counts.map((r) => r.n));
    const nameWidth = Math.max(9, ...counts.map((r) => r.name.length), "abstained".length);

    const boardLines = [];
    for (const row of counts) {
      const isLeader = row.n === best && !tie;
      const pct = Math.round((row.n / totalBallots) * 100);
      const mark = isLeader ? c.red + "▸ " + c.reset : "  ";
      boardLines.push(
        `${mark}${c.bold}${row.name.padEnd(nameWidth)}${c.reset} ${bar(row.n, maxN, 16, isLeader ? c.red : c.magenta)} ${c.gray}${String(row.n).padStart(2)} vote${row.n === 1 ? " " : "s"} (${pct}%)${c.reset}`,
      );
    }
    if (abstained)
      boardLines.push(
        `  ${c.gray}${"abstained".padEnd(nameWidth)} ${bar(0, totalBallots, 16, c.gray)} ${String(abstained).padStart(2)}${c.gray}     (${Math.round((abstained / totalBallots) * 100)}%)${c.reset}`,
      );
    if (!boardLines.length) boardLines.push(c.gray + "Nobody cast a ballot." + c.reset);
    this.broadcast("\n" + box(boardLines, c.magenta, `VERDICT — DAY ${this.round}`));

    if (!top || tie) {
      this.broadcast(c.gray + "  The room is split. No one hangs today." + c.reset);
      this.log.push({ type: "vote", round: this.round, result: "no elimination", record });
      return;
    }
    const victim = this.players.find((p) => p.id === top);
    victim.alive = false;
    this.broadcast(
      c.bold + `  ${victim.name} is voted out (${best} votes).` + c.reset + "\n" + `  They were ${victim.role.color + c.bold + victim.role.name + c.reset}.`,
    );
    this.log.push({ type: "vote", round: this.round, result: `${victim.name} eliminated (${victim.role.name})`, record });

    if (victim.role.key === "jester") {
      this.send(victim, "\n" + bigBanner("🎭 JESTER WINS", c.yellow) + "\n\n" + box([c.yellow + "You got exactly what you wanted." + c.reset], c.gray));
      this.broadcast("\n" + c.yellow + c.bold + `  ${victim.name} was the Jester — they wanted this. 🎭` + c.reset);
      this.end("jester");
      return;
    }

    this.send(
      victim,
      "\n" +
        bigBanner("ELIMINATED", c.yellow) +
        "\n\n" +
        box([c.yellow + "The town turned on you." + c.reset, c.gray + "You are now a spectator." + c.reset], c.gray),
    );
  }

  /* ---------------- win condition ---------------- */

  checkWin() {
    // resolveVote() may already have ended the game itself (Jester's
    // instant win on elimination) before the loop gets a chance to ask.
    if (this.phase === "over") return true;
    const alive = this.alive();
    const mafia = alive.filter((p) => p.role.team === "mafia");
    const town = alive.filter((p) => p.role.team === "town");
    if (mafia.length === 0) return this.end("town");
    if (mafia.length >= town.length) return this.end("mafia");
    return false;
  }

  end(winner) {
    this.phase = "over";
    const WIN_TEXT = {
      town: { label: "TOWN", color: c.green, line: "every Mafia has been buried." },
      mafia: { label: "MAFIA", color: c.red, line: "they outnumber the living town." },
      jester: { label: "JESTER", color: c.yellow, line: "they got exactly what they wanted — voted out." },
    };
    const info = WIN_TEXT[winner];
    const win = info.color + c.bold + `  ${info.label} WINS — ${info.line}` + c.reset;
    this.broadcast("\n" + rule("GAME OVER", info.color));
    this.broadcast("\n" + bigBanner(`${info.label} WINS`, info.color) + "\n");
    this.broadcast(win + "\n");

    // Personalized verdict — everyone still in a team finds out on their own screen
    // whether their side won, before the shared roster/history recap below.
    for (const p of this.players) {
      if (p.isBot || !p.role || p.role.team === "none") continue;
      const wonIt = p.role.team === winner;
      this.send(p, "\n" + bigBanner(wonIt ? "YOU WIN" : "YOU LOSE", wonIt ? c.green : c.red) + "\n");
    }

    this.broadcast(
      box(
        this.players.map(
          (p) =>
            `${p.alive ? c.green + "●" + c.reset : c.gray + "✝" + c.reset} ${p.name.padEnd(12)} ${p.role.color + p.role.name + c.reset}` +
            (p.isBot ? c.gray + "  ·bot" + c.reset : ""),
        ),
        c.white,
      ),
    );
    this.broadcast("\n" + rule("MATCH HISTORY", c.gray));
    for (const e of this.log) {
      if (e.type === "night") this.broadcast(c.blue + `  night ${e.round}: ` + c.reset + e.result);
      if (e.type === "vote") {
        this.broadcast(c.magenta + `  day ${e.round}: ` + c.reset + e.result);
        this.broadcast(c.gray + "    " + e.record.map((r) => `${r.voter}→${r.target}`).join("  ") + c.reset);
      }
    }
    this.broadcast("\n" + c.gray + "  Host can type /restart to run it back." + c.reset);

    this.onEnd?.({
      endedAt: new Date().toISOString(),
      players: this.players.length,
      winner,
      rounds: this.round,
      roster: this.players.map((p) => ({
        name: p.name,
        role: p.role ? p.role.name : "—",
        team: p.role ? p.role.team : "none",
        alive: p.alive,
        isBot: p.isBot,
      })),
      // Role reveals + voting patterns only — chat isn't needed for the replay.
      log: this.log.filter((e) => e.type === "start" || e.type === "night" || e.type === "vote"),
    });

    return true;
  }
}
