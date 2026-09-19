// Persistent match history — every completed game is appended to a JSON
// file on disk, so /history works across server restarts, not just within
// the current process. Kept deliberately dumb (no DB): this is a LAN party
// game, not a service.
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "match-history.json");
const MAX_STORED = 200; // oldest matches roll off after this many

export function loadMatches() {
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return []; // no file yet, or unreadable — start fresh, don't crash
  }
}

// summary shape: { endedAt, players, winner, rounds, roster: [...], log: [...] }
export function recordMatch(summary) {
  let list;
  try {
    list = loadMatches();
  } catch {
    list = [];
  }
  list.push(summary);
  if (list.length > MAX_STORED) list = list.slice(list.length - MAX_STORED);
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(list, null, 2), "utf8");
  } catch (err) {
    // A history write failure should never take the game server down.
    console.error("Failed to persist match history:", err.message);
  }
  return list.length;
}
