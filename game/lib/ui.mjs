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

export const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

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

export function box(lines, color = c.cyan) {
  const width = 62;
  const out = [color + "╭" + "─".repeat(width) + "╮" + c.reset];
  for (const line of lines) {
    const len = strip(line).length;
    const pad = Math.max(0, width - 2 - len);
    out.push(color + "│ " + c.reset + line + " ".repeat(pad) + color + " │" + c.reset);
  }
  out.push(color + "╰" + "─".repeat(width) + "╯" + c.reset);
  return out.join("\n");
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
