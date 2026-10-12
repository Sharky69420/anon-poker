# Server-run engine contract v2 (single source of truth for streams E, B, W, P)
Goal: the SERVER deals, runs the bots, decides results and owns the player's stack. The browser only renders and sends actions. Closes the "client-reported result" gap of the MVP slice.
Scope (cut hard, everything else stays on the existing client engine): SOL tables in ledger mode, No-Limit Hold'em only (PLO stays free play), hero = seat 0 vs 1..7 bots (page default 5), blinds SB=10 BB=20 chips, internal integer chips. Free play, ZEC tables, signed-out state: unchanged client engine.
The existing page engine (zp.html: evalH, sc5, shuffleSeeded, seededRandom, startHand, act, findNextToAct, showdown, botAct) IS the rules spec. Where this file and the page disagree on poker rules, the page wins and the difference is reported.

## Files
worker/engine.js   pure ESM, no I/O, no Date, no Math.random (all randomness from a passed seeded rng). Stream E.
worker/bots.js     pure ESM bot policy. Stream B.
worker/payout-worker.js  endpoints, KV, ledger. Stream W (imports ./engine.js ./bots.js; deploy = paste all three files in the Cloudflare editor as modules, or concatenate: W ALSO delivers build/bundle.py that concatenates the three into one worker file with the imports stripped; the bundled file is what ships).

## Fairness (must keep the existing in-app verifier working unchanged)
commit = sha256Hex(serverSeed)  (serverSeed = 64 hex chars from crypto.getRandomValues, same as page randHex(32))
deckHex = serverSeed + clientSeed + handNo   (string concat, handNo decimal, exactly like pfDeckHex())
deck = shuffleSeeded(mkDeck(), deckHex) using the page's exact seededRandom + shuffle loop + mkDeck order (SUITS x RANKS as in page). Engine must reproduce the page deck byte for byte (differential test, 1000 seeds).
Flow per hand: the commit for hand N+1 is returned BEFORE the client sends its clientSeed for N+1 (response of the previous hand, or of /table/open for hand 1). Server keeps serverSeed secret in KV until the hand is over, then reveals it.
Deal order, burn cards, blind posting, position rotation: as the page (E reads startHand).

## engine.js API (E implements; W and B code against exactly this)
export const CFG={SB:10,BB:20,RAKE:0.05,RAKECAP:3,BBJD:0.01}  // rake: see Rake
export function mkDeck(); export function seededRandom(hex); export function shuffleSeeded(deck,hex); export function sha256Hex(str) -> Promise<string> (webcrypto)
export function evalH(hole,comm) -> {rank,name,tb}   // same results as page for NLHE (2 hole cards)
export function newHand({seats,dealer,serverSeed,clientSeed,handNo}) -> state
   seats: [{idx,name,isBot,chips(integer),agg}]  (idx 0 = hero). Seats with chips<=0 are not dealt in.
export function legal(state) -> null | {seat,canCheck,callAmt,minRaiseTo,maxRaiseTo,canRaise}   // for state.toAct
export function applyAction(state,seat,{type:'fold'|'check'|'call'|'raise',amount?}) -> {ok:true,events:[...]} | {ok:false,why}
   Mutates or returns new state (E decides, but must be deterministic and never leave state half-updated on {ok:false}). 'raise' amount = total bet size 'raise to' (like the page's bet/raise amount semantic; E documents). Illegal action = {ok:false,why}, state untouched. Hero check-with-call-owed is REFUSED (the page converts it; the server must not).
export function view(state,forSeat=0) -> the public view (below). Hidden cards NEVER appear in it.
export function isOver(state) ; export function result(state) -> {winners:[{seat,amount,handName}],pots:[{amount,eligible,winners}],rake,bbj}
Events: [{seat,type:'blind'|'fold'|'check'|'call'|'raise'|'allin'|'deal'|'street'|'showdown'|'win',amount?,cards?,stage?}], order = real order of play.
Rake: floor to integer chips, only if the hand saw a flop (check the page; replicate its condition). Rake and jackpot drop leave the table. ORACLE runs with RAKE=0 and BBJD=0 on both sides and must be exactly equal; rake itself has its own unit tests.
Chip conservation invariant must hold in every state: sum(seat chips)+pot+rake+bbj == initial total.

## bots.js API (B implements)
export function decide(botView,rng) -> {type,amount?}   // botView: {seat,hole,comm,stage,pot,callAmt,minRaiseTo,maxRaiseTo,chips,bets,numActive,agg,position,...} B defines the exact minimal botView and E builds it via engine.botView(state,seat) (B tells E the fields it needs in handback/B/NEEDS.md at the START, E adds botView before delivering).
Port the page's botAct/handEquity/potOdds/betSize logic faithfully. rng = engine.seededRandom(serverSeed+clientSeed+handNo+':bots') so a replay is deterministic. Never return an illegal action (E validates anyway; on illegal W falls back to check/call/fold).

## Worker state (KV)
'sess:'+addr = {inTotal, stack}   lamports; stack = lamports currently at the table or reserved for it (server truth). /buyin adds to both. (replaces the inTotal-only session)
'tbl:'+addr = {token,unit,tableId,bots:[{name,chips,agg}],dealer,handNo,hero:chips,hand:<engine state with secrets>|null,nextSeed,nextCommit,lastReveal}
unit = lamports per chip: micro 100000 (0.0001 SOL), mid 1000000, high 10000000 (page TABLES.mul*1e9). lamports(stack chips)=chips*unit. Table stack must never exceed what the session holds: hero chips*unit == sess.stack at all times between hands (invariant, tested).

## Endpoints (all: origin + config checks first, JSON errors without exception text)
Existing /credit /withdraw unchanged. /balance -> {balance, session:inTotal, stack, table:bool}.
POST /buyin (unchanged contract incl. signature; now also adds lamports to sess.stack and, if a table is open and no hand running, to hero chips (lamports must be multiple of unit); if a hand is running -> 409 {error:'hand in progress'}).
POST /table/open {addr,tableId,bots,nonce,ts,signature}  signed, message 'Anon Poker open table\nChain: Solana devnet\nAddress: '+addr+'\nTable: '+tableId+'\nBots: '+bots+'\nNonce: '+nonce+'\nTimestamp: '+ts+'\nThis signature authorises sitting at this table with your current table stack.'
   requires sess.stack>0 and a SOL table id (sol-micro|sol-mid|sol-high), bots 1..7 integer, stack>=BUYIN min in chips (250 chips) else 422; no table already open else 409. Returns {token,unit,handNo:1,commit,stackChips,bots:[names/chips]}. token = 32 random hex (secret; returned only here and by /table/state for the signer? NO: only here).
POST /hand/deal {addr,token,clientSeed(16 hex)} -> view (hand N dealt, bots acted until hero's turn or hand over). Requires no hand running, token match, hero chips>=BB else 409 'stack below big blind'.
POST /hand/act {addr,token,handNo,action:{type,amount?}} -> view. Validates handNo==current, it is hero's turn, action legal. After hero acts the server runs bots until hero's next turn or hand over. Illegal -> 422 {error:'illegal action',why,legal}; wrong token 401; replay of same (handNo, actSeq) not needed: server tracks actSeq and requires body.seq==expected (page sends it).
GET /table/state?addr&token -> current view (reload recovery) incl. hero hole cards only.
POST /cashout {addr,lamports,nonce,ts,signature} (signed as before, same message text): amount must EQUAL sess.stack exactly else 422 {error:'amount mismatch',stack}; refuses 409 'hand in progress' if a hand is running; closes table+session (tbl deleted, sess zeroed), bal += stack.  The old client-reported cap path (6x) is REMOVED.
View JSON: {handNo,commit,stage,dealer,seats:[{idx,name,isBot,chips,bet,folded,allIn,hole:[{r,s}]|null}],comm:[],pot,toAct,legal,seq,events:[],result:null|{...},reveal:null|{serverSeed,commit,clientSeed,handNo},heroChips,stackLamports,nextCommit}
 hole is non-null only for seat 0, plus bots still in at a real showdown after the last action. Folded bots' cards are revealed ONLY via reveal (seed) after the hand, never in view.
 After the hand ends: result+reveal present, nextCommit = commit for hand N+1 (server already stored nextSeed).
Hands run to completion server-side; no timers. Hero AFK is the page's problem (it sends fold when its own timer expires).
Persistence: after every response the table state is written to KV once (single write per request); KV not atomic = single-user devnet, say so in a comment.

## Page (stream P)
New patch build/handback/P/50-server-engine.py applied AFTER the already-shipped 40-money-loop (master zp.html includes it). Server-table mode: ledger mode AND SOL table AND NLHE. 
- openBuyIn/confirmBuyIn: existing /buyin, then /table/open (signMessage popup, user click), then render from the server view. Hero chips come from the server (stackChips).
- startHand/act/showdown/bots/timers for server tables are replaced by an adapter: srvApply(view) maps view -> G (seats, comm, pot, bets, stage, dealer, toAct, hole cards) and calls the existing render()/animations as far as practical; bot actions in view.events are replayed with short delays for readability (cancelable; a new response never waits on animation).
- The action bar (fold/check/call/raise) calls POST /hand/act (no popups). Hero timer expiry sends fold.
- Fairness: commit from the server shown in the PROVABLY FAIR badge BEFORE the deal; on hand end reveal -> PF.lastReveal so the existing verifier (pfVerifyNow) recomputes sha256 and rebuilds the deck. Verifier must show MATCH computed by the PAGE from the revealed seed (never trust a server 'ok' flag).
- Leave table: if hand running, send fold first, then sign cash-out for the SERVER stack (lamports from view.stackLamports), POST /cashout. Decline/failure keeps the table open (stack safe on server).
- Rebuy/add-on only between hands via /buyin. Orphan recovery on load: /balance shows table:true -> GET /table/state needs the token, which the page lost on reload: therefore W also supports POST /table/resume {addr,nonce,ts,signature} (signed 'Anon Poker resume table' message, same shape) returning a NEW token (old one invalidated) + current view. P implements the resume button.
- Client-reported cash-out path and its pending/retry logic for server tables are replaced by the server-stack cash-out; keep retry on failure.
- Everything else (free play, ZEC, signed-out) byte-for-byte unchanged behavior: the existing 2787 tests must stay green except tests that intentionally pinned the client-reported cash-out for ledger tables (list them and why).

## Gates (integrator = me, C)
G1 each stream green alone with its own mutation checks.
G2 E: differential oracle vs the PAGE engine (hand eval 200k random hands, deck 1000 seeds, scripted multi-way hands incl. all-ins/side pots/split pots, RAKE=0) exactly equal.
G3 W+E+B real: 500 simulated hands through the real handler with random legal hero play: chip conservation each step, ledger conservation, hidden cards never in any response before showdown/reveal (scan all JSON), reveal verifies (sha256(seed)==commit, deck re-derivation == dealt cards), cashout==stack, no value minted on injected KV failures.
G4 P vs REAL worker in a vm: real page code plays N hands, no Phantom call on deal/act, UI stack == server stack, verifier MATCH computed by page.
G5 two independent adversarial reviewers (fresh agents) try to cheat/break: out-of-turn/negative/fractional/over-stack actions, stale/foreign token, seq replay, peeking, resume abuse, cashout mismatch; and UI error paths.
G6 full runner green, mutation checks, only then master changes (integrate.py --ship). Fallback: if not green by Monday 12:00, the current shipped MVP-slice stays; nothing half-built ships.
