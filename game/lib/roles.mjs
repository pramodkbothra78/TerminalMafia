import { c } from "./ui.mjs";

export const ROLES = {
  villager: {
    key: "villager",
    name: "Villager",
    team: "town",
    color: c.green,
    blurb: "You have no powers, only instincts. Talk, read the room, vote well.",
    night: null,
  },
  mafia: {
    key: "mafia",
    name: "Mafia",
    team: "mafia",
    color: c.red,
    blurb:
      "Each night you and your partners pick one player to eliminate. Your Double Agent partner works the room by day, hunting for the Detective — listen to what they whisper you. By day, lie beautifully.",
    night: "kill",
  },
  detective: {
    key: "detective",
    name: "Detective",
    team: "town",
    color: c.cyan,
    blurb: "Each night you investigate one player and learn if they read as MAFIA or CLEAN.",
    night: "check",
  },
  doctor: {
    key: "doctor",
    name: "Doctor",
    team: "town",
    color: c.blue,
    blurb: "Each night you protect one player from the Mafia. You may protect yourself once per game.",
    night: "save",
  },
  double_agent: {
    key: "double_agent",
    name: "Double Agent",
    team: "mafia",
    color: c.magenta,
    blurb:
      "You win with the Mafia — and now they know you, and you know them. You have no kill of your own, but you have a job: figure out who the Detective is from how people talk and vote, then use your private channel to tip off your partners so they can target the right person. You still read CLEAN to Detective checks, which makes you the safest cover in the room.",
    night: null,
  },
  bodyguard: {
    key: "bodyguard",
    name: "Bodyguard",
    team: "town",
    color: c.cyan,
    blurb:
      "Each night you guard one other player. If the Mafia attacks the person you're guarding, you take the bullet instead — you die, they live. You may not guard yourself.",
    night: "guard",
  },
  jester: {
    key: "jester",
    name: "Jester",
    team: "jester",
    color: c.yellow,
    blurb:
      "You win alone. You have no powers and no allies — your only goal is to get yourself voted out by the town. Act suspicious, bait accusations, and if the room hangs you, you win instantly, whatever happens to everyone else.",
    night: null,
  },
};

// How many players sit on the Mafia team (including the Double Agent).
// Roughly one third of the room, which is the classic Mafia ratio and —
// critically — guarantees the town still outnumbers the mafia after the
// first night kill. An earlier table added the Double Agent as an EXTRA
// mafia-team member, which made 5- and 7-player games reach mafia parity
// on night 1 and end before anyone got to speak.
export function mafiaTeamSize(n) {
  if (n < 4) return 1; // force-start / testing sizes only
  return Math.max(1, Math.floor(n / 3));
}

// Role table by player count. Town stays a clear majority on purpose —
// pressure comes from talk, not from raw numbers. The Double Agent always
// OCCUPIES a mafia-team slot rather than adding one, so the team size above
// is the single source of truth for balance.
export function buildRoleDeck(n) {
  const deck = [];
  const team = mafiaTeamSize(n);
  // Double Agent needs a partner to be interesting (they have no kill of
  // their own), so they only appear once the team has room for two.
  const hasAgent = n >= 6 && team >= 2;
  for (let i = 0; i < team - (hasAgent ? 1 : 0); i++) deck.push("mafia");
  if (hasAgent) deck.push("double_agent");
  if (n >= 3) deck.push("detective");
  if (n >= 4) deck.push("doctor");
  // Jester and Bodyguard only show up once the room is big enough to spare
  // the slot without tipping the mafia-vs-town ratio toward the danger zone
  // validateDeck checks for. Jester is neutral, so it eats into town's
  // effective headcount (Bodyguard doesn't — it's still a town role, just a
  // Villager with a trade-off), which is why Jester needs one more player
  // than Bodyguard would on its own before it's safe to deal.
  if (n >= 7) deck.push("jester");
  if (n >= 7) deck.push("bodyguard");
  while (deck.length < n) deck.push("villager");
  return deck.slice(0, n);
}

// Safety net used at deal time: a deck that is already at mafia parity is
// an instantly-decided game, which is the worst possible thing to happen
// in front of a judge. Returns null when the deck is sound. Neutral roles
// (Jester) count toward neither side on purpose — they don't prop up town's
// numbers, so the mafia-vs-town ratio here reflects the fight that actually
// decides the game.
export function validateDeck(deck) {
  const maf = deck.filter((k) => ROLES[k].team === "mafia").length;
  const town = deck.filter((k) => ROLES[k].team === "town").length;
  if (maf === 0) return "no mafia in the deck";
  if (maf >= town) return `mafia ${maf} vs town ${town} — game would be decided before it starts`;
  if (maf >= town - 1) return `mafia ${maf} vs town ${town} — mafia would win on night 1`;
  return null;
}
