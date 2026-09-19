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
    blurb: "Each night you and your partners pick one player to eliminate. By day, lie beautifully.",
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
      "You win with the Mafia, but you do NOT know who they are — and they do not know you. You read CLEAN to the Detective.",
    night: null,
  },
};

// Role table by player count. Town stays a slim majority on purpose —
// pressure comes from talk, not from raw numbers. Thresholds are kept low
// so the special roles (Detective, Doctor, Double Agent) show up well
// before you need a full 8-player lobby to see them.
export function buildRoleDeck(n) {
  const deck = [];
  if (n >= 2) deck.push("mafia");
  if (n >= 3) deck.push("detective");
  if (n >= 4) deck.push("doctor");
  if (n >= 5) deck.push("double_agent");
  if (n >= 7) deck.push("mafia"); // 2nd mafia
  if (n >= 11) deck.push("mafia"); // 3rd mafia
  while (deck.length < n) deck.push("villager");
  return deck.slice(0, n);
}
