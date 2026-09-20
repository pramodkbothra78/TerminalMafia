#!/usr/bin/env node
// Zero-dependency bundler for game/server.mjs + game/lib/*.mjs.
// Needed because Node's SEA feature only embeds a single file — local
// `import` statements pointing at other files on disk won't resolve once
// the code is packed inside the executable. Bun's compiler does this
// automatically; this script does the equivalent by hand for our small,
// fully-local (no npm deps) module graph.
//
// Usage: node scripts/bundle-server.mjs -> writes build/server.bundle.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LIB_DIR = path.join(ROOT, "game", "lib");
const OUT_DIR = path.join(ROOT, "build");
const OUT_FILE = path.join(OUT_DIR, "server.bundle.mjs");

// Order matters: dependencies before dependents.
const LIB_ORDER = ["ui.mjs", "roles.mjs", "bots.mjs", "history.mjs", "game.mjs"];

function stripLocalImports(src) {
  // Remove `import { a, b } from "./whatever.mjs";` lines — after
  // concatenation everything is in one shared top-level scope already.
  return src.replace(/^import\s*\{[^}]*\}\s*from\s*["']\.\/[^"']+["'];?\s*$/gm, "");
}
function convertNodeImportsToCommonJS(src) {
  return src
    .replace(
      /^import\s+([A-Za-z_$][\w$]*)\s+from\s+["'](node:[^"']+)["'];?\s*$/gm,
      'const $1 = require("$2");'
    )
    .replace(
      /^import\s*\{([^}]+)\}\s*from\s+["'](node:[^"']+)["'];?\s*$/gm,
      'const {$1} = require("$2");'
    );
}

function stripExportKeyword(src) {
  // `export const X = ...` -> `const X = ...`
  // `export function f(...)` -> `function f(...)`
  // `export class C {` -> `class C {`
  return src.replace(/^export\s+(const|function|class|let|var)\s+/gm, "$1 ");
}

function stripShebang(src) {
  return src.replace(/^#!.*\n/, "");
}

function readAndTransform(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return stripExportKeyword(
    convertNodeImportsToCommonJS(
      stripLocalImports(stripShebang(raw))
    )
  );
}
function build() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const parts = [
    "#!/usr/bin/env node",
    "// AUTO-GENERATED bundle — do not edit by hand.",
    "// Source: game/server.mjs + game/lib/*.mjs",
    "// Regenerate with: node scripts/bundle-server.mjs",
    "",
  ];

  for (const name of LIB_ORDER) {
    const p = path.join(LIB_DIR, name);
    parts.push(`// ---- game/lib/${name} ----`);
    parts.push(readAndTransform(p));
    parts.push("");
  }

  parts.push("// ---- game/server.mjs ----");
  parts.push(readAndTransform(path.join(ROOT, "game", "server.mjs")));

  fs.writeFileSync(OUT_FILE, parts.join("\n"), "utf8");
  console.log(`Wrote ${path.relative(ROOT, OUT_FILE)}`);
}

build();
