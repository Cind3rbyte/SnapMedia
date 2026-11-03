#!/usr/bin/env node
/**
 * Copies the WebAssembly engines from node_modules into /public so they are
 * served from the app's own origin. This keeps SnapMedia free of third-party
 * CDNs: no request ever leaves the domain the app runs on.
 *
 *   public/ffmpeg/st/   -> @ffmpeg/core     (single-threaded, works everywhere)
 *   public/ffmpeg/mt/   -> @ffmpeg/core-mt  (multi-threaded, needs SharedArrayBuffer)
 *   public/vendor/      -> browser-image-compression UMD build for its Web Worker
 *
 * Runs automatically on `npm install` (postinstall), `npm run dev` and `npm run build`.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");

/** Resolves the root folder of an installed package without relying on its "exports" map. */
function packageRoot(name) {
  const candidates = [join(root, "node_modules", name)];
  try {
    candidates.push(dirname(require.resolve(`${name}/package.json`, { paths: [root] })));
  } catch {
    // Package does not expose package.json via "exports"; the node_modules path above still applies.
  }
  return candidates.find((dir) => existsSync(join(dir, "package.json")));
}

function copyIfChanged(from, to) {
  if (!existsSync(from)) {
    throw new Error(`Source file missing: ${from}`);
  }
  mkdirSync(dirname(to), { recursive: true });
  if (existsSync(to)) {
    const a = statSync(from);
    const b = statSync(to);
    if (a.size === b.size && a.mtimeMs <= b.mtimeMs) return false;
  }
  copyFileSync(from, to);
  return true;
}

const jobs = [
  {
    pkg: "@ffmpeg/core",
    files: [
      ["dist/umd/ffmpeg-core.js", "ffmpeg/st/ffmpeg-core.js"],
      ["dist/umd/ffmpeg-core.wasm", "ffmpeg/st/ffmpeg-core.wasm"],
    ],
  },
  {
    pkg: "@ffmpeg/core-mt",
    files: [
      ["dist/umd/ffmpeg-core.js", "ffmpeg/mt/ffmpeg-core.js"],
      ["dist/umd/ffmpeg-core.wasm", "ffmpeg/mt/ffmpeg-core.wasm"],
      ["dist/umd/ffmpeg-core.worker.js", "ffmpeg/mt/ffmpeg-core.worker.js"],
    ],
  },
  {
    pkg: "browser-image-compression",
    files: [["dist/browser-image-compression.js", "vendor/browser-image-compression.js"]],
  },
];

let copied = 0;
const versions = {};
const sizes = {};
try {
  for (const job of jobs) {
    const dir = packageRoot(job.pkg);
    if (!dir) {
      throw new Error(`Package ${job.pkg} is not installed. Please run "npm install".`);
    }
    versions[job.pkg] = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
    for (const [from, to] of job.files) {
      if (copyIfChanged(join(dir, from), join(publicDir, to))) copied += 1;
      sizes[to] = statSync(join(publicDir, to)).size;
    }
  }
  // Exact file sizes let the app show real download percentages even when the server compresses the response.
  writeFileSync(join(publicDir, "ffmpeg", "manifest.json"), `${JSON.stringify({ versions, sizes }, null, 2)}\n`);
  console.log(
    `[snapmedia] WebAssembly engines ready (${copied} file(s) updated): ` +
      Object.entries(versions)
        .map(([name, version]) => `${name}@${version}`)
        .join(", "),
  );
} catch (error) {
  console.error(`[snapmedia] Could not copy the WebAssembly engines: ${error.message}`);
  process.exit(1);
}
