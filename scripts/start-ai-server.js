const { spawn } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

const { buildSync } = require("esbuild");

// Use the existing build toolchain; don't add a TS runtime or generated files to
// the checkout. Provider credentials are read at runtime, never bundled.
const result = buildSync({
  entryPoints: [path.resolve(__dirname, "../excalidraw-app/dev/start-ai.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  write: false,
});
const directory = mkdtempSync(path.join(tmpdir(), "excalidraw-ai-"));
const entry = path.join(directory, "server.cjs");
writeFileSync(entry, result.outputFiles[0].contents);
process.once("exit", () => rmSync(directory, { recursive: true, force: true }));

const child = spawn(process.execPath, [entry], { stdio: "inherit" });
child.once("error", (error) => {
  console.error(`Could not start development AI (${error.code}).`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}
