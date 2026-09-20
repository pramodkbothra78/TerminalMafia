// Terminal Mafia — automated test suite.
//
//   npm test
//
// Every test spawns a real server and drives it over real TCP sockets.
// The universal assertion in every single test is "the server did not
// crash": no stderr output, no early exit. Gameplay assertions sit on top.

import { Server, Client, lobby, sleep } from "./harness.mjs";

const results = [];
let only = process.argv.slice(2).filter((a) => !a.startsWith("-"));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function test(name, fn) {
  if (only.length && !only.some((o) => name.toLowerCase().includes(o.toLowerCase()))) return;
  const started = Date.now();
  let server = null;
  const track = (s) => (server = s);
  try {
    await fn(track);
    if (server?.crashed) throw new Error("SERVER CRASHED: " + server.crashText);
    results.push({ name, ok: true, ms: Date.now() - started });
    process.stdout.write(`  \x1b[32m✓\x1b[0m ${name} \x1b[90m(${Date.now() - started}ms)\x1b[0m\n`);
  } catch (err) {
    const crash = server?.crashed ? " | " + server.crashText : "";
    results.push({ name, ok: false, ms: Date.now() - started, err: err.message + crash });
    process.stdout.write(`  \x1b[31m✗\x1b[0m ${name}\n    \x1b[31m${err.message}${crash}\x1b[0m\n`);
  } finally {
    server?.stop();
  }
}

const NAMES = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"];

/* ------------------------------------------------------------------ */
/* 1. Full matches at every supported lobby size                       */
/* ------------------------------------------------------------------ */

async function fullMatch(track, n, { bots = 0 } = {}) {
  const humans = NAMES.slice(0, n - bots);
  const { server, clients } = await lobby({ night: 2, day: 2, vote: 2 }, humans);
  track(server);
  clients.forEach((c) => c.autoPlay());
  if (bots) {
    clients[0].send(`/bots ${bots}`);
    await sleep(400);
  }
  clients[0].send("/start");

  // A match must reach a decisive end well inside the timeout.
  const end = await clients[0].waitFor(/(TOWN|MAFIA|JESTER) WINS —/, 120000);
  assert(/TOWN WINS|MAFIA WINS|JESTER WINS/.test(end), "no decisive winner");

  // Nobody should have been dealt an unbalanced deck.
  assert(!clients[0].saw(/Refusing to deal an unbalanced deck/), "unbalanced deck was dealt");

  // The game must have actually been played, not decided on night 1.
  assert(clients[0].saw(/DAY 1 — DISCUSSION/), "game ended before any discussion happened");
  assert(clients[0].saw(/DAY 1 — VOTE/), "game ended before anyone voted");

  // Every player must have received exactly one secret role.
  for (const c of clients) assert(c.role, `${c.name} never received a role`);
  return { server, clients };
}

for (const n of [4, 5, 6, 7, 8]) {
  await test(`full match — ${n} players, all human`, (track) => fullMatch(track, n));
}

/* ------------------------------------------------------------------ */
/* 2. Bot + human combinations                                         */
/* ------------------------------------------------------------------ */

await test("bot + human — 1 human, 5 bots", (track) => fullMatch(track, 6, { bots: 5 }));
await test("bot + human — 3 humans, 4 bots", (track) => fullMatch(track, 7, { bots: 4 }));
await test("bot + human — 2 humans, 6 bots", (track) => fullMatch(track, 8, { bots: 6 }));

/* ------------------------------------------------------------------ */
/* 3. Role mechanics (deterministic via pinned roles)                  */
/* ------------------------------------------------------------------ */

/** Deal a pinned game and return the clients, keyed by name. */
async function scripted(track, names, roles, opts = {}) {
  const { server, clients } = await lobby({ night: 4, day: 2, vote: 4, roles, ...opts }, names);
  track(server);
  const by = Object.fromEntries(clients.map((c) => [c.name, c]));
  clients[0].send("/start");
  await clients[0].waitFor(/NIGHT 1/, 15000);
  return { server, clients, by };
}

await test("Doctor saves the Mafia's target", async (track) => {
  const { by } = await scripted(track, ["alpha", "bravo", "charlie", "delta"], "alpha=mafia,bravo=doctor,charlie=detective,delta=villager");
  await by.alpha.waitFor(/Choose a target:/);
  by.alpha.send("/kill delta");
  by.bravo.send("/save delta");
  const dawn = await by.delta.waitFor(/survived|is dead/, 15000);
  assert(/survived/.test(dawn), "doctor's save did not prevent the kill: " + dawn);
  assert(by.delta.alive, "saved player was marked dead");
});

await test("Doctor self-protect is once per game", async (track) => {
  const { by } = await scripted(track, ["alpha", "bravo", "charlie", "delta", "echo"], "alpha=mafia,bravo=doctor,charlie=detective,delta=villager,echo=villager");
  await by.bravo.waitFor(/Protect someone:/);
  by.bravo.send("/save bravo");
  await by.bravo.waitFor(/watch over bravo/, 10000);
  await by.bravo.waitFor(/Protect someone:/.source ? /Protect someone:/ : /x/, 30000).catch(() => {});
  by.bravo.send("/save bravo");
  await sleep(600);
  assert(by.bravo.saw(/already used your self-protection/), "self-protect was allowed twice");
});

await test("Detective reads Mafia as MAFIA and Double Agent as CLEAN", async (track) => {
  const names = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];
  const { by } = await scripted(track, names, "alpha=mafia,bravo=double_agent,charlie=detective,delta=doctor,echo=villager,foxtrot=villager");
  await by.charlie.waitFor(/Investigate someone:/);
  by.charlie.send("/check alpha");
  const r1 = await by.charlie.waitFor(/file on alpha reads/, 10000);
  assert(/MAFIA/.test(r1), "detective misread the Mafia: " + r1);

  // survive to night 2, then check the Double Agent
  by.alpha.send("/kill echo");
  await by.charlie.waitFor(/DAY 1 — DISCUSSION/, 20000);
  for (const n of names) by[n].send("/skip");
  await by.charlie.waitFor(/DAY 1 — VOTE/, 20000);
  for (const n of names) by[n].send("/vote skip");
  await by.charlie.waitFor(/Investigate someone:/.source ? /NIGHT 2/ : /x/, 25000);
  await sleep(300);
  by.charlie.send("/check bravo");
  const r2 = await by.charlie.waitFor(/file on bravo reads/, 15000);
  assert(/CLEAN/.test(r2), "Double Agent did not read CLEAN — signature role is broken: " + r2);
});

await test("Bodyguard dies instead of the player they guard", async (track) => {
  const { by } = await scripted(track, ["alpha", "bravo", "charlie", "delta"], "alpha=mafia,bravo=bodyguard,charlie=detective,delta=villager");
  await by.alpha.waitFor(/Choose a target:/);
  by.alpha.send("/kill delta");
  by.bravo.send("/guard delta");
  const dawn = await by.delta.waitFor(/took the bullet|is dead/, 15000);
  assert(/took the bullet/.test(dawn), "bodyguard's protection did not prevent the kill: " + dawn);
  assert(by.delta.alive, "guarded player was marked dead");
  await sleep(300);
  assert(by.bravo.saw(/YOU DIED|gave your life/), "bodyguard was not told they died in place of their target");
});

await test("Bodyguard cannot guard themselves", async (track) => {
  const { by } = await scripted(track, ["alpha", "bravo", "charlie", "delta"], "alpha=mafia,bravo=bodyguard,charlie=detective,delta=villager");
  await by.bravo.waitFor(/Guard someone/);
  by.bravo.send("/guard bravo");
  await sleep(400);
  assert(by.bravo.saw(/can't guard yourself/), "self-guard was allowed");
});

await test("Doctor's save takes priority over Bodyguard's sacrifice on the same target", async (track) => {
  const { by } = await scripted(
    track,
    ["alpha", "bravo", "charlie", "delta", "echo"],
    "alpha=mafia,bravo=bodyguard,charlie=doctor,delta=villager,echo=villager",
  );
  await by.alpha.waitFor(/Choose a target:/);
  by.alpha.send("/kill delta");
  by.bravo.send("/guard delta");
  by.charlie.send("/save delta");
  const dawn = await by.delta.waitFor(/survived|took the bullet|is dead/, 15000);
  assert(/survived/.test(dawn), "doctor's save should have won out over the bodyguard trade: " + dawn);
  assert(by.bravo.alive, "bodyguard should not have died — the doctor already saved the target");
});

await test("Jester wins instantly when voted out", async (track) => {
  const names = ["alpha", "bravo", "charlie", "delta"];
  const { by } = await scripted(track, names, "alpha=mafia,bravo=jester,charlie=detective,delta=villager");
  // alpha deliberately does not kill, so all four survive to the vote
  await by.bravo.waitFor(/DAY 1 — VOTE/, 25000);
  for (const n of ["alpha", "charlie", "delta"]) by[n].send("/vote bravo");
  by.bravo.send("/vote skip");
  const end = await by.charlie.waitFor(/JESTER WINS/, 20000);
  assert(/JESTER WINS/.test(end), "jester did not win after being voted out");
  await sleep(300);
  assert(by.bravo.saw(/got exactly what you wanted/), "jester was not told they won on their own screen");
});

await test("two Mafia selecting the same target", async (track) => {
  const names = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf"];
  const { by } = await scripted(track, names, "alpha=mafia,bravo=mafia,charlie=doctor,delta=detective,echo=villager,foxtrot=villager,golf=villager");
  await by.alpha.waitFor(/Choose a target:/);
  by.alpha.send("/kill echo");
  by.bravo.send("/kill echo");
  // doctor and detective also converge on one player — no conflict expected
  by.charlie.send("/save foxtrot");
  by.delta.send("/check foxtrot");
  const dawn = await by.echo.waitFor(/echo is dead/, 20000);
  assert(/is dead/.test(dawn), "duplicate mafia votes did not resolve to a kill");
  assert(!by.alpha.saw(/^\[!\]/), "duplicate targeting produced an error");
});

await test("Mafia eliminated by vote → TOWN WINS", async (track) => {
  const names = ["alpha", "bravo", "charlie", "delta"];
  const { by } = await scripted(track, names, "alpha=mafia,bravo=detective,charlie=doctor,delta=villager");
  // alpha deliberately does not kill, so all four survive to the vote
  await by.bravo.waitFor(/DAY 1 — VOTE/, 25000);
  for (const n of ["bravo", "charlie", "delta"]) by[n].send("/vote alpha");
  by.alpha.send("/vote skip");
  const end = await by.bravo.waitFor(/TOWN WINS/, 20000);
  assert(/TOWN WINS/.test(end), "town did not win after the last mafia was lynched");
});

await test("Mafia reaches majority → MAFIA WINS", async (track) => {
  const names = ["alpha", "bravo", "charlie", "delta"];
  const { by } = await scripted(track, names, "alpha=mafia,bravo=mafia,charlie=villager,delta=villager");
  await by.alpha.waitFor(/Choose a target:/);
  by.alpha.send("/kill charlie");
  const end = await by.delta.waitFor(/MAFIA WINS/, 25000);
  assert(/MAFIA WINS/.test(end), "mafia did not win at parity");
});

await test("tied vote → nobody is eliminated", async (track) => {
  const names = ["alpha", "bravo", "charlie", "delta"];
  const { by } = await scripted(track, names, "alpha=mafia,bravo=detective,charlie=doctor,delta=villager");
  await by.alpha.waitFor(/DAY 1 — VOTE/, 25000);
  by.alpha.send("/vote bravo");
  by.bravo.send("/vote alpha");
  by.charlie.send("/vote delta");
  by.delta.send("/vote charlie");
  const verdict = await by.alpha.waitFor(/room is split|is voted out/, 20000);
  assert(/room is split/.test(verdict), "a tie eliminated somebody: " + verdict);
});

/* ------------------------------------------------------------------ */
/* 4. Bad input — nothing here may crash or corrupt the round          */
/* ------------------------------------------------------------------ */

await test("invalid player name is rejected, then accepted", async (track) => {
  const server = await new Server({}).start();
  track(server);
  const c = new Client(server, "alpha");
  await c.connect({ join: false });
  await sleep(200);
  for (const bad of ["", "   ", "!!!", "@@@@", "***"]) c.send(bad);
  await sleep(400);
  assert(c.saw(/Letters and numbers only/), "bad name was not rejected");
  c.send("realname");
  await c.waitFor(/realname.*joined|Lobby/, 5000);
  assert(c.saw(/joined/), "valid name was not accepted after rejections");
});

await test("oversized name is truncated, duplicate name is refused", async (track) => {
  const server = await new Server({}).start();
  track(server);
  const a = new Client(server, "x".repeat(200));
  await a.connect();
  await sleep(300);
  const b = new Client(server, "x".repeat(12));
  await b.connect();
  await sleep(400);
  assert(b.saw(/name is taken/), "duplicate name was allowed");
});

await test("invalid vote targets are rejected", async (track) => {
  const names = ["alpha", "bravo", "charlie", "delta"];
  const { by } = await scripted(track, names, "alpha=mafia,bravo=detective,charlie=doctor,delta=villager");
  await by.alpha.waitFor(/DAY 1 — VOTE/, 25000);
  by.alpha.send("/vote nobodyhere");
  by.alpha.send("/vote 999");
  by.alpha.send("/vote -3");
  by.alpha.send("/vote");
  await sleep(500);
  assert(by.alpha.saw(/No living player/), "invalid vote target was not rejected");
  // the round must still be votable afterwards
  by.alpha.send("/vote bravo");
  await by.alpha.waitFor(/Your vote is locked in/, 8000);
});

await test("duplicate vote is refused", async (track) => {
  const names = ["alpha", "bravo", "charlie", "delta"];
  const { by } = await scripted(track, names, "alpha=mafia,bravo=detective,charlie=doctor,delta=villager");
  await by.alpha.waitFor(/DAY 1 — VOTE/, 25000);
  by.alpha.send("/vote bravo");
  await by.alpha.waitFor(/Your vote is locked in/, 8000);
  by.alpha.send("/vote charlie");
  await sleep(400);
  assert(by.alpha.saw(/already voted/), "vote was allowed to change");
});

await test("dead player cannot use commands", async (track) => {
  const names = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];
  const { by } = await scripted(track, names, "alpha=mafia,bravo=double_agent,charlie=detective,delta=doctor,echo=villager,foxtrot=villager");
  await by.alpha.waitFor(/Choose a target:/);
  by.alpha.send("/kill echo");
  await by.echo.waitFor(/YOU DIED|is dead/, 20000);
  await sleep(400);
  by.echo.send("/vote alpha");
  by.echo.send("/kill alpha");
  by.echo.send("/save alpha");
  await sleep(500);
  assert(by.echo.saw(/The dead only watch/), "a dead player's commands were not blocked");
});

await test("junk input during every phase never crashes the server", async (track) => {
  const names = ["alpha", "bravo", "charlie", "delta"];
  const { by, clients } = await scripted(track, names, "alpha=mafia,bravo=detective,charlie=doctor,delta=villager");
  const junk = [
    "/bogus", "/kill", "/save", "/check", "/vote", "/history abc", "/history 99999",
    "/kill 0", "/kill -5", "/save 99999", "/start", "/restart", "/bots abc", "/bots -1",
    "/m", "/skip extra args", "x".repeat(9000), "\x00\x01\x02", "/vote skip skip",
    "{}", "[]", "null", "undefined", "../../etc/passwd", "%s%s%s%n",
  ];
  for (let round = 0; round < 3; round++) {
    for (const c of clients) for (const j of junk) c.send(j);
    await sleep(800);
  }
  // the game must still be running and responsive
  by.alpha.send("/players");
  await by.alpha.waitFor(/ALIVE \(/, 8000);
});

/* ------------------------------------------------------------------ */
/* 5. Disconnects and reconnects                                       */
/* ------------------------------------------------------------------ */

await test("player disconnects during night — round continues", async (track) => {
  const names = ["alpha", "bravo", "charlie", "delta", "echo"];
  const { by } = await scripted(track, names, "alpha=mafia,bravo=detective,charlie=doctor,delta=villager,echo=villager");
  await by.alpha.waitFor(/Choose a target:/);
  by.delta.drop();
  await sleep(300);
  by.alpha.send("/kill echo");
  // the phase must not stall waiting on the dropped player
  await by.alpha.waitFor(/DAY 1 — DISCUSSION/, 25000);
  assert(by.alpha.saw(/delta dropped out/), "disconnect was not announced");
});

await test("player disconnects during voting — vote still resolves", async (track) => {
  const names = ["alpha", "bravo", "charlie", "delta", "echo"];
  const { by } = await scripted(track, names, "alpha=mafia,bravo=detective,charlie=doctor,delta=villager,echo=villager");
  await by.alpha.waitFor(/DAY 1 — VOTE/, 30000);
  by.delta.drop();
  await sleep(200);
  by.alpha.send("/vote bravo");
  by.bravo.send("/vote bravo");
  by.charlie.send("/vote bravo");
  const verdict = await by.alpha.waitFor(/VERDICT|is voted out|room is split/, 20000);
  assert(verdict, "vote did not resolve after a mid-vote disconnect");
});

await test("host disconnects — host badge is handed over", async (track) => {
  const names = ["alpha", "bravo", "charlie", "delta"];
  const { by } = await scripted(track, names, "alpha=mafia,bravo=detective,charlie=doctor,delta=villager");
  by.alpha.drop();
  await sleep(600);
  assert(by.bravo.saw(/You are now the host/), "host badge was not transferred on drop");
});

await test("player reconnects and gets their role back", async (track) => {
  const names = ["alpha", "bravo", "charlie", "delta", "echo"];
  const { server, by } = await scripted(track, names, "alpha=mafia,bravo=detective,charlie=doctor,delta=villager,echo=villager");
  const originalRole = by.charlie.role;
  assert(originalRole === "DOCTOR", "pinned role did not apply, got " + originalRole);
  by.charlie.drop();
  await sleep(600);
  const again = new Client(server, "charlie");
  await again.connect();
  await again.waitFor(/reconnected/, 8000);
  await sleep(400);
  assert(again.role === originalRole, `role not restored: was ${originalRole}, now ${again.role}`);
});

await test("reconnect works after the drop was announced mid-vote", async (track) => {
  const names = ["alpha", "bravo", "charlie", "delta", "echo"];
  const { server, by } = await scripted(track, names, "alpha=mafia,bravo=detective,charlie=doctor,delta=villager,echo=villager");
  await by.alpha.waitFor(/DAY 1 — VOTE/, 30000);
  by.echo.drop();
  await sleep(300);
  const again = new Client(server, "echo");
  await again.connect();
  await again.waitFor(/reconnected/, 8000);
  again.send("/vote bravo");
  await sleep(500);
  assert(!again.saw(/Unknown command/), "reconnected player could not vote");
});

await test("all humans drop mid-match — server survives and finishes", async (track) => {
  const names = ["alpha", "bravo", "charlie", "delta"];
  const { server, clients } = await lobby({ night: 2, day: 2, vote: 2 }, names);
  track(server);
  clients.forEach((c) => c.autoPlay());
  clients[0].send("/bots 2");
  await sleep(400);
  clients[0].send("/start");
  await clients[0].waitFor(/NIGHT 1/, 15000);
  clients.forEach((c) => c.drop());
  await sleep(12000);
  assert(!server.crashed, "server died after every human left");
});

/* ------------------------------------------------------------------ */
/* 3b. Bot personalities                                               */
/* ------------------------------------------------------------------ */

await test("bot personalities are stable and cover all four types", async () => {
  const { personaFor, BOT_NAMES, PERSONAS } = await import("../lib/bots.mjs");
  for (const n of BOT_NAMES) {
    assert(personaFor(n) === personaFor(n.toUpperCase()), `${n} persona is case-sensitive`);
    assert(personaFor(n).label, `${n} has no persona`);
  }
  const used = new Set(BOT_NAMES.map((n) => personaFor(n).key));
  for (const k of Object.keys(PERSONAS)) assert(used.has(k), `no bot uses the ${k} personality`);
  assert(personaFor("ada").key === "analytical", "ada should be analytical");
  assert(personaFor("grim").key === "aggressive", "grim should be aggressive");
  assert(personaFor("juno").key === "defensive", "juno should be defensive");
  assert(personaFor("dax").key === "chaotic", "dax should be chaotic");
  assert(personaFor("some_custom_name").label, "unknown codenames must still get a persona");
});

await test("bots produce varied, non-repeating dialogue", async (track) => {
  const server = await new Server({ night: 1, day: 8, vote: 1 }).start();
  track(server);
  const me = new Client(server, "watcher");
  await me.connect();
  me.autoPlay({ skip: false }); // let the discussion run its full length
  me.send("/bots 7");
  await sleep(500);
  me.send("/start");
  await me.waitFor(/(TOWN|MAFIA|JESTER) WINS —/, 120000);
  const chat = me.lines.filter((l) => /^ {2}\w+·:/.test(l)).map((l) => l.slice(l.indexOf(":") + 1).trim());
  assert(chat.length >= 8, `bots barely spoke (${chat.length} lines)`);
  const unique = new Set(chat).size;
  assert(unique / chat.length > 0.7, `dialogue repeats too much: ${unique} unique of ${chat.length}`);
});

await test("bots react to what happened the previous night", async (track) => {
  const server = await new Server({ night: 2, day: 8, vote: 2 }).start();
  track(server);
  const me = new Client(server, "watcher");
  await me.connect();
  me.autoPlay({ skip: false });
  me.send("/bots 7");
  await sleep(500);
  me.send("/start");
  await me.waitFor(/(TOWN|MAFIA|JESTER) WINS —/, 120000);
  // Someone dying should be spoken about by name, not ignored.
  const deaths = me.lines.filter((l) => /is dead\./.test(l)).map((l) => l.trim().split(" ")[0]);
  if (deaths.length) {
    const reacted = me.lines.some((l) => /^ {2}\w+·:/.test(l) && deaths.some((d) => l.includes(d)));
    assert(reacted, "nobody mentioned the player who died");
  }
});

await test("end-of-match reveal names each bot's personality", async (track) => {
  const server = await new Server({ night: 2, day: 2, vote: 2 }).start();
  track(server);
  const me = new Client(server, "watcher");
  await me.connect();
  me.autoPlay();
  me.send("/bots 4");
  await sleep(500);
  me.send("/start");
  await me.waitFor(/(TOWN|MAFIA|JESTER) WINS —/, 120000);
  await sleep(400);
  assert(
    me.saw(/·bot \((analytical|aggressive|defensive|chaotic)\)/),
    "final reveal did not show bot personalities",
  );
});

/* ------------------------------------------------------------------ */
/* 5b. Lobby screen                                                    */
/* ------------------------------------------------------------------ */

await test("lobby screen shows room, roster, host, bots and readiness", async (track) => {
  const server = await new Server({}).start();
  track(server);
  server.env.MAFIA_ROOM = "7F42";
  const a = new Client(server, "Sadiq");
  await a.connect();
  assert(a.saw(/TERMINAL MAFIA/), "no lobby screen on join");
  assert(a.saw(/ROOM\s+[0-9A-F]{4}/), "room code missing");
  assert(a.saw(/Sadiq\s+HOST/), "host not marked");
  assert(a.saw(/NEED 3 MORE/), "readiness count wrong for a 1-player lobby");

  const b = new Client(server, "Rahul");
  await b.connect();
  const c2 = new Client(server, "Aman");
  await c2.connect();
  a.send("/bots 1");
  await a.waitFor(/PLAYERS — READY/, 8000);
  await sleep(300); // the host's start prompt follows the screen
  assert(a.saw(/⚙ ada\s+BOT/), "bot not marked in lobby");
  assert(a.saw(/4 PLAYERS — READY/), "lobby did not report ready at 4");
  assert(a.saw(/\/start.*when everyone's ready/), "host was not prompted to start");
});

await test("lobby screen updates when a player leaves", async (track) => {
  const server = await new Server({}).start();
  track(server);
  const a = new Client(server, "alpha");
  await a.connect();
  const b = new Client(server, "bravo");
  await b.connect();
  await a.waitFor(/NEED 2 MORE/, 8000);
  b.drop();
  await a.waitFor(/bravo left the lobby/, 8000);
  await sleep(300);
  // the screen must redraw with the reduced count after the departure
  const redrawn = a.lines.slice(a.lines.findIndex((l) => /bravo left the lobby/.test(l)));
  assert(redrawn.some((l) => /NEED 3 MORE/.test(l)), "lobby screen did not redraw after a departure");
});

/* ------------------------------------------------------------------ */
/* 6. Lifecycle                                                        */
/* ------------------------------------------------------------------ */

await test("restart runs a clean second match", async (track) => {
  const { server, clients } = await fullMatch(track, 4);
  clients[0].send("/restart");
  await sleep(600);
  clients[0].send("/bots 2");
  await sleep(400);
  clients[0].send("/start");
  const end = await clients[1].waitFor(/(TOWN|MAFIA|JESTER) WINS —/, 120000);
  assert(end, "second match did not complete");
});

await test("match history persists and replays", async (track) => {
  const { server, clients } = await fullMatch(track, 4);
  await sleep(500);
  clients[0].send("/history");
  await clients[0].waitFor(/MATCH HISTORY — \d+ game/, 8000);
  clients[0].send("/history 1");
  await clients[0].waitFor(/NIGHTS & VOTES/, 8000);
  clients[0].send("/history 500");
  await sleep(300);
  assert(clients[0].saw(/No match #500/), "out-of-range history index was not handled");
});

/* ------------------------------------------------------------------ */
/* 7. The showcase moments                                             */
/* ------------------------------------------------------------------ */

await test("opening card announces the exact shape of the room", async (track) => {
  const server = await new Server({ night: 2, day: 2, vote: 2 }).start();
  track(server);
  const me = new Client(server, "watcher");
  await me.connect();
  me.autoPlay();
  me.send("/bots 7");
  await sleep(500);
  me.send("/start");
  await me.waitFor(/THE NIGHT BEGINS/, 15000);
  assert(me.saw(/^\s*8 PLAYERS\s*$/), "player count missing from the deal card");
  assert(me.saw(/^\s*\d+ MAFIA\s*$/), "mafia count missing from the deal card");
  assert(me.saw(/^\s*\d+ DETECTIVE\s*$/), "detective count missing from the deal card");
  // Every counted role must add up to the size of the room.
  const counts = me.lines
    .map((l) => l.trim().match(/^(\d+) ([A-Z][A-Z ]*)$/))
    .filter((m) => m && m[2] !== "PLAYERS")
    .map((m) => Number(m[1]));
  assert(counts.reduce((a, b) => a + b, 0) === 8, `role counts do not sum to the room: ${counts}`);
});

await test("a player who knows too much gets called out for it", async (track) => {
  // Pinned deck + pinned leak slot: ada is the Double Agent, so grim (her
  // Mafia partner) is holding a secret he can drop in public.
  const server = await new Server({
    night: 2,
    day: 14,
    vote: 2,
    leak: "always",
    roles: "ada=double_agent,grim=mafia,juno=detective,boone=doctor,cinder=villager,dax=villager,echo=villager,watcher=villager",
  }).start();
  track(server);
  const me = new Client(server, "watcher");
  await me.connect();
  me.autoPlay({ skip: false });
  me.send("/bots 7");
  await sleep(500);
  me.send("/start");
  const shout = await me.waitFor(/HOW DO YOU KNOW|just told us|nobody ever said|how do YOU know/, 40000);
  const at = me.lines.indexOf(shout);
  // A long callout wraps onto a continuation line, so read the whole thing.
  const full = me.lines.slice(at, at + 3).join(" ").replace(/\s+/g, " ");
  assert(/double agent/i.test(full), "the callout did not name the leaked role: " + full);
  assert(!/^\s*ada·/.test(shout), "the leaked player called out their own cover: " + shout);
  await me.waitFor(/the room turns on/, 8000);
});

await test("a correct guess is not treated as a leak", async (track) => {
  // Nobody may be called out for naming a role that the room already
  // watched flip, or for a role nobody secretly knows.
  const server = await new Server({ night: 2, day: 6, vote: 2, leak: "never" }).start();
  track(server);
  const me = new Client(server, "watcher");
  await me.connect();
  me.autoPlay({ skip: false });
  me.send("/bots 5");
  await sleep(500);
  me.send("/start");
  await me.waitFor(/DAY 1 — DISCUSSION/, 20000);
  me.send("i think one of you is the doctor");
  await sleep(1500);
  assert(!me.saw(/the room turns on watcher/), "a guess with no name in it was punished as a leak");
});

await test("verdict publishes the ballot and reveals the role", async (track) => {
  const server = await new Server({ night: 2, day: 2, vote: 3 }).start();
  track(server);
  const me = new Client(server, "watcher");
  await me.connect();
  me.autoPlay();
  me.send("/bots 5");
  await sleep(500);
  me.send("/start");
  await me.waitFor(/(TOWN|MAFIA|JESTER) WINS —/, 120000);
  assert(me.saw(/ROLE REVEAL/), "no role reveal after an elimination");
  assert(me.saw(/has been eliminated/), "no elimination line");
  assert(me.saw(/ballot\s+\w+→/), "the ballot was never published");
  // The published ballot must account for every living voter.
  const line = me.lines.find((l) => /ballot\s+\w+→/.test(l));
  assert((line.match(/→/g) || []).length >= 4, "published ballot is missing voters: " + line);
});

await test("mafia private channel reaches partners and nobody else", async (track) => {
  const server = await new Server({
    night: 3,
    day: 8,
    vote: 3,
    roles: "alpha=mafia,bravo=double_agent,charlie=detective,delta=doctor,echo=villager,foxtrot=villager",
  }).start();
  track(server);
  const names = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];
  const cl = {};
  for (const n of names) {
    cl[n] = new Client(server, n);
    await cl[n].connect();
  }
  cl.alpha.send("/start");
  await cl.alpha.waitFor(/DAY 1 — DISCUSSION/, 30000);
  await sleep(300);
  cl.alpha.send("/m the detective is charlie");
  cl.bravo.send("/m understood partner");
  await sleep(900);
  const saw = (c2, re) => c2.lines.some((l) => re.test(l));
  const secret = /the detective is charlie/;
  const reply = /understood partner/;

  assert(saw(cl.bravo, secret), "the Double Agent never received their partner's tip-off");
  assert(saw(cl.alpha, reply), "the Double Agent could not reply on the private channel");
  assert(!saw(cl.alpha, /Unknown command/), "/m was advertised but not implemented");
  // The whole point of the channel is that the town cannot read it.
  for (const n of ["charlie", "delta", "echo", "foxtrot"])
    assert(!saw(cl[n], secret) && !saw(cl[n], reply), `${n} (town) could read the mafia channel`);
  // And that the town cannot use it.
  cl.charlie.send("/m hello?");
  await sleep(400);
  assert(saw(cl.charlie, /don't have a private channel/), "a townsperson was allowed to use /m");
});

/* ------------------------------------------------------------------ */

const failed = results.filter((r) => !r.ok);
const total = results.length;
console.log(
  `\n${failed.length === 0 ? "\x1b[32m" : "\x1b[31m"}${total - failed.length}/${total} passed\x1b[0m` +
    ` \x1b[90m(${(results.reduce((a, r) => a + r.ms, 0) / 1000).toFixed(1)}s)\x1b[0m\n`,
);
process.exit(failed.length ? 1 : 0);
