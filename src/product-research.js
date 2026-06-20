"use strict";

/**
 * Karpathy-style product research primitives for A1 products.
 *
 * This intentionally does not run git, shells, or model calls. Hosts use these
 * pure helpers to render a narrow agent program, compare fixed-budget eval
 * results, and record experiment rows in a stable TSV format.
 */

const DEFAULT_RESULT_COLUMNS = Object.freeze(["commit", "metric", "memory_gb", "status", "description"]);
const STATUS = Object.freeze({
  KEEP: "keep",
  DISCARD: "discard",
  CRASH: "crash"
});
const DIRECTIONS = new Set(["minimize", "maximize"]);

function asTrimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeList(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  return value
    .map(asTrimmed)
    .filter(Boolean);
}

function sanitizeCell(value) {
  const cell = String(value ?? "")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\s\s+/g, " ")
    .trim();
  return /^[=+\-@]/.test(cell) ? `'${cell}` : cell;
}

function sanitizeMarkdownText(value) {
  return sanitizeCell(value).replace(/`/g, "'");
}

function parseFiniteNumber(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new TypeError(`${name} must be a finite number`);
  return n;
}

function parseMetricValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMetricFromText(text, metricName = "metric") {
  const name = asTrimmed(metricName) || "metric";
  const pattern = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(name)}\\s*=\\s*([-+]?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?)\\s*(?:\\n|$)`);
  const match = String(text ?? "").match(pattern);
  return match ? parseMetricValue(match[1]) : null;
}

function normalizePathList(value, name) {
  return normalizeList(value, name).map(item => {
    const normalized = item.replace(/\\/g, "/").replace(/\/+/g, "/");
    const parts = normalized.split("/");
    const hasGlob = /[*?[\]{}]/.test(normalized);
    const hasDrive = /^[A-Za-z]:/.test(normalized);
    const isBroad = normalized === "." || normalized === ".." || normalized === "/";
    const escapesRepo = normalized.startsWith("/") || parts.includes("..") || parts.includes(".") || parts.includes("");
    if (hasGlob || hasDrive || isBroad || escapesRepo) {
      throw new TypeError(`${name} must contain narrow repo-relative file paths`);
    }
    return normalized;
  });
}

function normalizeMetric(metric = {}) {
  const name = asTrimmed(metric.name) || "metric";
  const direction = asTrimmed(metric.direction) || "minimize";
  if (!DIRECTIONS.has(direction)) throw new TypeError("metric.direction must be minimize or maximize");
  const improvementEpsilon = metric.improvementEpsilon == null
    ? 0
    : parseFiniteNumber(metric.improvementEpsilon, "metric.improvementEpsilon");
  if (improvementEpsilon < 0) throw new TypeError("metric.improvementEpsilon must be >= 0");
  return { name, direction, improvementEpsilon };
}

function normalizeProductResearchConfig(config = {}) {
  const productName = asTrimmed(config.productName);
  if (!productName) throw new TypeError("productName is required");

  const runTag = asTrimmed(config.runTag);
  if (!runTag) throw new TypeError("runTag is required");

  const editableFiles = normalizePathList(config.editableFiles, "editableFiles");
  if (!editableFiles.length) throw new TypeError("editableFiles must include at least one path");

  const evalCommand = asTrimmed(config.evalCommand);
  if (!evalCommand) throw new TypeError("evalCommand is required");

  const readOnlyFiles = normalizePathList(config.readOnlyFiles || [], "readOnlyFiles");
  const editableSet = new Set(editableFiles);
  const overlappingReadOnly = readOnlyFiles.filter(file => editableSet.has(file));
  if (overlappingReadOnly.length) {
    throw new TypeError(`readOnlyFiles overlap editableFiles: ${overlappingReadOnly.join(", ")}`);
  }
  const contextFiles = normalizePathList(config.contextFiles || [], "contextFiles");
  const guardrails = normalizeList(config.guardrails || [], "guardrails");
  const metric = normalizeMetric(config.metric);
  const branchPrefix = asTrimmed(config.branchPrefix) || "autoresearch/";
  const timeBudgetMinutes = config.timeBudgetMinutes == null
    ? 15
    : parseFiniteNumber(config.timeBudgetMinutes, "timeBudgetMinutes");
  const timeoutMinutes = config.timeoutMinutes == null
    ? Math.max(10, timeBudgetMinutes * 2)
    : parseFiniteNumber(config.timeoutMinutes, "timeoutMinutes");

  if (timeBudgetMinutes <= 0) throw new TypeError("timeBudgetMinutes must be > 0");
  if (timeoutMinutes < timeBudgetMinutes) throw new TypeError("timeoutMinutes must be >= timeBudgetMinutes");

  return {
    productName,
    runTag,
    branchPrefix,
    editableFiles,
    readOnlyFiles,
    contextFiles,
    guardrails,
    evalCommand,
    metric,
    timeBudgetMinutes,
    timeoutMinutes
  };
}

function listLines(items) {
  return items.length ? items.map(item => `- \`${sanitizeMarkdownText(item)}\``).join("\n") : "- None";
}

function renderProductResearchProgram(config = {}) {
  const c = normalizeProductResearchConfig(config);
  const directionLabel = c.metric.direction === "minimize" ? "lower is better" : "higher is better";

  return [
    `# ${sanitizeMarkdownText(c.productName)} Product Research Program`,
    "",
    `Run tag: \`${sanitizeMarkdownText(c.runTag)}\``,
    `Branch: \`${sanitizeMarkdownText(c.branchPrefix + c.runTag)}\``,
    "",
    "## Scope",
    "",
    "You may edit only:",
    listLines(c.editableFiles),
    "",
    "Do not edit:",
    listLines(c.readOnlyFiles),
    "",
    "Read for context before changing code:",
    listLines(c.contextFiles),
    "",
    "## Evaluation",
    "",
    `- Command: \`${sanitizeMarkdownText(c.evalCommand)}\``,
    `- Metric: \`${sanitizeMarkdownText(c.metric.name)}\` (${directionLabel})`,
    `- Fixed eval budget: ${c.timeBudgetMinutes} minutes`,
    `- Timeout: ${c.timeoutMinutes} minutes`,
    "",
    "## Guardrails",
    "",
    listLines(c.guardrails.length ? c.guardrails : [
      "Keep the editable surface narrow and reviewable.",
      "Do not add dependencies unless the human explicitly approves.",
      "Do not weaken auth, tenant isolation, egress policy, or audit logging.",
      "Prefer simpler code when the metric is tied."
    ]),
    "",
    "## Experiment Loop",
    "",
    "1. Record the starting commit and current best metric.",
    "2. Make one focused change inside the editable files.",
    "3. Run the eval command and capture stdout/stderr into a log file.",
    "4. Extract the configured metric and any memory/runtime signal.",
    "5. Append one uncommitted TSV row: `commit`, metric, `memory_gb`, `status`, `description`.",
    "6. Keep the change only when the metric improves, or when the metric ties and the code is materially simpler.",
    "7. Discard crashes, invalid metrics, and changes that regress the metric.",
    "",
    "## Result TSV",
    "",
    `Header: \`${formatExperimentHeader(c.metric.name)}\``
  ].join("\n");
}

function metricDelta(bestMetric, candidateMetric, direction) {
  return direction === "minimize"
    ? bestMetric - candidateMetric
    : candidateMetric - bestMetric;
}

function decideExperimentStatus({
  bestMetric,
  candidateMetric,
  direction = "minimize",
  improvementEpsilon = 0,
  complexityDelta = 0,
  crashed = false
} = {}) {
  if (!DIRECTIONS.has(direction)) throw new TypeError("direction must be minimize or maximize");
  const epsilon = parseFiniteNumber(improvementEpsilon, "improvementEpsilon");
  if (epsilon < 0) throw new TypeError("improvementEpsilon must be >= 0");
  if (crashed) return { status: STATUS.CRASH, improved: false, delta: 0, reason: "crash" };

  const candidate = parseMetricValue(candidateMetric);
  if (candidate == null) return { status: STATUS.CRASH, improved: false, delta: 0, reason: "invalid-candidate-metric" };

  const best = parseMetricValue(bestMetric);
  if (best == null) {
    return { status: STATUS.KEEP, improved: true, delta: 0, reason: "baseline" };
  }

  const delta = metricDelta(best, candidate, direction);
  if (delta > epsilon) return { status: STATUS.KEEP, improved: true, delta, reason: "metric-improved" };
  if (Math.abs(delta) <= epsilon && Number(complexityDelta) < 0) {
    return { status: STATUS.KEEP, improved: true, delta, reason: "metric-tied-and-simpler" };
  }
  return { status: STATUS.DISCARD, improved: false, delta, reason: delta < 0 ? "metric-regressed" : "metric-tied" };
}

function formatExperimentHeader(metricName = "metric") {
  return ["commit", sanitizeCell(metricName) || "metric", "memory_gb", "status", "description"].join("\t");
}

function formatExperimentResult({
  commit = "",
  metricValue,
  memoryGb,
  memoryMb,
  status,
  description = ""
} = {}) {
  if (!Object.values(STATUS).includes(status)) throw new TypeError("status must be keep, discard, or crash");
  const metricNumber = parseMetricValue(metricValue);
  if (metricNumber == null && status !== STATUS.CRASH) {
    throw new TypeError("metricValue must be finite unless status is crash");
  }
  const metric = metricNumber == null ? "0.000000" : metricNumber.toFixed(6);
  const memory = memoryGb == null && memoryMb != null ? Number(memoryMb) / 1024 : Number(memoryGb || 0);
  const memoryText = Number.isFinite(memory) ? memory.toFixed(1) : "0.0";
  return [
    sanitizeCell(commit),
    metric,
    memoryText,
    status,
    sanitizeCell(description)
  ].join("\t");
}

function parseExperimentTsv(text, metricName = "metric") {
  const lines = String(text || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split("\t");
  const metricColumn = header[1] || metricName;
  return lines.slice(1).map(line => {
    const [commit = "", metric, memoryGb = "0", status = "", ...description] = line.split("\t");
    const metricNumber = parseMetricValue(metric);
    return {
      commit,
      [metricColumn]: metricNumber,
      memoryGb: parseMetricValue(memoryGb) ?? 0,
      status,
      description: description.join(" ")
    };
  });
}

module.exports = {
  DEFAULT_RESULT_COLUMNS,
  STATUS,
  normalizeProductResearchConfig,
  renderProductResearchProgram,
  decideExperimentStatus,
  extractMetricFromText,
  formatExperimentHeader,
  formatExperimentResult,
  parseExperimentTsv
};
