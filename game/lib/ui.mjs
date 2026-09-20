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

// Chunky 7-row block font. Originally this held only the handful of
// letters the death/win banners needed; the reveal screens now render
// arbitrary text (role names, "DAY 2", "VERDICT"), so it's a full
// A–Z + 0–9 set. Styled to echo the title banner's two-tone look
// (bright on top, fading to gray).
const BIG_FONT = {
  " ": ["     ", "     ", "     ", "     ", "     ", "     ", "     "],
  A: ["  ██  ", " ████ ", "██  ██", "██████", "██  ██", "██  ██", "██  ██"],
  B: ["█████ ", "██  ██", "██  ██", "█████ ", "██  ██", "██  ██", "█████ "],
  C: [" █████", "██    ", "██    ", "██    ", "██    ", "██    ", " █████"],
  D: ["█████ ", "██  ██", "██  ██", "██  ██", "██  ██", "██  ██", "█████ "],
  E: ["██████", "██    ", "██    ", "█████ ", "██    ", "██    ", "██████"],
  F: ["██████", "██    ", "██    ", "█████ ", "██    ", "██    ", "██    "],
  G: [" █████", "██    ", "██    ", "██ ███", "██  ██", "██  ██", " █████"],
  H: ["██  ██", "██  ██", "██  ██", "██████", "██  ██", "██  ██", "██  ██"],
  I: ["████", " ██ ", " ██ ", " ██ ", " ██ ", " ██ ", "████"],
  J: ["    ██", "    ██", "    ██", "    ██", "██  ██", "██  ██", " ████ "],
  K: ["██  ██", "██ ██ ", "████  ", "███   ", "████  ", "██ ██ ", "██  ██"],
  L: ["██    ", "██    ", "██    ", "██    ", "██    ", "██    ", "██████"],
  M: ["██   ██", "███ ███", "███████", "██ █ ██", "██   ██", "██   ██", "██   ██"],
  N: ["██   ██", "███  ██", "████ ██", "██ ████", "██  ███", "██   ██", "██   ██"],
  O: [" ████ ", "██  ██", "██  ██", "██  ██", "██  ██", "██  ██", " ████ "],
  P: ["█████ ", "██  ██", "██  ██", "█████ ", "██    ", "██    ", "██    "],
  Q: [" ████ ", "██  ██", "██  ██", "██  ██", "██ ███", "██ ██ ", " ██ ██"],
  R: ["█████ ", "██  ██", "██  ██", "█████ ", "████  ", "██ ██ ", "██  ██"],
  S: [" █████", "██    ", "██    ", " ████ ", "    ██", "    ██", "█████ "],
  T: ["██████", "  ██  ", "  ██  ", "  ██  ", "  ██  ", "  ██  ", "  ██  "],
  U: ["██  ██", "██  ██", "██  ██", "██  ██", "██  ██", "██  ██", " ████ "],
  V: ["██  ██", "██  ██", "██  ██", "██  ██", "██  ██", " ████ ", "  ██  "],
  W: ["██   ██", "██   ██", "██   ██", "██ █ ██", "███████", "███ ███", "██   ██"],
  X: ["██  ██", "██  ██", " ████ ", "  ██  ", " ████ ", "██  ██", "██  ██"],
  Y: ["██  ██", "██  ██", " ████ ", "  ██  ", "  ██  ", "  ██  ", "  ██  "],
  Z: ["██████", "    ██", "   ██ ", "  ██  ", " ██   ", "██    ", "██████"],
  0: [" ████ ", "██  ██", "██ ███", "██ ███", "███ ██", "██  ██", " ████ "],
  1: ["  ██  ", " ███  ", "  ██  ", "  ██  ", "  ██  ", "  ██  ", "██████"],
  2: [" ████ ", "██  ██", "    ██", "   ██ ", "  ██  ", " ██   ", "██████"],
  3: [" ████ ", "██  ██", "    ██", "  ███ ", "    ██", "██  ██", " ████ "],
  4: ["   ██ ", "  ███ ", " ████ ", "██ ██ ", "██████", "   ██ ", "   ██ "],
  5: ["██████", "██    ", "█████ ", "    ██", "    ██", "██  ██", " ████ "],
  6: [" ████ ", "██  ██", "██    ", "█████ ", "██  ██", "██  ██", " ████ "],
  7: ["██████", "    ██", "   ██ ", "  ██  ", "  ██  ", " ██   ", " ██   "],
  8: [" ████ ", "██  ██", "██  ██", " ████ ", "██  ██", "██  ██", " ████ "],
  9: [" ████ ", "██  ██", "██  ██", " █████", "    ██", "██  ██", " ████ "],
  "!": ["██", "██", "██", "██", "██", "  ", "██"],
  "?": [" ████ ", "██  ██", "    ██", "   ██ ", "  ██  ", "      ", "  ██  "],
  ".": ["  ", "  ", "  ", "  ", "  ", "  ", "██"],
  "-": ["      ", "      ", "      ", "██████", "      ", "      ", "      "],
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

/* ------------------------------------------------------------------ */
/* Cinematic screens                                                   */
/*                                                                     */
/* The three moments that sell the game — the deal, the day, the       */
/* verdict — are rendered as centered "cards" with breathing room      */
/* around them instead of as another line of chat scroll.              */
/* ------------------------------------------------------------------ */

export const SCREEN = 64;

// Centers one already-colored line inside the screen width.
export function center(line, width = SCREEN) {
  const pad = Math.max(0, Math.floor((width - vlen(line)) / 2));
  return " ".repeat(pad) + line;
}

// Big text if it fits the screen, otherwise wide-spaced bold caps.
// Role names vary a lot in length — "MAFIA" looks great as block
// letters, "DOUBLE AGENT" would run off an 80-column terminal — so the
// reveal degrades to letterspacing rather than wrapping into mush.
export function fitBig(text, color = c.white, width = SCREEN) {
  const rows = bigText(text, color);
  const maxLen = Math.max(...rows.map(vlen));
  if (maxLen <= width) {
    // One shared left pad for the whole block — centering each row on its
    // own would make the letters wobble, because bigText trims the blank
    // tail off every row.
    const pad = " ".repeat(Math.max(0, Math.floor((width - maxLen) / 2)));
    return rows.map((r) => pad + r).join("\n");
  }
  const spaced = String(text).toUpperCase().split("").join(" ");
  return center(color + c.bold + spaced + c.reset, width);
}

// A full-width dramatic beat: blank space, content, blank space.
export function screen(lines, { pad = 1 } = {}) {
  const blanks = Array.from({ length: pad }, () => "");
  return [...blanks, ...lines, ...blanks].join("\n");
}

// Word-wraps plain text to `width`, never splitting a word unless the
// word alone is longer than the line.
export function wrap(text, width) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur.length) cur = w;
    else if (cur.length + 1 + w.length <= width) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur.length) lines.push(cur);
  return lines.length ? lines : [""];
}

// A line of spoken dialogue:
//
//   aman: "no, rahul is pushing me because
//          he knows i'm onto him."
//
// The hanging indent lines continuation up under the opening quote, so
// a long accusation reads as one person talking rather than as three
// separate chat messages.
export function speech(name, text, { mark = "", nameColor = c.bold, textColor = "", width = SCREEN } = {}) {
  const head = `  ${name}${strip(mark)}: `;
  const indent = " ".repeat(head.length + 1);
  const lines = wrap(text, Math.max(20, width - head.length - 2));
  const first = `  ${nameColor}${name}${c.reset}${mark}${c.gray}:${c.reset} ${textColor}"${lines[0]}`;
  const rest = lines.slice(1).map((l) => indent + textColor + l);
  const out = [...[first], ...rest];
  return out.join("\n") + `"${c.reset}`;
}

// The verdict board — one row per candidate, bar scaled to the leader,
// the whole block centered so it reads as a screen rather than as chat.
//
//   ▸ rahul     ████████████░░░░   5  56%
//     aman      █████░░░░░░░░░░░   2  22%
//     skip      ██░░░░░░░░░░░░░░   1  11%
export function voteBoard(rows, { width = 16, total = 0, screenWidth = SCREEN } = {}) {
  // Abstentions are scaled against the real candidates, never the other
  // way round — "skip" outgrowing the person being hanged reads as a bug.
  const candidates = rows.filter((r) => !r.dim);
  const max = Math.max(1, ...(candidates.length ? candidates : rows).map((r) => r.n));
  const nameWidth = Math.max(8, ...rows.map((r) => r.name.length));
  const ballots = total || rows.reduce((a, r) => a + r.n, 0);

  const built = rows.map((r) => {
    const color = r.leader ? c.red : r.dim ? c.gray : c.magenta;
    const mark = r.leader ? c.red + c.bold + "▸ " + c.reset : "  ";
    const label = (r.leader ? c.bold : r.dim ? c.gray : c.white) + r.name.padEnd(nameWidth) + c.reset;
    const pct = ballots ? `${String(Math.round((r.n / ballots) * 100)).padStart(3)}%` : "    ";
    return `${mark}${label}  ${bar(r.n, max, width, color)}  ${c.bold}${String(r.n).padStart(2)}${c.reset}  ${c.gray}${pct}${c.reset}`;
  });

  // One shared pad keeps the bars in a straight column.
  const w = Math.max(...built.map(vlen));
  const pad = " ".repeat(Math.max(0, Math.floor((screenWidth - w) / 2)));
  return built.map((l) => pad + l);
}
