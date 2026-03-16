/**
 * Builds a .dxt package for Claude Desktop.
 *
 * A .dxt file is a ZIP archive containing:
 *   manifest.json  — extension metadata & config
 *   server/        — compiled JS + production node_modules
 *
 * Usage: node scripts/build-dxt.mjs
 * Called automatically by `npm run build:dxt`.
 */

import { execSync } from "node:child_process";
import { readFileSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const STAGE = join(ROOT, ".dxt-staging");
const DIST = join(ROOT, "dist");

// Read version from manifest
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const outName = `fastmail-mcp-server-v${manifest.version}.dxt`;
const OUT = join(ROOT, outName);

console.log(`Building DXT package: ${outName}`);

// ── 1. Clean staging area ──
if (existsSync(STAGE)) rmSync(STAGE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });
mkdirSync(join(STAGE, "server"), { recursive: true });

// ── 2. Copy manifest.json ──
cpSync(join(ROOT, "manifest.json"), join(STAGE, "manifest.json"));

// ── 3. Copy compiled JS into server/ ──
cpSync(DIST, join(STAGE, "server"), { recursive: true });

// ── 4. Install production-only node_modules into staging ──
cpSync(join(ROOT, "package.json"), join(STAGE, "package.json"));

// Also copy package-lock.json if it exists for deterministic installs
const lockFile = join(ROOT, "package-lock.json");
if (existsSync(lockFile)) {
  cpSync(lockFile, join(STAGE, "package-lock.json"));
}

console.log("Installing production dependencies...");
execSync("npm install --omit=dev --ignore-scripts", {
  cwd: STAGE,
  stdio: "inherit",
});

// Remove the staging package.json/lock — they're not needed in the bundle
rmSync(join(STAGE, "package.json"), { force: true });
rmSync(join(STAGE, "package-lock.json"), { force: true });

// ── 5. Create ZIP (.dxt) ──
// Use the `zip` CLI if available, otherwise fall back to Node's built-in
// archiving approach via tar | gzip — but .dxt is really a ZIP, so prefer zip.
console.log("Creating .dxt archive...");

try {
  // Try system zip first (available on macOS/Linux, and Git Bash on Windows)
  execSync(`zip -r -9 "${OUT}" .`, {
    cwd: STAGE,
    stdio: "inherit",
  });
} catch {
  // Fallback: use Node.js to create a ZIP without extra deps.
  // We use the lightweight approach of shelling out to tar on unix or
  // PowerShell Compress-Archive on Windows
  const isWin = process.platform === "win32";
  if (isWin) {
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${STAGE}\\*' -DestinationPath '${OUT}' -Force"`,
      { stdio: "inherit" },
    );
  } else {
    // tar-based zip fallback for systems without zip
    execSync(`tar -cf - -C "${STAGE}" . | gzip -9 > "${OUT}"`, {
      stdio: "inherit",
      shell: "/bin/sh",
    });
  }
}

// ── 6. Clean up ──
rmSync(STAGE, { recursive: true, force: true });

console.log(`\n✅ DXT package created: ${outName}`);
console.log(`   Install in Claude Desktop by opening the .dxt file.`);
