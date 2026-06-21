#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedTestCount = 24;
const testFiles = [
  "test/product-research.test.js",
  "test/product-research-runner.test.js",
];
const requiredTitles = [
  "product research helpers are exported from the package root",
  "normalizeProductResearchConfig validates and defaults a product research run",
  "normalizeProductResearchConfig rejects broad or incomplete runs",
  "renderProductResearchProgram captures scope, metric, budget, and TSV header",
  "renderProductResearchProgram sanitizes markdown control characters in labels",
  "decideExperimentStatus keeps baselines, improvements, and simpler ties",
  "decideExperimentStatus discards regressions and marks crashes",
  "extractMetricFromText finds explicit scalar metric lines",
  "format and parse experiment TSV rows",
  "parseExperimentTsv keeps malformed metrics as null instead of coercing to zero",
  "formatExperimentResult rejects invalid non-crash metrics and neutralizes formula cells",
  "runProductResearchCli renders programs and records extracted metrics",
  "runProductResearchCli blocks harness dirt by default but allows bootstrap-only files",
  "runProductResearchCli blocks staged renames from out-of-scope paths",
  "runProductResearchCli rejects invalid best metrics before logging",
  "runProductResearchCli records failed missing-metric runs as crashes",
  "runProductResearchCli uses normalized metric defaults for headers and extraction",
  "runProductResearchCli captures verbose eval logs without default buffer crashes",
  "runProductResearchCli rejects overlapping editable and read-only scopes",
  "runProductResearchCli honors metric improvement epsilon",
  "runProductResearchCli fails closed outside git repos",
  "runProductResearchCli rejects invalid fallback metrics instead of coercing to zero",
  "runProductResearchCli rechecks scope after eval before logging results",
  "runProductResearchCli refuses to overwrite TSV history on header mismatch",
];

function testEnv(env, tempRoot) {
  return {
    CI: "1",
    NODE_ENV: "test",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    PATH: env.PATH || "",
    HOME: env.HOME || "",
    TMPDIR: tempRoot,
    TMP: tempRoot,
    TEMP: tempRoot,
    SystemRoot: env.SystemRoot || "",
    ComSpec: env.ComSpec || "",
    PATHEXT: env.PATHEXT || "",
  };
}

function validateTapReport(reportPath) {
  if (!existsSync(reportPath)) return "missing Node TAP report";
  if (requiredTitles.length !== expectedTestCount) {
    return `checker expected-title list has ${requiredTitles.length} entries, expected ${expectedTestCount}`;
  }

  const tap = readFileSync(reportPath, "utf8");
  if (!tap.includes(`1..${expectedTestCount}`)) {
    return `missing TAP plan 1..${expectedTestCount}`;
  }
  if (/^not ok\s+\d+/m.test(tap)) return "TAP report contains failing tests";
  if (/^ok\s+\d+\s+-\s+.+#\s*(SKIP|TODO)\b/im.test(tap)) {
    return "TAP report contains skipped or TODO tests";
  }
  if (new RegExp(`#\\s+(fail|cancelled|skipped|todo)\\s+[1-9]`).test(tap)) {
    return "TAP summary contains non-passing tests";
  }

  const okTitles = Array.from(tap.matchAll(/^ok\s+\d+\s+-\s+(.+)$/gm), (match) => match[1].trim());
  if (okTitles.length !== expectedTestCount) {
    return `expected ${expectedTestCount} passing tests, got ${okTitles.length}`;
  }
  const titleSet = new Set(okTitles);
  if (titleSet.size !== expectedTestCount) return "TAP report contains duplicate passing test titles";
  for (const title of requiredTitles) {
    if (!titleSet.has(title)) return `missing expected test title: ${title}`;
  }
  return "";
}

let tempRoot = "";
let result = { status: 1, stdout: "", stderr: "", error: null };
let reportError = "";

try {
  tempRoot = mkdtempSync(path.join(os.tmpdir(), "a1-ai-core-product-research-contract-"));
  const reportPath = path.join(tempRoot, "product-research-core-contract.tap");
  result = spawnSync(process.execPath, [
    "--test",
    "--test-reporter=tap",
    `--test-reporter-destination=${reportPath}`,
    ...testFiles,
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    env: testEnv(process.env, tempRoot),
    shell: false,
  });
  reportError = validateTapReport(reportPath);
} catch (error) {
  reportError = error && error.message ? error.message : String(error);
} finally {
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
}

const failed = result.error || result.status !== 0 || reportError;
console.log(`failing_checks=${failed ? 1 : 0}`);

if (reportError) console.error(`report_validation_error=${reportError}`);
if (!failed && result.stdout) process.stdout.write(result.stdout);
if (!failed && result.stderr) process.stderr.write(result.stderr);
if (result.error) console.error(result.error.message);

process.exitCode = failed ? 1 : 0;
