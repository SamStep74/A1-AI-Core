# @a1/ai

Shared, **framework-agnostic** AI provider core for the **A1** product family
(Suite, HayHashvapah, CRM, Platform, …). One source of truth so every product
gets the same OpenRouter integration, model policy, local settings store, and
the opt-in Open Notebook connector — no per-repo drift.

This package performs **no LLM calls itself** and imports **no product config**.
Every capability that touches the outside world (HTTP/egress) or the filesystem
(the data dir) is **injected** by the host product.

## What it provides

| Area | Export | Notes |
|------|--------|-------|
| Model menu | `createModelCatalog({ safeFetch, isEgressAllowed, openrouter })` → `listModels()` | Live OpenRouter `/models`; degrades to `FALLBACK_MODELS` (never throws) when egress is blocked or the call fails. |
| Model policy | `resolveModelForRequest(policy, { aspect, module })` | Pure precedence: **module → aspect → default → "" (auto)**. |
| Local settings | `createSettingsStore({ resolveDataDir, modelKeys, defaultModels })` | `0600` JSON: OpenRouter key + per-aspect model policy + Open Notebook connector. `redactedForClient()` strips secrets to `*Set` booleans. |
| Open Notebook | `createOpenNotebook({ safeFetch })` → `isEnabled()` / `search()` | Opt-in, egress-gated, **non-throwing** (`[]` on any failure). Results normalized to the common RAG shape. |
| Supplemental | `normalizeSupplementalSources(rows)` | Advisory-only ranking/dedupe/cap. **Never** treat as authoritative citations. |
| Product research | `renderProductResearchProgram()` / `decideExperimentStatus()` / TSV helpers | Karpathy-style narrow agent/eval loop primitives for product repos. Pure helpers only; no git, shell, network, or filesystem side effects. |

## Consuming it (per product)

```js
const { createAi } = require("@a1/ai");

const ai = createAi({
  safeFetch: config.safeFetch,                        // (url, options, env) => Promise<Response>, egress-gated
  isEgressAllowed: config.isOpenRouterEgressAllowed,  // (env) => boolean
  openrouter: config.openrouter,                      // { modelsUrl, referer, title }
  resolveDataDir: config.resolveDataDir,              // () => string (dir for ai-settings.json)
  defaultModels: config.aiModels                      // { default, copilot, transform, finance, crm, docs }
});

await ai.listModels({ apiKey });                      // onboarding model menu
ai.settings.updateSettings({ openrouterApiKey, models, openNotebook });
const policy = ai.settings.resolveModelPolicy();
const model  = ai.resolveModelForRequest(policy, { aspect: "copilot" });
const extra  = await ai.openNotebook.search(question, { settings: ai.settings.getSettings() });
const shown  = ai.normalizeSupplementalSources(extra);
```

## Product research harness

For agent-driven product work, keep the Karpathy-style loop narrow:

- humans define the `program.md`-style instructions and editable surface
- agents edit only the listed files
- evals run on a fixed budget with one explicit metric
- result rows stay in an uncommitted TSV; evals may also print
  `memory_gb=N` or `memory_mb=N` for the TSV memory column
- keep changes only when the metric improves, or ties with materially simpler code

```js
const {
  renderProductResearchProgram,
  decideExperimentStatus,
  formatExperimentHeader,
  formatExperimentResult,
  runProductResearchCli
} = require("@a1/ai");

const program = renderProductResearchProgram({
  productName: "A1 Suite Local MAX shell health",
  runTag: "2026-06-20-shell-health",
  editableFiles: ["apps/shell/src/health.ts"],
  readOnlyFiles: ["apps/shell/test/health.test.ts"],
  contextFiles: ["README.md", "deploy/README.md"],
  evalCommand: "npm test --workspace @a1/shell",
  metric: { name: "failing_tests", direction: "minimize" },
  timeBudgetMinutes: 10
});

const outcome = decideExperimentStatus({
  bestMetric: 2,
  candidateMetric: 0,
  direction: "minimize"
});

const header = formatExperimentHeader("failing_tests");
const row = formatExperimentResult({
  commit: "abc1234",
  metricValue: 0,
  memoryGb: 1.2,
  status: outcome.status,
  description: "fix shell health route contract"
});

// Product repos use this from a tiny scripts/karpathy-eval.mjs shim.
runProductResearchCli({ repoRoot: process.cwd(), argv: ["--list"] })
  .then(exitCode => { process.exitCode = exitCode; });
```

This repo also pins the shared runner contract with its own eval lane:

```
npm run karpathy:list
npm run karpathy:program -- product-research-core-contract
npm run karpathy:run -- product-research-core-contract
```

See [KARPATHY_ROLLOUT.md](./KARPATHY_ROLLOUT.md) for the current attached-repo
map and deferred repo gates.

Initial rollout targets:

| Owner | Repo | First narrow slice |
|------|------|--------------------|
| `SamStep74` | `A1-AI-Core` | Shared product research primitives and tests. |
| `SamStep74` | `A1-Suite-Local-MAX` | Attach the harness to one deterministic ERP or shell health eval. |
| `SamStep74` | `A1-Platform-MAX` | Attach the harness to validation-helper fixture evals. |
| local product | `hayreel-landing` | Attach the harness to trilingual locale-message parity. |
| `SamStep74` | `SBOS-A1-ERP` | Attach the harness to role/audit scanner fixture evals after the dirty local worktree is reconciled. |
| `Armosphera` | `A1-Suite-Local-MAX`, `A1-Suite-Local-ANT`, `SBOS-A1-ERP`, `A1-AI-ERP-SBOS-MSTUDIO-sovereign` | Consume the same shared harness from the mirrored/private products; keep editable surfaces product-local. |

Install via a local path or git (no public registry needed — sovereign/local-first):

```
npm install file:../A1-AI-Core      # sibling checkout
# or
npm install git+https://github.com/SamStep74/A1-AI-Core.git
```

## Security / sovereignty contract

- **Egress stays the host product's responsibility.** This package only calls the
  `safeFetch`/`isEgressAllowed` you inject — it cannot reach the network on its own.
  Keep your egress **deny-until-listed**; loopback (local RAG/embeddings) stays allowed.
- **Secrets never leave raw.** The OpenRouter key + Open Notebook key live only in the
  local `0600` settings file; send `redactedForClient()` to any browser.
- **Open Notebook is opt-in + non-authoritative.** Disabled unless configured; its hits
  are advisory and must never satisfy a required/authoritative citation in the host app.

## Test

```
npm test        # node --test, no dependencies
```

Pure Node, no runtime dependencies. Requires Node ≥ 22.5.
