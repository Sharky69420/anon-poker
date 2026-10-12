# Anon Poker — Multi-Agent Build Structure (Sun Oct 11, freeze 8:00 p.m. Amsterdam)

## 1. The one problem this solves
The app is **one 1.7 MB HTML file**. Several agents editing it at once will overwrite each other. So:

- **Agents never touch `zp.html`.** Each works on a private copy and hands back **a patch script + a test suite**.
- **One integrator (the only writer of `zp.html`)** applies patches to a staging copy, runs the full runner, and replaces master **only if everything is green**.
- Patches use exact-match edits (`rep(old,new,count)`); a patch either applies fully or fails loudly. Nothing is ever half-applied.

Tooling (built and tested): `build/patchlib.py`, `build/integrate.py`, `tests/suites/*.js` auto-loaded by the runner.
Proved: a bad patch stops the run and leaves master unchanged; a good patch lands on staging only; 40 suites green.

## 2. Streams
| Stream | Owner | Delivers | Depends on | Time box |
|---|---|---|---|---|
| **A Integrator / QA** | main session | applies patches, full runner, ships `zec-poker-preview.html`, rehearsal bugs | all | whole day |
| **B Memo anchoring** | agent | `patches/20-memo.py`, `suites/memo.js` | none (uses working deposit tx path) | 90 min |
| **C Zcash payment request** | agent | `patches/30-zcash.py`, `suites/zcash.js`, spike note | none | 120 min (+45 min spike cap) |
| **D Repo and git** | agent | repo layout, `.gitignore`, secrets scan, commit plan, README skeleton + disclosure | none | 45 min |
| **E Submission content** | agent | GTM, pitch script, demo script, form answers (final state, honest) | B, C scope known | 90 min |
| **F Payout deploy** | **you** | worker code pasted, 2 secrets, `ALLOW_ORIGIN`; send me the two URLs | none | 15 min |
| **G Payout wiring** | integrator | set `SOL_CFG.api`, e2e test | F | 10 min after F |

B, C, D, E start **at the same time**. F is the only human blocker, and it only gates G.

## 3. Contracts (so patches never collide)
1. **Namespaces:** B uses prefix `mem` / `solMemo*`. C uses `zec` / `zip321*`. New element ids use the same prefix. No shared function names.
2. **Insertion points:** new code goes in its own block, between `// ── <STREAM>:BEGIN` and `// ── <STREAM>:END`. CSS in its own `<style>` block. Anchors must be strings that occur exactly once.
3. **No edits to shared functions** except through one listed hook line per stream, reported in the stream's hand-back note.
4. **Money-path rules:** integer math only; devnet/testnet only; idempotent on transaction signature; no private key material anywhere in page or repo.
5. **Every patch ships its own suite** that (a) runs the real page code in the vm sandbox, (b) uses an independent decoder/oracle (the lesson from the Phantom buffer bug: a mock that is more forgiving than the real wallet hides bugs).
6. **Honest labeling:** anything simulated says so in the UI.
7. **No new external script/font loads.** Single self-contained file.

## 4. Integration loop (stream A)
1. Drop `NN-name.py` into `build/patches/`, `name.js` into `build/suites/`.
2. `python3 build/integrate.py` → patches apply to staging in filename order, suites run.
3. Red → stream agent gets the exact failure line, fixes, resubmits. Master is untouched meanwhile.
4. Green for all → `python3 build/integrate.py --ship`, then `cmp` shipped vs tested, send to you.
Order: 10 (existing) → 20 memo → 30 zcash → 90 payout url.

## 5. Timeline
| Time | Event |
|---|---|
| 3:30 p.m. | Launch B, C, D, E. You do F. |
| 5:00 p.m. | B patch due. Integrate. |
| 5:30 p.m. | C patch due; spike verdict. Integrate. |
| 6:00 p.m. | D repo commit plan ready; E drafts ready. G wired if F done. |
| 6:30–7:30 p.m. | Full rehearsal x2 (deposit → hand → verifier → Memo link → cash-out → Zcash request). Only blocking bugs fixed. |
| 8:00 p.m. | **Freeze.** Tag release. |

## 6. Agent briefs (paste-ready)

**B Memo anchoring**
Goal: before each hand's deal, write the hand's fairness commitment hash on Solana devnet through the Memo program, and show the explorer link in the verifier. Work on a copy of `zp.html`; do not edit the master. Reuse the existing Phantom transaction path (`solBuildTransferMessage`, `solBuildUnsignedTx`, `p.request({method:'signAndSendTransaction'...})` — wallet payload is a serialized tx: 1 zero signature slot + message). Memo program id `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`; one instruction, data = UTF-8 commitment hex (<566 bytes), signer = the player. Deliver `patches/20-memo.py` (uses `patchlib`) and `suites/memo.js` that decodes the built transaction with an independent parser and rejects any wallet payload a real Phantom would reject. Anchoring failure must never block play. Label as devnet. Report the exact hook lines touched.

**C Zcash payment request**
Goal: replace the placeholder deposit box in the wallet modal (`#depCopyBtn`, text `utest1anonpoker…preview`) with a real ZIP-321 request: `zcash:<addr>?amount=<0–8 dp>&memo=<base64url ≤512 B>&message=<pct-encoded>` for the operator's testnet address (config constant, placeholder until supplied), a QR code from a small inline encoder (no external libs), a working Copy button, a unique per-request memo tag. Validate per ZIP-321 (reject `+ / =` in memo, >8 decimals, memo on transparent address). Spike (cap 45 min): is there a browser-reachable Zcash testnet confirmation source (explorer API with CORS, lightwalletd gRPC-web)? Report verdict with evidence; otherwise implement an honest "operator-confirmed" path. Deliver `patches/30-zcash.py`, `suites/zcash.js` (QR checked by decoding it back with an independent decoder if feasible, otherwise by structural checks), spike note.

**D Repo and git**
Goal: produce the GitHub repo plan. Layout (`app/`, `worker/`, `tests/`, `docs/`), `.gitignore` (must exclude `secrets/` and any keypair), a secrets-scan script that fails on key arrays / `api-key=` outside `SOL_CFG`, README skeleton with the **pre-Sep-14 disclosure** (engine, UI, verifier predate Sep 14; Solana lane, Zcash lane, Memo anchoring, payout service, tests were built during the hackathon), and a **commit plan** that splits the real work into honest, meaningful commits (Phantom sign-in, deposit, withdrawal service, Memo anchoring, Zcash request, tests). Do not fabricate dates. Output the commands for a non-technical user, step by step.

**E Submission content**
Goal: final-state documents, honest: GTM + demand-validation + distribution plan (state "no traction yet"), 2–3 min pitch script, ≤3 min demo script (say devnet/testnet in the first 10 seconds), form answers for both tracks, one paragraph on gambling licensing. Update DEMO-SCRIPT/STAGE-SCRIPT (Zano removed; reflect Memo and Zcash as actually built). No claims beyond what the tests and demos show.

## 7. Efficiency rules
- Agents get **narrow, written briefs** and the contracts above; no open-ended exploration.
- Each hand-back is **one patch + one suite + a 5-line note** (hooks touched, what is simulated, what is untested).
- The integrator never rewrites an agent's patch; failures go back with the exact line.
- Cut order if time runs short: E content polish → C confirmation spike (keep request + QR) → B (keep deposit/withdraw loop).
- Never cut: F/G (real loop), D (git history), videos on Monday.
