"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runProductResearchCli } = require("..");

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.strictEqual(result.status, 0, `${command} ${args.join(" ")} failed:\n${result.stderr}`);
  return result;
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function makeRepo() {
  const repo = mkdtempSync(path.join(os.tmpdir(), "a1-karpathy-runner-"));
  mkdirSync(path.join(repo, "evals", "karpathy"), { recursive: true });
  mkdirSync(path.join(repo, "scripts"), { recursive: true });
  mkdirSync(path.join(repo, "src"), { recursive: true });

  writeFileSync(path.join(repo, ".gitignore"), "evals/karpathy/results/\n");
  writeFileSync(path.join(repo, "README.md"), "# Test product\n");
  writeFileSync(path.join(repo, "package.json"), "{\"name\":\"test-product\"}\n");
  mkdirSync(path.join(repo, "docs"), { recursive: true });
  writeFileSync(path.join(repo, "src", "editable.txt"), "editable\n");
  writeFileSync(path.join(repo, "docs", "out.txt"), "out of scope\n");
  writeFileSync(path.join(repo, "scripts", "metric.mjs"), "console.log('failing_checks=7'); console.log('memory_gb=1.25'); process.exit(1);\n");
  writeFileSync(path.join(repo, "scripts", "epsilon.mjs"), "console.log('score=10.005');\n");
  writeFileSync(path.join(repo, "scripts", "default-metric.mjs"), "console.log('metric=42');\n");
  writeFileSync(path.join(repo, "scripts", "verbose.mjs"), "console.log('x'.repeat(2 * 1024 * 1024)); console.log('metric=5');\n");
  writeFileSync(path.join(repo, "scripts", "no-metric.mjs"), "console.error('missing metric'); process.exit(1);\n");
  writeFileSync(path.join(repo, "scripts", "touch-out-of-scope.mjs"), "import { writeFileSync } from 'node:fs'; writeFileSync('docs/generated.txt', 'changed by eval\\n'); console.log('failing_checks=0');\n");
  writeJson(path.join(repo, "evals", "karpathy", "metric-check.json"), {
    id: "metric-check",
    productName: "Runner test product",
    runTag: "runner-test",
    branchPrefix: "karpathy/",
    editableFiles: ["src/editable.txt", "src/new.txt"],
    readOnlyFiles: ["scripts/metric.mjs"],
    contextFiles: ["README.md", "package.json"],
    guardrails: ["Keep the test narrow."],
    eval: {
      command: "node",
      args: ["scripts/metric.mjs"],
      metric: { name: "failing_checks", direction: "minimize" },
      successMetricValue: 0,
      failureMetricValue: 1,
      timeBudgetMinutes: 1,
      timeoutMinutes: 2
    }
  });
  writeJson(path.join(repo, "evals", "karpathy", "missing-metric.json"), {
    id: "missing-metric",
    productName: "Runner missing metric test",
    runTag: "missing-metric-test",
    branchPrefix: "karpathy/",
    editableFiles: ["src/editable.txt"],
    readOnlyFiles: ["scripts/no-metric.mjs"],
    contextFiles: ["README.md", "package.json"],
    guardrails: ["Keep the test narrow."],
    eval: {
      command: "node",
      args: ["scripts/no-metric.mjs"],
      metric: { name: "failing_checks", direction: "minimize" },
      successMetricValue: 0,
      failureMetricValue: 1,
      timeBudgetMinutes: 1,
      timeoutMinutes: 2
    }
  });
  writeJson(path.join(repo, "evals", "karpathy", "default-metric.json"), {
    id: "default-metric",
    productName: "Runner default metric test",
    runTag: "default-metric-test",
    branchPrefix: "karpathy/",
    editableFiles: ["src/editable.txt"],
    readOnlyFiles: ["scripts/default-metric.mjs"],
    contextFiles: ["README.md", "package.json"],
    guardrails: ["Keep the test narrow."],
    eval: {
      command: "node",
      args: ["scripts/default-metric.mjs"],
      successMetricValue: 0,
      failureMetricValue: 1,
      timeBudgetMinutes: 1
    }
  });
  writeJson(path.join(repo, "evals", "karpathy", "verbose-default.json"), {
    id: "verbose-default",
    productName: "Runner verbose output test",
    runTag: "verbose-output-test",
    branchPrefix: "karpathy/",
    editableFiles: ["src/editable.txt"],
    readOnlyFiles: ["scripts/verbose.mjs"],
    contextFiles: ["README.md", "package.json"],
    guardrails: ["Keep the test narrow."],
    eval: {
      command: "node",
      args: ["scripts/verbose.mjs"],
      successMetricValue: 0,
      failureMetricValue: 1,
      timeBudgetMinutes: 1
    }
  });
  writeJson(path.join(repo, "evals", "karpathy", "overlap-scope.json"), {
    id: "overlap-scope",
    productName: "Runner overlap scope test",
    runTag: "overlap-scope-test",
    branchPrefix: "karpathy/",
    editableFiles: ["src/editable.txt"],
    readOnlyFiles: ["src/editable.txt"],
    contextFiles: ["README.md", "package.json"],
    guardrails: ["Keep the test narrow."],
    eval: {
      command: "node",
      args: ["scripts/default-metric.mjs"],
      metric: { name: "metric", direction: "minimize" },
      successMetricValue: 0,
      failureMetricValue: 1,
      timeBudgetMinutes: 1
    }
  });
  writeJson(path.join(repo, "evals", "karpathy", "epsilon-check.json"), {
    id: "epsilon-check",
    productName: "Runner epsilon test",
    runTag: "epsilon-test",
    branchPrefix: "karpathy/",
    editableFiles: ["src/editable.txt"],
    readOnlyFiles: ["scripts/epsilon.mjs"],
    contextFiles: ["README.md", "package.json"],
    guardrails: ["Keep the test narrow."],
    eval: {
      command: "node",
      args: ["scripts/epsilon.mjs"],
      metric: { name: "score", direction: "maximize", improvementEpsilon: 0.01 },
      successMetricValue: 0,
      failureMetricValue: 1,
      timeBudgetMinutes: 1,
      timeoutMinutes: 2
    }
  });
  writeJson(path.join(repo, "evals", "karpathy", "readonly-readme.json"), {
    id: "readonly-readme",
    productName: "Runner readonly README test",
    runTag: "readonly-readme-test",
    branchPrefix: "karpathy/",
    editableFiles: ["src/editable.txt"],
    readOnlyFiles: ["README.md"],
    contextFiles: ["package.json"],
    guardrails: ["Keep the test narrow."],
    eval: {
      command: "node",
      args: ["scripts/epsilon.mjs"],
      metric: { name: "score", direction: "maximize" },
      successMetricValue: 0,
      failureMetricValue: 1,
      timeBudgetMinutes: 1,
      timeoutMinutes: 2
    }
  });
  writeJson(path.join(repo, "evals", "karpathy", "bad-fallback.json"), {
    id: "bad-fallback",
    productName: "Runner bad fallback test",
    runTag: "bad-fallback-test",
    branchPrefix: "karpathy/",
    editableFiles: ["src/editable.txt"],
    readOnlyFiles: ["scripts/no-metric.mjs"],
    contextFiles: ["README.md", "package.json"],
    guardrails: ["Keep the test narrow."],
    eval: {
      command: "node",
      args: ["scripts/no-metric.mjs"],
      metric: { name: "failing_checks", direction: "minimize" },
      successMetricValue: "",
      failureMetricValue: null,
      allowFailureMetricFallback: true,
      timeBudgetMinutes: 1,
      timeoutMinutes: 2
    }
  });
  writeJson(path.join(repo, "evals", "karpathy", "touch-out-of-scope.json"), {
    id: "touch-out-of-scope",
    productName: "Runner scope mutation test",
    runTag: "scope-mutation-test",
    branchPrefix: "karpathy/",
    editableFiles: ["src/editable.txt"],
    readOnlyFiles: ["scripts/touch-out-of-scope.mjs"],
    contextFiles: ["README.md", "package.json"],
    guardrails: ["Keep the test narrow."],
    eval: {
      command: "node",
      args: ["scripts/touch-out-of-scope.mjs"],
      metric: { name: "failing_checks", direction: "minimize" },
      successMetricValue: 0,
      failureMetricValue: 1,
      timeBudgetMinutes: 1,
      timeoutMinutes: 2
    }
  });

  run("git", ["init"], repo);
  run("git", ["config", "user.email", "codex@example.test"], repo);
  run("git", ["config", "user.name", "Codex Test"], repo);
  run("git", ["add", "."], repo);
  run("git", ["commit", "-m", "initial"], repo);
  return repo;
}

async function invoke(repo, argv) {
  const stdout = [];
  const stderr = [];
  const code = await runProductResearchCli({
    repoRoot: repo,
    argv,
    env: process.env,
    stdout: line => stdout.push(line),
    stderr: line => stderr.push(line)
  });
  return { code, stdout, stderr };
}

test("runProductResearchCli renders programs and records extracted metrics", async () => {
  const repo = makeRepo();
  try {
    const program = await invoke(repo, ["--program", "metric-check"]);
    assert.strictEqual(program.code, 0);
    assert.match(program.stdout.join("\n"), /Metric: `failing_checks`/);

    const result = await invoke(repo, ["--run", "metric-check"]);
    assert.strictEqual(result.code, 1);
    assert.deepStrictEqual(result.stderr, []);
    assert.match(result.stdout[0], /commit\tfailing_checks\tmemory_gb\tstatus\tdescription/);
    assert.match(result.stdout[1], /\t7\.000000\t1\.3\tkeep\tmetric-check baseline/);

    const tsv = readFileSync(path.join(repo, "evals", "karpathy", "results", "metric-check.tsv"), "utf8");
    assert.match(tsv, /failing_checks/);
    assert.match(tsv, /\t7\.000000\t/);
    assert.match(tsv, /\t1\.3\t/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("runProductResearchCli blocks harness dirt by default but allows bootstrap-only files", async () => {
  const repo = makeRepo();
  try {
    writeFileSync(path.join(repo, "README.md"), "# Test product\n\nBootstrap docs changed.\n");

    const strict = await invoke(repo, ["--run", "epsilon-check"]);
    assert.strictEqual(strict.code, 1);
    assert.match(strict.stderr.join("\n"), /README\.md/);
    assert.strictEqual(existsSync(path.join(repo, "evals", "karpathy", "results", "epsilon-check.tsv")), false);

    const bootstrap = await invoke(repo, ["--run", "epsilon-check", "--allow-harness-dirty"]);
    assert.strictEqual(bootstrap.code, 0);
    assert.match(bootstrap.stdout[1], /\t10\.005000\t0\.0\tkeep\tepsilon-check baseline/);

    writeFileSync(path.join(repo, "src", "unrelated.txt"), "not allowed\n");
    const unrelated = await invoke(repo, ["--run", "epsilon-check", "--allow-harness-dirty"]);
    assert.strictEqual(unrelated.code, 1);
    assert.match(unrelated.stderr.join("\n"), /src\/unrelated\.txt/);

    rmSync(path.join(repo, "src", "unrelated.txt"), { force: true });
    writeFileSync(path.join(repo, "scripts", "metric.mjs"), "console.log('failing_checks=0');\n");
    const readOnlyDirty = await invoke(repo, ["--run", "metric-check", "--allow-harness-dirty"]);
    assert.strictEqual(readOnlyDirty.code, 1);
    assert.match(readOnlyDirty.stderr.join("\n"), /scripts\/metric\.mjs/);

    run("git", ["checkout", "--", "scripts/metric.mjs"], repo);
    const readOnlyBootstrap = await invoke(repo, ["--run", "readonly-readme", "--allow-harness-dirty"]);
    assert.strictEqual(readOnlyBootstrap.code, 1);
    assert.match(readOnlyBootstrap.stderr.join("\n"), /README\.md/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("runProductResearchCli blocks staged renames from out-of-scope paths", async () => {
  const repo = makeRepo();
  try {
    run("git", ["mv", "docs/out.txt", "src/new.txt"], repo);
    const result = await invoke(repo, ["--run", "metric-check", "--allow-harness-dirty"]);
    assert.strictEqual(result.code, 1);
    assert.match(result.stderr.join("\n"), /docs\/out\.txt -> src\/new\.txt/);
    assert.strictEqual(existsSync(path.join(repo, "evals", "karpathy", "results", "metric-check.tsv")), false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("runProductResearchCli rejects invalid best metrics before logging", async () => {
  const repo = makeRepo();
  try {
    const result = await invoke(repo, ["--run", "metric-check", "--best", "nope"]);
    assert.strictEqual(result.code, 1);
    assert.match(result.stderr.join("\n"), /--best requires a finite metric value/);
    assert.strictEqual(existsSync(path.join(repo, "evals", "karpathy", "results", "metric-check.tsv")), false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("runProductResearchCli records failed missing-metric runs as crashes", async () => {
  const repo = makeRepo();
  try {
    const result = await invoke(repo, ["--run", "missing-metric"]);
    assert.strictEqual(result.code, 1);
    assert.deepStrictEqual(result.stderr, []);
    assert.match(result.stdout[1], /\t0\.000000\t0\.0\tcrash\tmissing-metric crash/);

    const tsv = readFileSync(path.join(repo, "evals", "karpathy", "results", "missing-metric.tsv"), "utf8");
    assert.match(tsv, /crash\tmissing-metric crash/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("runProductResearchCli uses normalized metric defaults for headers and extraction", async () => {
  const repo = makeRepo();
  try {
    const program = await invoke(repo, ["--program", "default-metric"]);
    assert.strictEqual(program.code, 0);
    assert.match(program.stdout.join("\n"), /Metric: `metric`/);
    assert.match(program.stdout.join("\n"), /Timeout: 10 minutes/);

    const result = await invoke(repo, ["--run", "default-metric"]);
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(result.stderr, []);
    assert.match(result.stdout[0], /^commit\tmetric\tmemory_gb\tstatus\tdescription$/);
    assert.match(result.stdout[1], /\t42\.000000\t0\.0\tkeep\tdefault-metric baseline/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("runProductResearchCli captures verbose eval logs without default buffer crashes", async () => {
  const repo = makeRepo();
  try {
    const result = await invoke(repo, ["--run", "verbose-default"]);
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(result.stderr, []);
    assert.match(result.stdout[1], /\t5\.000000\t0\.0\tkeep\tverbose-default baseline/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("runProductResearchCli rejects overlapping editable and read-only scopes", async () => {
  const repo = makeRepo();
  try {
    const result = await invoke(repo, ["--run", "overlap-scope"]);
    assert.strictEqual(result.code, 1);
    assert.match(result.stderr.join("\n"), /readOnlyFiles overlap editableFiles: src\/editable\.txt/);
    assert.strictEqual(existsSync(path.join(repo, "evals", "karpathy", "results", "overlap-scope.tsv")), false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("runProductResearchCli honors metric improvement epsilon", async () => {
  const repo = makeRepo();
  try {
    const result = await invoke(repo, ["--run", "epsilon-check", "--best", "10"]);
    assert.strictEqual(result.code, 0);
    assert.match(result.stdout[1], /\t10\.005000\t0\.0\tdiscard\tepsilon-check metric-tied/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("runProductResearchCli fails closed outside git repos", async () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), "a1-karpathy-nongit-"));
  try {
    mkdirSync(path.join(repo, "evals", "karpathy"), { recursive: true });
    mkdirSync(path.join(repo, "scripts"), { recursive: true });
    mkdirSync(path.join(repo, "src"), { recursive: true });
    writeFileSync(path.join(repo, "scripts", "metric.mjs"), "console.log('failing_checks=0');\n");
    writeJson(path.join(repo, "evals", "karpathy", "metric-check.json"), {
      id: "metric-check",
      productName: "Non git product",
      runTag: "nongit",
      editableFiles: ["src/editable.txt"],
      readOnlyFiles: ["scripts/metric.mjs"],
      eval: {
        command: "node",
        args: ["scripts/metric.mjs"],
        metric: { name: "failing_checks", direction: "minimize" },
        successMetricValue: 0,
        timeBudgetMinutes: 1,
        timeoutMinutes: 2
      }
    });

    const result = await invoke(repo, ["--run", "metric-check"]);
    assert.strictEqual(result.code, 1);
    assert.match(result.stderr.join("\n"), /Cannot inspect git status/);
    assert.strictEqual(existsSync(path.join(repo, "evals", "karpathy", "results", "metric-check.tsv")), false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("runProductResearchCli rejects invalid fallback metrics instead of coercing to zero", async () => {
  const repo = makeRepo();
  try {
    const result = await invoke(repo, ["--run", "bad-fallback"]);
    assert.strictEqual(result.code, 1);
    assert.deepStrictEqual(result.stderr, []);
    assert.match(result.stdout[1], /\t0\.000000\t0\.0\tcrash\tbad-fallback crash/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("runProductResearchCli rechecks scope after eval before logging results", async () => {
  const repo = makeRepo();
  try {
    const result = await invoke(repo, ["--run", "touch-out-of-scope"]);
    assert.strictEqual(result.code, 1);
    assert.match(result.stderr.join("\n"), /docs\/generated\.txt/);
    assert.strictEqual(existsSync(path.join(repo, "evals", "karpathy", "results", "touch-out-of-scope.tsv")), false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("runProductResearchCli refuses to overwrite TSV history on header mismatch", async () => {
  const repo = makeRepo();
  try {
    mkdirSync(path.join(repo, "evals", "karpathy", "results"), { recursive: true });
    writeFileSync(path.join(repo, "evals", "karpathy", "results", "metric-check.tsv"), "commit\told_metric\tmemory_gb\tstatus\tdescription\nabc\t1\t0\tkeep\told\n");
    const result = await invoke(repo, ["--run", "metric-check"]);
    assert.strictEqual(result.code, 1);
    assert.match(result.stderr.join("\n"), /header mismatch/);
    const tsv = readFileSync(path.join(repo, "evals", "karpathy", "results", "metric-check.tsv"), "utf8");
    assert.match(tsv, /old_metric/);
    assert.match(tsv, /old/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
