# Contributing to StellarKraal

Thank you for helping improve StellarKraal! This guide covers the commit convention, branching strategy, and automated release process.

---

## Commit Convention — Conventional Commits

All commits **must** follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification. This is required for the automated changelog and semantic versioning to work correctly.

### Format

```
<type>(<optional scope>): <short description>

[optional body]

[optional footer(s)]
```

### Types

| Type | When to use | Version bump |
|------|-------------|--------------|
| `feat` | New feature | minor |
| `fix` | Bug fix | patch |
| `docs` | Documentation only | patch |
| `refactor` | Code change with no feature/fix | patch |
| `test` | Adding or fixing tests | patch |
| `chore` | Build, CI, tooling changes | patch |
| `perf` | Performance improvement | patch |
| `BREAKING CHANGE` | Footer or `!` after type | major |

### Examples

```bash
feat(loans): add partial repayment support
fix(wallet): handle Freighter connection timeout
docs: update FAQ with liquidation questions
feat!: change collateral ID format (BREAKING CHANGE)
```

---

## Branching Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready code; triggers release-please |
| `feat/<name>` | New features |
| `fix/<name>` | Bug fixes |
| `chore/<name>` | Tooling, CI, dependency updates |

Open a pull request from your branch into `main`. Squash-merge to keep history clean.

---

## Automated Release Process (release-please)

This project uses [release-please](https://github.com/googleapis/release-please) to automate releases.

### How it works

1. You push Conventional Commits to `main`.
2. The `release-please` GitHub Actions workflow (`.github/workflows/release-please.yml`) opens a **Release PR** that:
   - Bumps the version in `package.json` following semver rules.
   - Updates `CHANGELOG.md` with entries grouped by type.
3. When the Release PR is merged, release-please:
   - Creates a **GitHub Release** with the changelog notes.
   - Tags the commit (e.g. `v1.2.0`).

### Manual steps (none required for normal releases)

If you need to cut a release manually, merge the open Release PR created by release-please. Do **not** manually edit the versioned release headers in `CHANGELOG.md` — those are auto-generated.

When your PR changes user-facing behavior, add a bullet to the `[Unreleased]` section
yourself following [docs/guides/changelog.md](docs/guides/changelog.md).

---

## Development Setup

> **New contributor?** Start with the **[Contributing Quickstart](docs/development/contributing-quickstart.md)** — it walks you through cloning, installing dependencies, running tests, and opening your first PR on a clean Ubuntu 22.04 or macOS install.

```bash
# Clone
git clone https://github.com/teslims2/StellarKraal-.git
cd StellarKraal-

# Frontend
cd frontend && npm install && npm run dev

# Backend
cd backend && npm install && npm run dev

# Smart contract (requires Rust + stellar-cli)
stellar contract build
```

## Code Style

All code must pass the project's linting and formatting checks before it can be merged. CI enforces these, so run them locally first to avoid failed builds.

### ESLint

ESLint is configured at the repository root (`.eslintrc.js` / `.eslintrc.json`) and applies to both `frontend/` and `backend/`. Run it from the relevant subdirectory:

```bash
# Lint frontend
cd frontend && npm run lint

# Lint backend
cd backend && npm run lint

# Auto-fix fixable issues
cd frontend && npm run lint -- --fix
```

### Prettier

Formatting is enforced by Prettier using the shared config (`.prettierrc`). Do not hand-format code — let Prettier do it:

```bash
# Check formatting (fails if files are not formatted)
npx prettier --check .

# Apply formatting
npx prettier --write .
```

### Rust (contracts)

Contract code must be formatted and lint-clean:

```bash
cd contracts/stellarkraal
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
```

> Tip: install the ESLint and Prettier editor extensions so issues surface as you type.

## Testing

Every PR that changes behavior **must** include tests. CI will reject PRs that drop total coverage below the required threshold.

### Minimum Coverage Requirement

The project enforces a **70% minimum test coverage** across the codebase. PRs that reduce coverage below 70% will fail CI. New code should be covered by tests — do not rely on existing coverage to carry new logic.

Check coverage locally before pushing:

```bash
# Frontend coverage (Jest)
cd frontend && npm run test -- --coverage

# Backend coverage
cd backend && npm run test -- --coverage
```

Review the coverage summary printed at the end of the run. If your change lowers coverage, add tests for the new branches before opening the PR.

### Running the Test Suites

```bash
# Frontend — Jest component tests
npm run test:frontend

# Backend — unit + integration tests
npm run test:backend

# Smart contract — Soroban (Rust) tests
npm run test:contract

# End-to-end — Playwright
npm run test:e2e
```

For detailed instructions on running E2E tests locally, see [E2E Testing Guide](docs/testing/e2e-tests.md).

Run the full suite before opening a PR:

```bash
npm run test:frontend && npm run test:backend && npm run test:contract
```

## Managing Dependencies

Before adding a new dependency, run `depcheck` to confirm it is not already available:

```bash
# Check for unused dependencies (run from the relevant subdirectory)
npx depcheck frontend
npx depcheck backend
```

Remove any packages flagged as unused before opening a PR. This keeps install time, bundle size, and attack surface minimal.

---

## Smart Contract Changes

The on-chain logic lives in `contracts/stellarkraal/` and is written in Rust using the
[Soroban SDK](https://developers.stellar.org/docs/tools/sdks/library-sdk).

### Rust Toolchain Setup

The contract pins a specific toolchain in `contracts/stellarkraal/rust-toolchain.toml`. Rust will
automatically download and activate the correct version when you run any Cargo command inside the
contract directory.

```bash
# Install rustup if you do not have it
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add the WebAssembly target (required to build a Soroban contract)
rustup target add wasm32-unknown-unknown

# Install stellar-cli (version 22+ required)
cargo install --locked stellar-cli --features opt
```

Verify your setup:

```bash
rustc --version      # should match rust-toolchain.toml
stellar --version    # should be 22.x or higher
```

### Running Contract Tests

```bash
cd contracts/stellarkraal

# Unit and integration tests (no network required)
cargo test

# With output visible on failures
cargo test -- --nocapture

# Run a specific test
cargo test test_register_collateral
```

All tests must pass before opening a PR. CI runs `cargo test` via
`.github/workflows/rust-ci.yml`.

### Building the WASM

```bash
cd contracts/stellarkraal

# Debug build (fast, larger file)
cargo build --target wasm32-unknown-unknown

# Release build (optimised, required for deployment)
stellar contract build
```

The optimised WASM is written to
`contracts/stellarkraal/target/wasm32-unknown-unknown/release/stellarkraal.wasm`.

### When an ADR Is Required

Open an [Architecture Decision Record](docs/adr/) in `docs/adr/` whenever a contract change:

- Alters the public ABI (adds, removes, or changes the signature of any `#[contractimpl]` function)
- Changes persistent storage layout (adds or renames a `DataKey` variant)
- Introduces a new oracle, price feed, or liquidation mechanism
- Modifies governance or admin controls (pause, upgrade, admin transfer)
- Involves a breaking protocol change that requires a migration guide

Copy `docs/adr/template.md`, increment the number, fill in all sections, and add a row to the ADR
table in `README.md`. Reference the ADR in your PR description.

> **New to ADRs?** See **[docs/adr/template.md](docs/adr/template.md)** for a filled example and a step-by-step guide covering when to write an ADR, what to put in each section, and how the review process works.

For non-breaking additions (new error codes, comment changes, test improvements) an ADR is not
required, but a clear PR description is expected.

### Deploy to Testnet

> See [Contract Deployment Guide](docs/deployment/contract-deployment.md) for the full step-by-step.

Quick reference:

```bash
# Generate a deployer identity (only needed once)
stellar keys generate deployer --network testnet

# Fund via Friendbot
curl "https://friendbot.stellar.org?addr=$(stellar keys address deployer)"

# Build the optimised WASM
stellar contract build

# Deploy
stellar contract deploy \
  --wasm contracts/stellarkraal/target/wasm32-unknown-unknown/release/stellarkraal.wasm \
  --source deployer \
  --network testnet
```

The command prints a `CONTRACT_ID`. Set `CONTRACT_ID=<value>` in your backend `.env` to point
the local stack at the newly deployed contract.

Testnet state is reset periodically by Stellar. Always test on testnet before proposing mainnet
deployments. Mainnet deployments require an additional review gate; see the deployment guide.

### Soroban SDK Documentation

- [Soroban SDK (Rust)](https://docs.rs/soroban-sdk/latest/soroban_sdk/)
- [Stellar Developer Docs — Smart Contracts](https://developers.stellar.org/docs/smart-contracts)
- [Soroban Examples](https://github.com/stellar/soroban-examples)
- [Stellar CLI Reference](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli)

---

## Code Review

Explicit review guidelines align expectations for everyone involved and help keep review cycles short. This section covers what reviewers look for, how to give constructive feedback, the review SLA, and the responsibilities of both authors and reviewers.

---

### Reviewer Checklist

Reviewers should confirm each quality gate below before approving. If any item fails, request changes rather than approving.

- [ ] **CI is green** — all required checks (lint, format, tests, coverage) pass.
- [ ] **Coverage ≥ 70%** — the PR does not drop total coverage below the threshold; new logic has tests.
- [ ] **Style clean** — ESLint and Prettier pass with no warnings suppressed; Rust code passes `cargo fmt` and `cargo clippy`.
- [ ] **Tests present** — behavior changes include unit/integration tests; contract changes include `cargo test` coverage.
- [ ] **Conventional Commit** — the PR title/commit follows the Conventional Commits format.
- [ ] **ADR included** — required for ABI, storage, oracle, governance, or breaking protocol changes.
- [ ] **No unused dependencies** — `depcheck` is clean for touched subprojects.
- [ ] **Docs updated** — user-facing changes update relevant docs and the `[Unreleased]` changelog entry.

---

### Author Responsibilities

Before requ