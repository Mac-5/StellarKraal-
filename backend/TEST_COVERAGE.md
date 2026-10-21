# Test Coverage

This document describes the test coverage requirements for the backend and how to check them locally.

## Minimum Coverage Requirement

The backend enforces a **70% minimum test coverage** threshold. Pull requests that drop coverage below this threshold will fail CI.

## Backend CI Gates

The backend CI workflow (`.github/workflows/backend-ci.yml`) runs four independent jobs in parallel:

- **Lint** — runs ESLint and fails on any lint error.
- **Type-check** — runs the TypeScript compiler in no-emit mode and fails on any type error.
- **Test** — runs the test suite with coverage and fails if overall coverage drops below 70%.
- **Build** — compiles the backend and fails if the build breaks.

Each job reports a clear failure message so you can tell which gate failed without digging through logs.

## Running Tests Locally

Run the backend test suite with coverage reporting:

```bash
cd backend
npm test -- --coverage
```

To run a single test file:

```bash
cd backend
npm test -- path/to/file.test.ts
```

## Checking Coverage Locally

After running the suite with `--coverage`, a coverage summary is printed to the console and a detailed HTML report is written to `backend/coverage/`. Open `backend/coverage/index.html` in a browser to inspect uncovered lines.

Confirm the overall coverage meets the 70% minimum before opening a pull request. If your change introduces new code paths, add tests that exercise them so coverage does not regress.

## Coverage by Area

- **Backend**: `cd backend && npm test -- --coverage`
- **Frontend**: `cd frontend && npm test -- --coverage`
- **Contracts**: `cd contracts && npm test`

## Reviewer Quality Gates

Reviewers should confirm the following before approving a PR:

- [ ] CI passes, including the lint, type-check, test, and build jobs
- [ ] New or changed logic is covered by tests
- [ ] Overall coverage remains at or above 70%
- [ ] Code follows the ESLint and Prettier configurations
- [ ] No unrelated changes are bundled into the PR
