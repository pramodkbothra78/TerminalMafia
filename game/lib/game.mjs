import {
  c,
  rule,
  box,
  tag,
  banner,
  bar,
  countdown,
  icon,
  bigBanner,
  fitBig,
  center,
  screen,
  speech,
  voteBoard,
  wrap,
  strip,
  SCREEN,
} from "./ui.mjs";
import { ROLES, buildRoleDeck } from "./roles.mjs";
import {
  botChat,
  botVote,
  botNightTarget,
  gotchaLine,
  rebutLine,
  slipLine,
  personaFor,
  SECRET_ROLES,
  BOT_NAMES,
} from "./bots.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => (arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);

// Phase lengths can be compressed via env vars — used by the test suite to
// run a full match in seconds instead of minutes.
export const TIMINGS = {
  night: Number(process.env.MAFIA_NIGHT) || 45,
  day: Number(process.env.MAFIA_DAY) || 60,
  vote: Number(process.env.MAFIA_VOTE) || 45,
};

// The reveal screens are paced — a verdict that appears all at once isn't
// a verdict, it's a paragraph. But when the phase timers are compressed
// (the test suite runs 2-second phases) the pauses collapse too, so a
// full match still finishes in seconds instead of stalling on drama.
const DRAMA = TIMINGS.vote < 10 || TIMINGS.day < 10 ? 0.08 : 1;
const beat = (ms) => sleep(Math.max(1, Math.round(ms * DRAMA)));

// Centers a group of lines as one block, so numbers in a column stay
// aligned with each other instead of each line floating independently.
function centerBlock(lines) {
  const width = Math.max(...lines.map((l) => strip(l).length));
  const pad = " ".repeat(Math.max(0, Math.floor((SCREEN - width) / 2)));
  return lines.map((l) => pad + l);
}

// "2 MAFIA", "3 VILLAGERS" — Mafia reads as a collective, everything else
// takes a plural s.
function countLabel(role, n) {
  const name = role.name.toUpperCase();
  if (n === 1 || role.key === "mafia") return `${n} ${name}`;
  return `${n} ${name}S`;
}

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
    this.talk = {}; // how much each player has spoken — bots target loud rooms
    this.ballots = []; // yesterday's published ballot, so bots can quote it
    this.publicRoles = new Set(); // roles the whole room has seen flipped
    this.claimed = new Set(); // roles said out loud — true or not, they're public now
    this.convo = { event: null, lastAccusation: null, slip: null, budget: 0, last: null };
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

  /* ---------------- the deal ---------------- */

  // The opening card. Everyone learns the exact shape of the room — how
  // many mafia, which power roles are live — before a single word is
  // spoken. Revealed line by line, because a wall of text that appears
  // instantly reads as output, and a list that arrives one line at a
  // time reads as a dealer turning over cards.
  async dealCard(deck) {
    const counts = {};
    for (const k of deck) counts[k] = (counts[k] || 0) + 1;
    const order = ["mafia", "double_agent", "detective", "doctor", "bodyguard", "jester", "villager"];

    this.broadcast(banner());
    await beat(600);

    const rows = [
      { text: `${this.players.length} PLAYERS`, color: c.white },
      ...order.filter((k) => counts[k]).map((k) => ({ text: countLabel(ROLES[k], counts[k]), color: ROLES[k].color })),
    ];
    const width = Math.max(...rows.map((r) => r.text.length));
    const pad = " ".repeat(Math.max(0, Math.floor((SCREEN - width) / 2)));

    this.broadcast("");
    for (const r of rows) {
      this.broadcast(pad + r.color + c.bold + r.text + c.reset);
      await beat(r.color === c.white ? 650 : 340);
    }

    await beat(800);
    this.broadcast("\n" + centerBlock([c.gray + c.it + "THE NIGHT BEGINS..." + c.reset]).join("\n") + "\n");
    await beat(900);
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
    await this.dealCard(deck);

    for (const p of this.players) {
      if (p.isBot) continue;
      // Mafia and Double Agent share team "mafia" and know each other from the start.
      const isConspirator = p.role.team === "mafia";
      const mates = isConspirator
        ? this.players
            .filter((o) => o.id !== p.id && o.role.team === "mafia")
            .map((o) => `${o.name} (${o.role.name})`)
        : [];
      // The private half of the deal: your own role, big, on your screen
      // only. The literal "You are ROLE" line stays — it's what a
      // reconnecting client and the test harness read the role from.
      this.send(
        p,
        "\n" +
          screen([
            center(c.gray + "YOUR ROLE" + c.reset),
            "",
            fitBig(p.role.name, p.role.color),
            "",
            center(`${c.gray}You are ${c.reset}${p.role.color + c.bold + p.role.name.toUpperCase() + c.reset}`),
          ]) +
          "\n" +
          box(
            [
              c.gray + p.role.blurb + c.reset,
              ...(isConspirator
                ? [
                    "",
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

    this.broadcast("\n" + c.gray + "  /help at any time · /players lists the room" + c.reset);
    await beat(2500);
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
        Math.min(1500 + Math.random() * 6000, TIMINGS.night * 1000 * 0.55),
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
      this.lastEvent = { type: "quiet" };
      this.log.push({ type: "night", round: this.round, result: "no kill" });
    } else if (this.actions.save === victim.id) {
      this.broadcast(
        c.green + `  ${victim.name} was attacked — and survived. Someone was watching over them.` + c.reset,
      );
      this.lastEvent = { type: "save", name: victim.name };
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
      this.publicRoles.add(guard.id);
      this.lastEvent = { type: "kill", name: guard.name };
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
      this.publicRoles.add(victim.id);
      this.lastEvent = { type: "kill", name: victim.name };
      this.log.push({ type: "night", round: this.round, result: `${victim.name} killed (${victim.role.name})` });
    }
  }

  /* ---------------- day ---------------- */

  async day() {
    this.phase = "day";
    this.suspicion = {};
    // Fresh argument, but it starts from what the room woke up to.
    this.convo = { event: this.lastEvent || null, lastAccusation: null, slip: null, budget: 0, last: null };
    this.broadcast("\n" + screen([fitBig(`DAY ${this.round}`, c.yellow)]));
    await beat(700);
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

    this.startConversation();

    await this.waitPhase(TIMINGS.day, () => {
      const humans = this.alive().filter((p) => !p.isBot && p.connected);
      return humans.length > 0 && humans.every((p) => this.skipVotes.has(p.id));
    });
  }

  /* ---------------- the conversation ---------------- */

  // Bots don't fire off independent one-liners on random timers any more —
  // they take turns in a single room, and each turn looks at what was just
  // said. That's the difference between a chatroom and an argument.
  startConversation() {
    const bots = this.alive().filter((p) => p.isBot);
    this.convo.budget = Math.min(26, bots.length * 3 + 4);
    this.convo.endsAt = Date.now() + TIMINGS.day * 1000;
    this.convo.beats = 0;
    // Somebody on the mafia team gets careless most days. This is not a
    // coin flip buried inside a personality check — the leak is the most
    // interesting thing that can happen in a discussion, so the day
    // schedules a slot for it and the first conspirator who actually
    // holds a secret fills it. If nobody does, the beat passes quietly.
    // MAFIA_LEAK pins the slot ("always"/"never") so the slip-and-getting-
    // caught exchange can be tested deterministically. Unset in real matches.
    const leakMode = process.env.MAFIA_LEAK;
    this.convo.leakBeat =
      leakMode === "always"
        ? 2
        : leakMode === "never"
          ? -1
          : Math.random() < 0.65
            ? 2 + Math.floor(Math.random() * Math.max(1, this.convo.budget / 3))
            : -1;
    const beatMs = Math.max(600, Math.min(2600, (TIMINGS.day * 1000) / 9));
    this._step = () => {
      if (this.phase !== "day") return;
      this.conversationBeat();
      if (this.convo.budget <= 0) return;
      this._convo = setTimeout(this._step, beatMs * (0.65 + Math.random() * 0.8));
    };
    this._convo = setTimeout(this._step, Math.min(1200, beatMs * 0.7));
  }

  // A slip is the loudest thing that can happen in a day, so the room
  // rounds on it immediately rather than whenever the next beat happens
  // to land — the payoff has to arrive while the line is still on screen.
  scheduleGotcha() {
    if (this.phase !== "day" || !this._step) return;
    clearTimeout(this._convo);
    this.convo.budget = Math.max(this.convo.budget, 2);
    this._convo = setTimeout(this._step, Math.max(400, 1100 * DRAMA));
  }

  stopConversation() {
    clearTimeout(this._convo);
    this._convo = null;
  }

  // One turn of the argument, in priority order: an unanswered slip is
  // the loudest thing in the room, then an unanswered accusation, then
  // whoever feels like talking.
  conversationBeat() {
    const bots = this.alive().filter((p) => p.isBot);
    if (!bots.length) return;
    this.convo.budget--;
    this.convo.beats = (this.convo.beats || 0) + 1;

    // 1. Somebody said something they couldn't possibly know.
    const slip = this.convo.slip;
    if (slip && !slip.answered) {
      // Neither the person who leaked nor the person whose role was leaked
      // would draw attention to it — the subject least of all.
      const responder = pick(bots.filter((b) => b.name !== slip.speaker && b.id !== slip.subjectId));
      if (responder) {
        slip.answered = true;
        const line = gotchaLine(responder, slip);
        this.say(responder, line.text, { kind: "gotcha" });
        this.afterGotcha(slip);
        return;
      }
    }

    // 2. The scheduled leak. Only a bot that genuinely holds the secret
    //    can fill it — bots never invent knowledge they don't have.
    if (this.convo.beats === this.convo.leakBeat) {
      this.convo.leakBeat = -1;
      const conspirators = bots.filter((b) => b.role?.team === "mafia").sort(() => Math.random() - 0.5);
      for (const b of conspirators) {
        const line = slipLine(b, this);
        if (line) {
          this.say(b, line.text, { kind: "slip" });
          return;
        }
      }
    }

    // 3. An accused bot answers for itself before anything else happens.
    const acc = this.convo.lastAccusation;
    if (acc && !acc.answered) {
      const accused = bots.find((b) => b.name.toLowerCase() === String(acc.target).toLowerCase());
      if (accused && accused.name !== acc.by) {
        acc.answered = true;
        const line = rebutLine(accused, acc.by);
        this.say(accused, line.text, { kind: "rebut" });
        return;
      }
    }

    // 4. Otherwise someone speaks up — chattier personalities more often,
    //    and never the same voice twice in a row if there's an alternative.
    const notLast = bots.filter((b) => b.id !== this.convo.last);
    const pool = notLast.length ? notLast : bots;
    const weighted = [];
    for (const b of pool) {
      const n = Math.max(1, Math.round(personaFor(b.name).chatty * 4));
      for (let i = 0; i < n; i++) weighted.push(b);
    }
    const speaker = pick(weighted);
    if (!speaker) return;

    const ctx = {
      event: this.convo.event,
      lastAccusation: this.convo.lastAccusation,
      // Don't leak with seconds left on the clock — nobody would get to
      // call it out, and an unanswered slip is just a weird sentence.
      allowSlip: this.convo.budget > 1 && Date.now() < (this.convo.endsAt || 0) - 4000 * DRAMA,
    };
    // A bot never repeats itself, but two bots reaching for the same
    // template in the same minute is just as obvious — so the room keeps
    // its own memory of what's already been said today.
    let line = null;
    for (let i = 0; i < 3; i++) {
      const candidate = botChat(speaker, this, ctx);
      if (!candidate) break;
      line = candidate;
      if (!this.convo.recent?.has(candidate.text)) break;
    }
    if (!line) return;
    if (line.kind === "react") this.convo.event = null; // the body gets discussed once
    this.say(speaker, line.text, { kind: line.kind, target: line.target });
  }

  // The room's reaction to a caught slip: the person who leaked becomes
  // the most suspicious player alive, which really does move the vote —
  // bots weight their ballots by suspicion. Drama with consequences.
  afterGotcha(slip) {
    const speaker = this.players.find((p) => p.name === slip.speaker);
    if (speaker) this.suspicion[speaker.id] = (this.suspicion[speaker.id] || 0) + 3;
    // Once it's been screamed across the room it isn't secret knowledge
    // any more, so nobody gets called out for repeating it.
    if (slip.subjectId) this.claimed.add(slip.subjectId);
    this.broadcast(
      "  " + c.yellow + "\u26a0" + c.reset + c.gray + ` the room turns on ${slip.speaker}.` + c.reset,
    );
  }

  // Did this line contain knowledge the speaker has no honest way of
  // holding? Naming someone as mafia is an accusation; naming them as the
  // Doctor is information, and information has a source.
  detectSlip(speaker, text) {
    const lower = text.toLowerCase();
    if (lower.trim().endsWith("?")) return null; // asking isn't knowing
    const WORDS = {
      doctor: "doctor",
      detective: "detective",
      bodyguard: "bodyguard",
      double_agent: "double agent",
      jester: "jester",
    };
    for (const p of this.alive()) {
      if (p.id === speaker.id) continue;
      if (!p.role || !SECRET_ROLES.includes(p.role.key)) continue;
      if (this.publicRoles.has(p.id) || this.claimed.has(p.id)) continue;
      const word = WORDS[p.role.key];
      if (!lower.includes(word)) continue;
      if (!new RegExp(`\\b${p.name.toLowerCase().replace(/[^\w-]/g, "")}\\b`).test(lower)) continue;
      return {
        speaker: speaker.name,
        subject: p.name,
        subjectId: p.id,
        role: word,
        answered: false,
      };
    }
    return null;
  }

  // Claiming your own role is normal play, not a leak — but it does put
  // that role into the open, so nobody gets screamed at for repeating it.
  noteSelfClaim(speaker, text) {
    if (!speaker.role) return;
    const word = { double_agent: "double agent" }[speaker.role.key] || speaker.role.key;
    if (new RegExp(`\\bi(?:'m| am| was)\\b[^.!?]*\\b${word}\\b`, "i").test(text)) this.claimed.add(speaker.id);
  }

  say(player, text, { kind = "chat", target = null } = {}) {
    const clean = text.slice(0, 240);
    for (const p of this.alive()) {
      if (clean.toLowerCase().includes(p.name.toLowerCase()) && p.id !== player.id)
        this.suspicion[p.id] = (this.suspicion[p.id] || 0) + 1;
    }
    this.talk[player.id] = (this.talk[player.id] || 0) + 1;
    this.convo.last = player.id;
    (this.convo.recent ||= new Set()).add(clean);

    if (kind === "accuse" && target) this.convo.lastAccusation = { by: player.name, target, answered: false };
    // A human who names exactly one other player has, as far as the room is
    // concerned, accused them — so the bots answer real people by name too.
    if (kind === "chat") {
      const named = this.alive().filter(
        (p) => p.id !== player.id && new RegExp(`\\b${p.name.toLowerCase()}\\b`).test(clean.toLowerCase()),
      );
      if (named.length === 1)
        this.convo.lastAccusation = { by: player.name, target: named[0].name, answered: false };
    }
    if (kind !== "gotcha") {
      this.noteSelfClaim(player, clean);
      const slip = this.detectSlip(player, clean);
      // Only the freshest slip is worth yelling about.
      if (slip) {
        this.convo.slip = slip;
        this.scheduleGotcha();
      }
    }

    const botMark = player.isBot ? c.gray + "·" + c.reset : "";
    const shout = kind === "gotcha";
    this.broadcast(
      "\n" +
        speech(player.name, clean, {
          mark: botMark,
          nameColor: shout ? c.red + c.bold : c.bold,
          textColor: shout ? c.red + c.bold : "",
        }),
    );
    this.log.push({ type: "chat", round: this.round, name: player.name, text: clean });
  }

  /* ---------------- voting ---------------- */

  async voting() {
    this.phase = "vote";
    this.counting = false;
    this.stopConversation();
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
        Math.min(2000 + Math.random() * 10000, TIMINGS.vote * 1000 * 0.6),
      );
    }

    await this.waitPhase(TIMINGS.vote, () => this.alive().every((p) => p.vote || !p.connected));
    await this.resolveVote();
  }

  castVote(voter, target) {
    voter.vote = target === "skip" ? "skip" : target.id;
    const label = target === "skip" ? c.gray + "abstain" + c.reset : c.bold + target.name + c.reset;
    // Secret ballot: only the voter learns who they picked.
    this.send(voter, `  ${c.magenta}▸${c.reset} ${c.gray}Your vote is locked in:${c.reset} ${label}`);
    const cast = this.alive().filter((p) => p.vote).length;
    const total = this.alive().length;
    if (!this.counting)
      this.broadcast(`  ${c.magenta}▸${c.reset} ${bar(cast, total, 14, c.magenta)} ${c.gray}${cast}/${total} ballots in${c.reset}`);
    return true;
  }

  // The published ballot: who put the rope on whom. Secret while the vote
  // is open, on the record the moment it closes.
  ballotLine(record) {
    if (!record.length) return "";
    const pairs = record.map((r) => `${r.voter}\u2192${r.target === "\u2014" ? "skip" : r.target}`);
    // wrap() normalises whitespace, so the separator has to be a character.
    // A full room on one line overruns an 80-column terminal, so the ballot
    // wraps with a hanging indent under the label.
    const label = "  ballot  ";
    const lines = wrap(pairs.join(" \u00b7 "), SCREEN - label.length);
    return lines
      .map((l, i) => (i === 0 ? c.gray + label + c.reset : " ".repeat(label.length)) + c.gray + l + c.reset)
      .join("\n");
  }

  async resolveVote() {
    // Ballots are closed. Late arrivals from a bot timer must not print
    // a progress bar into the middle of the verdict screen.
    this.counting = true;
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

    // The ballot becomes public once it's counted. It stays secret while
    // people are voting, but afterwards the room can hold each other to
    // it — and the bots quote it out loud the next morning.
    this.ballots = record;

    this.broadcast("\n" + screen([fitBig("VERDICT", c.magenta)]));
    this.broadcast(center(c.gray + `DAY ${this.round}` + c.reset) + "\n");
    await beat(900);

    const rows = counts.map((row) => ({ name: row.name, n: row.n, leader: row.n === best && !tie }));
    if (abstained) rows.push({ name: "skip", n: abstained, dim: true });
    const boardLines = rows.length
      ? voteBoard(rows, { total: totalBallots })
      : [center(c.gray + "Nobody cast a ballot." + c.reset)];
    // Row by row, so the bars fill in front of the room rather than
    // arriving as a finished table.
    for (const line of boardLines) {
      this.broadcast(line);
      await beat(280);
    }
    this.broadcast("");
    this.broadcast(this.ballotLine(record));
    await beat(1000);

    if (!top || tie) {
      this.broadcast("\n" + center(c.gray + "The room is split. No one hangs today." + c.reset) + "\n");
      this.log.push({ type: "vote", round: this.round, result: "no elimination", record });
      return;
    }
    const victim = this.players.find((p) => p.id === top);
    victim.alive = false;
    this.broadcast("\n" + rule("", c.gray));
    this.broadcast(
      center(c.bold + `${victim.name} has been eliminated` + c.reset + c.gray + `  ·  ${best} vote${best === 1 ? "" : "s"}` + c.reset),
    );
    await beat(1500);

    // The reveal. This is the beat the whole day was built toward, so it
    // gets its own screen rather than a trailing clause on the last line.
    this.broadcast("\n" + center(c.gray + "\u2500\u2500  ROLE REVEAL  \u2500\u2500" + c.reset) + "\n");
    await beat(800);
    this.broadcast(fitBig(victim.role.name, victim.role.color));
    const side =
      victim.role.team === "mafia"
        ? c.red + c.bold + "THEY WERE WITH THE MAFIA." + c.reset
        : victim.role.team === "town"
          ? c.green + c.bold + "THEY WERE TOWN." + c.reset
          : c.yellow + c.bold + "THEY PLAYED FOR NOBODY BUT THEMSELVES." + c.reset;
    this.broadcast("\n" + center(side));
    this.broadcast(rule("", c.gray) + "\n");
    await beat(1000);
    this.publicRoles.add(victim.id);
    this.log.push({ type: "vote", round: this.round, result: `${victim.name} eliminated (${victim.role.name})`, record });

    if (victim.role.key === "jester") {
      this.send(victim, "\n" + fitBig("JESTER WINS", c.yellow) + "\n\n" + box([c.yellow + "You got exactly what you wanted." + c.reset], c.gray));
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
            (p.isBot ? c.gray + `  ·bot (${personaFor(p.name).label})` + c.reset : ""),
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
