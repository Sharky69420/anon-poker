> **STALE / PRE-HACKATHON DESIGN DOCUMENT (v1.1, August 2026).** This describes the originally planned Zcash/Zano escrow design.
> It is NOT a description of what is implemented in this repository. In particular, the operator wallet, diversified-address
> rotation and Zano/Zchips rail described here are not built. See README.md for what is real, and docs/COLOSSEUM-MVP-PLAN.md for the current scope.

# ZEC Poker — Funds Transfer & Settlement Design
**Version 1.1 · August 2026 · Companion to the Common S3nse submission**

---

## The one-paragraph thesis

A poker decision takes seconds; a Zcash confirmation takes minutes. ZEC Poker does not pretend otherwise. Money moves on-chain exactly twice per session — once in, once out — and everything between those two moments is instant play against escrowed chips. The confirmation delay is not a weakness the platform hides; it is the reason the escrow architecture exists.

---

## 1. The two rails

| | **Zcash rail** | **Zchip rail** |
|---|---|---|
| Unit | Shielded ZEC | Zchip (1 Zchip = $1) |
| What it is | The player's own coin, staked directly | An operator-backed Confidential Asset on Zano |
| Tables | Micro 0.001/0.002 · Mid 0.01/0.02 · High 0.1/0.2 Z | Ƶ1/2 · Ƶ10/20 · Ƶ100/200 |
| Buy-in formula | min 12.5×BB, max 125×BB (both rails) | same |
| Redemption | Shielded ZEC payout on leave | 1:1 USD-value redemption via Ionic Swap |

**Honesty note for judges (say it before they ask):** the Zchip peg is a claim on the operator, not an algorithm. Someone must hold the dollar side. Zchips are minted as a Confidential Asset on Zano, backed by operator reserves, and redeemed through Ionic Swaps. Players who want zero counterparty exposure play the ZEC rail; players who want a stable unit accept the operator claim, exactly as they do at every fiat poker room — minus the identity file.

---

## 2. Deposit: chain → chips

1. Player is shown a **fresh shielded (Orchard) address** — one per player session, never reused.
2. Player sends ZEC from any shielded wallet. The transaction's **encrypted memo field (~512 bytes)** carries a session token, which is how the deposit is attributed to the player **without ever asking who they are**. The memo is the privacy-native replacement for a reference number.
3. The platform credits **escrowed chips** after confirmation:
   - up to 1 ZEC → **3 confirmations (~4 minutes)**
   - above 1 ZEC → **10 confirmations (~13 minutes)**
4. From the moment of credit, the player buys into tables instantly. No further chain interaction occurs during play.

Transparent-pool deposits are accepted but auto-shielded before credit, so the platform's books live entirely in the shielded pool.

## 3. Play: off-chain against escrow

- Every table action settles against the escrow ledger in milliseconds.
- The internal unit is an **integer chip** (no floating-point money anywhere in the engine); each table maps one internal chip to a display value. The same convention extends to chain settlement: one internal chip corresponds to a fixed number of atomic units, so **UI, engine, and chain can never disagree about a balance**.
- The provably-fair layer (deck-hash commitment before each hand, seed reveal after) rides on this ledger and is independent of settlement.

## 4. Cash-out: chips → chain

1. Player taps **Leave → Cash Out** (with an explicit Stay option — no accidental exits).
2. The receipt shows hands played and the exact cash-out value; the escrow ledger is debited immediately.
3. A **shielded payout** is broadcast to the player's address. Sender-side, one confirmation is sufficient assurance for the player's wallet to show it; full spendability follows normal wallet policy.
4. **Minimum cash-out threshold: 0.001 ZEC.** Below this, the network fee is a material fraction of the payout (see §5); residual dust remains in the player's balance for their next session.

## 5. Network parameters (fetched, never hard-coded)

| Parameter | Current value | Treatment |
|---|---|---|
| Block time | ~75 seconds | constant |
| Deposit credit | 3 conf (≤1 Z) / 10 conf | policy, tunable |
| Fee rule | ZIP-317: 5,000 zatoshis per logical action, minimum two actions (~0.0001 ZEC typical) | **fetched at runtime** |
| Fee flux | Dynamic-fee proposals active; ZIP-317 slated for revision in NU6.3 | re-verify each upgrade |
| Memo capacity | ~512 bytes, encrypted | deposit attribution |
| Privacy pool | Orchard preferred; Sapling accepted; transparent auto-shielded | policy |

Fees are the one parameter guaranteed to change: ZEC price appreciation has already triggered dynamic-fee proposals, and the fee ZIP is under active revision. The platform reads fee policy from the network at runtime and prices its cash-out threshold against it.

## 6. Custody: where the escrow actually lives

Zcash has no programmable vaults; the escrow is **a platform-controlled shielded wallet plus the ledger beside it**. The wallet holds the money; the ledger records whose ticket claims how much of it. Together they are the escrow — and that makes the platform a **custodian during play**, the same trust every poker room on earth asks for. Zcash's privacy protects players from the world, not from the operator. The pitch states this plainly: *custody works like every poker room; identity works like no poker room.*

**Treasury structure (production):**

1. **Per-player deposit addresses** — unique shielded addresses, all owned by the treasury wallet; address + memo route each deposit to the right ticket.
2. **Hot wallet** — a day's cash-out float, keys on the server, because payouts must be automatic.
3. **Cold wallet** — the bulk of reserves, keys offline; a server breach reaches the float, never the bankroll.

**Trust-reduction ladder (in deployment order):**

| Rung | Mechanism | Status |
|---|---|---|
| 1 | Small exposure by design — session-sized balances, cash-out anytime in minutes | architecture (now) |
| 2 | Hot/cold treasury split | launch requirement |
| 3 | **Reserve attestation** — an auditor verifies via shielded viewing keys that treasury ≥ sum of all tickets, with nothing exposed publicly | post-hackathon |
| 4 | Threshold signing (FROST-style) — no single machine or person can move treasury funds alone | roadmap |

**Zchip rail difference:** the Zchip *is* the ticket — a Confidential Asset on Zano rather than a ledger row — and redemption via Ionic Swap is atomic (the swap itself cannot cheat either side). Custody trust doesn't vanish; it relocates from "trust the ledger" to "trust the dollar reserves," disclosed in §1.

**Current status:** the preview simulates all of the above; no real funds reside anywhere. Testnet-only until §7's risks are answered.

## 7. Risks, named

- **Custodial treasury.** The operator holds player funds during play (§6). Mitigations: exposure sizing, hot/cold split, reserve attestation, threshold keys — in that order.
- **Peg backing (Zchips).** Operator claim, disclosed in §1 and §6. Reserve attestation is a post-hackathon item.
- **Reorgs.** Mitigated by the tiered confirmation policy; large deposits wait longer.
- **Fee volatility.** Mitigated by runtime fee fetch + cash-out threshold.
- **Regulatory.** A privacy poker platform has jurisdiction questions this document does not answer; testnet-only until they are.

## 8. Build-week mapping (Aug 31 →)

| This document | Hackathon deliverable |
|---|---|
| Player identity = wallet | Zano Companion connect + `REQUEST_MESSAGE_SIGN` auth (post-June-2026 `REQUEST_ACCESS` flow) |
| Zchip asset | POKER Confidential Asset mint |
| Redemption | Ionic Swaps buy-in / cash-out |
| Escrow ledger | The existing engine's integer-chip wallet, already tested (46 eval + 18 capability + 800 geometry assertions) |

*Prepared for the ZEC Poker submission to Common S3nse, Cypherpunk Week, Amsterdam.*
