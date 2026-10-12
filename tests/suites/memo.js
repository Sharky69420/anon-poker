// Memo anchoring suite. Runs the REAL page code in a vm sandbox. The wallet mock is STRICT
// (like Phantom): it parses the payload with an independent decoder and rejects a missing
// signature-slot prefix, trailing bytes, wrong program, extra instructions, wrong fee payer.
// NOT run against real Phantom or devnet (no network / wallet in CI).
module.exports=async function(){
let pass=0,fail=0;const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
const vm=require('vm'),fs=require('fs'),path=require('path'),nodeCrypto=require('crypto');
const wc=nodeCrypto.webcrypto;
const html=fs.readFileSync(path.join(__dirname,'..','..','app','index.html'),'utf8');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
const ALPHA='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const MEMO='MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
function b58enc(u8){let n=0n;for(const b of u8)n=n*256n+BigInt(b);let o='';while(n>0n){o=ALPHA[Number(n%58n)]+o;n/=58n;}for(const b of u8){if(b===0)o='1'+o;else break;}return o;}
function b58dec(str){let n=0n;for(const c of str){const i=ALPHA.indexOf(c);if(i<0)throw new Error('bad b58');n=n*58n+BigInt(i);}const o=[];while(n>0n){o.push(Number(n&255n));n>>=8n;}for(const c of str){if(c==='1')o.push(0);else break;}return Uint8Array.from(o.reverse());}
const rnd32=()=>Uint8Array.from(nodeCrypto.randomBytes(32));

// ---- independent strict parser of a serialized legacy transaction ----
function parseTx(buf){
  let o=0;const need=n=>{if(o+n>buf.length)throw new Error('Reached end of buffer unexpectedly');};
  const sv=()=>{let v=0,sh=0;for(;;){need(1);const b=buf[o++];v|=(b&127)<<sh;if(!(b&128))break;sh+=7;if(sh>14)throw new Error('shortvec too long');}return v;};
  const nsig=sv();const sigs=[];for(let i=0;i<nsig;i++){need(64);sigs.push(Buffer.from(buf.slice(o,o+64)));o+=64;}
  need(1);if(buf[o]&0x80)throw new Error('versioned message not expected');
  need(3);const h=[buf[o],buf[o+1],buf[o+2]];o+=3;
  const nk=sv();const keys=[];for(let i=0;i<nk;i++){need(32);keys.push(b58enc(buf.slice(o,o+32)));o+=32;}
  need(32);const bh=b58enc(buf.slice(o,o+32));o+=32;
  const ni=sv();const ixs=[];
  for(let i=0;i<ni;i++){need(1);const pid=buf[o++];const na=sv();need(na);const acc=Array.from(buf.slice(o,o+na));o+=na;const dl=sv();need(dl);const data=Buffer.from(buf.slice(o,o+dl));o+=dl;ixs.push({pid,acc,data});}
  if(o!==buf.length)throw new Error('trailing bytes after message: '+(buf.length-o));
  // structural validity the runtime enforces
  if(h[0]!==nsig)throw new Error('signature count '+nsig+' != required '+h[0]);
  if(h[0]+h[2]>nk||h[1]>=h[0]+0&&h[1]>h[0])throw new Error('bad header');
  for(const ix of ixs){if(ix.pid>=nk)throw new Error('program index out of range');if(ix.pid<h[0])throw new Error('program id may not be a signer');for(const a of ix.acc)if(a>=nk)throw new Error('account index out of range');}
  return {sigs,h,keys,bh,ixs};
}

// ---- sandbox ----
const els={};
function el(id){return els[id]||(els[id]={style:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},innerHTML:'',textContent:'',value:'',addEventListener(){},insertAdjacentHTML(w,h){this.innerHTML+=h;},querySelector:()=>el('q'),querySelectorAll:()=>[],set onclick(f){},set oninput(f){},set onchange(f){}});}
const s={console,Math,Object,Array,Set,Map,JSON,Number,Date,Uint8Array,TextEncoder,TextDecoder,BigInt,String,Error,Promise,Buffer,RegExp};
s.document={getElementById:id=>el(id),createElement:()=>el('c'),querySelector:()=>el('q'),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}}};
const PLAYER=b58enc(rnd32());
const BH=b58enc(rnd32());
// mock chain / wallet state
const W={requests:[],fetches:0,mode:'ok',statusMode:'ok',txs:{},rpcFail:false,rpcMemoOverride:null,hang:false};
const strictPhantom={isPhantom:true,connect:async()=>({}),
  async request(args){
    W.requests.push(args);
    if(W.mode==='decline')throw Object.assign(new Error('User rejected the request.'),{code:4001});
    if(W.hang)return new Promise(()=>{});
    if(!args||args.method!=='signAndSendTransaction')throw new Error('unsupported method');
    const m=args.params&&args.params.message;
    if(typeof m!=='string')throw new Error('message must be a base58 string');
    const raw=b58dec(m);
    const tx=parseTx(raw); // throws like the real wallet on a bare message / trailing bytes
    if(tx.sigs.length!==1||!tx.sigs[0].equals(Buffer.alloc(64)))throw new Error('expected one zeroed signature slot');
    if(tx.keys[0]!==PLAYER)throw new Error('fee payer is not the connected account');
    if(tx.h.join()!=='1,0,1')throw new Error('unexpected header '+tx.h);
    if(tx.keys.length!==2||tx.keys[1]!==MEMO)throw new Error('only the Memo program is permitted here');
    if(tx.ixs.length!==1||tx.ixs[0].pid!==1)throw new Error('exactly one memo instruction required');
    if(tx.ixs[0].acc.some(a=>a!==0))throw new Error('memo accounts may only be the signer');
    if(tx.ixs[0].data.length<1||tx.ixs[0].data.length>566)throw new Error('memo size');
    if(tx.bh!==BH)throw new Error('blockhash not recent');
    const text=new TextDecoder('utf-8',{fatal:true}).decode(tx.ixs[0].data);
    const sig=b58enc(nodeCrypto.randomBytes(64));
    W.txs[sig]={text,payer:tx.keys[0]};
    return {signature:sig};
  }};
s.window={matchMedia:()=>({matches:true}),phantom:{solana:strictPhantom}};s.matchMedia=()=>({matches:true});s.localStorage={getItem:()=>null,setItem(){}};
s.crypto=wc;s.navigator={};s.setInterval=()=>0;s.clearInterval=()=>{};s.requestAnimationFrame=()=>0;s.cancelAnimationFrame=()=>{};s.performance={now:()=>0};
s.clearTimeout=()=>{};
// timers: the 45 s wallet timeout (and the 1234 test value) fire only when asked; short polls run on next tick
s.setTimeout=(f,ms)=>{if(ms===45000)return 0;setImmediate(f);return 0;};
s.fetch=async(url,opt)=>{
  W.fetches++;
  if(W.rpcFail)throw new Error('network down');
  const b=JSON.parse(opt.body);const res=r=>({ok:true,json:async()=>({jsonrpc:'2.0',id:1,result:r})});
  if(b.method==='getLatestBlockhash')return res({value:{blockhash:BH}});
  if(b.method==='getSignatureStatuses'){
    if(W.statusMode==='none')return res({value:[null]});
    if(W.statusMode==='err')return res({value:[{err:{InstructionError:[0,'x']},confirmationStatus:'confirmed'}]});
    return res({value:[{err:null,confirmationStatus:'confirmed'}]});}
  if(b.method==='getTransaction'){
    const t=W.txs[b.params[0]];if(!t)return res(null);
    const text=W.rpcMemoOverride!==null?W.rpcMemoOverride:t.text;
    return res({blockTime:1760000000,meta:{err:null},transaction:{message:{accountKeys:[{pubkey:t.payer,signer:true,writable:true},{pubkey:MEMO,signer:false,writable:false}],instructions:[{program:'spl-memo',programId:MEMO,parsed:text}]}}});}
  throw new Error('unexpected rpc '+b.method);
};
vm.createContext(s);
vm.runInContext(code+';globalThis.T={SOL_CFG,SOLWAL,PF,MEM,MEM_PROGRAM,pfCommit,pfReveal,sha256Hex,solB58Encode,solB58Decode,solMemoBuildMessage,solBuildUnsignedTx,solMemoVerifyTx,memAnchor,memOnCommit,memExplorerUrl,memToggleAuto,memRenderVerifier,openPF};',s);
const T=s.T;
T.SOL_CFG.pollMs=0;T.SOL_CFG.pollMax=3;
const reset=()=>{W.requests.length=0;W.fetches=0;W.mode='ok';W.statusMode='ok';W.rpcFail=false;W.rpcMemoOverride=null;W.hang=false;T.SOL_CFG.connectTimeoutMs=45000;T.SOL_CFG.pollMax=3;T.MEM.busy=false;T.MEM.auto=false;for(const k of Object.keys(T.MEM.by))delete T.MEM.by[k];};
const newCommit=()=>{T.pfCommit();return T.PF.commit;};
const body=()=>el('pfBody').innerHTML;

// ---------- 0. strict mock really is strict ----------
ok('config: memo program id is the 32-byte canonical key', b58dec(MEMO).length===32&&T.MEM_PROGRAM===MEMO);
const COMMIT0='ab'.repeat(32);
const msg0=T.solMemoBuildMessage(PLAYER,COMMIT0,BH);
const goodTx=T.solBuildUnsignedTx(msg0);
const tryReq=async b=>{try{await strictPhantom.request({method:'signAndSendTransaction',params:{message:b58enc(b)}});return 'accepted';}catch(e){return String(e.message);}};
T.SOLWAL.addr=PLAYER;
ok('strict wallet accepts a well-formed memo tx', await tryReq(goodTx)==='accepted');
ok('strict wallet rejects a bare message (Phantom buffer bug)', /Reached end of buffer|signature|trailing|header|required|shortvec|versioned|out of range|program id/i.test(await tryReq(msg0)), await tryReq(msg0));
ok('strict wallet rejects trailing bytes', /trailing/.test(await tryReq(Uint8Array.from([...goodTx,0]))));
{const bad=Uint8Array.from(goodTx);bad.set(b58dec('11111111111111111111111111111111'),1+64+3+1+32);ok('strict wallet rejects wrong program', /Memo program/.test(await tryReq(bad)));}
{const bad=Uint8Array.from(goodTx);bad[1]=1;ok('strict wallet rejects non-zero signature slot', /zeroed/.test(await tryReq(bad)));}
ok('strict wallet rejects truncated payload', /end of buffer/.test(await tryReq(goodTx.slice(0,goodTx.length-1))));
W.requests.length=0;

// ---------- 1. transaction structure, independent decode ----------
const tx=parseTx(goodTx);
ok('tx: one zero signature slot', tx.sigs.length===1&&tx.sigs[0].equals(Buffer.alloc(64)));
ok('tx: header 1,0,1 (one signer, memo program read-only unsigned)', tx.h.join()==='1,0,1');
ok('tx: account keys = [player, memo program]', tx.keys.join()===[PLAYER,MEMO].join());
ok('tx: blockhash embedded', tx.bh===BH);
ok('tx: exactly one instruction, program index 1, accounts [0]', tx.ixs.length===1&&tx.ixs[0].pid===1&&tx.ixs[0].acc.join()==='0');
ok('tx: memo data equals the commitment text byte for byte', tx.ixs[0].data.equals(Buffer.from(COMMIT0,'utf8'))&&tx.ixs[0].data.length===64);
{const expected=Buffer.concat([Buffer.from([1,0,1,2]),Buffer.from(b58dec(PLAYER)),Buffer.from(b58dec(MEMO)),Buffer.from(b58dec(BH)),Buffer.from([1,1,1,0,64]),Buffer.from(COMMIT0)]);
 ok('tx: message bytes equal independently assembled bytes', Buffer.from(msg0).equals(expected));
 ok('tx: payload length = 1 + 64 + message', goodTx.length===65+expected.length&&goodTx[0]===1);}
ok('builder rejects empty memo', (()=>{try{T.solMemoBuildMessage(PLAYER,'',BH);return false;}catch(e){return true;}})());
ok('builder accepts 566-byte memo, rejects 567', (()=>{try{const m=T.solMemoBuildMessage(PLAYER,'x'.repeat(566),BH);const d=parseTx(T.solBuildUnsignedTx(m));if(d.ixs[0].data.length!==566)return false;}catch(e){return false;}try{T.solMemoBuildMessage(PLAYER,'x'.repeat(567),BH);return false;}catch(e){return true;}})());
ok('builder rejects bad signer key and bad blockhash', (()=>{let n=0;try{T.solMemoBuildMessage('0OIl',COMMIT0,BH);}catch(e){n++;}try{T.solMemoBuildMessage(PLAYER,COMMIT0,'short');}catch(e){n++;}return n===2;})());

// ---------- 2. end-to-end happy path, real pfCommit commitment ----------
reset();T.SOLWAL.addr=PLAYER;
const c1=newCommit();
ok('commitment is SHA-256 of the seed (independent hash)', /^[0-9a-f]{64}$/.test(c1)&&nodeCrypto.createHash('sha256').update(T.PF.serverSeed).digest('hex')===c1);
const r1=await T.memAnchor(c1);
ok('anchor ok with a signature', r1.ok===true&&r1.confirmed===true&&typeof r1.sig==='string', JSON.stringify(r1));
ok('wallet was asked exactly once', W.requests.length===1);
ok('memo text received by the wallet equals the commitment exactly', W.txs[r1.sig]&&W.txs[r1.sig].text===c1);
ok('state confirmed and signature stored', T.MEM.by[c1].state==='confirmed'&&T.MEM.by[c1].sig===r1.sig);
ok('explorer url format', T.memExplorerUrl(r1.sig)==='https://explorer.solana.com/tx/'+r1.sig+'?cluster=devnet');
// verifier UI
T.openPF();
{const h=body();const hrefs=[...h.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);
 ok('UI: exactly one link, exact explorer devnet format', hrefs.length===1&&hrefs[0]==='https://explorer.solana.com/tx/'+r1.sig+'?cluster=devnet', hrefs.join());
 ok('UI: labeled devnet and anchored', /devnet/i.test(h)&&/Anchored on Solana devnet/.test(h));
 ok('UI: original verifier content still present', h.includes('Commitment (SHA-256)')&&h.includes(c1));
 ok('UI: link opens safely (noopener)', /rel="noopener noreferrer"/.test(h)&&/target="_blank"/.test(h));}

// ---------- 3. idempotency ----------
const r1b=await T.memAnchor(c1);
ok('same commitment again: dup, same sig, no second wallet request', r1b.ok&&r1b.dup===true&&r1b.sig===r1.sig&&W.requests.length===1);
reset();T.SOLWAL.addr=PLAYER;
{const c=newCommit();const [a,b]=await Promise.all([T.memAnchor(c),T.memAnchor(c)]);
 ok('concurrent double call sends once', W.requests.length===1&&(a.ok||b.ok)&&!(a.ok&&b.ok&&!a.dup&&!b.dup), JSON.stringify([a,b]));
 const c2=newCommit();const r=await T.memAnchor(c2);
 ok('a different commitment anchors separately', r.ok&&W.requests.length===2&&W.txs[r.sig].text===c2&&c2!==c);}
reset();T.SOLWAL.addr=PLAYER;
{const c=newCommit();T.MEM.auto=true;T.memOnCommit(c);T.memOnCommit(c);await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
 await new Promise(r=>setImmediate(r));
 ok('auto hook fired twice for one commitment -> one wallet request', W.requests.length===1, W.requests.length);}

// ---------- 4. auto is off by default; hook is fire-and-forget ----------
reset();T.SOLWAL.addr=PLAYER;
ok('auto-anchor is OFF by default', T.MEM.auto===false);
{T.SOLWAL.addr=PLAYER;T.memRenderVerifier();const body=el('pfBody').innerHTML;ok('verifier offers NO auto-anchor checkbox (no per-hand wallet popups)',!/type="checkbox"/.test(body)&&!/Auto-anchor/i.test(body)&&/manual/i.test(body),body.slice(-200));}
{const c=newCommit();const ret=T.memOnCommit(c);await new Promise(r=>setImmediate(r));
 ok('hook with auto off does nothing (no wallet request, no rpc)', ret===undefined&&W.requests.length===0&&W.fetches===0);}
{T.MEM.auto=true;W.hang=true;const c=newCommit();let t0=Date.now();const ret=T.memOnCommit(c);
 ok('hook returns synchronously even if Phantom never answers', ret===undefined&&Date.now()-t0<50);
 await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
 ok('...and the page can keep committing/dealing meanwhile', (()=>{const x=T.PF.commit;T.pfCommit();return T.PF.commit&&T.PF.commit!==x;})());
 W.hang=false;}

// ---------- 5. decline / failure never blocks ----------
reset();T.SOLWAL.addr=PLAYER;
{const c=newCommit();T.MEM.auto=true;W.mode='decline';
 let r,threw=false;try{r=await T.memAnchor(c);}catch(e){threw=true;}
 ok('decline: resolves (no throw) with why=rejected', !threw&&r.ok===false&&r.why==='rejected', JSON.stringify(r));
 ok('decline: state declined, no signature, auto switched off', T.MEM.by[c].state==='declined'&&!T.MEM.by[c].sig&&T.MEM.auto===false);
 T.openPF();ok('decline: UI says play continues, no explorer link', /Play continues/.test(body())&&!/explorer\.solana\.com/.test(body()));
 ok('decline: pfCommit/pfReveal still work afterwards', (()=>{const x=newCommit();T.pfReveal();return !!x&&!!T.PF.lastReveal;})());
 W.mode='ok';const c2=T.PF.lastReveal.commit;
 const rr=await T.memAnchor(c);ok('decline: user can retry the same commitment later', rr.ok===true&&W.requests.length===2);}
reset();T.SOLWAL.addr=PLAYER;
{const c=newCommit();W.rpcFail=true;let r,threw=false;try{r=await T.memAnchor(c);}catch(e){threw=true;}
 ok('rpc down: resolves with error, no throw', !threw&&r.ok===false&&r.why==='error'&&T.MEM.by[c].state==='error');
 ok('rpc down: busy flag released', T.MEM.busy===false);
 W.rpcFail=false;const rr=await T.memAnchor(c);ok('rpc back: retry works', rr.ok&&rr.confirmed);}
reset();T.SOLWAL.addr=PLAYER;
{const c=newCommit();T.SOL_CFG.connectTimeoutMs=1234;s.setTimeout=(f,ms)=>{if(ms===45000)return 0;setImmediate(f);return 0;};W.hang=true;
 const r=await T.memAnchor(c);ok('wallet timeout: resolves error, busy released', r.ok===false&&T.MEM.busy===false&&T.MEM.by[c].state==='error');W.hang=false;}
reset();T.SOLWAL.addr=PLAYER;
{const c=newCommit();W.statusMode='err';const r=await T.memAnchor(c);
 ok('on-chain failure: reported failed, signature not kept, retry allowed', r.ok===false&&r.why==='failed'&&!T.MEM.by[c].sig&&T.MEM.by[c].state==='failed');
 W.statusMode='ok';const r2=await T.memAnchor(c);ok('on-chain failure: retry succeeds', r2.ok&&r2.confirmed);}
reset();T.SOLWAL.addr=PLAYER;
{const c=newCommit();W.statusMode='none';T.SOL_CFG.pollMax=2;const r=await T.memAnchor(c);
 ok('not confirmed in time: ok, unconfirmed, sig kept, labeled awaiting', r.ok&&r.confirmed===false&&T.MEM.by[c].state==='sent');
 T.openPF();ok('...UI shows link but NOT the anchored tick', /explorer\.solana\.com\/tx\//.test(body())&&!/Anchored on Solana devnet/.test(body())&&/awaiting/i.test(body()));
 const n=W.requests.length;await T.memAnchor(c);ok('...and is not re-sent', W.requests.length===n);}
reset();T.SOLWAL.addr=PLAYER;
{const c=newCommit();W.rpcMemoOverride='ff'.repeat(32);const r=await T.memAnchor(c);
 ok('memo on chain differs from commitment -> unverified, not anchored', r.ok===false&&r.why==='unverified'&&T.MEM.by[c].state==='unverified');
 T.openPF();ok('...UI does not claim anchored', !/Anchored on Solana devnet/.test(body())&&/could not be verified/.test(body()));}
// pure verifier
{const C=COMMIT0;const good=()=>({blockTime:1,meta:{err:null},transaction:{message:{accountKeys:[{pubkey:PLAYER,signer:true}],instructions:[{program:'spl-memo',programId:MEMO,parsed:C}]}}});
 const E={from:PLAYER,commit:C};
 ok('verifyTx: valid', T.solMemoVerifyTx(good(),E).ok===true);
 let t=good();t.meta.err={x:1};ok('verifyTx: on-chain error rejected', !T.solMemoVerifyTx(t,E).ok);
 t=good();t.transaction.message.instructions[0].programId='11111111111111111111111111111111';ok('verifyTx: wrong program rejected', !T.solMemoVerifyTx(t,E).ok);
 t=good();t.transaction.message.instructions[0].parsed=C.replace(/^./,'0');ok('verifyTx: wrong memo rejected', !T.solMemoVerifyTx(t,E).ok);
 t=good();t.transaction.message.accountKeys[0].pubkey='X';ok('verifyTx: wrong signer rejected', !T.solMemoVerifyTx(t,E).ok);
 t=good();t.transaction.message.instructions.push({program:'system',programId:'11111111111111111111111111111111',parsed:{}});ok('verifyTx: extra instruction rejected', !T.solMemoVerifyTx(t,E).ok);
 t=good();t.transaction.message.instructions.unshift({program:'compute-budget',programId:'ComputeBudget111111111111111111111111111111',parsed:{}});t.transaction.message.instructions.push({programId:'L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95'});ok('verifyTx: wallet ComputeBudget + Lighthouse guard tolerated', T.solMemoVerifyTx(t,E).ok);
 t=good();t.transaction.message.instructions.push({programId:'ComputeBudget111111111111111111111111111111'});t.transaction.message.instructions.push(t.transaction.message.instructions[0]);ok('verifyTx: two memo instructions rejected even with allowed extras', !T.solMemoVerifyTx(t,E).ok);
 t=good();t.transaction.message.instructions.push({programId:'L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95'});t.transaction.message.instructions[0].parsed='0'.repeat(64);ok('verifyTx: allowed extras do not excuse a wrong memo', !T.solMemoVerifyTx(t,E).ok);
 t=good();t.transaction.message.instructions.push({programId:'11111111111111111111111111111111'});ok('verifyTx: rejection names the unexpected program', /Unexpected instructions \(1111/.test(T.solMemoVerifyTx(t,E).why||''));
 ok('verifyTx: null / garbage never throws', !T.solMemoVerifyTx(null,E).ok&&!T.solMemoVerifyTx({transaction:{message:{accountKeys:5}},meta:{err:null}},E).ok);}

// ---------- 6. not connected / no provider / bad input ----------
reset();T.SOLWAL.addr=null;
{const c=newCommit();const r=await T.memAnchor(c);
 ok('not connected: why=not-connected, no wallet call, no rpc call', r.ok===false&&r.why==='not-connected'&&W.requests.length===0&&W.fetches===0);
 T.MEM.auto=true;T.memOnCommit(c);await new Promise(r=>setImmediate(r));
 ok('not connected: auto hook is a no-op', W.requests.length===0&&W.fetches===0);
 T.openPF();ok('not connected: UI asks to connect Phantom, no anchor button', /Connect Phantom to anchor/.test(body())&&!/memAnchorClick/.test(body()));}
reset();T.SOLWAL.addr=PLAYER;
{const saved=s.window.phantom;s.window.phantom=undefined;const c=newCommit();const r=await T.memAnchor(c);s.window.phantom=saved;
 ok('no provider: why=no-provider, no rpc', r.ok===false&&r.why==='no-provider'&&W.fetches===0);}
for(const bad of [null,undefined,'',123,'abc','AB'.repeat(32),'a'.repeat(63),'a'.repeat(65),'g'.repeat(64),{}]){
  const r=await T.memAnchor(bad);ok('bad commitment '+JSON.stringify(bad)+' rejected before any wallet call', r.ok===false&&r.why==='bad-commitment'&&W.requests.length===0);}

// ---------- 7. UI: manual button only for the current, unrevealed commitment ----------
reset();T.SOLWAL.addr=PLAYER;
{T.PF.lastReveal=null;const c=newCommit();T.openPF();
 ok('UI: current hand shows the anchor button when connected', /memAnchorClick/.test(body())&&/optional/i.test(body())&&/devnet/i.test(body()));
 ok('UI: no auto-toggle rendered', !/memToggleAuto/.test(body())&&!/type="checkbox"/.test(body()));
 T.pfReveal();T.openPF();
 ok('UI: after reveal, no button for the played hand (cannot prove pre-deal)', !/memAnchorClick/.test(body()));
 const c2=newCommit();T.openPF();
 ok('UI: next hand listed as current with its own button', /\(current\)/.test(body())&&/memAnchorClick/.test(body()));
 T.memToggleAuto(true);ok('even if auto is forced on in code, the UI shows no checkbox', T.MEM.auto===true&&!/type="checkbox"/.test(body()));
 T.memToggleAuto(false);ok('toggle off clears auto', T.MEM.auto===false);}

// ---------- 8. static: hooks, no keys, no new externals ----------
{const b0=html.indexOf('// ── MEMO:BEGIN'),b1=html.indexOf('// ── MEMO:END');
 ok('code block markers present, once', b0>0&&b1>b0&&html.split('// ── MEMO:BEGIN').length===2&&html.split('// ── MEMO:END').length===2);
 const blk=html.slice(b0,b1);
 ok('no private key material or signing primitives in the block', !/secretKey|privateKey|private key|Keypair|keypair|nacl|signTransaction|signMessage|Ed25519|seed phrase|mnemonic/i.test(blk.replace(/no key material here/ig,'').replace(/No key material here/g,'')));
 ok('no 64-element numeric arrays (embedded key bytes) in the block', !/\[(\s*\d+\s*,){31,}/.test(blk));
 ok('no network URL in the block except the devnet explorer', (blk.match(/https?:\/\/[^\s'"<>)]+/g)||[]).every(u=>u.startsWith('https://explorer.solana.com/tx/')));
 ok('block uses only the existing RPC helper (no own fetch/XHR/script load)', !/\bfetch\(|XMLHttpRequest|createElement\('script'\)|importScripts|<script/.test(blk));
 ok('no "mainnet" cluster referenced', !/mainnet/i.test(blk)&&/cluster=devnet/.test(blk));
 ok('no new external script/stylesheet/font load in the page (only the pre-existing Google Fonts link)', (html.match(/<script[^>]+src=/g)||[]).length===0&&(html.match(/<link[^>]+href="https?:[^"]*"/g)||[]).every(l=>l.includes('fonts.googleapis.com')));
 const hook=html.split('\n').filter(l=>l.includes('pfCommit();')&&l.includes('memOnCommit'));
 ok('hook 1: startHand calls memOnCommit right after pfCommit, not awaited', hook.length===1&&/^\s*pfCommit\(\); memOnCommit\(PF\.commit\);/.test(hook[0])&&!/await/.test(hook[0].split('//')[0]));
 ok('hook 2: openPF renders via memRenderVerifier', /function openPF\(\)\{\s*document\.getElementById\('pfOverlay'\)\.classList\.add\('show'\);\s*memRenderVerifier\(\);\s*\}/.test(html));
 ok('memAnchor is never awaited in game flow', !/await\s+memAnchor|await\s+memOnCommit/.test(html.replace(blk,'')));}

return {name:'memo-tests.js',pass,fail};};
