// Test harness for Terminal Mafia.
//
// Spawns a real game server as a child process and drives it with real TCP
// clients, exactly like a human would. Nothing is mocked — if a test passes
// here, the same thing works in a live match.
//
// Phase lengths are compressed via env vars so a full game runs in seconds.

import net from "node:net";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let portCounter = 5700 + Math.floor(Math.random() * 300);
export const nextPort = () => portCounter++;

export class Server {
  constructor({ port = nextPort(), night = 2, day = 2, vote = 2, roles = null, leak = null } = {}) {
    this.port = port;
    this.stderr = [];
    this.stdout = [];
    this.exitCode = null;
    this.dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mafia-test-"));
    this.env = {
      ...process.env,
      MAFIA_NIGHT: String(night),
      MAFIA_DAY: String(day),
      MAFIA_VOTE: String(vote),
      MAFIA_DATA_DIR: this.dataDir,
    };
    if (roles) this.env.MAFIA_ROLES = roles;
    if (leak) this.env.MAFIA_LEAK = leak;
  }

  async start() {
    this.proc = spawn("node", ["game/server.mjs", String(this.port)], { cwd: ROOT, env: this.env });
    this.proc.stdout.setEncoding("utf8");
    this.proc.stderr.setEncoding("utf8");
    this.proc.stdout.on("data", (d) => this.stdout.push(d));
    this.proc.stderr.on("data", (d) => this.stderr.push(d));
    this.proc.on("exit", (code) => {
      this.exitCode = code;
    });
    // wait for the port to accept connections
    for (let i = 0; i < 100; i++) {
      await sleep(100);
      if (this.exitCode !== null) throw new Error(`server exited early (${this.exitCode}): ${this.stderr.join("")}`);
      if (await this._probe()) return this;
    }
    throw new Error("server never opened its port");
  }

  _probe() {
    return new Promise((resolve) => {
      const s = net.createConnection({ host: "127.0.0.1", port: this.port });
      s.once("connect", () => {
        s.destroy();
        resolve(true);
      });
      s.once("error", () => resolve(false));
    });
  }

  /** The single most important assertion: the server never fell over. */
  get crashed() {
    const err = this.stderr.join("");
    return this.exitCode !== null || /Error|error:|TypeError|ReferenceError|undefined is not/.test(err);
  }

  get crashText() {
    return (this.exitCode !== null ? `exited with code ${this.exitCode}; ` : "") + this.stderr.join("").slice(0, 800);
  }

  stop() {
    try {
      this.proc?.kill("SIGKILL");
    } catch {}
    try {
      fs.rmSync(this.dataDir, { recursive: true, force: true });
    } catch {}
  }
}

export class Client {
  constructor(server, name) {
    this.server = server;
    this.name = name;
    this.lines = [];
    this.role = null;
    this.alive = true;
    this._waiters = [];
    this._auto = null;
    this._roster = [];
  }

  async connect({ join = true } = {}) {
    await new Promise((resolve, reject) => {
      this.sock = net.createConnection({ host: "127.0.0.1", port: this.server.port });
      this.sock.setEncoding("utf8");
      this.sock.once("connect", resolve);
      this.sock.once("error", reject);
    });
    this.sock.on("error", () => {});
    let buf = "";
    this.sock.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = strip(buf.slice(0, i));
        buf = buf.slice(i + 1);
        this._ingest(line);
      }
    });
    if (join) {
      await sleep(120);
      this.send(this.name);
      await sleep(180);
    }
    return this;
  }

  _ingest(line) {
    this.lines.push(line);

    // Track our own role as the server reveals it.
    const rm = line.match(/You are ([A-Z][A-Z ]*[A-Z])/);
    if (rm) this.role = rm[1].trim();

    // Track the living roster from the broadcast player list.
    const pm = line.match(/^\s*\d+\s+[●◌]\s+(\w+)/);
    if (pm && !this._roster.includes(pm[1])) this._roster.push(pm[1]);
    if (/^ALIVE \(/.test(line)) this._roster = [];

    if (/YOU DIED|ELIMINATED/.test(line) || /The dead only watch/.test(line)) this.alive = false;

    for (const w of [...this._waiters]) {
      if (w.re.test(line)) {
        this._waiters.splice(this._waiters.indexOf(w), 1);
        w.resolve(line);
      }
    }
    if (this._auto) this._auto(line, this);
  }

  send(text) {
    if (this.sock?.writable) this.sock.write(text + "\n");
    return this;
  }

  /** Resolve when a line matching `re` arrives (checks history first). */
  waitFor(re, ms = 8000) {
    const existing = this.lines.find((l) => re.test(l));
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const w = { re, resolve };
      this._waiters.push(w);
      setTimeout(() => {
        const i = this._waiters.indexOf(w);
        if (i >= 0) {
          this._waiters.splice(i, 1);
          reject(new Error(`[${this.name}] timeout waiting for ${re}`));
        }
      }, ms);
    });
  }

  saw(re) {
    return this.lines.some((l) => re.test(l));
  }

  /** Hard TCP drop — simulates a laptop lid closing, not a clean /quit. */
  drop() {
    this.sock?.destroy();
    return this;
  }

  /** Play sensibly and automatically for the whole match. */
  autoPlay({ skip = true } = {}) {
    let offset = 0;
    const others = () => this._roster.filter((n) => n.toLowerCase() !== this.name.toLowerCase());
    const pick = () => {
      const list = others();
      return list.length ? list[offset++ % list.length] : null;
    };
    this._auto = (line) => {
      // An invalid target (e.g. a mafioso told "that's your own partner")
      // just rotates to the next candidate — which also exercises the
      // server's bad-input handling on every single run.
      if (/^\[!\]/.test(line)) {
        const t = pick();
        if (t && /own partner|No living player/.test(line)) {
          if (this._lastCmd) this.send(`${this._lastCmd} ${t}`);
        }
        return;
      }
      if (/Choose a target:/.test(line)) this._act("/kill", pick());
      else if (/Investigate someone:/.test(line)) this._act("/check", pick());
      else if (/Protect someone:/.test(line)) this._act("/save", pick());
      else if (/Talk\. Accuse\. Defend/.test(line)) {
        setTimeout(() => this.send("someone here is lying"), 50);
        if (skip) setTimeout(() => this.send("/skip"), 150);
      } else if (/\/vote skip/.test(line)) this._act("/vote", pick());
    };
    return this;
  }

  _act(cmd, target) {
    if (!target) return;
    this._lastCmd = cmd;
    setTimeout(() => this.send(`${cmd} ${target}`), 60);
  }
}

/** Spin up a server with N connected human clients. First one is host. */
export async function lobby(opts, names) {
  const server = await new Server(opts).start();
  const clients = [];
  for (const n of names) {
    const cl = new Client(server, n);
    await cl.connect();
    clients.push(cl);
  }
  return { server, clients };
}
