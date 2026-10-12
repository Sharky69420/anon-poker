# Money-loop contract (single source of truth for streams A, B, C)
Goal: balance on the worker ledger is what the player plays with. deposit -> buy-in -> play -> cash-out -> withdraw.
Trust model (state it, never hide it): hand results are CLIENT-REPORTED (hands are simulated in the browser). The server only bounds them. Devnet only.

## Worker endpoints (all: origin check + config check first, exactly like existing /credit /withdraw)
Existing, unchanged: POST /credit, POST /withdraw. Changed: GET /balance.

### GET /balance?addr=<b58>   ->  200 {balance:int, session:int}
`balance` = lamports on ledger (as today). `session` = lamports currently sitting in an open table session (0 if none).

### POST /buyin  {addr, lamports, nonce, ts, signature(base64)}
Message (byte-exact, JS template; page and worker must match):
  'Anon Poker table buy-in\nChain: Solana devnet\nAddress: '+addr+'\nLamports: '+lamports+'\nNonce: '+nonce+'\nTimestamp: '+ts+'\nThis signature authorises moving exactly this amount from your balance to your table stack.'
Checks (same order as withdraw): isAddr; lamports safe integer, BUYIN.min<=lamports<=BUYIN.max, lamports % BUYIN.step===0; nonce /^[0-9a-f]{16,64}$/; |now-ts|<=300000; base64 sig 64 bytes; Ed25519 verify; replay key 'nonce:'+addr+':'+nonce (shared with all signed endpoints, TTL 3600); lamports<=balance else 402 {error:'exceeds ledger balance',balance}.
Effect: bal -= lamports; session.inTotal += lamports  (KV key 'sess:'+addr = JSON {inTotal:int}).
Return 200 {balance, session:inTotal}.
BUYIN = {min:25000000, max:5000000000, step:100000}.

### POST /cashout  {addr, lamports, nonce, ts, signature(base64)}
Message:
  'Anon Poker table cash-out\nChain: Solana devnet\nAddress: '+addr+'\nLamports: '+lamports+'\nNonce: '+nonce+'\nTimestamp: '+ts+'\nThis signature reports your final table stack and moves exactly this amount to your balance.'
Checks: as above, but lamports may be 0; 0<=lamports<=CASHOUT.cap(inTotal)=min(inTotal*6, 60000000000); lamports % 100000===0; session.inTotal>0 else 409 {error:'no open table session'}; lamports above the cap -> 422 {error:'exceeds table limit',limit:cap}.
Effect: bal += lamports (NOT clamped by maxLedger); session deleted (inTotal=0). Return 200 {balance, session:0}.
Signature of one endpoint must never validate on another (first message line differs; tests must prove it, incl. a withdraw signature replayed to /cashout and /buyin).
Atomicity: KV is not atomic; debit/set order must never mint value on failure (buyin: write session+bal; on any thrown error between writes restore). Single-user devnet; say so in code comment.

## Page (stream B)
Ledger mode = SOLWAL.addr connected AND SOL_CFG.api set. Otherwise everything behaves exactly as today (free play, WALLET {ZEC:30,SOL:10}).
- On sign-in/connect, after /credit, after withdraw: WALLET.SOL := (await GET /balance).balance/1e9 (server is truth). On disconnect: WALLET.SOL back to free-play 10.
- ZEC tables stay free play. Label them so.
- SOL table buy-in (confirmBuyIn, doRebuy, add-on): sign buy-in message with Phantom signMessage -> POST /buyin -> only then startGame / add chips. Stack lamports = chips * t.mul * 1e9 (round to integer; must be multiple of 100000). Any failure/decline: no chips given, clear message, wallet unchanged.
- leaveTable on a SOL table: sign cash-out message for floor(final chips * t.mul * 1e9 / 100000)*100000 -> POST /cashout -> WALLET.SOL := returned balance. If Phantom declined or server failed: do NOT lose the stack: keep a visible 'Cash-out pending, retry' button; session stays open server-side.
- Open session recovery: when /balance returns session>0 and no table is open, wallet menu shows 'Open table stack X SOL: return to balance' (cash-out of lamports=session; refund). 
- demoFundBtn (free faucet) disabled/hidden in ledger mode (it would show fake money).
- Phantom popups happen only on user clicks (connect, deposit, buy-in, cash-out, withdraw). Never on a deal.
- Honest labels: 'Ledger balance (devnet)' vs 'Free play'. Add one line near the cash-out receipt: 'Result reported by this browser; devnet only.'

## Gates (integrator C)
1. A and B each green alone. 2. integrate.py full runner green (no regressions; currently 2391). 3. Cross test: real page code against the REAL worker module in a vm (no mock): deposit->buyin->cashout(win)->withdraw; cheat attempts (cashout > cap, replay, wrong signer, withdraw-sig replay) all refused. 4. Mutation check: break one rule per endpoint, suite must go red.
