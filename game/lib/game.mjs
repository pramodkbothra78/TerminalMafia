import { c, rule, box, tag, banner } from "./ui.mjs";
import { ROLES, buildRoleDeck } from "./roles.mjs";
import { botChat, botVote, botNightTarget, BOT_NAMES } from "./bots.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const TIMINGS = {
  night: 45,
  day: 90,
  vote: 45,
};

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
    this.broadcast(msg, (p) => p.alive && p.role?.team === team && p.role.key !== "double_agent");
  }

  toGhosts(msg) {
    this.broadcast(msg, (p) => !p.alive);
  }

  roster(forPlayer = null) {
    const lines = this.alive().map((p, i) => {
      const mark =
        forPlayer && forPlayer.role?.key === "mafia" && p.role?.key === "mafia"
          ? c.red + " ✖ mafia" + c.reset
          : "";
      const conn = p.connected ? "" : c.gray + " (disconnected)" + c.reset;
      const bot = p.isBot ? c.gray + " ·bot" + c.reset : "";
      return ` ${c.bold}${String(i + 1).padStart(2)}${c.reset}  ${p.name}${bot}${mark}${conn}`;
    });
    const dead = this.dead().map((p) => c.gray + `  ✝  ${p.name} — ${p.role ? p.role.name : "?"}` + c.reset);
    return [c.bold + "ALIVE" + c.reset, ...lines, ...(dead.length ? [c.gray + "DEAD" + c.reset, ...dead] : [])].join(
      "\n",
    );
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
    const deck = buildRoleDeck(this.players.length);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
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
      const mates = this.players.filter((o) => o.role.key === "mafia" && o.id !== p.id).map((o) => o.name);
      this.send(
        p,
        "\n" +
          box(
            [
              `You are ${p.role.color + c.bold + p.role.name.toUpperCase() + c.reset}`,
              c.gray + p.role.blurb + c.reset,
              ...(p.role.key === "mafia"
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
          this.broadcast(c.gray + `  … ${left}s remaining` + c.reset, (p) => p.connected);
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
    this.actions = { mafiaVotes: {}, save: null, check: null };
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
          `\n${tag.mafia} Choose a target: ${c.bold}/kill <name|number>${c.reset}. Anything else you type is Mafia-only chat.`,
        );
      } else if (p.role.key === "detective") {
        this.send(p, `\n${tag.night} Investigate someone: ${c.bold}/check <name|number>${c.reset}`);
      } else if (p.role.key === "doctor") {
        this.send(p, `\n${tag.night} Protect someone: ${c.bold}/save <name|number>${c.reset}`);
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
    } else {
      victim.alive = false;
      this.broadcast(
        c.red + c.bold + `  ${victim.name} is dead.` + c.reset + c.gray + `  They were a ${victim.role.name}.` + c.reset,
      );
      this.send(victim, "\n" + box([c.red + "You were killed in the night." + c.reset, c.gray + "You are now a spectator. You can see everything — the living cannot hear you." + c.reset], c.gray));
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
    this.broadcast(`  ${c.magenta}▸${c.reset} ${voter.name} votes ${label}`);
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

    this.broadcast("\n" + rule("VERDICT", c.magenta));
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
    this.send(victim, "\n" + box([c.yellow + "The town turned on you." + c.reset, c.gray + "You are now a spectator." + c.reset], c.gray));
    this.log.push({ type: "vote", round: this.round, result: `${victim.name} eliminated (${victim.role.name})`, record });
  }

  /* ---------------- win condition ---------------- */

  checkWin() {
    const alive = this.alive();
    const mafia = alive.filter((p) => p.role.team === "mafia");
    const town = alive.filter((p) => p.role.team === "town");
    if (mafia.length === 0) return this.end("town");
    if (mafia.length >= town.length) return this.end("mafia");
    return false;
  }

  end(winner) {
    this.phase = "over";
    const win =
      winner === "town"
        ? c.green + c.bold + "  TOWN WINS — every Mafia has been buried." + c.reset
        : c.red + c.bold + "  MAFIA WINS — they outnumber the living town." + c.reset;
    this.broadcast("\n" + rule("GAME OVER", winner === "town" ? c.green : c.red));
    this.broadcast(win + "\n");
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
    return true;
  }
}
