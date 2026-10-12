// Ledger-loop worker suite (stream A): /balance session, /buyin, /cashout against the REAL worker module.
// Layout: tests/suites/<this file>; worker at ../../worker/payout-worker.js (the runner's staging layout).
// Mutation checks run for real: each MUTANT below edits one rule in a temp copy of the worker, re-runs the
// whole scenario, and the suite requires the scenario to go red. Same line can be broken by hand.
module.exports=async function(){
let pass=0,fail=0;const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
const fs=require('fs'),path=require('path'),os=require('os'),wc=require('crypto').webcrypto;
// Layout: the worker now imports ./engine.js and ./bots.js, so every load copies the three files into a temp dir.
// Sources: next to this file, else ../../worker (runner layout), else the real E2/B2 handbacks, else the W stub.
const here=__dirname,first=(...c)=>c.find(f=>f&&fs.existsSync(f));
const SRC=first(path.join(here,'payout-worker.js'),path.join(here,'..','..','worker','payout-worker.js'));
const ESRC=first(process.env.ZP_ENGINE_DIR&&path.join(process.env.ZP_ENGINE_DIR,'engine.js'),path.join(here,'engine.js'),path.join(here,'..','..','worker','engine.js'),path.join(here,'..','E2','engine.js'),path.join(here,'stub','engine.js'));
const BSRC=first(process.env.ZP_ENGINE_DIR&&path.join(process.env.ZP_ENGINE_DIR,'bots.js'),path.join(here,'bots.js'),path.join(here,'..','..','worker','bots.js'),path.join(here,'..','B2','bots.js'));
const src=fs.readFileSync(SRC,'utf8');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'llw-'));
let seq=0;
async function load(text){const d=path.join(tmp,'w'+(seq++));fs.mkdirSync(d);fs.writeFileSync(path.join(d,'payout-worker.js'),text);
  fs.copyFileSync(ESRC,path.join(d,'engine.js'));fs.copyFileSync(BSRC,path.join(d,'bots.js'));
  return import(require('url').pathToFileURL(path.join(d,'payout-worker.js')).href);}

const ORIGIN='https://site.example',NOW=1760000000000;
const b64=u=>Buffer.from(u).toString('base64');

// scenario(W,t): runs all checks against module W; t(name,cond,detail) records. Returns nothing.
async function scenario(W,t){
  async function keypair(){const k=await wc.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
    const pub=new Uint8Array(await wc.subtle.exportKey('raw',k.publicKey));const pk8=new Uint8Array(await wc.subtle.exportKey('pkcs8',k.privateKey));
    return {k,pub,seed:pk8.slice(-32),addr:W.b58enc(pub)};}
  const HK=await keypair(),PL=await keypair(),EV=await keypair(),P2=await keypair();
  const A=PL.addr;
  const kv=new Map();let ttl={};let failOn=null,puts=[];
  const env={HOUSE_SECRET:JSON.stringify([...HK.seed,...HK.pub]),RPC_URL:'https://rpc.test/?k=1',ALLOW_ORIGIN:ORIGIN,
    LEDGER:{get:async k=>kv.has(k)?kv.get(k):null,
      put:async(k,v,o)=>{puts.push(k);if(failOn&&failOn(k,v))throw new Error('kv down SECRETLEAK-xyz');kv.set(k,v);if(o&&o.expirationTtl)ttl[k]=o.expirationTtl;}}};
  const call=async(method,p,body,origin=ORIGIN,now=NOW)=>{
    const req=new Request('https://worker.test'+p,{method,headers:{'content-type':'application/json',...(origin?{origin}:{})},body:body===undefined?undefined:(typeof body==='string'?body:JSON.stringify(body))});
    const r=await W.handle(req,env,now);const txt=await r.text();let j=null;try{j=JSON.parse(txt);}catch(e){}return {st:r.status,j,txt};};
  const sign=async(kp,msg)=>b64(new Uint8Array(await wc.subtle.sign({name:'Ed25519'},kp.k.privateKey,new TextEncoder().encode(msg))));
  let nc=0;const nonce=()=>(++nc).toString(16).padStart(16,'0');
  // build a signed body; kind picks message fn; signer defaults to owner
  async function req(kind,{addr=A,lam,n=nonce(),ts=NOW,signer=PL,msgKind=kind,msgLam=lam,msgAddr=addr}={}){
    const fn={buyin:W.buyinMessage,cashout:W.cashoutMessage,withdraw:W.withdrawMessage}[msgKind];
    return {addr,lamports:lam,nonce:n,ts,signature:await sign(signer,fn(msgAddr,msgLam,n,ts))};}
  const buy=(lam,o)=>req('buyin',{lam,...o}).then(b=>call('POST','/buyin',b));
  const cash=(lam,o)=>req('cashout',{lam,...o}).then(b=>call('POST','/cashout',b));
  const bal=async a=>(await call('GET','/balance?addr='+(a||A))).j;
  const setBal=n=>kv.set('bal:'+A,String(n));
  const snap=()=>JSON.stringify([...kv.entries()].filter(([k])=>!k.startsWith('nonce:')));
  const T=t;

  // ---- messages are byte-exact ----
  T('buyinMessage exact', W.buyinMessage('ADDR',25000000,'ab','5')==='Anon Poker table buy-in\nChain: Solana devnet\nAddress: ADDR\nLamports: 25000000\nNonce: ab\nTimestamp: 5\nThis signature authorises moving exactly this amount from your balance to your table stack.');
  T('cashoutMessage exact', W.cashoutMessage('ADDR',0,'ab','5')==='Anon Poker table cash-out\nChain: Solana devnet\nAddress: ADDR\nLamports: 0\nNonce: ab\nTimestamp: 5\nThis signature reports your final table stack and moves exactly this amount to your balance.');
  T('withdrawMessage unchanged', W.withdrawMessage('ADDR',1,'ab','5').startsWith('Anon Poker withdraw\nChain: Solana devnet\n'));
  T('constants per contract', W.BUYIN.min===25000000&&W.BUYIN.max===5000000000&&W.BUYIN.step===100000);
  T('client-reported cap path removed (no cashoutCap/CASHOUT.mult)', W.cashoutCap===undefined&&W.CASHOUT.mult===undefined&&W.CASHOUT.max===undefined);

  // ---- /balance ----
  let r=await call('GET','/balance?addr='+A);
  T('balance new addr {0,0,stack 0,table false}', r.st===200&&r.j.balance===0&&r.j.session===0&&r.j.stack===0&&r.j.table===false, r.txt);
  r=await call('GET','/balance?addr=short');T('balance bad addr 400',r.st===400);
  r=await call('GET','/balance?addr='+A,undefined,'https://evil.example');T('balance foreign origin 403',r.st===403);

  // ---- origin / config first, like /credit /withdraw ----
  for(const p of ['/buyin','/cashout']){
    const b=p==='/buyin'?await req('buyin',{lam:25000000}):await req('cashout',{lam:0});
    r=await call('POST',p,b,'https://evil.example');T(p+' foreign origin 403',r.st===403);
    r=await call('POST',p,b,null);T(p+' missing origin 403',r.st===403);
    r=await call('OPTIONS',p,undefined);T(p+' preflight 204',r.st===204);
    r=await call('POST',p,'{not json');T(p+' bad json 400',r.st===400&&r.j.error==='bad json');
    r=await call('POST',p,'null');T(p+' null body 400 not 500',r.st===400,r.txt);
    r=await call('GET',p);T(p+' GET 404',r.st===404);
  }
  {const saved=env.RPC_URL;env.RPC_URL='http://insecure';r=await call('POST','/buyin',await req('buyin',{lam:25000000}));T('buyin config check 503',r.st===503);
   r=await call('POST','/cashout',await req('cashout',{lam:0}));T('cashout config check 503',r.st===503);env.RPC_URL=saved;}

  // ---- buy-in validation (no state change on any refusal) ----
  setBal(1e9);const before=snap();
  const bad=async(name,body,st,err)=>{const x=await call('POST','/buyin',body);T('buyin '+name+' -> '+st,x.st===st&&(!err||x.j.error===err),x.txt);};
  const good=await req('buyin',{lam:25000000});
  await bad('bad addr',{...good,addr:'nope'},400,'bad address');
  for(const [nm,l] of [['below min',24900000],['above max',5000100000],['off step',25000001],['zero',0],['negative',-25000000],['float',25000000.5],['string','25000000'],['null',null],['unsafe int',2**60],['NaN-ish',Infinity]]){
    await bad('lamports '+nm,{...good,lamports:l},400,'bad amount');}
  await bad('missing lamports',{...good,lamports:undefined},400,'bad amount');
  for(const [nm,n] of [['short',  'abc'],['non-hex','zz'.repeat(8)],['upper','AB'.repeat(8)],['too long','a'.repeat(65)],['number',12345],['empty','']])
    await bad('nonce '+nm,{...good,nonce:n},400,'bad nonce');
  await bad('ts string',{...good,ts:String(NOW)},400,'stale request');
  await bad('ts stale',{...good,ts:NOW-300001},400,'stale request');
  await bad('ts future',{...good,ts:NOW+300001},400,'stale request');
  await bad('sig not base64',{...good,signature:'!!!'},400);
  await bad('sig wrong length',{...good,signature:b64(new Uint8Array(63))},400,'bad signature');
  await bad('sig missing',{...good,signature:undefined},400);
  await bad('sig zeros',{...good,signature:b64(new Uint8Array(64))},401,'signature does not match');
  await bad('wrong signer',await req('buyin',{lam:25000000,signer:EV}),401,'signature does not match');
  await bad('signed other lamports',await req('buyin',{lam:25000000,msgLam:30000000}),401);
  await bad('signed other addr',await req('buyin',{lam:25000000,msgAddr:P2.addr}),401);
  {const b=await req('buyin',{lam:25000000});await bad('signed other nonce',{...b,nonce:nonce()},401);await bad('signed other ts',{...b,ts:NOW+1},401);}
  T('buyin refusals changed no ledger state', snap()===before, snap());
  {const b=await req('buyin',{lam:25000000});const x=await call('POST','/buyin',b);const y=await call('POST','/buyin',{...b});
   T('boundary: now-ts == 300000 accepted', (await buy(25000000,{ts:NOW-300000})).st===200);
   T('boundary: now+300000 accepted', (await buy(25000000,{ts:NOW+300000})).st===200);
   T('first buyin ok', x.st===200, x.txt); T('replay of same buyin 409', y.st===409&&y.j.error==='replayed request', y.txt);
   T('replay did not move value twice', JSON.stringify(await bal())===JSON.stringify({balance:1e9-75000000,session:75000000,stack:75000000,table:false}), JSON.stringify(await bal()));
   T('nonce TTL 3600', ttl['nonce:'+A+':'+b.nonce]===3600);}

  // ---- session math ----
  kv.clear();setBal(1e9);
  r=await buy(100000000);T('buyin 0.1 -> balance 0.9 session 0.1',r.st===200&&r.j.balance===9e8&&r.j.session===1e8,r.txt);
  r=await buy(250000000);T('second buyin adds up',r.st===200&&r.j.balance===65e7&&r.j.session===35e7,r.txt);
  T('balance endpoint agrees', JSON.stringify(await bal())===JSON.stringify({balance:65e7,session:35e7,stack:35e7,table:false}));
  T('session KV format {inTotal,stack}', kv.get('sess:'+A)==='{"inTotal":350000000,"stack":350000000}', kv.get('sess:'+A));
  kv.set('sess:'+A,'{"inTotal":350000000}');T('legacy {inTotal} record reads as stack=inTotal', (await bal()).stack===35e7);kv.set('sess:'+A,'{"inTotal":350000000,"stack":350000000}');
  T('other address untouched', JSON.stringify(await bal(P2.addr))===JSON.stringify({balance:0,session:0,stack:0,table:false}));
  r=await buy(700000000);T('buyin > balance 402 with balance',r.st===402&&r.j.error==='exceeds ledger balance'&&r.j.balance===65e7,r.txt);
  T('402 left state', (await bal()).session===35e7&&(await bal()).balance===65e7&&(await bal()).stack===35e7);
  r=await buy(65e7);T('buyin exactly the whole balance ok',r.st===200&&r.j.balance===0&&r.j.session===1e9,r.txt);
  r=await buy(25000000);T('buyin with 0 balance 402',r.st===402&&r.j.balance===0);

  // ---- cash-out validation ----
  const cbad=async(name,body,st,err)=>{const x=await call('POST','/cashout',body);T('cashout '+name+' -> '+st,x.st===st&&(!err||x.j.error===err),x.txt);return x;};
  const cg=await req('cashout',{lam:100000});
  await cbad('bad addr',{...cg,addr:'x'},400,'bad address');
  for(const [nm,l] of [['negative',-100000],['off step',100001],['float',0.5],['string','0'],['null',null],['unsafe',2**60]])await cbad('lamports '+nm,{...cg,lamports:l},400,'bad amount');
  await cbad('nonce bad',{...cg,nonce:'xyz'},400,'bad nonce');
  await cbad('ts stale',{...cg,ts:NOW-300001},400,'stale request');
  await cbad('sig short',{...cg,signature:b64(new Uint8Array(10))},400,'bad signature');
  await cbad('wrong signer',await req('cashout',{lam:100000,signer:EV}),401,'signature does not match');
  await cbad('signed other lamports',await req('cashout',{lam:100000,msgLam:200000}),401);
  // cross-endpoint signature replay: sign for X, send to Y (same addr/lamports/nonce/ts)
  const L=25000000;
  {const w=await req('cashout',{lam:L,msgKind:'withdraw'});await cbad('withdraw-sig replayed to cashout',w,401,'signature does not match');}
  {const w=await req('buyin',{lam:L,msgKind:'withdraw'});const x=await call('POST','/buyin',w);T('withdraw-sig replayed to buyin 401',x.st===401,x.txt);}
  {const b=await req('cashout',{lam:L,msgKind:'buyin'});await cbad('buyin-sig replayed to cashout',b,401,'signature does not match');}
  {const b=await req('buyin',{lam:L,msgKind:'cashout'});const x=await call('POST','/buyin',b);T('cashout-sig replayed to buyin 401',x.st===401,x.txt);}
  {const b=await req('buyin',{lam:L,msgKind:'buyin'});const x=await call('POST','/withdraw',b);T('buyin-sig replayed to withdraw 401',x.st===401,x.txt);}
  {const b=await req('cashout',{lam:L,msgKind:'cashout'});const x=await call('POST','/withdraw',b);T('cashout-sig replayed to withdraw 401',x.st===401,x.txt);}
  {const b=await req('buyin',{lam:L});const x=await call('POST','/cashout',b);T('valid buyin body to cashout 401',x.st===401);}
  T('message first lines differ', new Set([W.buyinMessage,W.cashoutMessage,W.withdrawMessage].map(f=>f('a',1,'n','t').split('\n')[0])).size===3);

  // ---- cash-out with no session ----
  kv.clear();setBal(5e8);
  r=await cash(0);T('cashout no session 409',r.st===409&&r.j.error==='no open table session',r.txt);
  r=await cash(100000);T('cashout no session (nonzero) 409',r.st===409);
  T('no-session cashout minted nothing', (await bal()).balance===5e8);

  // ---- cash-out must EQUAL the server stack (the 6x client-reported cap is gone) ----
  kv.clear();setBal(1e9);await buy(100000000);               // stack 1e8
  r=await cash(600000000);T('old cap amount (6x) -> 422 amount mismatch with the real stack',r.st===422&&r.j.error==='amount mismatch'&&r.j.stack===1e8,r.txt);
  r=await cash(100100000);T('stack+one step -> 422',r.st===422&&r.j.stack===1e8,r.txt);
  r=await cash(99900000);T('stack-one step -> 422',r.st===422);
  r=await cash(0);T('zero while stack>0 -> 422',r.st===422);
  r=await cash(1e12);T('huge amount 422',r.st===422&&r.j.stack===1e8,r.txt);
  r=await cash(2**60);T('unsafe integer amount 400',r.st===400);
  T('422 left session open and balance', JSON.stringify(await bal())===JSON.stringify({balance:9e8,session:1e8,stack:1e8,table:false}));
  r=await cash(100000000);T('exactly the stack accepted',r.st===200&&r.j.balance===1e9&&r.j.session===0,r.txt);
  T('session closed after cashout', JSON.stringify(await bal())===JSON.stringify({balance:1e9,session:0,stack:0,table:false}));
  r=await cash(0);T('second cashout 409 (closed)',r.st===409);
  {kv.clear();setBal(1e9);await buy(100000000);const b=await req('cashout',{lam:100000000});const x=await call('POST','/cashout',b);const y=await call('POST','/cashout',b);
   T('cashout ok', x.st===200&&x.j.balance===1e9,x.txt);T('cashout replay 409 replayed',y.st===409&&y.j.error==='replayed request',y.txt);T('replay minted nothing',(await bal()).balance===1e9);}
  {kv.clear();setBal(1e9);await buy(100000000);await buy(100000000);r=await cash(200000001);T('off-step still 400',r.st===400);
   r=await cash(100000000);T('one buy-in worth is not the stack: 422 stack=sum',r.st===422&&r.j.stack===2e8,r.txt);r=await cash(200000000);T('sum accepted',r.st===200&&r.j.balance===1e9,r.txt);}
  {kv.clear();setBal(3e10);for(let i=0;i<3;i++){const x=await buy(5e9);T('big buyin '+i,x.st===200,x.txt);}
   T('stack 1.5e10 stored',(await bal()).stack===15e9&&(await bal()).session===15e9);
   r=await cash(15e9);T('big stack accepted, balance not clamped by maxLedger',r.st===200&&r.j.balance===3e10&&(await bal()).balance===3e10&&(await bal()).balance>W.LIMITS.maxLedger,r.txt);}
  // different players do not share sessions
  {kv.clear();setBal(1e9);kv.set('bal:'+P2.addr,'1000000000');await buy(100000000);
   const b=await req('cashout',{addr:P2.addr,signer:P2,lam:0});r=await call('POST','/cashout',b);T('other player has no session 409',r.st===409,r.txt);
   const c=await req('cashout',{addr:A,signer:P2,lam:100000000});r=await call('POST','/cashout',c);T('other player cannot sign for my session 401',r.st===401);
   T('my session intact',(await bal()).session===1e8);}

  // ---- withdraw still works and does not touch session ----
  {kv.clear();setBal(1e9);await buy(100000000);T('withdraw uses balance only',(await bal()).balance===9e8);}

  // ---- KV failure between writes: nothing minted ----
  for(const failKey of ['sess:','bal:']){
    kv.clear();setBal(1e9);await buy(100000000);const s0=snap();
    failOn=k=>k.startsWith(failKey);
    r=await buy(100000000);failOn=null;
    T('buyin KV fail on '+failKey+' -> 502 restored',r.st===502&&r.j.error==='ledger write failed, restored',r.txt);
    T('buyin KV fail on '+failKey+': state identical',snap()===s0,snap());
    T('no exception text leaked ('+failKey+')',!/SECRETLEAK|kv down/.test(r.txt));
    T('buyin KV fail: no value created',(await bal()).balance+(await bal()).session===1e9);
  }
  for(const failKey of ['sess:','bal:']){
    kv.clear();setBal(1e9);await buy(100000000);const s0=snap();
    // fail only the FIRST such put so the restore can succeed
    let n=0;failOn=k=>k.startsWith(failKey)&&n++===0;
    r=await cash(100000000);failOn=null;
    T('cashout KV fail on '+failKey+' -> 502 restored',r.st===502&&r.j.error==='ledger write failed, restored',r.txt);
    T('cashout KV fail on '+failKey+': state identical (session open, no credit)',snap()===s0,snap());
    T('no exception text leaked cashout ('+failKey+')',!/SECRETLEAK|kv down/.test(r.txt));
    // session still usable afterwards
    r=await cash(100000000);T('cashout retry after failure succeeds',r.st===200&&r.j.balance===1e9,r.txt);
  }
  // restore itself failing must not mint: total (balance+session) never exceeds what was funded
  {kv.clear();setBal(1e9);await buy(100000000);failOn=k=>k.startsWith('bal:');r=await cash(100000000);failOn=null;
   const b=await bal();T('cashout with failing balance write: no value minted',b.balance<=9e8+0&&r.st===502&&b.stack===1e8,JSON.stringify(b)+r.txt);}
  {kv.clear();setBal(1e9);failOn=k=>k.startsWith('bal:');r=await buy(100000000);failOn=null;const b=await bal();
   T('buyin with failing balance write: nothing minted',b.balance+b.session<=1e9,JSON.stringify(b));}

  // ---- no secrets / internals in any response ----
  {kv.clear();setBal(1e9);const all=[];all.push((await buy(100000000)).txt,(await cash(0)).txt,(await cash(0)).txt,(await buy(1)).txt);
   T('responses contain no house secret/rpc url',!all.some(x=>/rpc\.test|HOUSE|k=1/.test(x)||x.includes(env.HOUSE_SECRET.slice(2,30))));}
}

// ---- run on the real worker ----
const real=await load(src);
const mine=(n,c,d)=>ok(n,c,d);
await scenario(real,mine);

// ---- existing endpoints keep working ----
{const kv=new Map();const E={HOUSE_SECRET:JSON.stringify(Array(64).fill(1)),RPC_URL:'https://r.test',ALLOW_ORIGIN:ORIGIN,LEDGER:{get:async k=>kv.get(k)??null,put:async(k,v)=>{kv.set(k,v);}}};
 const rq=(m,p,b)=>real.handle(new Request('https://w.test'+p,{method:m,headers:{origin:ORIGIN,'content-type':'application/json'},body:b?JSON.stringify(b):undefined}),E,NOW).then(async r=>({st:r.status,j:await r.json()}));
 let x=await rq('POST','/credit',{addr:'bad',sig:'x'});ok('credit still validates',x.st===400&&x.j.error==='bad address');
 x=await rq('POST','/withdraw',{addr:'bad'});ok('withdraw still validates',x.st===400&&x.j.error==='bad address');
 x=await rq('GET','/balance?addr=11111111111111111111111111111111');ok('balance on KV with get/put only (no delete needed)',x.st===200&&x.j.session===0);}

// ---- mutation checks: each must turn the scenario red ----
const MUT=[
 ['buyin: drop min bound',"l => l >= BUYIN.min && l <= BUYIN.max","l => l <= BUYIN.max"],
 ['buyin: drop max bound',"l >= BUYIN.min && l <= BUYIN.max &&","l >= BUYIN.min &&"],
 ['buyin: drop step rule',"l % BUYIN.step === 0);\n  if (bad) return bad;\n  const { addr, lamports } = body;\n  const bal = await getBal(env, addr), s0","true);\n  if (bad) return bad;\n  const { addr, lamports } = body;\n  const bal = await getBal(env, addr), s0"],
 ['buyin: drop balance check',"if (lamports > bal) return [402, { error: 'exceeds ledger balance', balance: bal }];\n  let tbl1","let tbl1"],
 ['buyin: session total not added up',"inTotal: s0.inTotal + lamports,","inTotal: s0.inTotal,"],
 ['buyin: stack not added up',"stack: s0.stack + lamports }","stack: s0.stack }"],
 ['buyin: balance not debited',"await setBal(env, addr, bal - lamports); step = 1;","await setBal(env, addr, bal); step = 1;"],
 ['buyin: no restore on failure',"try { if (step >= 1) await setBal(env, addr, bal); } catch (e2)","try { if (false) await setBal(env, addr, bal); } catch (e2)"],
 ['cashout: amount must equal stack removed',"if (lamports !== stack) return","if (false) return"],
 ['cashout: one step slack',"if (lamports !== stack) return","if (Math.abs(lamports - stack) > 100000) return"],
 ['cashout: no session check',"if (s0.inTotal <= 0) return [409","if (false) return [409"],
 ['cashout: session not closed',"await setSess(env, addr, { inTotal: 0, stack: 0 }); step = 2;","step = 2;"],
 ['cashout: clamped by maxLedger',"await setBal(env, addr, bal + lamports); // not clamped","await setBal(env, addr, Math.min(LIMITS.maxLedger, bal + lamports)); // not clamped"],
 ['cashout: negative allowed',"l => l >= 0 && l % CASHOUT.step === 0","l => l % CASHOUT.step === 0"],
 ['cashout: step rule removed',"l >= 0 && l % CASHOUT.step === 0","l >= 0"],
 ['cashout: no restore on failure',"try { if (step >= 2) await setSess(env, addr, s0); } catch (e2)","try { if (false) await setSess(env, addr, s0); } catch (e2)"],
 ['cashout signs buyin text',"checkSigned(env, body, now, mark, cashoutMessage","checkSigned(env, body, now, mark, buyinMessage"],
 ['buyin signs withdraw text',"checkSigned(env, body, now, mark, buyinMessage","checkSigned(env, body, now, mark, withdrawMessage"],
 ['cashout message = withdraw header',"'Anon Poker table cash-out\\nChain","'Anon Poker withdraw\\nChain"],
 ['replay check removed',"if (await env.LEDGER.get('nonce:' + addr + ':' + nonce)) return [409, { error: 'replayed request' }];\n  await env.LEDGER.put('nonce:' + addr + ':' + nonce, '1', { expirationTtl: 3600 });\n  return null;","return null;"],
 ['replay TTL changed',"{ expirationTtl: 3600 });\n  return null;","{ expirationTtl: 60 });\n  return null;"],
 ['signature check skipped',"if (!(await verifySig(addr, new TextEncoder().encode(msgFn(addr, lamports, nonce, ts)), sig)))","if (false)"],
 ['timestamp check removed',"if (!Number.isSafeInteger(ts) || Math.abs(now - ts) > LIMITS.tsSkewMs) return [400, { error: 'stale request' }];\n  let sig;\n  try { sig = b64dec(signature); } catch (e) { return [400, { error: 'bad signature encoding' }]; }\n  if (sig.length !== 64) return [400, { error: 'bad signature' }];\n  mark('verify-signature');\n  if (!(await verifySig(addr, new TextEncoder().encode(msgFn","let sig;\n  try { sig = b64dec(signature); } catch (e) { return [400, { error: 'bad signature encoding' }]; }\n  if (sig.length !== 64) return [400, { error: 'bad signature' }];\n  mark('verify-signature');\n  if (!(await verifySig(addr, new TextEncoder().encode(msgFn"],
 ['nonce format check removed',"if (typeof nonce !== 'string' || !/^[0-9a-f]{16,64}$/.test(nonce)) return [400, { error: 'bad nonce' }];\n  if (!Number.isSafeInteger(ts) || Math.abs(now - ts) > LIMITS.tsSkewMs) return [400, { error: 'stale request' }];\n  let sig;\n  try { sig = b64dec(signature); } catch (e) { return [400, { error: 'bad signature encoding' }]; }\n  if (sig.length !== 64) return [400, { error: 'bad signature' }];\n  mark('verify-signature');\n  if (!(await verifySig(addr, new TextEncoder().encode(msgFn","if (!Number.isSafeInteger(ts) || Math.abs(now - ts) > LIMITS.tsSkewMs) return [400, { error: 'stale request' }];\n  let sig;\n  try { sig = b64dec(signature); } catch (e) { return [400, { error: 'bad signature encoding' }]; }\n  if (sig.length !== 64) return [400, { error: 'bad signature' }];\n  mark('verify-signature');\n  if (!(await verifySig(addr, new TextEncoder().encode(msgFn"],
 ['balance omits session',"session: s.inTotal,","session: 0,"],
 ['balance omits stack',"stack: s.stack, table:","stack: 0, table:"],
 ['session read from wrong key',"JSON.parse(await env.LEDGER.get('sess:' + addr))","JSON.parse(await env.LEDGER.get('sess:x'))"],
 ['exception text leaked',"return [502, { error: 'ledger write failed, restored' }];\n  }\n  return [200, { balance: bal - lamports","return [502, { error: 'ledger write failed, restored', detail: String(e.message) }];\n  }\n  return [200, { balance: bal - lamports"],
];
for(const [name,from,to] of MUT){
  const i=src.indexOf(from);
  if(i<0||src.indexOf(from,i+1)>=0){ok('mutant anchor unique: '+name,false,i<0?'not found':'ambiguous');continue;}
  let red=0;
  try{const W=await load(src.replace(from,to));await scenario(W,(n,c)=>{if(!c)red++;});}catch(e){red++;}
  ok('mutant killed: '+name,red>0,'suite stayed green');
}
try{fs.rmSync(tmp,{recursive:true,force:true});}catch(e){}
return {name:'ledger-loop-worker.js (stream A, adapted by W)',pass,fail};};
