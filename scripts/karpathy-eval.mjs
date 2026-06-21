#!/usr/bin/env node
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { runProductResearchCli } = require(repoRoot);

const exitCode = await runProductResearchCli({
  repoRoot,
  argv: process.argv.slice(2),
  env: process.env,
});
if (exitCode) process.exitCode = exitCode;
