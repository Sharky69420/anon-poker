# Commit plan (honest history)

The script `make-commits.sh` (one level up, outside this folder) creates these commits with the real current date. Nothing is backdated.

| # | Message (summary) | Contents |
|---|---|---|
| 1 | Baseline: pre-existing project (snapshot from Sep 3, 2026), imported as-is | Everything built before the hackathon: engine, UI, fairness verifier, 26 old test files, old README/LICENSE, early design docs. A private AI handoff-notes file was left out. **This commit is NOT hackathon work.** |
| 2 | Hackathon: Solana lane, Zcash lane, Memo anchoring, uniform wallet UI in app/index.html | All hackathon changes to the single HTML file, in one commit. A single-file app cannot be split cleanly, so this is approximate. |
| 3 | Hackathon: add serverless payout service (worker/) | `worker/payout-worker.js` |
| 4 | Hackathon: consolidated test runner and new suites; CI | Replaces the 26 old test files with `tests/zec-poker-all-tests.js` and `tests/suites/`; new `.github/workflows/tests.yml` |
| 5 | Hackathon: secrets scan and .gitignore | `build/secrets_scan.py`, `.gitignore` |
| 6 | Docs: README with pre-hackathon disclosure, plan, deploy guides; mark old design doc stale | `README.md`, `docs/`, `COMMIT-PLAN.md` |

Rules: honest messages only; do not use `--date`, do not rewrite history, do not squash commit 1 into later ones. Any later fixes become new commits on top.
