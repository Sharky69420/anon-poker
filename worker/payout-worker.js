// Anon Poker devnet payout service (Cloudflare Worker, no dependencies).
// DEVNET ONLY. Holds the house key as a secret; the page never sees it.
//
// Bindings (set in the Cloudflare dashboard, never in code):
//   HOUSE_SECRET  secret  JSON array of the 64-byte house keypair
//   RPC_URL       secret  Helius devnet URL incl. api-key
//   LEDGER        KV      namespace
//   ALLOW_ORIGIN  var     exact site origin, e.g. https://yoursite.netlify.app
//
// Server-run tables (contract v2): the SERVER deals (engine.js), runs the bots (bots.js), decides results and
// owns the player's stack. This file holds NO poker rules: it only moves state between KV, the engine and the wire.
// Endpoints (JSON):
//   POST /table/open|/table/resume (wallet-signed), POST /hand/deal, POST /hand/act, GET /table/state (token)
//   POST /credit   {addr, sig}                     verifies a deposit on-chain, credits ledger once per sig
//   POST /withdraw {addr, lamports, nonce, ts, signature(base64)}   wallet-signed payout from ledger
//   GET  /balance?addr=...                         {balance, session:inTotal, stack, table} lamports
//   POST /buyin    {addr, lamports, nonce, ts, signature}   wallet-signed: balance -> table stack
//   POST /cashout  {addr, lamports, nonce, ts, signature}   wallet-signed: lamports must EQUAL the server stack -> balance
// Trust model: SOL tables are server-run (the client only sends actions). The old client-reported cash-out
// path is removed. Devnet only.
//
// Ledger model: balance = verified deposits - withdrawals + cashed-out table stacks.
// Money invariants (tested): sess.stack == tbl.hero*unit between hands; a hand running => no buyin/cashout;
// every write order loses value on a failed restore, never mints it.
// Writes per request: /hand/deal and mid-hand /hand/act write the table record once; a hand-ending request also
// writes sess.stack (sess first, then tbl; a failed tbl write restores sess and the retry replays the same
// hand, because bots are seeded and the hand state is only stored at the end of a request).
// Signed endpoints additionally write their replay nonce.
// KV is not atomic: fine for a single-user devnet demo, replace with a Durable Object for real use.

import * as E from './engine.js';
import * as BOT from './bots.js';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const SYS = '11111111111111111111111111111111';
export const LIMITS = { min: 10000000, max: 5000000000, step: 1000000, tsSkewMs: 300000, maxLedger: 5000000000 };

export const BUYIN = { min: 25000000, max: 5000000000, step: 100000 };
export const CASHOUT = { step: 100000 };
export const TABLES = { 'sol-micro': 100000, 'sol-mid': 1000000, 'sol-high': 10000000 }; // lamports per chip
export const MIN_STACK_CHIPS = 250;
const BOT_NAMES = ['Ace', 'Bluff', 'Chip', 'Dealer', 'Edge', 'Flop', 'Gutshot'];

export function b58dec(s) {
  let n = 0n;
  for (const ch of s) { const i = B58.indexOf(ch); if (i < 0) return null; n = n * 58n + BigInt(i); }
  const out = [];
  while (n > 0n) { out.push(Number(n & 255n)); n >>= 8n; }
  for (const ch of s) { if (ch === '1') out.push(0); else break; }
  return Uint8Array.from(out.reverse());
}
export function b58enc(u8) {
  let n = 0n;
  for (const b of u8) n = n * 256n + BigInt(b);
  let o = '';
  while (n > 0n) { o = B58[Number(n % 58n)] + o; n /= 58n; }
  for (const b of u8) { if (b === 0) o = '1' + o; else break; }
  return o;
}
const isAddr = a => typeof a === 'string' && a.length >= 32 && a.length <= 44 && (b58dec(a) || []).length === 32;
const b64dec = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64enc = u8 => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };

export function withdrawMessage(addr, lamports, nonce, ts) {
  return 'Anon Poker withdraw\nChain: Solana devnet\nAddress: ' + addr + '\nLamports: ' + lamports +
    '\nNonce: ' + nonce + '\nTimestamp: ' + ts + '\nThis signature authorises one payout of exactly this amount to this address.';
}

export function buyinMessage(addr, lamports, nonce, ts) {
  return 'Anon Poker table buy-in\nChain: Solana devnet\nAddress: ' + addr + '\nLamports: ' + lamports +
    '\nNonce: ' + nonce + '\nTimestamp: ' + ts + '\nThis signature authorises moving exactly this amount from your balance to your table stack.';
}
export function cashoutMessage(addr, lamports, nonce, ts) {
  return 'Anon Poker table cash-out\nChain: Solana devnet\nAddress: ' + addr + '\nLamports: ' + lamports +
    '\nNonce: ' + nonce + '\nTimestamp: ' + ts + '\nThis signature reports your final table stack and moves exactly this amount to your balance.';
}

export function openMessage(addr, tableId, bots, nonce, ts) {
  return 'Anon Poker open table\nChain: Solana devnet\nAddress: ' + addr + '\nTable: ' + tableId + '\nBots: ' + bots +
    '\nNonce: ' + nonce + '\nTimestamp: ' + ts + '\nThis signature authorises sitting at this table with your current table stack.';
}
export function resumeMessage(addr, nonce, ts) {
  return 'Anon Poker resume table\nChain: Solana devnet\nAddress: ' + addr +
    '\nNonce: ' + nonce + '\nTimestamp: ' + ts + '\nThis signature authorises resuming your open table and issuing a new table token.';
}

async function verifySig(addr, msgBytes, sig) {
  try {
    const key = await crypto.subtle.importKey('raw', b58dec(addr), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, sig, msgBytes);
  } catch (e) { return false; }
}

async function rpc(env, method, params) {
  const r = await fetch(env.RPC_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (!r.ok) throw new Error('RPC HTTP ' + r.status);
  const j = await r.json();
  if (j.error) throw new Error('RPC: ' + (j.error.message || 'error'));
  return j.result;
}

const shortvec = n => (n < 128 ? [n] : [(n & 127) | 128, n >> 7]);
// Legacy message: keys [house(signer,w), player(w), System(r)]; one Transfer.
export function buildPayoutMessage(house, player, lamports, blockhash) {
  const keys = [house, player, SYS].map(b58dec);
  const data = new Uint8Array(12);
  data[0] = 2;
  let v = BigInt(lamports);
  for (let i = 0; i < 8; i++) { data[4 + i] = Number(v & 255n); v >>= 8n; }
  return Uint8Array.from([1, 0, 1, 3, ...keys.flatMap(k => [...k]), ...b58dec(blockhash), 1, 2, 2, 0, 1, 12, ...data]);
}

async function houseKey(env) {
  const raw = Uint8Array.from(JSON.parse(env.HOUSE_SECRET));
  if (raw.length !== 64) throw new Error('bad house key');
  const pkcs8 = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20, ...raw.slice(0, 32)]);
  return { addr: b58enc(raw.slice(32)), key: await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']) };
}

const getBal = async (env, addr) => Number((await env.LEDGER.get('bal:' + addr)) || 0);
const setBal = (env, addr, n) => env.LEDGER.put('bal:' + addr, String(n));

export function verifyDeposit(tx, addr, house) {
  try {
    if (!tx || !tx.meta || tx.meta.err !== null) return null;
    const keys = tx.transaction.message.accountKeys;
    if (!keys[0] || keys[0].pubkey !== addr || keys[0].signer !== true) return null;
    const ix = tx.transaction.message.instructions.find(i => i.program === 'system' && i.parsed && i.parsed.type === 'transfer' &&
      i.parsed.info.source === addr && i.parsed.info.destination === house && Number.isSafeInteger(i.parsed.info.lamports) && i.parsed.info.lamports > 0);
    return ix ? ix.parsed.info.lamports : null;
  } catch (e) { return null; }
}

// sess:addr = {inTotal, stack} lamports. Old records ({inTotal} only) read as stack = inTotal.
async function getSess(env, addr) {
  try {
    const o = JSON.parse(await env.LEDGER.get('sess:' + addr));
    const inTotal = Number.isSafeInteger(o.inTotal) && o.inTotal > 0 ? o.inTotal : 0;
    const stack = Number.isSafeInteger(o.stack) && o.stack >= 0 ? o.stack : (o.stack === undefined ? inTotal : 0);
    return { inTotal, stack: inTotal > 0 ? stack : 0 };
  } catch (e) { return { inTotal: 0, stack: 0 }; }
}
const setSess = (env, addr, s) => env.LEDGER.put('sess:' + addr, JSON.stringify({ inTotal: s.inTotal, stack: s.stack }));

// tbl:addr = table record (see header); a closed table is stored as 'null' (the fake/real KV needs no delete).
async function getTbl(env, addr) {
  try { const o = JSON.parse(await env.LEDGER.get('tbl:' + addr)); return o && typeof o === 'object' && o.token ? o : null; } catch (e) { return null; }
}
const putTbl = (env, addr, t) => env.LEDGER.put('tbl:' + addr, JSON.stringify(t));
const running = t => !!(t && t.hand && !E.isOver(t.hand));

// Shared checks of the signed endpoints, in withdraw's order. msgFn(addr, lamports, nonce, ts) builds the signed text.
// amountOk === null: the endpoint carries no amount. Returns an error pair, or null when the request is authentic
// and fresh (its nonce is then consumed).
async function checkSigned(env, body, now, mark, msgFn, amountOk) {
  const { addr, lamports, nonce, ts, signature } = body;
  if (!isAddr(addr)) return [400, { error: 'bad address' }];
  if (amountOk && (!Number.isSafeInteger(lamports) || !amountOk(lamports))) return [400, { error: 'bad amount' }];
  if (typeof nonce !== 'string' || !/^[0-9a-f]{16,64}$/.test(nonce)) return [400, { error: 'bad nonce' }];
  if (!Number.isSafeInteger(ts) || Math.abs(now - ts) > LIMITS.tsSkewMs) return [400, { error: 'stale request' }];
  let sig;
  try { sig = b64dec(signature); } catch (e) { return [400, { error: 'bad signature encoding' }]; }
  if (sig.length !== 64) return [400, { error: 'bad signature' }];
  mark('verify-signature');
  if (!(await verifySig(addr, new TextEncoder().encode(msgFn(addr, lamports, nonce, ts)), sig))) return [401, { error: 'signature does not match' }];
  mark('ledger-read');
  if (await env.LEDGER.get('nonce:' + addr + ':' + nonce)) return [409, { error: 'replayed request' }];
  await env.LEDGER.put('nonce:' + addr + ':' + nonce, '1', { expirationTtl: 3600 });
  return null;
}

// KV is not atomic: fine for a single-user devnet demo. Every multi-key write debits/closes FIRST and credits
// LAST, and a failure restores in reverse order: if a restore fails too, value is lost, never minted.
async function buyin(env, body, now, mark = () => {}) {
  const bad = await checkSigned(env, body, now, mark, buyinMessage,
    l => l >= BUYIN.min && l <= BUYIN.max && l % BUYIN.step === 0);
  if (bad) return bad;
  const { addr, lamports } = body;
  const bal = await getBal(env, addr), s0 = await getSess(env, addr), tbl = await getTbl(env, addr);
  if (lamports > bal) return [402, { error: 'exceeds ledger balance', balance: bal }];
  let tbl1 = null;
  if (tbl) {
    if (running(tbl)) return [409, { error: 'hand in progress' }];
    if (lamports % tbl.unit !== 0) return [422, { error: 'amount must be a multiple of the table unit', unit: tbl.unit }];
    tbl1 = { ...tbl, hero: tbl.hero + lamports / tbl.unit };
  }
  const s1 = { inTotal: s0.inTotal + lamports, stack: s0.stack + lamports };
  mark('ledger-write');
  let step = 0;
  try {
    await setBal(env, addr, bal - lamports); step = 1;
    if (tbl1) { await putTbl(env, addr, tbl1); step = 2; }
    await setSess(env, addr, s1);
  } catch (e) {
    try { if (step >= 2) await putTbl(env, addr, tbl); } catch (e2) { /* value is lost, not minted */ }
    try { if (step >= 1) await setBal(env, addr, bal); } catch (e2) { /* nothing more to do */ }
    return [502, { error: 'ledger write failed, restored' }];
  }
  return [200, { balance: bal - lamports, session: s1.inTotal, stack: s1.stack, table: !!tbl }];
}

async function cashout(env, body, now, mark = () => {}) {
  const bad = await checkSigned(env, body, now, mark, cashoutMessage, l => l >= 0 && l % CASHOUT.step === 0);
  if (bad) return bad;
  const { addr, lamports } = body;
  const s0 = await getSess(env, addr), tbl = await getTbl(env, addr);
  if (s0.inTotal <= 0) return [409, { error: 'no open table session' }];
  if (running(tbl)) return [409, { error: 'hand in progress' }];
  // The server stack is the only cash-out amount. min() = a half-applied buy-in can only ever lose value.
  const stack = tbl ? Math.min(s0.stack, tbl.hero * tbl.unit) : s0.stack;
  if (lamports !== stack) return [422, { error: 'amount mismatch', stack }];
  const bal = await getBal(env, addr);
  mark('ledger-write');
  let step = 0;
  try {
    if (tbl) await env.LEDGER.put('tbl:' + addr, 'null'); step = 1;  // close the table first
    await setSess(env, addr, { inTotal: 0, stack: 0 }); step = 2;
    await setBal(env, addr, bal + lamports); // not clamped by maxLedger
  } catch (e) {
    try { if (step >= 2) await setSess(env, addr, s0); } catch (e2) { /* nothing more to do */ }
    try { if (step >= 1 && tbl) await putTbl(env, addr, tbl); } catch (e2) { /* nothing more to do */ }
    return [502, { error: 'ledger write failed, restored' }];
  }
  return [200, { balance: bal + lamports, session: 0, stack: 0, table: false }];
}

// ---------------------------------------------------------------- server-run table
const randHex = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); };
const HEX = (s, n) => typeof s === 'string' && new RegExp('^[0-9a-f]{' + n + '}$').test(s);
const tokenOk = (t, tok) => HEX(tok, 32) && tok === t.token;
const wrapErr = [502, { error: 'state write failed' }];

function seatsOf(t) {
  return [{ idx: 0, name: 'You', isBot: false, chips: t.hero, agg: 0 }].concat(t.bots.map((b, i) => ({ idx: i + 1, name: b.name, isBot: true, chips: b.chips, agg: b.agg })));
}

// A bot may only be shown cards at a real showdown: still in the hand when the hand is over and >1 seats remain.
function holeVisible(v, seat) {
  return seat.idx === 0 || (!!seat.hole && !seat.folded && v.seats.filter(s => !s.folded).length > 1);
}

// Builds the wire view of a table. NEVER includes the deck, a seed before its hand is over, or a token.
function tableView(t, events) {
  const h = t.hand, over = !h || E.isOver(h);
  let out;
  if (!h) {
    const seats = seatsOf(t).map(s => ({ idx: s.idx, name: s.name, isBot: s.isBot, chips: s.chips, bet: 0, folded: false, allIn: false, hole: null }));
    out = { handNo: t.handNo + 1, commit: t.nextCommit, stage: 'idle', dealer: t.dealer, seats, comm: [], pot: 0, toAct: null, legal: null, result: null, reveal: null, nextCommit: t.nextCommit, heroChips: t.hero };
  } else {
    const v = E.view(h, 0), reveal = over && t.lastReveal && t.lastReveal.handNo === t.cur.handNo ? t.lastReveal : null;
    const seats = v.seats.map(s => ({ ...s, hole: over ? (holeVisible(v, s) ? s.hole || null : null) : (s.idx === 0 ? s.hole || null : null) }));
    out = { ...v, handNo: t.cur.handNo, commit: t.cur.commit, seats, legal: over ? null : E.legal(h), toAct: over ? null : v.toAct,
      result: over ? E.result(h) : null, reveal, nextCommit: over ? t.nextCommit : null, heroChips: (seats[0] || {}).chips };
  }
  out.seq = t.seq;
  out.events = (events || []).map(ev => {
    if (!ev || typeof ev !== 'object') return ev;
    const c = { ...ev };
    if (c.cards && c.seat > 0 && !(over && c.type === 'showdown' && out.seats[c.seat] && out.seats[c.seat].hole)) delete c.cards;
    return c;
  });
  out.stackLamports = t.hero * t.unit;
  const j = JSON.stringify(out);
  if (j.includes('"deck"') || j.includes(t.nextSeed) || (t.cur && !over && j.includes(t.cur.serverSeed))) throw new Error('privacy');
  return out;
}

// Runs bots until the hero must act or the hand is over. rng is replayable: burn what earlier requests consumed.
function runBots(t, evs) {
  const h = t.hand, c = t.cur;
  const r = E.seededRandom(c.serverSeed + c.clientSeed + c.handNo + ':bots');
  for (let i = 0; i < t.rngN; i++) r();
  let n = t.rngN; const rng = () => { n++; return r(); };
  for (let g = 0; g < 400 && !E.isOver(h); g++) {
    const L = E.legal(h);
    if (!L) throw new Error('stuck');
    if (L.seat === 0) break;
    let a;
    try { a = BOT.decide(E.botView(h, L.seat), rng); } catch (e) { a = null; }
    let x = a && typeof a === 'object' ? E.applyAction(h, L.seat, a) : { ok: false };
    if (!x.ok) x = E.applyAction(h, L.seat, L.canCheck ? { type: 'check' } : L.callAmt > 0 ? { type: 'call' } : { type: 'fold' });
    if (!x.ok) throw new Error('bot fallback illegal');
    if (x.events) evs.push(...x.events);
  }
  if (!E.isOver(h)) { const L = E.legal(h); if (!L || L.seat !== 0) throw new Error('stuck'); }
  t.rngN = n;
}

// Called after the engine has moved: if the hand ended, settle the table record (not yet written).
// Returns {sessStack|null} or throws on a violated chip invariant (nothing has been written yet).
function settle(t, before) {
  const h = t.hand;
  if (!E.isOver(h)) return null;
  const v = E.view(h, 0), res = E.result(h);
  const chips = v.seats.map(s => s.chips);
  const sum = chips.reduce((a, b) => a + b, 0);
  if (!chips.every(Number.isSafeInteger) || chips.some(x => x < 0) || sum + res.rake + res.bbj !== before) throw new Error('chip invariant');
  t.hero = chips[0];
  t.bots.forEach((b, i) => { b.chips = chips[i + 1]; });
  t.dealer = v.dealer;
  t.rake = (t.rake || 0) + res.rake; t.bbj = (t.bbj || 0) + res.bbj;
  t.lastReveal = { serverSeed: t.cur.serverSeed, commit: t.cur.commit, clientSeed: t.cur.clientSeed, handNo: t.cur.handNo };
  return t.hero * t.unit;
}

// Writes the table (and, when a hand ended, sess.stack first). Returns an error pair or null.
async function persist(env, addr, t, sessStack, sess0) {
  try {
    if (sessStack !== null && sessStack !== sess0.stack) {
      await setSess(env, addr, { inTotal: sess0.inTotal, stack: sessStack });
      try { await putTbl(env, addr, t); } catch (e) {
        try { await setSess(env, addr, sess0); } catch (e2) { /* hand still marked running in KV: cash-out is blocked */ }
        return wrapErr;
      }
    } else await putTbl(env, addr, t);
  } catch (e) { return wrapErr; }
  return null;
}

async function tableOpen(env, body, now, mark = () => {}) {
  const { tableId, bots } = body;
  if (typeof tableId !== 'string' || !Object.prototype.hasOwnProperty.call(TABLES, tableId)) return [400, { error: 'bad table' }];
  if (!Number.isSafeInteger(bots) || bots < 1 || bots > 7) return [400, { error: 'bad bots' }];
  const bad = await checkSigned(env, body, now, mark, (a, l, n, t) => openMessage(a, tableId, bots, n, t), null);
  if (bad) return bad;
  const { addr } = body, unit = TABLES[tableId];
  if (await getTbl(env, addr)) return [409, { error: 'table already open' }];
  const s = await getSess(env, addr);
  if (s.stack <= 0) return [422, { error: 'no table stack' }];
  const chips = s.stack / unit;
  if (!Number.isSafeInteger(chips) || chips < MIN_STACK_CHIPS) return [422, { error: 'stack below table minimum', minChips: MIN_STACK_CHIPS, unit }];
  const seed = randHex(32), t = {
    token: randHex(16), unit, tableId, bots: Array.from({ length: bots }, (_, i) => ({ name: BOT_NAMES[i], chips, agg: [0.5, 0.3, 0.7, 0.4, 0.6, 0.2, 0.8][i] })),
    botStart: chips, dealer: 0, handNo: 0, hero: chips, hand: null, cur: null, nextSeed: seed, nextCommit: await E.sha256Hex(seed), lastReveal: null, seq: 0, rngN: 0 };
  mark('ledger-write');
  try { await putTbl(env, addr, t); } catch (e) { return wrapErr; }
  return [200, { token: t.token, unit, tableId, handNo: 1, commit: t.nextCommit, stackChips: chips, stackLamports: chips * unit, bots: t.bots.map(b => ({ name: b.name, chips: b.chips })) }];
}

async function tableResume(env, body, now, mark = () => {}) {
  const bad = await checkSigned(env, body, now, mark, (a, l, n, t) => resumeMessage(a, n, t), null);
  if (bad) return bad;
  const { addr } = body, t = await getTbl(env, addr);
  if (!t) return [404, { error: 'no open table' }];
  t.token = randHex(16); // the old token dies here
  mark('ledger-write');
  try { await putTbl(env, addr, t); } catch (e) { return wrapErr; }
  return [200, { token: t.token, unit: t.unit, tableId: t.tableId, ...tableView(t, []) }];
}

async function tableState(env, url) {
  const addr = url.searchParams.get('addr'), token = url.searchParams.get('token');
  if (!isAddr(addr)) return [400, { error: 'bad address' }];
  const t = await getTbl(env, addr);
  if (!t) return [404, { error: 'no open table' }];
  if (!tokenOk(t, token)) return [401, { error: 'bad token' }];
  return [200, tableView(t, [])];
}

async function handDeal(env, body, mark = () => {}) {
  const { addr, token, clientSeed } = body;
  if (!isAddr(addr)) return [400, { error: 'bad address' }];
  if (!HEX(clientSeed, 16)) return [400, { error: 'bad client seed' }];
  const t = await getTbl(env, addr);
  if (!t) return [404, { error: 'no open table' }];
  if (!tokenOk(t, token)) return [401, { error: 'bad token' }];
  if (running(t)) return [409, { error: 'hand in progress' }];
  if (t.hero < E.CFG.BB) return [409, { error: 'stack below big blind' }];
  const sess0 = await getSess(env, addr);
  mark('engine');
  t.bots.forEach(b => { if (b.chips < E.CFG.BB) b.chips = t.botStart; }); // house-side bot rebuy, never touches lamports
  const handNo = t.handNo + 1, seats = seatsOf(t), dealer = (t.dealer + 1) % seats.length;
  const before = seats.reduce((a, s) => a + s.chips, 0);
  const cur = { serverSeed: t.nextSeed, clientSeed, commit: t.nextCommit, handNo };
  const h = E.newHand({ seats, dealer, serverSeed: cur.serverSeed, clientSeed, handNo });
  const evs = Array.isArray(h.events) ? h.events.slice() : [];
  t.hand = h; t.cur = cur; t.handNo = handNo; t.seq = 0; t.rngN = 0;
  t.nextSeed = randHex(32); t.nextCommit = await E.sha256Hex(t.nextSeed);
  runBots(t, evs);
  const ss = settle(t, before);
  const view = tableView(t, evs);
  const err = await persist(env, addr, t, ss, sess0);
  return err || [200, view];
}

async function handAct(env, body, mark = () => {}) {
  const { addr, token, handNo, seq, action } = body;
  if (!isAddr(addr)) return [400, { error: 'bad address' }];
  const t = await getTbl(env, addr);
  if (!t) return [404, { error: 'no open table' }];
  if (!tokenOk(t, token)) return [401, { error: 'bad token' }];
  if (!running(t)) return [409, { error: 'no hand in progress' }];
  if (handNo !== t.cur.handNo) return [409, { error: 'stale hand', handNo: t.cur.handNo }];
  if (!Number.isSafeInteger(seq)) return [400, { error: 'bad seq' }];
  if (seq !== t.seq) return [409, { error: 'bad seq', seq: t.seq }];
  if (!action || typeof action !== 'object' || Array.isArray(action) || !['fold', 'check', 'call', 'raise'].includes(action.type)) return [422, { error: 'illegal action', why: 'bad action', legal: E.legal(t.hand) }];
  const a = { type: action.type };
  if (a.type === 'raise') {
    if (!Number.isSafeInteger(action.amount)) return [422, { error: 'illegal action', why: 'bad amount', legal: E.legal(t.hand) }];
    a.amount = action.amount;
  }
  const L = E.legal(t.hand);
  if (!L || L.seat !== 0) return [409, { error: 'not your turn' }];
  const sess0 = await getSess(env, addr);
  mark('engine');
  const before = seatsOf(t).reduce((s, x) => s + x.chips, 0);
  const r = E.applyAction(t.hand, 0, a);
  if (!r.ok) return [422, { error: 'illegal action', why: String(r.why || '').slice(0, 80), legal: E.legal(t.hand) }];
  const evs = (r.events || []).slice();
  t.seq++;
  runBots(t, evs);
  const ss = settle(t, before);
  const view = tableView(t, evs);
  const err = await persist(env, addr, t, ss, sess0);
  return err || [200, view];
}

async function credit(env, body, mark = () => {}) {
  const { addr, sig } = body;
  if (!isAddr(addr)) return [400, { error: 'bad address' }];
  if (typeof sig !== 'string' || (b58dec(sig) || []).length !== 64) return [400, { error: 'bad signature' }];
  mark('ledger-read');
  if (await env.LEDGER.get('dep:' + sig)) return [200, { credited: 0, balance: await getBal(env, addr), note: 'already credited' }];
  mark('house-key');
  const house = (await houseKey(env)).addr;
  mark('rpc-status');
  const st = await rpc(env, 'getSignatureStatuses', [[sig], { searchTransactionHistory: true }]);
  const s = st && st.value && st.value[0];
  if (!s || s.err || !(s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) return [409, { error: 'deposit not confirmed' }];
  mark('rpc-tx');
  const tx = await rpc(env, 'getTransaction', [sig, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
  const lam = verifyDeposit(tx, addr, house);
  if (lam === null) return [422, { error: 'not a valid deposit from this address to the house' }];
  mark('ledger-write');
  await env.LEDGER.put('dep:' + sig, String(lam));
  const bal = Math.min(LIMITS.maxLedger, (await getBal(env, addr)) + lam);
  await setBal(env, addr, bal);
  return [200, { credited: lam, balance: bal }];
}

async function withdraw(env, body, now, mark = () => {}) {
  const { addr, lamports, nonce, ts, signature } = body;
  if (!isAddr(addr)) return [400, { error: 'bad address' }];
  if (!Number.isSafeInteger(lamports) || lamports < LIMITS.min || lamports > LIMITS.max || lamports % LIMITS.step !== 0) return [400, { error: 'bad amount' }];
  if (typeof nonce !== 'string' || !/^[0-9a-f]{16,64}$/.test(nonce)) return [400, { error: 'bad nonce' }];
  if (!Number.isSafeInteger(ts) || Math.abs(now - ts) > LIMITS.tsSkewMs) return [400, { error: 'stale request' }];
  let sig;
  try { sig = b64dec(signature); } catch (e) { return [400, { error: 'bad signature encoding' }]; }
  if (sig.length !== 64) return [400, { error: 'bad signature' }];
  const msg = new TextEncoder().encode(withdrawMessage(addr, lamports, nonce, ts));
  mark('verify-signature');
  if (!(await verifySig(addr, msg, sig))) return [401, { error: 'signature does not match' }];
  mark('ledger-read');
  if (await env.LEDGER.get('nonce:' + addr + ':' + nonce)) return [409, { error: 'replayed request' }];
  await env.LEDGER.put('nonce:' + addr + ':' + nonce, '1', { expirationTtl: 3600 });
  const bal = await getBal(env, addr);
  if (lamports > bal) return [402, { error: 'exceeds ledger balance', balance: bal }];
  await setBal(env, addr, bal - lamports); // debit first; refund if the send fails
  try {
    mark('house-key');
    const h = await houseKey(env);
    mark('rpc-send');
    const bh = (await rpc(env, 'getLatestBlockhash', [{ commitment: 'confirmed' }])).value.blockhash;
    const m = buildPayoutMessage(h.addr, addr, lamports, bh);
    const s = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, h.key, m));
    const wire = Uint8Array.from([1, ...s, ...m]);
    const txSig = await rpc(env, 'sendTransaction', [b64enc(wire), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
    return [200, { signature: txSig, balance: bal - lamports }];
  } catch (e) {
    await setBal(env, addr, (await getBal(env, addr)) + lamports);
    return [502, { error: 'payout failed, ledger restored', detail: String(e.message || e) }];
  }
}

// Names only, never values: tells the operator which setting is wrong without leaking anything.
export function configProblems(env) {
  const bad = [];
  if (!env.LEDGER || typeof env.LEDGER.get !== 'function') bad.push('LEDGER (KV binding)');
  if (!env.RPC_URL || !/^https:\/\//.test(env.RPC_URL)) bad.push('RPC_URL');
  if (!env.ALLOW_ORIGIN) bad.push('ALLOW_ORIGIN');
  let ok = false;
  try { const a = JSON.parse(env.HOUSE_SECRET); ok = Array.isArray(a) && a.length === 64 && a.every(n => Number.isInteger(n) && n >= 0 && n < 256); } catch (e) { ok = false; }
  if (!ok) bad.push('HOUSE_SECRET (missing or not the 64-number key)');
  return bad;
}

export async function handle(request, env, now = Date.now()) {
  const origin = env.ALLOW_ORIGIN || '';
  const cors = { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type', 'vary': 'origin' };
  const out = (st, o) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json', ...cors } });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!origin || request.headers.get('origin') !== origin) return out(403, { error: 'origin not allowed' });
  const url = new URL(request.url);
  const cfg = configProblems(env);
  if (cfg.length) return out(503, { error: 'service misconfigured', missing: cfg });
  let stage = '';
  const mark = n => { stage = n; };
  try {
    if (request.method === 'GET' && url.pathname === '/balance') {
      const a = url.searchParams.get('addr');
      if (!isAddr(a)) return out(400, { error: 'bad address' });
      const s = await getSess(env, a);
      return out(200, { balance: await getBal(env, a), session: s.inTotal, stack: s.stack, table: !!(await getTbl(env, a)) });
    }
    if (request.method === 'GET' && url.pathname === '/table/state') { const [st, o] = await tableState(env, url); return out(st, o); }
    if (request.method === 'POST' && (url.pathname === '/credit' || url.pathname === '/withdraw')) {
      let body; try { body = await request.json(); } catch (e) { return out(400, { error: 'bad json' }); }
      const [st, o] = url.pathname === '/credit' ? await credit(env, body || {}, mark) : await withdraw(env, body || {}, now, mark);
      return out(st, o);
    }
    const POSTS = { '/buyin': buyin, '/cashout': cashout, '/table/open': tableOpen, '/table/resume': tableResume,
      '/hand/deal': (e, b, n, m) => handDeal(e, b, m), '/hand/act': (e, b, n, m) => handAct(e, b, m) };
    if (request.method === 'POST' && Object.prototype.hasOwnProperty.call(POSTS, url.pathname)) {
      let body; try { body = await request.json(); } catch (e) { return out(400, { error: 'bad json' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return out(400, { error: 'bad json' });
      const [st, o] = await POSTS[url.pathname](env, body, now, mark);
      return out(st, o);
    }
    return out(404, { error: 'not found' });
  } catch (e) { return out(500, { error: 'server error', stage, kind: String((e && e.name) || 'Error').slice(0, 40) }); }
}

export default { fetch: (req, env) => handle(req, env) };
