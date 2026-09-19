// Offline heuristic bots. No network, no API keys — they run inside the server.

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

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const ACCUSE = [
  "{t} has been way too quiet.",
  "something about {t} isn't adding up.",
  "{t}, explain your last vote.",
  "i'd put {t} on the block, honestly.",
  "watching {t}. that reaction was off.",
];
const DEFEND = [
  "i'm town, obviously. look elsewhere.",
  "if you flip me you lose the game.",
  "slow down, we're lynching on vibes again.",
  "i'd rather hear from the quiet ones first.",
];
const FILLER = [
  "who did we agree on last night?",
  "no reads yet. talk to me.",
  "counting: we can't afford a mislynch.",
  "i'm listening.",
];

export function botChat(bot, game) {
  const others = game.alive().filter((p) => p.id !== bot.id);
  if (!others.length) return null;
  const roll = Math.random();
  if (roll < 0.55) {
    const target =
      bot.role.team === "mafia"
        ? pick(others.filter((p) => p.role.team !== "mafia") || others)
        : pick(others.sort((a, b) => (game.suspicion[b.id] || 0) - (game.suspicion[a.id] || 0)).slice(0, 3));
    if (!target) return null;
    return pick(ACCUSE).replace("{t}", target.name);
  }
  if (roll < 0.8) return pick(DEFEND);
  return pick(FILLER);
}

export function botVote(bot, game) {
  const candidates = game.alive().filter((p) => p.id !== bot.id);
  if (!candidates.length) return null;
  if (bot.role.team === "mafia") {
    const town = candidates.filter((p) => p.role.team !== "mafia");
    const pool = town.length ? town : candidates;
    pool.sort((a, b) => (game.suspicion[b.id] || 0) - (game.suspicion[a.id] || 0));
    return Math.random() < 0.7 ? pool[0] : pick(pool);
  }
  const sorted = [...candidates].sort((a, b) => (game.suspicion[b.id] || 0) - (game.suspicion[a.id] || 0));
  const top = (game.suspicion[sorted[0].id] || 0) > 0 ? sorted[0] : pick(candidates);
  return Math.random() < 0.75 ? top : pick(candidates);
}

export function botNightTarget(bot, game) {
  const alive = game.alive();
  if (bot.role.key === "mafia") {
    const town = alive.filter((p) => p.role.team !== "mafia");
    if (!town.length) return null;
    town.sort((a, b) => (game.suspicion[a.id] || 0) - (game.suspicion[b.id] || 0));
    return Math.random() < 0.5 ? town[0] : pick(town);
  }
  if (bot.role.key === "doctor") {
    if (Math.random() < 0.3 && !bot.selfSaved) return bot;
    const others = alive.filter((p) => p.id !== bot.id);
    return others.length ? pick(others) : bot;
  }
  if (bot.role.key === "detective") {
    const unchecked = alive.filter((p) => p.id !== bot.id && !bot.checked?.has(p.id));
    return unchecked.length ? pick(unchecked) : null;
  }
  return null;
}
