# Anon Poker — Colosseum MVP Plan (Zano/Dash decision, Solana privacy lane, timetable, step-by-step)
*Prepared Thu Oct 8, 2026. Supersedes the timetable in SOLANA-INTEGRATION-OPTIONS.md (its weekday labels were wrong; see §9).*

Sources reviewed: Colosseum Developer Resources (all sections + Zcash track + sponsored), official Rules PDF, hackathon FAQ page, worldsfair page, Helius Privacy (Rings) docs, Arcium, Vanish, Phantom Connect, Solana Confidential Balances, Solana payment-indexing docs, Dash integration docs.

---

## 1. What the rules and judges actually reward (this changes priorities)

| Fact (source) | Consequence |
|---|---|
| Deadline: **11:59 pm PT Mon Oct 12 = 8:59 a.m. Tue Oct 13 Amsterdam** (Rules §5). "Entry Period" is undefined (Rules §6b). | **Internal deadline: Mon Oct 12, 6:00 p.m. Amsterdam.** |
| Tracks with money: **Solana $100K / 10 products, Zcash $100K / 10 products**, plus Grand Champion $30K, 20 × $15K, and a $2.5M seed pool. **No Zano track. No Dash track.** (Rules §14) | A Zano or Dash lane earns **zero track prize**. Solana and Zcash lanes each target a real pool. |
| Zcash track requirement is only: integrate "the Zcash blockchain or asset" (Rules §14h). | Our Zcash rail is currently address validation only. It must become a real integration to qualify. |
| Pre-existing code is allowed but **must be disclosed**; **judging covers only work done Sep 14 – Oct 12**; misrepresenting history can disqualify and revoke prizes (FAQ). | The poker engine, UI and fair-dealing verifier were built before Sep 14. Disclose it plainly. The new chain integrations are the judged work, so they must be substantial and visible in git history. |
| Required deliverables: product name/description, chains and tools, team backgrounds, location, logo, **GitHub link** (private allowed if access is given to hackathon@colosseum.com), **2–3 min pitch video**, **≤3 min demo video**, **go-to-market, demand validation, distribution plan**. (FAQ) | Videos and GTM are mandatory deliverables, not polish. Budget real time for them. |
| Judging is VC-style: founder-market fit, insight, product + execution, market size, communication, viability, traction. Rules add functionality, novelty, UX, open-source, business plan. | The pitch is a startup pitch. The demo must work end to end. Never claim traction we do not have. |
| Colosseum says it does not grade framework choice or design patterns; reviewers look for **significant work during the hackathon, done by the team, with strategic prioritization**. | A working simple path beats an ambitious unfinished one. |
| Phantom Portal is **not accepting new apps**, so Phantom embedded-wallet sign-in is unavailable. | Use the **injected Phantom extension** (no portal needed). |
| Track judges include **Arcium** (Julian Deschler, Milian), Phantom, Realms, MetaDAO, Drift, Anza and others. | A credible privacy story matters on the Solana track. |

---

## 2. Decision: Zano → Dash?  **No. Drop Zano; do not add Dash.**

| Criterion | Zano | Dash | **Solana lane** |
|---|---|---|---|
| Track prize pool | None | None | **$100K / 10** |
| Privacy | Confidential asset (operator-backed) | Optional CoinJoin mixing only; not shielded | Public, plus optional private lane (§3) |
| Settlement speed | Block-based | InstantSend ≈ 3 s (good UX) | ~1 s |
| Browser integration | Companion extension, untested, signing shape unconfirmed | Needs a node (JSON-RPC/ZMQ) or an explorer API → a backend; libs exist, testnet flow unverified by me | Phantom extension + public RPC; documented |
| Cost to ship by Oct 12 | Already sunk; unproven | ~1.5 days, from zero | Already the plan |

Dash's one real advantage, fast final settlement, does not offset the lack of a prize path, the need for a backend, and the lost days. **Dash and Zano each become one roadmap line.** The pitch claim "compliance rail" also goes (a public chain is not one).

---

## 3. Solana privacy lane — what is real, what is not

| Option | What it hides | Status (per docs) | Fit | Verdict |
|---|---|---|---|---|
| **Helius Rings (Zolana)** | Default Ring: **asset and amount** hidden; **sender/recipient stay public**. Custom/anonymous Rings can hide parties. Entry/exit and tx hashes always public. | **Devnet only, beta**, endpoints may change, audits ongoing. Groth16 proofs; **RPC provider generates proofs by default** (can be local). TS + Rust SDKs, escrow example. Anonymity set **not specified**. | Private balance for table funds: "stack amounts not visible on-chain". | **Time-boxed stretch (4 h cap)** |
| **Arcium** (MPC) | Computation on encrypted data. Lists card games as a use case. | Live on mainnet per docs; build needs Arcis (Rust), MXE, `arcium` CLI. No poker example found. | The true fix for "house can see the deck" (mental poker). | **Too large for 4 days. Roadmap slide, name-drop (their staff are judges).** |
| Token-2022 Confidential Balances | Amounts and balances only; addresses public. | Page confirms behavior; availability not confirmed. | Weak | Skip |
| Vanish Core | Private trading/lending via one-time wallets | Not transfers; network unspecified | No fit | Skip |
| Umbra / Privacy Cash / MagicBlock | Various | Not re-verified this round | Unknown | Roadmap only |

**Honest wording for judges:** *"Anonymous by design at the application layer (wallet signature, no KYC); pseudonymous on-chain; amounts can be made confidential on Solana devnet with Helius Rings; full shielding is the Zcash lane."* Never say "anonymous" about the default Ring.

---

## 4. Target MVP (what we ship)

One engine, two money lanes, one fairness proof.

1. **Solana lane (devnet):** Phantom connect + signed sign-in → deposit → chips → play → withdraw.
2. **Zcash lane (testnet):** real payment request (ZIP-321 URI/QR to a testnet address) and a deposit-confirmation path; honest labeling of whatever is simulated.
3. **Fairness:** existing commit/reveal verifier, plus the commitment hash written on-chain via the Memo program.
4. **Optional:** Rings private balance (devnet) *or* Anchor escrow, whichever is green first.
5. **Submission package:** repo + README with disclosure, 2–3 min pitch, ≤3 min demo, GTM page.

### Priority and cut order

| P | Item | Cut? |
|---|---|---|
| P0 | Submission package (repo, disclosure, videos, GTM, form) | **Never** |
| P1 | Solana: connect/sign-in, deposit + idempotent credit, withdraw (serverless, devnet) | **Never** |
| P2 | Zcash: real payment-request flow + honest labeling | Cut to "documented design" only if the spike fails |
| P3 | Memo anchoring of commitments | Cut 3rd |
| P4 | Anchor escrow (replaces the serverless payout rather than adding to it) | Cut 2nd; keep serverless |
| P5 | Rings private balance | **Cut 1st** |

> Note: Anchor escrow was previously marked "never cut". The Rules and FAQ do not grade code architecture, so I recommend it become P4. Confirm or override.

---

## 5. Timetable (Amsterdam time)

| When | Goal | Exit test |
|---|---|---|
| **Thu Oct 8 evening** (≈1.5 h) | Your setup tasks (§6 Day 0) and Discord questions | Keys and accounts ready |
| **Fri Oct 9** | Zano → Solana swap in build, tests and scripts. Phantom connect + sign-in. Solana lane in lobby. **2-hour Zcash spike** | Phantom connects on devnet; signature verified; no Zano text left; all suites green |
| **Sat Oct 10** | Solana deposit with reference key + Helius detection + idempotent credit. Serverless devnet payout. Memo anchoring | Real devnet deposit credits exactly once; withdrawal arrives |
| **Sun Oct 11** | Zcash payment-request flow. Choose **one** stretch (escrow *or* Rings). Full rehearsal. **Code freeze 8:00 p.m.** | Deposit → hand → verifier → cash-out works twice in a row |
| **Mon Oct 12** | Record demo (≤3 min) and pitch (2–3 min). README + disclosure. GTM. Fill the form. **Submit by 6:00 p.m.** | Submission confirmation received |

Reserve: Tue 8:59 a.m. is the absolute limit. Do not use it.

---

## 6. Step-by-step

### Day 0 — Thu evening (you do these)
1. **Helius:** create a free account → create an API key → in the dashboard restrict it to your site's domain (devnet use only).
2. **Phantom:** install the browser extension → Settings → Developer Settings → enable **Testnet Mode** → select **Solana Devnet** → copy your address → get devnet SOL from faucet.solana.com.
3. **Colosseum:** confirm you are registered and a team exists; open the dashboard submission portal and screenshot the form fields.
4. **GitHub:** decide public or private. If private, add **hackathon@colosseum.com** as a collaborator with read access.
5. **Discord (colosseum.com/discord), ask two questions:**
   - "Can one submission be eligible for both the Solana and Zcash tracks?"
   - "How should pre-hackathon code be disclosed in the form?"
6. Send me the Helius key **only into the domain-restricted devnet config**, never anywhere public.

### Day 1 — Fri Oct 9 (I build; you verify)
1. Replace the Zano rail with "Solana (devnet)": remove Zano address validation and wallet-connect hooks. Chip engine stays untouched.
2. Add Phantom connect and message-signing sign-in using the injected provider.
3. New test suite for each change; full runner green before replacing the stable file.
4. **Zcash spike (cap 2 h):** find a reachable testnet confirmation source from a browser. If none, we use a labeled operator-confirm demo path and document the real design.
5. Your check: open the file, connect Phantom, see your devnet address and a verified signature.

### Day 2 — Sat Oct 10
1. Deposit request: unique reference key, payment transaction signed in Phantom.
2. Detect via Helius RPC, polling every 2–3 s; credit chips once, keyed on transaction signature.
3. Payout: tiny serverless function (devnet key held as a secret) sends funds to the player's address.
4. Memo anchoring: write each hand's commitment hash on-chain; verifier shows the explorer link.
5. Your check: deposit 0.1 devnet SOL → chips appear once → cash out → funds arrive.

### Day 3 — Sun Oct 11
1. Zcash: ZIP-321 payment request URI + QR for a testnet address; confirmation path per the spike.
2. Pick **one** stretch: escrow program or Rings. Start only if P1–P3 are green.
3. Rehearse the full demo twice back to back; fix only blocking bugs. **Freeze at 8:00 p.m.**

### Day 4 — Mon Oct 12
1. **Morning:** record demo (≤3 min). Script: connect → deposit → play → fairness verifier → on-chain commitment → cash-out → Zcash lane.
2. **Midday:** record pitch (2–3 min). Open with the problem; state exactly what is real, what is devnet/testnet, and what is roadmap.
3. **Afternoon:** README (including the disclosure of pre-hackathon code), GTM page, form, logo.
4. **Submit by 6:00 p.m.** Screenshot the confirmation.

---

## 7. Submission content (guardrails)

- **Disclosure line (draft):** *"The poker engine, UI and provably-fair verifier were built before Sep 14, 2026. Everything on the Solana and Zcash lanes, the on-chain commitment anchoring, and the submission package were built during the hackathon."* Adjust to match git history exactly.
- **Traction:** none yet. State that. Do not invent users or revenue.
- **Business plan:** rake model, target users, distribution through Solana/Zcash communities. Include one honest paragraph on gambling licensing: this demo is play-money on test networks; a real launch needs jurisdictional licensing.
- **Everything is devnet/testnet.** Say so in the first 10 seconds of the demo.

---

## 8. Open risks

- Pre-hackathon share of the work (largest scoring risk; mitigated by honesty and visible new commits).
- Zcash browser confirmation path is unverified until the Fri spike.
- Rings is beta; proofs depend on the RPC provider; anonymity set unspecified.
- Single-HTML architecture means the payout key lives in one serverless function.
- Dual-track eligibility is unconfirmed until Discord answers.
- I could not read the Colosseum Discord workshop recordings (Zcash and Helius privacy sessions); they may contain shortcuts.

## 9. Correction

My earlier timetable labeled **Oct 9 as Thursday, Oct 10 as Friday, Oct 11 as Saturday, Oct 12 as Sunday**. The correct days are **Fri Oct 9, Sat Oct 10, Sun Oct 11, Mon Oct 12**. The Oct 8 deadline math is unchanged; only the weekday names were wrong. The older file is patched.

## 10. Default recommendation

**Drop Zano, skip Dash, build Solana (P1) + a real Zcash payment flow (P2) + Memo anchoring (P3). Time-box Rings to one afternoon on Sun only if all else is green. Put Arcium on the roadmap slide. Submit by Mon 6:00 p.m. Amsterdam.**
