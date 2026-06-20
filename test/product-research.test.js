"use strict";
const test = require("node:test");
const assert = require("node:assert");
const {
  STATUS,
  normalizeProductResearchConfig,
  renderProductResearchProgram,
  decideExperimentStatus,
  extractMetricFromText,
  formatExperimentHeader,
  formatExperimentResult,
  parseExperimentTsv
} = require("../src/product-research");
const root = require("..");

test("product research helpers are exported from the package root", () => {
  assert.strictEqual(root.renderProductResearchProgram, renderProductResearchProgram);
  assert.strictEqual(root.decideExperimentStatus, decideExperimentStatus);
  assert.strictEqual(root.extractMetricFromText, extractMetricFromText);
  assert.strictEqual(root.PRODUCT_RESEARCH_STATUS.KEEP, "keep");
});

test("normalizeProductResearchConfig validates and defaults a product research run", () => {
  const config = normalizeProductResearchConfig({
    productName: "A1 Suite Local MAX",
    runTag: "2026-06-20-shell-health",
    editableFiles: [" apps/shell/src/health.ts "],
    readOnlyFiles: ["apps/shell/test/health.test.ts"],
    evalCommand: "npm test --workspace @a1/shell",
    metric: { name: "failures", direction: "minimize" }
  });

  assert.strictEqual(config.branchPrefix, "autoresearch/");
  assert.strictEqual(config.timeBudgetMinutes, 15);
  assert.strictEqual(config.timeoutMinutes, 30);
  assert.deepStrictEqual(config.editableFiles, ["apps/shell/src/health.ts"]);
  assert.deepStrictEqual(config.metric, { name: "failures", direction: "minimize", improvementEpsilon: 0 });
});

test("normalizeProductResearchConfig rejects broad or incomplete runs", () => {
  assert.throws(() => normalizeProductResearchConfig({}), /productName/);
  assert.throws(() => normalizeProductResearchConfig({
    productName: "x",
    runTag: "r",
    editableFiles: [],
    evalCommand: "npm test"
  }), /editableFiles/);
  assert.throws(() => normalizeProductResearchConfig({
    productName: "x",
    runTag: "r",
    editableFiles: ["src/a.js"],
    evalCommand: "npm test",
    metric: { direction: "sideways" }
  }), /metric.direction/);

  for (const path of [".", "..", "src/.", "src/foo/.", "../other-repo/file.js", "/tmp/file.js", "src/*.js", "src/"]) {
    assert.throws(() => normalizeProductResearchConfig({
      productName: "x",
      runTag: "r",
      editableFiles: [path],
      evalCommand: "npm test"
    }), /narrow repo-relative/);
  }

  assert.throws(() => normalizeProductResearchConfig({
    productName: "x",
    runTag: "r",
    editableFiles: ["src/a.js"],
    readOnlyFiles: ["src/a.js"],
    evalCommand: "npm test"
  }), /readOnlyFiles overlap editableFiles/);
});

test("renderProductResearchProgram captures scope, metric, budget, and TSV header", () => {
  const program = renderProductResearchProgram({
    productName: "SBOS-A1-ERP audit scanner",
    runTag: "audit-fixtures",
    editableFiles: ["server/rbac/permissions-audit.js"],
    readOnlyFiles: ["server/rbac/permissions-audit.test.js"],
    contextFiles: ["AGENTS.md"],
    evalCommand: "npm test -- server/rbac/permissions-audit.test.js",
    metric: { name: "orphan_permission_count", direction: "minimize" },
    timeBudgetMinutes: 10
  });

  assert.match(program, /SBOS-A1-ERP audit scanner Product Research Program/);
  assert.match(program, /`server\/rbac\/permissions-audit.js`/);
  assert.match(program, /Do not edit/);
  assert.match(program, /`npm test -- server\/rbac\/permissions-audit.test.js`/);
  assert.match(program, /`orphan_permission_count` \(lower is better\)/);
  assert.match(program, /Fixed eval budget: 10 minutes/);
  assert.match(program, /Header: `commit\torphan_permission_count\tmemory_gb\tstatus\tdescription`/);
});

test("renderProductResearchProgram sanitizes markdown control characters in labels", () => {
  const program = renderProductResearchProgram({
    productName: "A1\nSuite",
    runTag: "tag`x",
    editableFiles: ["src/`danger`.js"],
    evalCommand: "npm test\nrm -rf nope",
    metric: { name: "score`value", direction: "maximize" }
  });

  assert.match(program, /^# A1 Suite Product Research Program/m);
  assert.match(program, /Run tag: `tag'x`/);
  assert.match(program, /- `src\/'danger'\.js`/);
  assert.match(program, /- Command: `npm test rm -rf nope`/);
  assert.match(program, /- Metric: `score'value` \(higher is better\)/);
});

test("decideExperimentStatus keeps baselines, improvements, and simpler ties", () => {
  assert.deepStrictEqual(
    decideExperimentStatus({ bestMetric: undefined, candidateMetric: 4, direction: "minimize" }),
    { status: STATUS.KEEP, improved: true, delta: 0, reason: "baseline" }
  );

  assert.deepStrictEqual(
    decideExperimentStatus({ bestMetric: 10, candidateMetric: 8, direction: "minimize" }),
    { status: STATUS.KEEP, improved: true, delta: 2, reason: "metric-improved" }
  );

  assert.deepStrictEqual(
    decideExperimentStatus({ bestMetric: 0.91, candidateMetric: 0.92, direction: "maximize" }),
    { status: STATUS.KEEP, improved: true, delta: 0.010000000000000009, reason: "metric-improved" }
  );

  assert.deepStrictEqual(
    decideExperimentStatus({ bestMetric: 8, candidateMetric: 8, direction: "minimize", complexityDelta: -12 }),
    { status: STATUS.KEEP, improved: true, delta: 0, reason: "metric-tied-and-simpler" }
  );
});

test("decideExperimentStatus discards regressions and marks crashes", () => {
  assert.deepStrictEqual(
    decideExperimentStatus({ bestMetric: 8, candidateMetric: 9, direction: "minimize" }),
    { status: STATUS.DISCARD, improved: false, delta: -1, reason: "metric-regressed" }
  );

  assert.deepStrictEqual(
    decideExperimentStatus({ bestMetric: 8, candidateMetric: "nope", direction: "minimize" }),
    { status: STATUS.CRASH, improved: false, delta: 0, reason: "invalid-candidate-metric" }
  );

  for (const candidateMetric of ["", null, false, [], true]) {
    assert.deepStrictEqual(
      decideExperimentStatus({ bestMetric: 8, candidateMetric, direction: "minimize" }),
      { status: STATUS.CRASH, improved: false, delta: 0, reason: "invalid-candidate-metric" }
    );
  }

  assert.deepStrictEqual(
    decideExperimentStatus({ bestMetric: 8, candidateMetric: 7, crashed: true }),
    { status: STATUS.CRASH, improved: false, delta: 0, reason: "crash" }
  );
});

test("extractMetricFromText finds explicit scalar metric lines", () => {
  assert.strictEqual(extractMetricFromText("noise\nfailing_checks=12\n", "failing_checks"), 12);
  assert.strictEqual(extractMetricFromText("score = -1.25e2\n", "score"), -125);
  assert.strictEqual(extractMetricFromText("score=not-a-number\n", "score"), null);
  assert.strictEqual(extractMetricFromText("other=4\n", "score"), null);
});

test("format and parse experiment TSV rows", () => {
  const header = formatExperimentHeader("val_bpb");
  const row = formatExperimentResult({
    commit: "abc1234",
    metricValue: 0.9979,
    memoryMb: 45060.2,
    status: "keep",
    description: "baseline\twith newline\nnormalized"
  });

  assert.strictEqual(header, "commit\tval_bpb\tmemory_gb\tstatus\tdescription");
  assert.strictEqual(row, "abc1234\t0.997900\t44.0\tkeep\tbaseline with newline normalized");
  assert.deepStrictEqual(parseExperimentTsv(`${header}\n${row}\n`), [{
    commit: "abc1234",
    val_bpb: 0.9979,
    memoryGb: 44,
    status: "keep",
    description: "baseline with newline normalized"
  }]);
});

test("parseExperimentTsv keeps malformed metrics as null instead of coercing to zero", () => {
  assert.deepStrictEqual(parseExperimentTsv([
    "commit\tfailing_tests\tmemory_gb\tstatus\tdescription",
    "abc1234\t\t0.0\tkeep\tmissing metric",
    "def5678\tnot-a-number\t\tdiscard\tbad metric"
  ].join("\n")), [
    {
      commit: "abc1234",
      failing_tests: null,
      memoryGb: 0,
      status: "keep",
      description: "missing metric"
    },
    {
      commit: "def5678",
      failing_tests: null,
      memoryGb: 0,
      status: "discard",
      description: "bad metric"
    }
  ]);
});

test("formatExperimentResult rejects invalid non-crash metrics and neutralizes formula cells", () => {
  assert.throws(() => formatExperimentResult({
    commit: "abc1234",
    status: "keep",
    description: "missing metric"
  }), /metricValue/);

  for (const metricValue of ["", "not-a-number", null, false, [], true]) {
    assert.throws(() => formatExperimentResult({
      commit: "abc1234",
      metricValue,
      status: "discard",
      description: "invalid metric"
    }), /metricValue/);
  }

  assert.strictEqual(formatExperimentResult({
    commit: "=abc1234",
    metricValue: "not-a-number",
    status: "crash",
    description: "@formula"
  }), "'=abc1234\t0.000000\t0.0\tcrash\t'@formula");
});
