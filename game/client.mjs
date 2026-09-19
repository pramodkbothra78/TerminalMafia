#!/usr/bin/env node
// Terminal Mafia — client. Run: node game/client.mjs [host] [port]
import net from "node:net";
import readline from "node:readline";

const HOST = process.argv[2] || process.env.MAFIA_HOST || "127.0.0.1";
const PORT = Number(process.argv[3] || process.env.MAFIA_PORT || 5555);

const socket = net.createConnection({ host: HOST, port: PORT });
socket.setEncoding("utf8");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "\x1b[90m> \x1b[0m" });

socket.on("connect", () => {
  process.stdout.write("\x1b[2J\x1b[H");
  rl.prompt();
});

socket.on("data", (chunk) => {
  // keep the input line tidy while server output streams in
  readline.cursorTo(process.stdout, 0);
  readline.clearLine(process.stdout, 0);
  process.stdout.write(chunk.replace(/\n$/, "") + "\n");
  rl.prompt(true);
});

socket.on("error", (err) => {
  console.error(
    `\x1b[31mCould not reach the game at ${HOST}:${PORT}\x1b[0m\n` +
      `\x1b[90m${err.code === "ECONNREFUSED" ? "Is the server running? Start it with: node game/server.mjs" : err.message}\x1b[0m`,
  );
  process.exit(1);
});

socket.on("close", () => {
  console.log("\n\x1b[90mDisconnected from the game.\x1b[0m");
  process.exit(0);
});

rl.on("line", (line) => {
  if (socket.writable) socket.write(line + "\n");
  rl.prompt();
});

rl.on("SIGINT", () => {
  socket.end();
  process.exit(0);
});
