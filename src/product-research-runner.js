"use strict";

const { spawnSync } = require("node:child_process");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { readdir } = require("node:fs/promises");
const path = require("node:path");
const productResearch = require("./product-research");

function usage() {
  return [
    "Usage:",
    "  npm run karpathy:list",
    "  npm run karpathy:program -- <eval-id>",
    "  npm run karpathy:run -- <eval-id> [--best <metric>]",
  ].join("\n");
}

function pathsFor(repoRoot) {
  const root = path.resolve(repoRoot || process.cwd());
  const evalRoot = path.join(root, "evals", "karpathy");
  return {
    repoRoot: root,
    evalRoot,
    resultsRoot: path.join(evalRoot, "results")
  };
}

async function listEvalIds(evalRoot) {
  const files = await readdir(evalRoot);
  return files
    .filter(file => file.endsWith(".json"))
    .map(file => file.replace(/\.json$/, ""))
    .sort();
}

function readEvalConfig(repoRoot, evalRoot, id) {
  if (!id || id.startsWith("-")) throw new Error(`Missing eval id.\n${usage()}`);
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(id)) throw new Error(`Invalid eval id: ${id}`);
  const file = path.join(evalRoot, `${id}.json`);
  if (!existsSync(file)) throw new Error(`Unknown eval id: ${id}`);
  const config = JSON.parse(readFileSync(file, "utf8"));
  if (config.id !== id) throw new Error(`Eval id mismatch: ${file} declares ${config.id}`);
  config.__file = path.relative(repoRoot, file);
  return config;
}

function commandText(evalConfig) {
  const args = Array.isArray(evalConfig.eval.args) ? evalConfig.eval.args : [];
  return [evalConfig.eval.command, ...args].join(" ");
}

function toProgramConfig(evalConfig) {
  return {
    productName: evalConfig.productName,
    runTag: evalConfig.runTag,
    branchPrefix: evalConfig.branchPrefix,
    editableFiles: evalConfig.editableFiles,
    readOnlyFiles: evalConfig.readOnlyFiles,
    contextFiles: evalConfig.contextFiles,
    guardrails: evalConfig.guardrails,
    evalCommand: commandText(evalConfig),
    metric: evalConfig.eval.metric,
    timeBudgetMinutes: evalConfig.eval.timeBudgetMinutes,
    timeoutMinutes: evalConfig.eval.timeoutMinutes,
  };
}

function gitShortHead(repoRoot) {
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function parseRunOptions(args) {
  const options = { bestMetric: undefined, allowHarnessDirty: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--allow-harness-dirty") {
      options.allowHarnessDirty = true;
      continue;
    }
    if (arg === "--best") {
      if (options.bestMetric != null) throw new Error("--best may only be provided once");
      const value = args[index + 1];
      if (value == null) throw new Error("--best requires a metric value");
      if (typeof value !== "string" || !value.trim()) throw new Error("--best requires a finite metric value");
      const metric = Number(value.trim());
      if (!Number.isFinite(metric)) throw new Error("--best requires a finite metric value");
      options.bestMetric = metric;
      index += 1;
      continue;
    }
    throw new Error(`Unknown run option: ${arg}`);
  }
  return options;
}

function dirtyEntries(repoRoot) {
  const result = spawnSync("git", ["status", "--short", "--untracked-files=all"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`Cannot inspect git status for eval scope${detail ? `:\n${detail}` : ""}`);
  }
  return result.stdout
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean)
    .map(line => {
      const status = line.slice(0, 2);
      const pathText = line.slice(3).trim();
      const files = pathText.includes(" -> ") ? pathText.split(" -> ") : [pathText];
      const file = files[files.length - 1];
      return { status, file, files };
    })
    .filter(entry => entry.file);
}

function isBootstrapHarnessPath(file, evalConfig) {
  return file === ".gitignore"
    || file === "README.md"
    || file === "package.json"
    || file === "scripts/karpathy-eval.mjs"
    || file === evalConfig.__file;
}

function assertEvalScopeClean(repoRoot, evalConfig, { allowHarnessDirty = false } = {}) {
  const editable = new Set(evalConfig.editableFiles || []);
  const readOnly = new Set(evalConfig.readOnlyFiles || []);
  const outOfScope = dirtyEntries(repoRoot).filter(entry => {
    const files = Array.isArray(entry.files) && entry.files.length ? entry.files : [entry.file];
    return files.some(file => {
      if (editable.has(file)) return false;
      if (readOnly.has(file)) return true;
      if (allowHarnessDirty && isBootstrapHarnessPath(file, evalConfig)) return false;
      return true;
    });
  });
  if (outOfScope.length) {
    throw new Error(`Out-of-scope dirty files block eval result logging:\n${outOfScope.map(entry => `- ${(entry.files || [entry.file]).join(" -> ")}`).join("\n")}`);
  }
}

function finiteOrNull(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const EVAL_OUTPUT_MAX_BUFFER = 64 * 1024 * 1024;

function metricValueFromResult(evalConfig, normalizedProgramConfig, result, helpers) {
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  const metricName = normalizedProgramConfig.metric.name;
  const extracted = helpers.extractMetricFromText(output, metricName);
  if (extracted != null) return extracted;
  if (result.status === 0) return finiteOrNull(evalConfig.eval.successMetricValue);
  if (evalConfig.eval.allowFailureMetricFallback === true) {
    return finiteOrNull(evalConfig.eval.failureMetricValue);
  }
  return null;
}

function memoryGbFromResult(result, helpers) {
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  const memoryGb = helpers.extractMetricFromText(output, "memory_gb");
  if (memoryGb != null) return memoryGb;
  const memoryMb = helpers.extractMetricFromText(output, "memory_mb");
  return memoryMb == null ? 0 : memoryMb / 1024;
}

function appendResult(resultsRoot, id, header, row, logText) {
  mkdirSync(resultsRoot, { recursive: true });
  const tsvPath = path.join(resultsRoot, `${id}.tsv`);
  const logPath = path.join(resultsRoot, `${id}-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
  const existing = existsSync(tsvPath) ? readFileSync(tsvPath, "utf8") : "";
  const firstLine = existing.split(/\r?\n/, 1)[0];
  if (existing && firstLine !== header) {
    throw new Error(`Existing results header mismatch for ${path.relative(process.cwd(), tsvPath)}. Refusing to overwrite experiment history.`);
  }
  const tsvText = existing || `${header}\n`;
  writeFileSync(tsvPath, `${tsvText}${row}\n`);
  writeFileSync(logPath, logText);
  return { tsvPath, logPath };
}

async function productResearchMain({
  repoRoot,
  evalRoot,
  resultsRoot,
  argv,
  env,
  stdout,
  helpers
}) {
  const [mode, id, ...rest] = argv;
  if (!mode || mode === "--help" || mode === "-h") {
    stdout(usage());
    return 0;
  }

  if (mode === "--list") {
    const ids = await listEvalIds(evalRoot);
    stdout(ids.join("\n"));
    return 0;
  }

  const evalConfig = readEvalConfig(repoRoot, evalRoot, id);
  const programConfig = toProgramConfig(evalConfig);
  const normalizedProgramConfig = helpers.normalizeProductResearchConfig(programConfig);

  if (mode === "--program") {
    stdout(helpers.renderProductResearchProgram(normalizedProgramConfig));
    return 0;
  }

  if (mode !== "--run") throw new Error(`Unknown mode: ${mode}\n${usage()}`);

  const { bestMetric, allowHarnessDirty } = parseRunOptions(rest);
  assertEvalScopeClean(repoRoot, evalConfig, { allowHarnessDirty });
  const args = Array.isArray(evalConfig.eval.args) ? evalConfig.eval.args : [];
  const started = new Date().toISOString();
  const result = spawnSync(evalConfig.eval.command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...env, CI: "1" },
    shell: false,
    timeout: Math.max(1, normalizedProgramConfig.timeoutMinutes) * 60_000,
    maxBuffer: EVAL_OUTPUT_MAX_BUFFER,
  });
  const metricValue = metricValueFromResult(evalConfig, normalizedProgramConfig, result, helpers);
  const outcome = helpers.decideExperimentStatus({
    bestMetric,
    candidateMetric: metricValue,
    direction: normalizedProgramConfig.metric.direction,
    improvementEpsilon: normalizedProgramConfig.metric.improvementEpsilon,
    crashed: result.error != null || metricValue == null,
  });
  const row = helpers.formatExperimentResult({
    commit: gitShortHead(repoRoot),
    metricValue,
    memoryGb: memoryGbFromResult(result, helpers),
    status: outcome.status,
    description: `${evalConfig.id} ${outcome.reason}`,
  });
  const header = helpers.formatExperimentHeader(normalizedProgramConfig.metric.name);
  const logText = [
    `started=${started}`,
    `finished=${new Date().toISOString()}`,
    `command=${commandText(evalConfig)}`,
    `exit_status=${result.status}`,
    `signal=${result.signal || ""}`,
    `error=${result.error ? result.error.message : ""}`,
    "",
    "STDOUT:",
    result.stdout || "",
    "",
    "STDERR:",
    result.stderr || "",
  ].join("\n");
  assertEvalScopeClean(repoRoot, evalConfig, { allowHarnessDirty });
  const paths = appendResult(resultsRoot, evalConfig.id, header, row, logText);

  stdout(header);
  stdout(row);
  stdout(`log=${path.relative(repoRoot, paths.logPath)}`);
  stdout(`results=${path.relative(repoRoot, paths.tsvPath)}`);
  return result.status !== 0 || result.error || metricValue == null ? 1 : 0;
}

async function runProductResearchCli(options = {}) {
  const stdout = options.stdout || console.log;
  const stderr = options.stderr || console.error;
  const { repoRoot, evalRoot, resultsRoot } = pathsFor(options.repoRoot);
  try {
    return await productResearchMain({
      repoRoot,
      evalRoot,
      resultsRoot,
      argv: Array.isArray(options.argv) ? options.argv : process.argv.slice(2),
      env: options.env || process.env,
      stdout,
      helpers: options.helpers || productResearch
    });
  } catch (error) {
    stderr(error && error.message ? error.message : String(error));
    return 1;
  }
}

module.exports = {
  runProductResearchCli
};
