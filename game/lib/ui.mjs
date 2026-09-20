// Terminal styling helpers. No dependencies — raw ANSI.
export const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  it: "\x1b[3m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  white: "\x1b[97m",
  bgRed: "\x1b[41m",
  bgBlue: "\x1b[44m",
  bgGreen: "\x1b[42m",
  bgGray: "\x1b[100m",
};

export const icon = {
  alive: "●",
  dead: "✝",
  bot: "⚙",
  offline: "◌",
  voted: "✓",
  host: "★",
  mafia: "✖",
  skull: "☠",
};

// Chunky 7-row block font — just the letters our banners need
// (YOU DIED, TOWN/MAFIA WINS, YOU WIN/LOSE, ELIMINATED) rather than a
// full A–Z set, so every glyph below is deliberate and hand-checked.
// Styled to echo the title banner's two-tone look (bright on top,
// fading to gray) without copying its exact box-drawn letterforms.
const BIG_FONT = {
  " ": ["     ", "     ", "     ", "     ", "     ", "     ", "     "],
  A: ["  ██  ", " ████ ", "██  ██", "██  ██", "██████", "██  ██", "██  ██"],
  D: ["█████ ", "██  ██", "██  ██", "██  ██", "██  ██", "██  ██", "█████ "],
  E: ["██████", "██    ", "██    ", "█████ ", "██    ", "██    ", "██████"],
  F: ["██████", "██    ", "██    ", "█████ ", "██    ", "██    ", "██    "],
  I: ["████", " ██ ", " ██ ", " ██ ", " ██ ", " ██ ", "████"],
  L: ["██    ", "██    ", "██    ", "██    ", "██    ", "██    ", "██████"],
  M: ["██   ██", "███ ███", "███████", "██ █ ██", "██   ██", "██   ██", "██   ██"],
  N: ["██   █", "███  █", "██ █ █", "██  ██", "██   █", "██   █", "██   █"],
  O: [" ████ ", "██  ██", "██  ██", "██  ██", "██  ██", "██  ██", " ████ "],
  S: [" █████", "██    ", "██    ", " ████ ", "    ██", "    ██", "█████ "],
  T: ["███████", "   █   ", "   █   ", "   █   ", "   █   ", "   █   ", "   █   "],
  U: ["██  ██", "██  ██", "██  ██", "██  ██", "██  ██", "██  ██", " ████ "],
  W: ["██   ██", "██   ██", "██   ██", "██ █ ██", "███████", "███ ███", "██   ██"],
  Y: ["██   ██", " ██ ██ ", "  ███  ", "   █   ", "   █   ", "   █   ", "   █   "],
};

// Renders text as tall block letters, with the top ~60% of rows in the
// requested color and the bottom rows fading to gray — the same
// bright-to-gray gradient the title banner uses. Only covers the
// letters in BIG_FONT above — unsupported characters fall back to a
// blank space so a typo never crashes the game, it just leaves a gap.
export function bigText(text, color = c.white) {
  const rowCount = BIG_FONT[" "].length;
  const rows = Array.from({ length: rowCount }, () => "");
  for (const ch of String(text).toUpperCase()) {
    const glyph = BIG_FONT[ch] || BIG_FONT[" "];
    for (let i = 0; i < rowCount; i++) rows[i] += glyph[i] + " ";
  }
  const fadeAt = Math.ceil(rowCount * 0.6);
  return rows.map((r, i) => (i < fadeAt ? color + c.bold : c.gray) + r.replace(/ +$/, "") + c.reset);
}

// Same as bigText, but centered as a single block — the shape used for
// death / elimination / win-lose screens sent to individual players.
export function bigBanner(text, color = c.white, width = 62) {
  const rows = bigText(text, color);
  const maxLen = Math.max(...rows.map((r) => vlen(r)));
  const pad = " ".repeat(Math.max(0, Math.floor((width - maxLen) / 2)));
  return rows.map((r) => pad + r).join("\n");
}

export const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

// Visual width in a monospace terminal: most box-drawing / emoji-ish glyphs
// used here render as 1 column, so plain length after stripping ANSI is fine.
const vlen = (s) => strip(s).length;

export function rule(title = "", color = c.gray) {
  const width = 64;
  if (!title) return color + "─".repeat(width) + c.reset;
  const t = ` ${title} `;
  const left = Math.max(2, Math.floor((width - t.length) / 2));
  const right = Math.max(2, width - t.length - left);
  return color + "─".repeat(left) + c.bold + t + c.reset + color + "─".repeat(right) + c.reset;
}

export function banner() {
  return [
    "",
    c.red + c.bold + "  ████████╗███████╗██████╗ ███╗   ███╗██╗███╗   ██╗ █████╗ ██╗     " + c.reset,
    c.red + c.bold + "     ██║   ██╔════╝██╔══██╗████╗ ████║██║████╗  ██║██╔══██╗██║     " + c.reset,
    c.red + c.bold + "     ██║   █████╗  ██████╔╝██╔████╔██║██║██╔██╗ ██║███████║██║     " + c.reset,
    c.gray + "     ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██║██║╚██╗██║██╔══██║██║     " + c.reset,
    c.gray + "     ██║   ███████╗██║  ██║██║ ╚═╝ ██║██║██║ ╚████║██║  ██║███████╗" + c.reset,
    c.white + c.bold + "                    M  A  F  I  A" + c.reset + c.gray + "   ·  trust no process" + c.reset,
    "",
  ].join("\n");
}

export function box(lines, color = c.cyan, title = "") {
  const width = 62;
  const top = title
    ? (() => {
        const t = ` ${title} `;
        const left = 2;
        const right = Math.max(0, width - t.length - left);
        return color + "╭" + "─".repeat(left) + c.bold + t + c.reset + color + "─".repeat(right) + "╮" + c.reset;
      })()
    : color + "╭" + "─".repeat(width) + "╮" + c.reset;
  const out = [top];
  for (const line of lines) {
    const len = vlen(line);
    const pad = Math.max(0, width - 2 - len);
    out.push(color + "│ " + c.reset + line + " ".repeat(pad) + color + " │" + c.reset);
  }
  out.push(color + "╰" + "─".repeat(width) + "╯" + c.reset);
  return out.join("\n");
}

// Double-ruled box, used for the lobby screen so it reads as a distinct
// "screen" rather than another inline notice.
export function heavyBox(lines, color = c.cyan, title = "") {
  const width = 46;
  const centered = (t) => {
    const pad = Math.max(0, width - vlen(t));
    const left = Math.floor(pad / 2);
    return " ".repeat(left) + t + " ".repeat(pad - left);
  };
  const out = [color + "╔" + "═".repeat(width) + "╗" + c.reset];
  if (title) {
    out.push(color + "║" + c.reset + c.bold + centered(title) + c.reset + color + "║" + c.reset);
    out.push(color + "╠" + "═".repeat(width) + "╣" + c.reset);
  }
  for (const line of lines) {
    out.push(color + "║ " + c.reset + line + " ".repeat(Math.max(0, width - 2 - vlen(line))) + color + " ║" + c.reset);
  }
  out.push(color + "╚" + "═".repeat(width) + "╝" + c.reset);
  return out.join("\n");
}

// The lobby screen. This is the first thing anyone sees, so it carries the
// room code, who's in, who's the host, which players are bots, and whether
// the game can start yet — at a glance, with no commands to run.
export function lobbyScreen({ room, players, min }) {
  const nameWidth = Math.max(10, ...players.map((p) => p.name.length));
  const rows = players.map((p) => {
    const dot = p.isBot ? c.gray + icon.bot + c.reset : p.connected ? c.green + icon.alive + c.reset : c.gray + icon.offline + c.reset;
    const label = p.isHost ? c.yellow + "HOST" + c.reset : p.isBot ? c.gray + "BOT" + c.reset : "";
    return `${dot} ${c.bold}${p.name.padEnd(nameWidth)}${c.reset}  ${label}`;
  });
  const short = Math.max(0, min - players.length);
  const status = short
    ? c.yellow + `${players.length} PLAYER${players.length === 1 ? "" : "S"} — NEED ${short} MORE` + c.reset
    : c.green + c.bold + `${players.length} PLAYERS — READY` + c.reset;
  return heavyBox(
    [
      `${c.gray}ROOM${c.reset}  ${c.bold}${c.cyan}${room}${c.reset}`,
      "",
      c.gray + "PLAYERS" + c.reset,
      ...rows,
      "",
      status,
    ],
    c.cyan,
    "TERMINAL MAFIA",
  );
}

// A small inline meter, e.g. bar(3, 5) -> "███░░". Handy for vote tallies
// and countdowns so numbers get a visual anchor, not just text.
export function bar(value, max, width = 12, color = c.magenta) {
  const safeMax = Math.max(1, max);
  const filled = Math.max(0, Math.min(width, Math.round((value / safeMax) * width)));
  return color + "█".repeat(filled) + c.gray + "░".repeat(width - filled) + c.reset;
}

// Countdown as a shrinking bar + seconds, used during timed phases so the
// remaining time is visible at a glance instead of only as a number.
export function countdown(left, total, color = c.gray) {
  return `  ${bar(left, total, 20, color)} ${color}${left}s${c.reset}`;
}

export const tag = {
  sys: c.gray + "[sys]" + c.reset,
  night: c.blue + c.bold + "[night]" + c.reset,
  day: c.yellow + c.bold + "[day]" + c.reset,
  vote: c.magenta + c.bold + "[vote]" + c.reset,
  mafia: c.red + c.bold + "[mafia]" + c.reset,
  ghost: c.gray + "[ghost]" + c.reset,
  info: c.cyan + "[info]" + c.reset,
  warn: c.yellow + "[!]" + c.reset,
};
