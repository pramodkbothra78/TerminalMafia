// Offline heuristic bots. No network, no API keys, no LLM — they run
// inside the server.
//
// The goal here is not a strong Mafia engine, it's a *believable room*.
// Bots answer each other, quote things that actually happened, and
// occasionally say something they shouldn't know — which the rest of the
// room will catch them on. See `slipLine` and `GOTCHA`.

export const BOT_NAMES = [
  "ada",
  "boone",
  "cinder",
  "dax",
  "echo",
  "flint",
  "grim",
  "hazel",
  "ivo",
  "juno",
  "kilo",
  "lark",
];

const pick = (arr) => (arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);
const chance = (p) => Math.random() < p;

/* ------------------------------------------------------------------ */
/* Personalities                                                       */
/* ------------------------------------------------------------------ */

// Four temperaments. Personality is not decoration: it changes what a bot
// says, how often it says it, who it suspects, how predictably it votes,
// and how it uses its night power.
export const PERSONAS = {
  analytical: {
    key: "analytical",
    label: "analytical",
    blurb: "counts votes, quotes the record, rarely raises their voice",
    chatty: 0.85,
    voteNoise: 0.1,
    citeBias: 0.55, // prefers hard facts over vibes
    leakRisk: 0.05, // how likely they are to say the quiet part out loud
    killsLoud: false,
  },
  aggressive: {
    key: "aggressive",
    label: "aggressive",
    blurb: "picks a target early and shouts until the room follows",
    chatty: 1,
    voteNoise: 0.05,
    citeBias: 0.2,
    leakRisk: 0.18,
    killsLoud: true,
  },
  defensive: {
    key: "defensive",
    label: "defensive",
    blurb: "slows the room down, hates being the one holding the rope",
    chatty: 0.7,
    voteNoise: 0.25,
    citeBias: 0.3,
    leakRisk: 0.08,
    killsLoud: false,
  },
  chaotic: {
    key: "chaotic",
    label: "chaotic",
    blurb: "votes on vibes, and the vibes are not consistent",
    chatty: 0.9,
    voteNoise: 0.5,
    citeBias: 0.15,
    leakRisk: 0.25,
    killsLoud: true,
  },
};

// A few codenames are pinned so a room feels the same from match to
// match — grim always shouts, juno always flinches. Everyone else gets a
// stable persona from their name, so custom codenames work too.
const PINNED = {
  ada: "analytical",
  grim: "aggressive",
  juno: "defensive",
  dax: "chaotic",
};

const KEYS = Object.keys(PERSONAS);

// The canonical roster is dealt round-robin (after the pins) so a full
// lobby of bots is always a mixed room — four shouters and no sceptics
// makes for a boring day phase. Names outside the roster fall back to a
// stable hash, so custom codenames still get a fixed temperament.
const ROSTER_PERSONA = (() => {
  const map = {};
  let next = 0;
  for (const name of BOT_NAMES) {
    if (PINNED[name]) {
      map[name] = PINNED[name];
      continue;
    }
    while (Object.values(PINNED).includes(KEYS[next % KEYS.length]) && next < KEYS.length) next++;
    map[name] = KEYS[next % KEYS.length];
    next++;
  }
  return map;
})();

export function personaFor(name) {
  const n = String(name || "").toLowerCase();
  if (PINNED[n]) return PERSONAS[PINNED[n]];
  if (ROSTER_PERSONA[n]) return PERSONAS[ROSTER_PERSONA[n]];
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return PERSONAS[KEYS[h % KEYS.length]];
}

/* ------------------------------------------------------------------ */
/* Dialogue                                                            */
/* ------------------------------------------------------------------ */

const ACCUSE = {
  analytical: [
    "{t}'s story changed twice. i'm on {t}.",
    "count it out: {t} is the only one who gains from last night.",
    "i don't like the timing on {t}.",
    "{t}, walk me through your night. slowly.",
    "{t} has answered every question with a question.",
  ],
  aggressive: [
    "{t}. it's {t}. put them up.",
    "stop dancing. {t} is mafia.",
    "{t} hasn't said one useful thing all day.",
    "i'm voting {t} and i'm not moving.",
    "{t}, say something. anything. i dare you.",
  ],
  defensive: [
    "i'm not comfortable with {t}. i could be wrong.",
    "maybe {t}? i don't want to be the one pushing.",
    "{t} feels off. that's all i've got.",
    "if it isn't {t}, i'd rather skip than guess wrong.",
    "i keep coming back to {t} and i wish i didn't.",
  ],
  chaotic: [
    "coin says {t}. the coin has never been wrong.",
    "{t}. vibes. pure vibes.",
    "what if we hang {t} just to see what happens?",
    "{t} blinked. that's evidence where i'm from.",
    "i've decided it's {t}. don't ask me to show work.",
  ],
};

const REBUT = {
  analytical: [
    "{a} is pushing me because i'm the one keeping count. check the record.",
    "that's twice {a} has redirected onto me. note the timing.",
    "{a}, you moved on me the moment i named a number.",
  ],
  aggressive: [
    "no, {a} is pushing me because they know i'm onto them.",
    "{a} is mafia and {a} knows i can see it.",
    "say it to my face, {a}. you've been building this all day.",
  ],
  defensive: [
    "why me? i've done nothing but listen all day.",
    "{a}, please. i'm town. flip me and you'll see.",
    "i don't know how to prove a negative, {a}.",
  ],
  chaotic: [
    "bold of {a} to say that out loud.",
    "{a} accused me, so obviously {a} did it. that's how it works.",
    "wrong, but i respect the confidence, {a}.",
  ],
};

const FILLER = {
  analytical: ["who did we agree on last night?", "no reads yet. talk and i'll count.", "we can't afford another mislynch."],
  aggressive: ["someone talk. now.", "this silence is a confession.", "i'm not skipping again."],
  defensive: ["i'd rather hear from the quiet ones first.", "slow down. we're voting on vibes again.", "i'm listening. i'm just listening."],
  chaotic: ["what if none of us are mafia. haha. unless.", "i'm having a great time, for the record.", "anyone else hearing that?"],
};

const PILEON = [
  "i'm with {a}. {t} has dodged every direct question.",
  "that's two on {t}. i'll make it three.",
  "{a} is right about {t}, and {t} still hasn't answered.",
  "fine. {t}. i'll follow {a} on this one.",
];

const JESTER_BAIT = [
  "honestly? vote me. i dare you.",
  "i've got nothing to say in my defense.",
  "sure, put me up. see what happens.",
  "i wouldn't trust me either.",
  "you're all looking at me. good.",
];

// Reactions to what actually happened overnight.
const REACT_DEATH = [
  "{d} is gone. {d} was the one asking the right questions.",
  "they went for {d}. ask who wanted {d} quiet.",
  "{d}? that kill tells me more than the vote did.",
  "we lost {d}. whoever did it, you were in this room.",
];
const REACT_SAVE = [
  "{d} got hit and walked away. someone is protecting them.",
  "{d} survived. that's the second person we owe.",
  "they tried for {d} and missed. they'll try again tonight.",
];
const REACT_QUIET = [
  "nobody died. that's not mercy, that's a plan.",
  "a quiet night. i don't like quiet nights.",
  "no body this morning. somebody chose not to swing.",
];

// Citations of the real voting record — the bars everyone just watched.
const CITE = [
  "{a} voted {b} yesterday and never explained why.",
  "{a} and {b} voted together both times. that's a pair.",
  "{a} abstained while we were deciding. that's a choice.",
  "{a} put a rope on {b} and then went quiet. why?",
  "check the board: {a} was the last vote in.",
];

// The payoff. Someone just said something they could not possibly know.
const GOTCHA = [
  "WAIT. HOW DO YOU KNOW {X} WAS THE {ROLE}?",
  "STOP. {S} just told us {X} is the {ROLE}. HOW?",
  "hold on — {s}, nobody ever said {x} was the {role}.",
  "{s}. how do YOU know {x} is the {role}?",
];

// Lines a bot says when it gets careless with private knowledge.
const SLIP = [
  "{v} voted against {x}. nobody goes after the {role} by accident.",
  "we can't lose {x}, {x} is the {role}.",
  "keep {x} alive, we need the {role} where we can see them.",
  "{x} is the {role}. obviously. everyone knows that.",
];

/* ------------------------------------------------------------------ */
/* Helpers over game state                                             */
/* ------------------------------------------------------------------ */

const persona = (bot) => personaFor(bot.name);
const suspicion = (game, p) => game.suspicion?.[p.id] || 0;
const talkiness = (game, p) => game.talk?.[p.id] || 0;

// Never repeat the exact same sentence twice from the same mouth.
function fresh(bot, pool) {
  bot._said = bot._said || new Set();
  const unused = pool.filter((t) => !bot._said.has(t));
  const line = pick(unused.length ? unused : pool);
  if (line) bot._said.add(line);
  return line;
}

const fill = (tpl, map) =>
  String(tpl).replace(/\{(\w+)\}/g, (m, k) => {
    const v = map[k] ?? map[k.toLowerCase()];
    if (v === undefined) return m;
    return k === k.toUpperCase() ? String(v).toUpperCase() : String(v);
  });

/* ------------------------------------------------------------------ */
/* What a bot privately knows — the source of every slip               */
/* ------------------------------------------------------------------ */

// Roles that a townsperson has no honest way of knowing about someone
// else. Saying "X is mafia" is an accusation; saying "X is the doctor"
// is knowledge, and knowledge has to come from somewhere.
export const SECRET_ROLES = ["doctor", "detective", "bodyguard", "double_agent", "jester"];

// Returns { player, role } a bot genuinely knows and shouldn't say, or null.
export function secretKnowledge(bot, game) {
  const living = game.alive().filter((p) => p.id !== bot.id);

  // Mafia and the Double Agent are introduced to each other on night one.
  if (bot.role?.team === "mafia") {
    const partner = living.find((p) => p.role?.key === "double_agent");
    if (partner) return { player: partner, role: partner.role };
  }
  // The Double Agent's whole job is working out who the Detective is. This
  // is a heuristic, not real inference: they land on the truth about half
  // the time and on a loud townsperson otherwise — wrong reads burn an
  // innocent, which is exactly the risk the role is supposed to carry.
  if (bot.role?.key === "double_agent") {
    const detective = living.find((p) => p.role?.key === "detective");
    if (detective && chance(0.5)) return { player: detective, role: detective.role };
    const loud = [...living].filter((p) => p.role?.team !== "mafia").sort((a, b) => talkiness(game, b) - talkiness(game, a))[0];
    if (loud) return { player: loud, role: loud.role };
  }
  return null;
}

// A careless line built from that knowledge. Only ever produced when the
// bot actually holds the knowledge — bots don't bluff-slip.
export function slipLine(bot, game) {
  const known = secretKnowledge(bot, game);
  if (!known) return null;
  if (!SECRET_ROLES.includes(known.role.key)) return null;
  const tpl = fresh(bot, SLIP);
  // Some phrasings need a third party ("{v} voted against {x}") — without
  // one the bot ends up saying a player voted against themselves.
  const bystander = pick(game.alive().filter((p) => p.id !== bot.id && p.id !== known.player.id));
  if (tpl.includes("{v}") && !bystander) return null;
  return {
    kind: "slip",
    text: fill(tpl, {
      x: known.player.name,
      v: bystander ? bystander.name : "",
      role: known.role.name.toLowerCase(),
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Line generation                                                     */
/* ------------------------------------------------------------------ */

// The room's answer to a slip: someone repeats it back, in capitals.
export function gotchaLine(bot, slip) {
  return {
    kind: "gotcha",
    text: fill(fresh(bot, GOTCHA), {
      s: slip.speaker,
      S: slip.speaker,
      x: slip.subject,
      X: slip.subject,
      role: slip.role,
      ROLE: slip.role,
    }),
  };
}

// A direct answer to being accused, naming the accuser.
export function rebutLine(bot, accuser) {
  const p = persona(bot);
  return { kind: "rebut", text: fill(fresh(bot, REBUT[p.key]), { a: accuser }) };
}

// Morning-after reaction, built from what the room actually saw.
export function reactLine(bot, event) {
  if (!event) return null;
  const pool = event.type === "kill" ? REACT_DEATH : event.type === "save" ? REACT_SAVE : REACT_QUIET;
  return { kind: "react", text: fill(fresh(bot, pool), { d: event.name || "" }) };
}

// A citation of the published ballot — real votes, real names.
function citeLine(bot, game) {
  const ballots = game.ballots || [];
  if (ballots.length < 2) return null;
  const withTarget = ballots.filter((b) => b.target && b.target !== "—");
  const abstained = ballots.filter((b) => !b.target || b.target === "—");
  const options = [];
  for (const b of withTarget) options.push({ a: b.voter, b: b.target });
  if (abstained.length) options.push({ a: pick(abstained).voter, b: null });
  const chosen = pick(options);
  if (!chosen) return null;
  const pool = chosen.b ? CITE.filter((t) => t.includes("{b}")) : CITE.filter((t) => !t.includes("{b}"));
  const tpl = fresh(bot, pool.length ? pool : CITE);
  return { kind: "cite", text: fill(tpl, { a: chosen.a, b: chosen.b || "" }) };
}

// Picks who this bot leans on, coloured by team and temperament.
function accuseTarget(bot, game) {
  const others = game.alive().filter((p) => p.id !== bot.id);
  if (!others.length) return null;
  if (bot.role?.team === "mafia") {
    const town = others.filter((p) => p.role?.team !== "mafia");
    const pool = town.length ? town : others;
    // Mafia push whoever the room already distrusts — it's free cover.
    return [...pool].sort((a, b) => suspicion(game, b) - suspicion(game, a))[0] || pick(pool);
  }
  const p = persona(bot);
  const sorted = [...others].sort((a, b) => suspicion(game, b) - suspicion(game, a));
  if (chance(p.voteNoise)) return pick(others);
  return suspicion(game, sorted[0]) > 0 ? sorted[0] : pick(others);
}

// The main entry point used by the day-phase conversation loop.
// `ctx` carries what just happened in the room:
//   { accusedBy, lastAccusation: {by, target}, event }
export function botChat(bot, game, ctx = {}) {
  const p = persona(bot);
  const others = game.alive().filter((o) => o.id !== bot.id);
  if (!others.length) return null;

  // 1. Answer a direct accusation. People always defend themselves first.
  if (ctx.accusedBy) return rebutLine(bot, ctx.accusedBy);

  // 2. The Jester wants the rope, not an alibi.
  if (bot.role?.key === "jester" && chance(0.4)) return { kind: "bait", text: fresh(bot, JESTER_BAIT) };

  // 3. React to the body (or the lack of one) — only early in the day.
  if (ctx.event && chance(0.8)) return reactLine(bot, ctx.event);

  // 4. Say the quiet part out loud. Rare, persona-driven, and always
  //    built from knowledge the bot really has.
  if (ctx.allowSlip !== false && chance(p.leakRisk)) {
    const slip = slipLine(bot, game);
    if (slip) return slip;
  }

  // 5. Pile onto whoever is already under pressure.
  if (ctx.lastAccusation && ctx.lastAccusation.target !== bot.name && chance(0.3)) {
    return {
      kind: "pileon",
      text: fill(fresh(bot, PILEON), { a: ctx.lastAccusation.by, t: ctx.lastAccusation.target }),
    };
  }

  // 6. Quote the record.
  if (chance(p.citeBias)) {
    const cite = citeLine(bot, game);
    if (cite) return cite;
  }

  // 7. Accuse, or fill the silence.
  if (chance(0.7)) {
    const t = accuseTarget(bot, game);
    if (t) return { kind: "accuse", text: fill(fresh(bot, ACCUSE[p.key]), { t: t.name }), target: t.name };
  }
  return { kind: "filler", text: fresh(bot, FILLER[p.key]) };
}

/* ------------------------------------------------------------------ */
/* Voting and night actions                                            */
/* ------------------------------------------------------------------ */

export function botVote(bot, game) {
  const candidates = game.alive().filter((p) => p.id !== bot.id);
  if (!candidates.length) return null;
  const p = persona(bot);

  if (bot.role?.team === "mafia") {
    const town = candidates.filter((x) => x.role?.team !== "mafia");
    const pool = town.length ? town : candidates;
    pool.sort((a, b) => suspicion(game, b) - suspicion(game, a));
    return chance(0.75) ? pool[0] : pick(pool);
  }
  // The Jester is voting for its own funeral — it wants heat on itself,
  // so it avoids defending and just follows the loudest accusation.
  const sorted = [...candidates].sort((a, b) => suspicion(game, b) - suspicion(game, a));
  if (chance(p.voteNoise)) return pick(candidates);
  return suspicion(game, sorted[0]) > 0 ? sorted[0] : pick(candidates);
}

export function botNightTarget(bot, game) {
  const alive = game.alive();
  const p = persona(bot);

  if (bot.role?.key === "mafia") {
    const town = alive.filter((x) => x.role?.team !== "mafia");
    if (!town.length) return null;
    // An aggressive mafioso silences whoever is running the room. A quiet
    // one takes the player nobody is watching.
    const ranked = p.killsLoud
      ? [...town].sort((a, b) => talkiness(game, b) - talkiness(game, a))
      : [...town].sort((a, b) => suspicion(game, a) - suspicion(game, b));
    return chance(0.7) ? ranked[0] : pick(town);
  }
  if (bot.role?.key === "doctor") {
    if (chance(p.key === "defensive" ? 0.45 : 0.25) && !bot.selfSaved) return bot;
    const others = alive.filter((x) => x.id !== bot.id);
    // Cover whoever the mafia would most want gone: the loudest voice.
    const ranked = [...others].sort((a, b) => talkiness(game, b) - talkiness(game, a));
    return others.length ? (chance(0.6) ? ranked[0] : pick(others)) : bot;
  }
  if (bot.role?.key === "bodyguard") {
    const others = alive.filter((x) => x.id !== bot.id);
    if (!others.length) return null;
    const ranked = [...others].sort((a, b) => talkiness(game, b) - talkiness(game, a));
    return chance(0.6) ? ranked[0] : pick(others);
  }
  if (bot.role?.key === "detective") {
    const unchecked = alive.filter((x) => x.id !== bot.id && !bot.checked?.has(x.id));
    if (!unchecked.length) return null;
    // Check the people the room is arguing about, not a random stranger.
    const ranked = [...unchecked].sort((a, b) => suspicion(game, b) - suspicion(game, a));
    return chance(0.6) ? ranked[0] : pick(unchecked);
  }
  return null;
}
