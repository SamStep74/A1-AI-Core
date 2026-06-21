# Karpathy-Style Product Research Rollout

This is the A1 product-family rollout map for the Karpathy-style research loop:
small editable surface, fixed eval command, scalar metric, optional
`memory_gb=N` / `memory_mb=N` output, and explicit keep/discard/crash result
logging.

## Upstream Pattern

This rollout follows Karpathy's `autoresearch` shape: encode the agent-facing
program in Markdown, keep each experiment's editable surface deliberately small,
run a fixed eval with one comparable scalar metric, log TSV results with
`commit`, metric, memory, `keep`/`discard`/`crash`, and leave result logs
uncommitted. For A1 product repos, model-training metrics become product safety
or contract metrics such as `failing_checks`, while the loop mechanics stay the
same.

## Shared Core

`@a1/ai` owns the product research primitives:

- `renderProductResearchProgram()` renders the agent-facing program.
- `normalizeProductResearchConfig()` rejects broad or unsafe path scopes.
- `decideExperimentStatus()` compares scalar eval results.
- `extractMetricFromText()` parses explicit `metric_name=N` eval output.
- `formatExperimentHeader()`, `formatExperimentResult()`, and
  `parseExperimentTsv()` keep result rows stable and spreadsheet-safe.
- `runProductResearchCli()` runs the local product eval CLI from a host repo.

The low-level helper layer in `src/product-research.js` remains pure. The
runner lives separately in `src/product-research-runner.js`, so products do not
copy git/shell/result-log logic. Product repos own their local eval definitions
and a tiny `scripts/karpathy-eval.mjs` shim that loads `@a1/ai`.
The core repo pins this contract with `product-research-core-contract`, which
keeps the helper and runner suites passing as a first-class eval lane.

## Attached Product Repos

| Repo | Eval lane | Editable surface | Eval command | Status |
| --- | --- | --- | --- | --- |
| `A1-AI-Core` | `product-research-core-contract` | `src/product-research.js`, `src/product-research-runner.js`, `index.js` | `node scripts/check-product-research-core-contract.mjs` | Wired and locally passing |
| `A1-Suite-Local-MAX` | `shell-health` | `apps/shell/src/app/api/health/route.ts` | `node_modules/.bin/vitest run --root . apps/shell/test/unit/shell-health-route.test.ts` | Wired and locally passing |
| `A1-Platform-MAX` | `validate` | `src/lib/validate.ts` | `node_modules/.bin/vitest run test/unit/validate.test.ts` | Wired and locally passing |
| `hayreel-landing` | `locale-message-parity` | `messages/hy.json`, `messages/en.json`, `messages/ru.json` | `node scripts/check-message-parity.mjs` | Wired and locally passing |
| `A1-HH-Android` | `webview-shell-contract` | `app/src/main/java/com/a1smb/hayhashvapah/MainActivity.kt` | `node scripts/check-webview-shell.mjs` | Wired and locally passing |
| `HayHashvapah-iOS-iPadOS-macOS` | `prompt-safety-contract` | `HayHashvapah/Config/ArmenianAccountantPrompt.swift` | `node scripts/check-prompt-safety.mjs` | Wired and locally passing |
| `Samrek-Android` | `android-runtime-config-contract` | `samples/CameraAccessAndroid/**` runtime config files | `node scripts/check-android-runtime-config.mjs` | Wired and locally passing |
| `SamRek-iOS-iPadOS` | `ios-runtime-config-contract` | `samples/CameraAccess/CameraAccess/**` runtime config files | `node scripts/check-ios-runtime-config.mjs` | Wired and locally passing |
| `A1-SMB-CRM-HY-MAX` | `lead-source-read-contract` | `src/modules/integrations/lead-source-routes.ts` | `node scripts/check-lead-source-read-contract.mjs` | Wired and locally passing |
| `A1-Localization-AM` | `vat-return-contract` | `src/vatReturn.js` | `node scripts/check-vat-return-contract.mjs` | Wired and locally passing |
| `A1-Localization-RU` | `vat-einvoice-contract` | `src/vat.js`, `src/einvoice.js` | `node scripts/check-vat-einvoice-contract.mjs` | Wired and locally passing |
| `A1-SMB-CRM-HY` | `operator-checklist-contract` | `lib/integrationOperatorChecklistHandlers.js` | `node scripts/check-operator-checklist-contract.mjs` | Wired and locally passing |
| `A1-Suite-Local` | `production-readiness-gate` | `server/app.js` | `node scripts/check-production-readiness-gate.mjs` | Focused eval passing; full repo `npm test` currently red outside this lane |
| `a1-suite-local-max-preview` | `inventory-telegram-audit-route` | `apps/inventory/src/app/api/erp/notifications/audit-events/route.ts` | `node scripts/check-inventory-telegram-audit-route.mjs` | Wired and locally passing |
| `a1-suite-local-extended` | `crm-tube-webhook-contract` | `server/crm-tube/sync.js` | `node scripts/check-crm-tube-webhook-contract.mjs` | Wired and locally passing |
| `A1-Suite-Local-ui-migration` | `suite-route-contract` | `web/src/router/appIds.ts`, `web/src/suite-routes.js`, `server/app.js`, `server/db.js` | `node scripts/check-suite-route-contract.mjs` | Wired and locally passing; full repo `npm test` green after rebuilding ignored `public/` bundle |
| `A1-SMB-HH-HY-MAX` | `safe-redirect-contract` | `src/lib/safe-redirect.ts` | `node scripts/check-safe-redirect-contract.mjs` | Wired from clean `A1-SMB-HH-HY-MAX-main-codex` main worktree and locally passing |
| `A1-SMB-HH-HY` | `hayhashvapah-accounting-api-contract` | `server.js`, fiscal shared modules, `archive.js`, `lib/store.js`, `lib/validate.js` | `node scripts/check-hayhashvapah-accounting-api-contract.mjs` | Wired from clean `A1-SMB-HH-HY-pr19-followup` worktree and locally passing |
| `A1-Platform` | `platform-product-env-contract` | `src/product-env.js` | `node scripts/check-platform-product-env-contract.mjs` | Wired after fast-forwarding `codex/studio-env-alias-compat` and locally passing |
| `A1-ERP-HY` | `rbac-catalog-contract` | `server/rbac/permissions.js`, `server/rbac/matrix.js`, `server/rbac/roleMatrix.js`, `server/rbac/roles.js` | `node scripts/check-rbac-catalog-contract.mjs` | Wired from clean `.claude/worktrees/rbac-catalog` branch and focused eval passing; full `npm test` is red outside this lane with 950/958 passing |
| `A1-SMB-CRM-HY-MAX-web` | `integrations-admin-bootstrap-contract` | `src/lib/api/integrations.ts` | `node scripts/check-integrations-admin-bootstrap-contract.mjs` | Newly cloned from SamStep74, localStorage/browser-storage, storage-recovery, unavailable-storage logout, and SSR no-window auth regressions fixed, focused 8-test eval plus `npm test` and `npm run typecheck` passing |
| `xai-voice-agent` | `xai-realtime-cli-contract` | `xai_voice_agent.py` | `node scripts/check-xai-realtime-cli-contract.mjs` | Newly cloned from SamStep74; focused Python compile plus AST-backed realtime/audio/auth contract eval passing |
| `Aistudio` | `aistudio-shell-contract` | `src/App.tsx` | `node scripts/check-aistudio-shell-contract.mjs` | Newly cloned from SamStep74; empty shell replaced with buildable AI Studio operational shell; focused eval plus `npm run lint` and `npm run build` passing |
| `Simon` | `marketplace-seed-contract` | Swift, Android, and backend marketplace seed/catalog files | `node scripts/check-marketplace-seed-contract.mjs` | Clean main checkout; static marketplace seed contract attached for category taxonomy, anchor providers, exact-address hiding, and secret sentinels; focused eval passing and reviewed |
| `samstep` | `termux-bootstrap-contract` | `README.md`, `bootstrap.sh`, `start-services` | `node scripts/check-termux-bootstrap-contract.mjs` | Clean master checkout; static Termux/Oppo SSH bootstrap contract attached for runtime guard, SSH permissions, boot restart behavior, docs coverage, symlink-safe repo secret scan, and pipe-to-shell sentinels; focused eval passing and reviewed |
| `SamRek` | `publishable-runtime-config` | `.gitignore`, `README.md`, local runtime-secret paths removed from tracking | `node scripts/check-publishable-runtime-config.mjs` | Clean main checkout; tracked private runtime bundles and iOS `Secrets.swift` removed from the publishable tree while preserved locally as ignored files; focused eval passing, repeat runner verified, and reviewed |
| `Armosphera/A1-AI-ERP-SBOS-MSTUDIO-sovereign` | `sovereignty-contract` | `README.md`, `docs/DEPLOY.md`, `docker-compose.yml`, `.env.example` | `node scripts/check-sovereignty-contract.mjs` | Private Armosphera main checkout cloned via keyring HTTPS auth; sovereignty contract attached for air-gapped docs, egress-off env/compose defaults on every service, generated-secret requirements, and local-only deployment posture; focused eval, compose config, and review passing |
| `Armosphera/SBOS-A1-ERP` | `open-core-boundary-contract` | `.gitignore`, `README.md`, `docs/SBOS_VS_A1_ERP_HY.md`, `server/l10n-am/einvoice/einvoice.js` | `node scripts/check-open-core-boundary-contract.mjs` | Private Armosphera main checkout cloned via keyring HTTPS auth; open-core boundary contract attached for tracked/untracked source brand scans, key-shaped secret sentinels, env-file tracking guard, stable e-invoice URN exception, and bootstrap-only harness-dirty logging; focused eval, full Node test suite, and review passing |
| `Armosphera/A1-Suite-Local-MAX` | `shell-health` | `apps/shell/src/app/api/health/route.ts` | `node_modules/.bin/vitest run --root . apps/shell/test/unit/shell-health-route.test.ts` | Private Armosphera main checkout cloned via keyring HTTPS auth; shell health lane attached with explicit `@a1/ai` file dependency, npm aliases, ignored result logs, stable health fixture, focused eval, shell unit suite, lint/typecheck, and review passing |
| `Armosphera/A1-Localization-AM` | `vat-return-contract` | `src/vatReturn.js` | `node scripts/check-vat-return-contract.mjs` | Public Armosphera main checkout cloned via keyring HTTPS auth; Armenian VAT-return lane attached with temp-root TAP validation, required test-title guard, ignored result logs, focused eval, full Node test suite, and review passing |
| `Armosphera/A1-Localization-RU` | `vat-einvoice-contract` | `src/vat.js`, `src/einvoice.js` | `node scripts/check-vat-einvoice-contract.mjs` | Public Armosphera main checkout cloned via keyring HTTPS auth; Russian VAT/e-invoice lane attached with temp-root TAP validation, 2026/2025 rate and no-I/O seam guards, focused eval, full Node test suite, and review passing |
| `Armosphera/A1-Suite-Local-ANT` | `egress-policy-contract` | `server/config.js` | `node scripts/check-egress-policy-contract.mjs` | Private Armosphera main checkout cloned via keyring HTTPS auth; sovereignty egress lane attached with explicit `@a1/ai` file dependency, npm aliases, temp-root TAP validation over config/OpenRouter/Open Notebook adapter tests, ignored result logs, focused 37-test eval, and review passing; full `npm test` currently red before dependency install with missing `fastify`/unrelated UI helper path failures outside this lane |
| `Armosphera/autoresearch-sboss` | `invoice-extraction-autoresearch` | `workflow.py` | `python3 eval.py` | Public Armosphera main checkout cloned via keyring HTTPS auth; native Karpathy/autoresearch loop verified, deterministic mock invoice extractor improved from 64.0 to 100.0 over the fixed 20-item eval set, uncommitted keep logged in `results.tsv`, compile/diff checks clean, and review passing |

Each attached repo includes:

- `npm run karpathy:list` or `node scripts/karpathy-eval.mjs --list`
- `npm run karpathy:program -- <eval-id>` or
  `node scripts/karpathy-eval.mjs --program <eval-id>`
- `npm run karpathy:run -- <eval-id> [--best <metric>]` or
  `node scripts/karpathy-eval.mjs --run <eval-id> [--best <metric>]`
- ignored local result logs under `evals/karpathy/results/`
- a dirty-scope guard before command execution and result logging
- a thin `scripts/karpathy-eval.mjs` shim; do not copy the runner logic into
  product repos

## Deferred Repos

These repos were intentionally not touched in this pass because the local
checkout state was not a clean, current `main` baseline:

| Repo | Local state observed | Next action |
| --- | --- | --- |
| `A1-ERP-HY` canonical checkout | `main...origin/main` with untracked `.orchestration/` work; clean RBAC branch worktree attached above | Reconcile or archive canonical orchestration output before touching `main` |
| `A1-Platform` legacy branch gate | previously behind; fast-forwarded clean branch now attached above | Decide separately whether this feature branch should merge back to main |
| `A1-SMB-HH-HY-MAX` legacy feature worktree | feature branch with gone upstream; clean main worktree now attached above | Decide whether to keep, rebase, or delete the stale feature branch separately |
| `A1-SMB-HH-HY` legacy feature worktree | feature branch with gone upstream; clean aligned worktree now attached above | Decide whether to keep, rebase, or delete the stale feature branch separately |
| `A1-Suite-Local-ANT` | phase branch ahead with orchestration output | Reconcile current phase work first |
| `SBOS-A1-ERP` | `main...origin/main [ahead 12]` with untracked files | Push/merge or split local commits before adding eval lanes |
| `A1-WIP` | modified generated route tree and orchestration output | Clean or commit current work first |
| `goldies-inc-gsta-ai-erp` | `main` with package and tool-source edits | Finish or split the active finance-factory work before adding eval lanes |

## Next Eval Lanes

Good next candidates once their local state is clean:

- CRM: one narrow eval around contact/company normalization or deal stage guards.
- ERP: after the RBAC catalog branch is reviewed, choose the next clean ERP
  lane around app routing/sidebar coverage or malformed overlong path redaction
  based on the current full-suite failures.
- HH: one narrow eval around vacancy routing or candidate form validation.
- ANT/SBOSS: one narrow eval around an already-tested API route, not a broad
  migration slice.
- remaining iOS/macOS shells: one narrow eval around app-shell routing or
  configuration invariants, then run the focused Xcode build/test gate.
- Platform: keep promoting repeated product-lane behavior into `@a1/ai` only
  after three repos prove the same shape without repo-specific drift.
