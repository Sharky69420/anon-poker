# Anon Poker

Provably fair, wallet-signature poker where you sit down with a crypto wallet instead of an account. Same table and same fairness proof whichever money lane you use.

Submission to the **Solana Colosseum Crypto World's Fair** hackathon.
**Track targets:** Solana track (Phantom sign-in, on-chain devnet deposit, a server-run game engine with a wallet-signed ledger, withdrawal, Memo anchoring) and Zcash track (ZIP-321 payment-request lane, see status below).

Live demo (devnet/testnet): https://anonpoker.netlify.app

---

## DISCLOSURE: what existed before the hackathon

To be fully transparent:

**Built BEFORE Sep 14, 2026 (pre-existing):**
- The poker engine (hand evaluation, betting rounds, side pots, all-in run-outs)
- The full game UI (single HTML file, embedded art)
- The provably-fair commit/reveal verifier (SHA-256 commitment to the server's secret seed, revealed after the hand)
- An earlier suite of 18 test files and a Zcash/Zano design document, from the Common S3nse hackathon (Amsterdam, Sep 4-5, 2026), where this project was first shown
- The Business Source License and early README

**Built DURING the hackathon (Sep 14 - Oct 12, 2026):**
- Solana lane: Phantom connect and signed sign-in, real devnet SOL deposit with on-chain verification, wallet-signed buy-in, cash-out and withdrawal against a ledger kept by a serverless service (`worker/`)
- **Server-run game engine for Solana tables** (`worker/engine.js`, `worker/bots.js`): the server deals, runs the bots, decides results and owns the player's stack; the page only sends fold/check/call/raise. Per-hand SHA-256 commitment is published before the player's seed is sent.
- Zcash lane: ZIP-321 payment request with QR for a real Zcash testnet address (no automatic deposit detection yet)
- Memo anchoring of the hand commitment on Solana, started by the player from the verifier (one Phantom approval per anchor)
- Optional custom table felt (local only, every file scanned and re-encoded in the browser)
- Uniform wallet UI across lanes
- The consolidated test runner and the new test suites (Solana, Phantom, ledger, server engine, bots, Zcash, Memo, felt upload), including suites that run the real page against the real worker and engine, and mutation checks that break the code on purpose to prove the tests notice
- Two independent adversarial reviews of the worker/engine and of the page client; their findings and our fixes are listed under Known limits
- Repo tooling: secrets scan, CI, this documentation

**About this repository's git history (please read):**
- The pre-existing baseline lives in a separate repository, [github.com/Sharky69420/AnonPoker](https://github.com/Sharky69420/AnonPoker), as a single commit dated **Sep 2, 2026** (`29f0577`, "Add files via upload"). That is the real, dated "before" state. It is an earlier prototype: it has no Solana, Phantom, worker or Zcash-payment code. (Its About text describes older plans, including Zano, that are not part of this submission.)
- **This repository's first commit (`0db0726`, Oct 12, 2026, message "Hackathon submission: Anon Poker") imports the whole project in one go: the pre-existing parts and the hackathon work together.** Its message therefore overstates what is hackathon work. There is no separate baseline commit here. An earlier version of this README said there was; that was wrong.
- All commit dates here are **upload dates (Oct 12, 2026), not development dates.** The hackathon work was developed over Sep 14 - Oct 12 in a local workspace and uploaded in one session, so the history looks like a short burst. Nothing is backdated.
- Because the single-file app was uploaded as a whole, GitHub cannot show a line-level diff between the baseline and the hackathon version. The table below gives the comparison instead.
- Other evidence of the timeline: Netlify and Cloudflare Worker deploy history, and the Solana devnet transactions from live testing.

## What changed since the Sep 2 baseline

| | Baseline (`AnonPoker`, Sep 2, 2026) | This repo (Oct 12, 2026) |
|---|---|---|
| App (`index.html` / `app/index.html`) | 4,145 lines, 1.73 MB | 6,183 lines, 1.86 MB |
| Phantom / Solana code | none | Phantom sign-in, devnet deposit, signed buy-in / cash-out / withdraw, Memo anchoring |
| Server | none (everything in the page) | `worker/` (Cloudflare Worker, KV ledger, server-run engine and bots; about 1,000 lines) |
| Zcash | design document only | ZIP-321 testnet payment request in the page |
| Tests | 18 per-file scripts | consolidated runner plus `tests/suites/` (Solana, Phantom, ledger, server engine, bots, Zcash, Memo, felt upload, browser suites) |
| Other | | secrets scan, CI workflow, felt-upload hardening, DJ volume control |

Note: `docs/SETTLEMENT-DESIGN.md` is a stale pre-hackathon design and is marked as such.

---

## What is REAL and what is SIMULATED

| Part | Status |
|---|---|
| Poker engine, shuffling, fairness verifier | Real, runs entirely in your browser. |
| Phantom sign-in | **Real.** Connects the injected Phantom extension and verifies a signed message. |
| Solana deposit | **Real, on Solana devnet.** You send devnet SOL to the house address; the page confirms the transaction on-chain and credits chips once per transaction signature. Verified on-chain. |
| Solana tables (server-run) | **Real server-side game on devnet SOL tables.** No-limit hold'em, you against 1 to 7 bots, run by a Cloudflare Worker (`worker/`). Sitting down costs two Phantom approvals (buy-in, open table); hands need none. Your stack lives in the server ledger; cash-out must equal the server's stack. Local free-play tables still run in your browser as before. |
| Solana withdrawal | Wallet-signed withdrawal request; the worker pays from a devnet house wallet whose key is a Cloudflare secret. Devnet only. |
| Zcash lane | ZIP-321 payment request (URI, QR, copy) for a real Zcash **testnet** address. Not implemented: automatic deposit detection, Zcash withdrawal. |
| Memo anchoring | The player presses Anchor in the fairness verifier; Phantom signs a Solana Memo transaction carrying the hand commitment; the page re-reads the transaction and checks the memo equals the commitment. Manual, never automatic. |
| Custom felt | Optional, local to your browser, never uploaded or shown to others. PNG/JPEG/WebP only, scanned, then rebuilt as a plain image so only pixels survive. |
| Funds | **Devnet / testnet only. No real money moves anywhere.** |
| Other players / bots | Opponents are bots (server-run on Solana tables, in-browser on local tables). This is a single-player demo of the platform, not a live multiplayer network. |
| "House can see the deck" | True: the server deals, so the house knows the cards. Commit/reveal proves the shuffle was fixed in advance, not that it is hidden. Mental poker (Arcium MPC) is roadmap only. |
| Privacy | Wallet-signature sign-in, no KYC. On Solana the chain is public: **pseudonymous, not anonymous.** Full shielding would be the Zcash lane only. |
| Zano, Dash | Not part of this submission. Roadmap only. (A Zano companion connector file from the earlier hackathon is kept in `docs/`, unused.) |

---

## Known limits (stated openly, found by our own review)

1. **Deck derivation is weak against a determined attacker.** The deck is shuffled from a 32-bit seeded generator (the page's original verifier algorithm). A reviewer recovered the deck from the player's own cards and the flop by brute force (about 4.5 minutes of C code). Commit/reveal still proves the house did not change the deck after committing; it does not make bot cards unguessable. Fix: a SHA-256-based deck derivation with a matching verifier (roadmap).
2. **Concurrent requests are not safe.** Workers KV is not atomic. Parallel requests for one wallet (for example a cash-out racing a deal, or two identical withdrawals) can credit or pay twice. Acceptable for a single-user devnet demo, not for real money. Fix: one Durable Object per wallet (roadmap).
3. **Verifier scope.** It checks that the revealed seed hashes to the commitment shown before the deal and that your own hole cards come from that deck. It does not yet check the board or flag a missing reveal.
4. **Smaller items:** a throwaway key can burn Workers KV writes with signed junk requests; a short all-in re-opens betting; the bad-beat jackpot slice is deducted from pots but never paid out; bots refill for free so house exposure is uncapped.
5. Everything is devnet/testnet and play-money. A real-money launch needs gambling licences and compliance in each jurisdiction.

Fixed after review: cash-out after switching Phantom accounts no longer reports success; the page refuses to deal unless the commitment was received first and halts on a changed commitment or wrong hole cards; stale buy-in state; request timeout; cash-out amount cross-check.

## Live verification log

Automated tests prove the code against in-memory copies of the wallet and ledger. This table records what the founder has checked by hand on real devnet/testnet:

| Check | Result (Mon Oct 12, 2026, live site on Solana devnet, by the founder in Edge with Phantom) |
|---|---|
| G1 Phantom connect, deposit credited, sit down with two approvals | Pass |
| G2 Several hands with no wallet popups; bots act; pot and stacks correct | Pass |
| G3 Fairness verifier says MATCH after a hand | Pass |
| G4 Leave: one approval; balance equals the stack left with | Pass |
| G5 Withdraw to the wallet; SOL arrives | Pass |
| G6 Reload mid-session, resume with one approval; same hand and cards | Pass |
| Bonus: anchor the commitment through the Memo program; explorer shows the Memo | Pass |

Single user, single session, devnet only. The ledger limits listed above still apply (no concurrent users).

## How to run

Phantom only injects its wallet into pages served from **https://** or **http://localhost**. Opening `app/index.html` by double-click (`file:///`) shows the table but Phantom will not connect. This is a Phantom rule, not a bug, and the browser (Edge, Chrome) makes no difference.

**Easiest (localhost, needs Python):**
1. Open a terminal in the repo folder.
2. `python -m http.server 8080` (on Windows: `py -m http.server 8080`)
3. Open `http://localhost:8080/app/index.html` in a browser with the Phantom extension (set Phantom to Devnet / enable testnet mode).

**Or** host the `app/` folder on any https static host (Netlify Drop works: upload the folder containing `index.html`).

Details: `docs/START-LOCAL-SERVER.txt`. Payout service deployment: `docs/DEPLOY-PAYOUT-SERVICE.txt`.

The page uses a Helius **devnet** RPC key stored in `SOL_CFG` in `app/index.html`. It is a free devnet key, intentionally in the page, and should be restricted to the site domain in the Helius dashboard. No private keys are in this repo.

## Tests

Requires Node 18+; no install, no dependencies.

```
cd tests
node zec-poker-all-tests.js
```

Prints a per-suite breakdown and a total, and exits non-zero on any failure. Last run from this exact layout: 29,142 assertions passed, 0 failed, 50 suites (the total varies slightly between runs because some suites play randomised hands). The real-browser felt suite needs Playwright and skips itself if it is missing. The runner loads `../app/index.html` and `../worker/payout-worker.js`, and any extra suite in `tests/suites/`.

Secrets check (also run in CI): `python build/secrets_scan.py`

## Layout

```
app/index.html          the whole game, single self-contained file
worker/                 payout-worker.js + engine.js + bots.js (source), payout-worker.bundle.js (the ONE file you paste into Cloudflare)
tests/                  consolidated test runner + suites
build/secrets_scan.py   fails on key material; warns on the devnet RPC key
docs/                   contracts (money loop, server engine), plan, deploy guides, (stale) design doc
```

## License

Business Source License 1.1 (see `LICENSE`). Source is visible and free for non-production use including hackathon judging; commercial hosted use needs a separate license until 2030-09-04, then converts to Apache 2.0.
