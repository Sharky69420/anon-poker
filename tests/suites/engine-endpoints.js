// Server-run table endpoint suite (stream W): /table/open /table/resume /table/state /hand/deal /hand/act, the changed
// /buyin /cashout /balance, KV failure injection, privacy scans, a 300-hand simulation with a local replay mirror,
// the bundled single-file worker, and real mutation checks (each MUTANT edits one rule of the worker copy and the
// whole scenario must go red).
// Sources: worker next to this file (or ../../worker in the runner layout); engine/bots from ZP_ENGINE_DIR, else the
// real build/handback/E2 + B2 files when present, else the contract-conforming stub in ./stub.
module.exports=async function(){
let pass=0,fail=0;const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':String(d).slice(0,300)));};
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),wc=require('crypto').webcrypto;
const here=__dirname,rd=f=>fs.readFileSync(f,'utf8');
const first=(...c)=>c.find(f=>f&&fs.existsSync(f));
const WSRC=first(path.join(here,'payout-worker.js'),path.join(here,'..','..','worker','payout-worker.js'));
const ESRC=first(process.env.ZP_ENGINE_DIR&&path.join(process.env.ZP_ENGINE_DIR,'engine.js'),path.join(here,'engine.js'),path.join(here,'..','..','worker','engine.js'),path.join(here,'..','E2','engine.js'),path.join(here,'stub','engine.js'));
const BSRC=first(process.env.ZP_ENGINE_DIR&&path.join(process.env.ZP_ENGINE_DIR,'bots.js'),path.join(here,'bots.js'),path.join(here,'..','..','worker','bots.js'),path.join(here,'..','B2','bots.js'));
const IS_STUB=/[\\/]stub[\\/]/.test(ESRC);
const wsrc=rd(WSRC),esrc=rd(ESRC),bsrc=rd(BSRC);
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'eew-'));let seq=0;
async function loadSet(w,e,b){const d=path.join(tmp,'s'+(seq++));fs.mkdirSync(d);
  fs.writeFileSync(path.join(d,'payout-worker.js'),w);fs.writeFileSync(path.join(d,'engine.js'),e);fs.writeFileSync(path.join(d,'bots.js'),b);
  const url=f=>require('url').pathToFileURL(path.join(d,f)).href;
  const M=await import(url('payout-worker.js'));return Object.assign({},M,{__dir:d,__E:await import(url('engine.js')),__B:await import(url('bots.js'))});}
const ORIGIN='https://site.example',NOW=1760000000000;
const b64=u=>Buffer.from(u).toString('base64');
const hex=n=>[...wc.getRandomValues(new Uint8Array(n))].map(x=>x.toString(16).padStart(2,'0')).join('');
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const walk=(o,f)=>{if(o&&typeof o==='object'){f(o);for(const k of Object.keys(o))walk(o[k],f);}};
const cardsIn=o=>{const s=new Set();walk(o,x=>{if(typeof x.r==='string'&&typeof x.s==='string')s.add(x.r+'|'+x.s);});return s;};
const sumChips=v=>v.seats.reduce((a,s)=>a+s.chips,0);

// ------------------------------------------------------------------ world: fresh KV + env + helpers around module W
async function keypair(W){const k=await wc.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
  const pub=new Uint8Array(await wc.subtle.exportKey('raw',k.publicKey));const pk8=new Uint8Array(await wc.subtle.exportKey('pkcs8',k.privateKey));
  return {k,pub,seed:pk8.slice(-32),addr:W.b58enc(pub)};}
async function world(W){
  const HK=await keypair(W),PL=await keypair(W),EV=await keypair(W),P2=await keypair(W);const A=PL.addr;
  const kv=new Map();const w={kv,A,PL,EV,P2,failOn:null,puts:[],ttl:{}};
  w.env={HOUSE_SECRET:JSON.stringify([...HK.seed,...HK.pub]),RPC_URL:'https://rpc.test/?k=1',ALLOW_ORIGIN:ORIGIN,
    LEDGER:{get:async k=>kv.has(k)?kv.get(k):null,
      put:async(k,v,o)=>{w.puts.push(k);if(w.failOn&&w.failOn(k,v))throw new Error('kv down SECRETLEAK-xyz');kv.set(k,v);if(o&&o.expirationTtl)w.ttl[k]=o.expirationTtl;}}};
  w.call=async(method,p,body,origin=ORIGIN,now=NOW)=>{
    const req=new Request('https://worker.test'+p,{method,headers:{'content-type':'application/json',...(origin?{origin}:{})},body:body===undefined?undefined:(typeof body==='string'?body:JSON.stringify(body))});
    const before=w.puts.length;const r=await W.handle(req,w.env,now);const txt=await r.text();let j=null;try{j=JSON.parse(txt);}catch(e){}return {st:r.status,j,txt,writes:w.puts.slice(before)};};
  w.sign=async(kp,msg)=>b64(new Uint8Array(await wc.subtle.sign({name:'Ed25519'},kp.k.privateKey,new TextEncoder().encode(msg))));
  let nc=0;w.nonce=()=>(++nc).toString(16).padStart(16,'0');
  const msgFn={buyin:W.buyinMessage,cashout:W.cashoutMessage,withdraw:W.withdrawMessage,
    open:(a,l,n,t,o)=>W.openMessage(a,o.table,o.bots,n,t),resume:(a,l,n,t)=>W.resumeMessage(a,n,t)};
  // signed body; kind picks the message text; signer/msg* override for abuse tests
  w.req=async(kind,{addr=A,lam,n=w.nonce(),ts=NOW,signer=PL,msgKind=kind,msgLam=lam,msgAddr=addr,table='sol-micro',bots=5,msgTable=table,msgBots=bots}={})=>{
    const sig=await w.sign(signer,msgFn[msgKind](msgAddr,msgLam,n,ts,{table:msgTable,bots:msgBots}));
    const b={addr,nonce:n,ts,signature:sig};if(lam!==undefined)b.lamports=lam;if(kind==='open'){b.tableId=table;b.bots=bots;}return b;};
  w.buy=(lam,o)=>w.req('buyin',{lam,...o}).then(b=>w.call('POST','/buyin',b));
  w.cash=(lam,o)=>w.req('cashout',{lam,...o}).then(b=>w.call('POST','/cashout',b));
  w.open=(o)=>w.req('open',o).then(b=>w.call('POST','/table/open',b));
  w.resume=(o)=>w.req('resume',o).then(b=>w.call('POST','/table/resume',b));
  w.bal=async a=>(await w.call('GET','/balance?addr='+(a||A))).j;
  w.setBal=n=>kv.set('bal:'+A,String(n));
  w.snap=()=>JSON.stringify([...kv.entries()].filter(([k])=>!k.startsWith('nonce:')));
  w.tbl=()=>{try{return JSON.parse(kv.get('tbl:'+A));}catch(e){return null;}};
  w.sess=()=>JSON.parse(kv.get('sess:'+A));
  w.deal=(tok,cs=hex(8),addr=A)=>w.call('POST','/hand/deal',{addr,token:tok,clientSeed:cs});
  w.act=(tok,v,action,o={})=>w.call('POST','/hand/act',{addr:A,token:tok,handNo:v.handNo,seq:v.seq,action,...o});
  w.state=(tok,addr=A)=>w.call('GET','/table/state?addr='+addr+'&token='+tok);
  // fund + buy + open -> {token, open response}
  w.start=async({fund=1e9,stack=50000000,table='sol-micro',bots=5}={})=>{w.kv.clear();w.setBal(fund);const b=await w.buy(stack);const o=await w.open({table,bots});return {token:o.j&&o.j.token,o,b};};
  return w;
}

// ------------------------------------------------------------------ the scenario
// mk(mapEngine) loads a module set with the same (possibly mutated) worker text and a mapped engine source.
async function scenario(W,t,mk,full){
  const E=W.__E,B=W.__B;
  const w=await world(W);const {kv,A,PL,EV,P2,call,nonce,req,buy,cash,bal}=w;
  const T=t;
  // ---- messages byte-exact
  T('buyinMessage exact', W.buyinMessage('ADDR',25000000,'ab','5')==='Anon Poker table buy-in\nChain: Solana devnet\nAddress: ADDR\nLamports: 25000000\nNonce: ab\nTimestamp: 5\nThis signature authorises moving exactly this amount from your balance to your table stack.');
  T('cashoutMessage exact', W.cashoutMessage('ADDR',0,'ab','5')==='Anon Poker table cash-out\nChain: Solana devnet\nAddress: ADDR\nLamports: 0\nNonce: ab\nTimestamp: 5\nThis signature reports your final table stack and moves exactly this amount to your balance.');
  T('openMessage exact (contract text)', W.openMessage('ADDR','sol-micro',5,'ab','7')==='Anon Poker open table\nChain: Solana devnet\nAddress: ADDR\nTable: sol-micro\nBots: 5\nNonce: ab\nTimestamp: 7\nThis signature authorises sitting at this table with your current table stack.');
  T('resumeMessage exact', W.resumeMessage('ADDR','ab','7')==='Anon Poker resume table\nChain: Solana devnet\nAddress: ADDR\nNonce: ab\nTimestamp: 7\nThis signature authorises resuming your open table and issuing a new table token.');
  T('withdrawMessage unchanged', W.withdrawMessage('ADDR',1,'ab','5').startsWith('Anon Poker withdraw\nChain: Solana devnet\n'));
  T('constants', W.BUYIN.min===25000000&&W.BUYIN.max===5000000000&&W.BUYIN.step===100000&&W.TABLES['sol-micro']===100000&&W.TABLES['sol-mid']===1000000&&W.TABLES['sol-high']===10000000&&Object.keys(W.TABLES).length===3&&W.MIN_STACK_CHIPS===250);
  T('first lines of the 5 signed messages differ', new Set([W.buyinMessage('a',1,'n','t'),W.cashoutMessage('a',1,'n','t'),W.withdrawMessage('a',1,'n','t'),W.openMessage('a','x',1,'n','t'),W.resumeMessage('a','n','t')].map(m=>m.split('\n')[0])).size===5);
  T('no CASHOUT cap exports remain', W.cashoutCap===undefined);

  // ---- /balance
  let r=await call('GET','/balance?addr='+A);
  T('balance new addr', r.st===200&&r.j.balance===0&&r.j.session===0&&r.j.stack===0&&r.j.table===false, r.txt);
  r=await call('GET','/balance?addr=short');T('balance bad addr 400',r.st===400);
  r=await call('GET','/balance?addr='+A,undefined,'https://evil.example');T('balance foreign origin 403',r.st===403);

  // ---- origin/config/json hygiene on every POST route
  for(const p of ['/buyin','/cashout','/table/open','/table/resume','/hand/deal','/hand/act']){
    const b={addr:A};
    r=await call('POST',p,b,'https://evil.example');T(p+' foreign origin 403',r.st===403);
    r=await call('POST',p,b,null);T(p+' missing origin 403',r.st===403);
    r=await call('OPTIONS',p,undefined);T(p+' preflight 204',r.st===204);
    r=await call('POST',p,'{not json');T(p+' bad json 400',r.st===400&&r.j.error==='bad json');
    r=await call('POST',p,'null');T(p+' null body 400',r.st===400);
    r=await call('POST',p,'[1]');T(p+' array body 400',r.st===400);
    r=await call('GET',p);T(p+' GET 404',r.st===404);
    const saved=w.env.RPC_URL;w.env.RPC_URL='http://insecure';r=await call('POST',p,b);T(p+' config check 503',r.st===503);w.env.RPC_URL=saved;
  }
  r=await call('GET','/table/state?addr='+A+'&token='+'a'.repeat(32),undefined,'https://evil.example');T('table/state foreign origin 403',r.st===403);
  r=await call('GET','/nope');T('unknown route 404',r.st===404);
  r=await call('POST','/constructor',{});T('prototype-name route 404',r.st===404);
  r=await call('POST','/__proto__',{});T('__proto__ route 404',r.st===404);

  // ---- buy-in validation (no state change on any refusal)
  w.setBal(1e9);const before=w.snap();
  const bad=async(name,body,st,err)=>{const x=await call('POST','/buyin',body);T('buyin '+name+' -> '+st,x.st===st&&(!err||x.j.error===err),x.txt);};
  const good=await req('buyin',{lam:25000000});
  await bad('bad addr',{...good,addr:'nope'},400,'bad address');
  for(const [nm,l] of [['below min',24900000],['above max',5000100000],['off step',25000001],['zero',0],['negative',-25000000],['float',25000000.5],['string','25000000'],['null',null],['unsafe int',2**60]])
    await bad('lamports '+nm,{...good,lamports:l},400,'bad amount');
  for(const [nm,n] of [['short','abc'],['non-hex','zz'.repeat(8)],['upper','AB'.repeat(8)],['too long','a'.repeat(65)],['number',12345]])
    await bad('nonce '+nm,{...good,nonce:n},400,'bad nonce');
  await bad('ts stale',{...good,ts:NOW-300001},400,'stale request');
  await bad('ts future',{...good,ts:NOW+300001},400,'stale request');
  await bad('sig not base64',{...good,signature:'!!!'},400);
  await bad('sig wrong length',{...good,signature:b64(new Uint8Array(63))},400,'bad signature');
  await bad('sig zeros',{...good,signature:b64(new Uint8Array(64))},401,'signature does not match');
  await bad('wrong signer',await req('buyin',{lam:25000000,signer:EV}),401,'signature does not match');
  await bad('signed other lamports',await req('buyin',{lam:25000000,msgLam:30000000}),401);
  await bad('signed other addr',await req('buyin',{lam:25000000,msgAddr:P2.addr}),401);
  T('buyin refusals changed no ledger state', w.snap()===before, w.snap());
  {const b=await req('buyin',{lam:25000000});const x=await call('POST','/buyin',b);const y=await call('POST','/buyin',{...b});
   T('first buyin ok', x.st===200, x.txt);T('replay of same buyin 409', y.st===409&&y.j.error==='replayed request', y.txt);
   T('replay did not move value twice', JSON.stringify(await bal())===JSON.stringify({balance:1e9-25000000,session:25000000,stack:25000000,table:false}), JSON.stringify(await bal()));
   T('nonce TTL 3600', w.ttl['nonce:'+A+':'+b.nonce]===3600);}

  // ---- session math (no table)
  kv.clear();w.setBal(1e9);
  r=await buy(100000000);T('buyin 0.1 -> balance 0.9 session/stack 0.1',r.st===200&&r.j.balance===9e8&&r.j.session===1e8&&r.j.stack===1e8&&r.j.table===false,r.txt);
  r=await buy(250000000);T('second buyin adds up (both fields)',r.st===200&&r.j.balance===65e7&&r.j.session===35e7&&r.j.stack===35e7,r.txt);
  T('balance endpoint agrees', JSON.stringify(await bal())===JSON.stringify({balance:65e7,session:35e7,stack:35e7,table:false}));
  T('session KV format', kv.get('sess:'+A)==='{"inTotal":350000000,"stack":350000000}', kv.get('sess:'+A));
  T('other address untouched', JSON.stringify(await bal(P2.addr))===JSON.stringify({balance:0,session:0,stack:0,table:false}));
  r=await buy(700000000);T('buyin > balance 402',r.st===402&&r.j.error==='exceeds ledger balance'&&r.j.balance===65e7,r.txt);
  r=await buy(65e7);T('buyin exactly the whole balance ok',r.st===200&&r.j.balance===0&&r.j.session===1e9,r.txt);
  r=await buy(25000000);T('buyin with 0 balance 402',r.st===402&&r.j.balance===0);
  // legacy session record ({inTotal} only) reads as stack = inTotal
  kv.clear();kv.set('sess:'+A,'{"inTotal":50000000}');T('legacy session -> stack=inTotal',(await bal()).stack===50000000);
  kv.set('sess:'+A,'garbage');T('garbage session -> zeros',(await bal()).session===0&&(await bal()).stack===0);

  // ---- cash-out validation
  const cbad=async(name,body,st,err)=>{const x=await call('POST','/cashout',body);T('cashout '+name+' -> '+st,x.st===st&&(!err||x.j.error===err),x.txt);return x;};
  const cg=await req('cashout',{lam:100000});
  await cbad('bad addr',{...cg,addr:'x'},400,'bad address');
  for(const [nm,l] of [['negative',-100000],['off step',100001],['float',0.5],['string','0'],['null',null],['unsafe',2**60]])await cbad('lamports '+nm,{...cg,lamports:l},400,'bad amount');
  await cbad('nonce bad',{...cg,nonce:'xyz'},400,'bad nonce');
  await cbad('ts stale',{...cg,ts:NOW-300001},400,'stale request');
  await cbad('wrong signer',await req('cashout',{lam:100000,signer:EV}),401,'signature does not match');
  await cbad('signed other lamports',await req('cashout',{lam:100000,msgLam:200000}),401);
  // cross-endpoint signature replay
  const L=25000000;
  for(const [from,to,body] of [['withdraw','cashout','/cashout'],['buyin','cashout','/cashout'],['withdraw','buyin','/buyin'],['cashout','buyin','/buyin'],['buyin','withdraw','/withdraw'],['cashout','withdraw','/withdraw']]){
    const b=await req(to,{lam:L,msgKind:from});const x=await call('POST',body,b);T(from+'-sig replayed to '+to+' 401',x.st===401,x.txt);}
  {const b=await req('open',{msgKind:'cashout',msgLam:0});const x=await call('POST','/table/open',b);T('cashout-sig replayed to open 401',x.st===401);
   const c=await req('resume',{msgKind:'open'});const y=await call('POST','/table/resume',c);T('open-sig replayed to resume 401',y.st===401);
   const d=await req('open',{msgKind:'resume'});const z=await call('POST','/table/open',d);T('resume-sig replayed to open 401',z.st===401);}

  // ---- cash-out with no session
  kv.clear();w.setBal(5e8);
  r=await cash(0);T('cashout no session 409',r.st===409&&r.j.error==='no open table session',r.txt);
  r=await cash(100000);T('cashout no session (nonzero) 409',r.st===409);
  T('no-session cashout minted nothing', (await bal()).balance===5e8);

  // ---- cash-out amount must EQUAL the server stack (no table open)
  kv.clear();w.setBal(1e9);await buy(100000000);
  r=await cash(600000000);T('old 6x path is gone: above stack -> 422 mismatch with stack',r.st===422&&r.j.error==='amount mismatch'&&r.j.stack===1e8,r.txt);
  r=await cash(99900000);T('one step below stack 422',r.st===422&&r.j.stack===1e8);
  r=await cash(100100000);T('one step above stack 422',r.st===422);
  r=await cash(0);T('zero while stack>0 422 (cannot burn a stack by accident)',r.st===422);
  T('422s left session and balance', JSON.stringify(await bal())===JSON.stringify({balance:9e8,session:1e8,stack:1e8,table:false}));
  r=await cash(100000000);T('exact stack accepted',r.st===200&&r.j.balance===1e9&&r.j.session===0,r.txt);
  r=await cash(0);T('second cashout 409 (closed)',r.st===409);
  {kv.clear();w.setBal(1e9);await buy(100000000);const b=await req('cashout',{lam:100000000});const x=await call('POST','/cashout',b);const y=await call('POST','/cashout',{...b});
   T('cashout ok', x.st===200&&x.j.balance===1e9,x.txt);T('cashout replay 409 replayed',y.st===409&&y.j.error==='replayed request',y.txt);T('replay minted nothing',(await bal()).balance===1e9);}
  {kv.clear();w.setBal(3e10);for(let i=0;i<3;i++){const x=await buy(5e9);T('big buyin '+i,x.st===200,x.txt);}
   r=await cash(15e9);T('big stack cashout exact, balance not clamped by maxLedger',r.st===200&&r.j.balance===3e10&&(await bal()).balance===3e10&&(await bal()).balance>W.LIMITS.maxLedger,r.txt);}
  {kv.clear();w.setBal(1e9);kv.set('bal:'+P2.addr,'1000000000');await buy(100000000);
   const b=await req('cashout',{addr:P2.addr,signer:P2,lam:0});r=await call('POST','/cashout',b);T('other player has no session 409',r.st===409,r.txt);
   const c=await req('cashout',{addr:A,signer:P2,lam:100000000});r=await call('POST','/cashout',c);T('other player cannot sign for my session 401',r.st===401);
   T('my session intact',(await bal()).session===1e8);}

  // ---- /table/open refusals
  kv.clear();w.setBal(1e9);
  r=await w.open();T('open without any stack -> 422',r.st===422&&r.j.error==='no table stack',r.txt);
  await buy(25000000);
  const ob=await req('open',{});
  for(const [nm,o] of [['table missing',{tableId:undefined}],['table zec',{tableId:'zec-micro'}],['table free',{tableId:'free'}],['table proto',{tableId:'constructor'}],['table number',{tableId:5}],['bots 0',{bots:0}],['bots 8',{bots:8}],['bots 1.5',{bots:1.5}],['bots string',{bots:'3'}],['bots null',{bots:null}],['bots negative',{bots:-1}]]){
    const x=await call('POST','/table/open',{...ob,...o});T('open '+nm+' -> 400',x.st===400,x.txt);}
  {const s0=w.snap();const x=await call('POST','/table/open',{...ob,addr:'zz'});T('open bad addr 400',x.st===400);
   const y=await w.open({signer:EV});T('open wrong signer 401',y.st===401&&y.j.error==='signature does not match');
   const z=await w.open({msgTable:'sol-mid'});T('open signed other table 401',z.st===401);
   const q=await w.open({msgBots:3});T('open signed other bots 401',q.st===401);
   const s=await call('POST','/table/open',{...ob,ts:NOW-300001});T('open stale 400',s.st===400);
   T('open refusals wrote no table', w.tbl()===null&&!w.snap().includes('tbl:')||w.tbl()===null);}
  r=await w.open();T('open stack exactly 250 chips micro ok',r.st===200&&r.j.stackChips===250&&r.j.unit===100000&&r.j.handNo===1&&/^[0-9a-f]{64}$/.test(r.j.commit)&&/^[0-9a-f]{32}$/.test(r.j.token)&&r.j.bots.length===5,r.txt);
  r=await w.open();T('second open 409 table already open',r.st===409&&r.j.error==='table already open',r.txt);
  {const rr=await w.req('open',{});await call('POST','/table/open',rr);const y=await call('POST','/table/open',{...rr});T('open replay 409',y.st===409);}
  kv.clear();w.setBal(1e9);await buy(25000000);r=await w.open({table:'sol-mid'});T('open mid with 250 micro-chips stack -> 422 below minimum',r.st===422&&r.j.error==='stack below table minimum',r.txt);
  r=await w.open({table:'sol-high'});T('open high 422',r.st===422);
  kv.clear();w.setBal(1e10);await buy(5e9);r=await w.open({table:'sol-mid'});T('open mid 5 SOL -> 5000 chips',r.st===200&&r.j.stackChips===5000&&r.j.unit===1000000,r.txt);
  kv.clear();w.setBal(1e10);await buy(5e9);r=await w.open({table:'sol-high'});T('open high 5 SOL -> 500 chips',r.st===200&&r.j.stackChips===500&&r.j.unit===10000000,r.txt);
  kv.clear();w.setBal(1e10);await buy(300100000);r=await w.open({table:'sol-mid'});T('open: stack not a multiple of unit -> 422',r.st===422,r.txt);
  for(const nb of [1,7]){kv.clear();w.setBal(1e9);await buy(50000000);r=await w.open({bots:nb});T('open with '+nb+' bots',r.st===200&&r.j.bots.length===nb,r.txt);}
  {const x=await w.start({});T('open response carries token once; state needs it',x.o.st===200);
   T('hero chips*unit == sess.stack at open',w.tbl().hero*w.tbl().unit===w.sess().stack);
   T('balance shows table:true',(await bal()).table===true&&(await bal()).stack===50000000);
   T('open response has no seed',!/serverSeed|nextSeed/.test(x.o.txt)&&!x.o.txt.includes(w.tbl().nextSeed));}

  // ---- /table/state, token handling, deal refusals
  {const {token,o}=await w.start({});
   r=await w.state(token);T('state idle ok',r.st===200&&r.j.stage==='idle'&&r.j.commit===o.j.commit&&r.j.nextCommit===o.j.commit&&r.j.heroChips===500&&r.j.stackLamports===50000000&&r.j.seats.length===6&&r.j.seats.every(s=>s.hole===null)&&!r.txt.includes(token),r.txt);
   r=await w.state('a'.repeat(32));T('state wrong token 401',r.st===401);
   r=await w.state('');T('state missing token 401',r.st===401);
   r=await w.state(token.slice(0,31));T('state short token 401',r.st===401);
   r=await w.state(token.toUpperCase());T('state uppercase token 401',r.st===401);
   r=await w.state(token,P2.addr);T('state other address no table 404',r.st===404);
   r=await call('GET','/table/state?addr=zz&token='+token);T('state bad addr 400',r.st===400);
   const d=w.snap();
   for(const [nm,b] of [['wrong token',{addr:A,token:'b'.repeat(32),clientSeed:hex(8)}],['missing token',{addr:A,clientSeed:hex(8)}],['numeric token',{addr:A,token:123,clientSeed:hex(8)}],['object token',{addr:A,token:{},clientSeed:hex(8)}],['array token',{addr:A,token:[token],clientSeed:hex(8)}]]){
     r=await call('POST','/hand/deal',b);T('deal '+nm+' -> 401',r.st===401,r.txt);}
   for(const [nm,cs] of [['missing',undefined],['short','abc'],['long','a'.repeat(17)],['upper','AB'.repeat(8)],['non-hex','zz'.repeat(8)],['number',1234567890123456],['empty','']]){
     r=await call('POST','/hand/deal',{addr:A,token,clientSeed:cs});T('deal clientSeed '+nm+' -> 400',r.st===400&&r.j.error==='bad client seed',r.txt);}
   r=await call('POST','/hand/deal',{addr:'zz',token,clientSeed:hex(8)});T('deal bad addr 400',r.st===400);
   r=await call('POST','/hand/deal',{addr:P2.addr,token,clientSeed:hex(8)});T('deal other addr 404',r.st===404);
   T('deal refusals wrote nothing',w.snap()===d);
   // act before any hand
   r=await call('POST','/hand/act',{addr:A,token,handNo:1,seq:0,action:{type:'fold'}});T('act with no hand -> 409',r.st===409,r.txt);
   T('act refusal wrote nothing',w.snap()===d);
   r=await w.deal(token,'0123456789abcdef');T('deal ok',r.st===200&&r.j.handNo===1&&r.j.commit===o.j.commit&&r.j.seq===0&&r.j.result===null&&r.j.reveal===null&&r.j.nextCommit===null,r.txt);
   T('deal: exactly one KV write',r.writes.length===1&&r.writes[0]==='tbl:'+A,JSON.stringify(r.writes));
   const v=r.j;
   T('deal view has the hero hole cards only',v.seats[0].hole&&v.seats[0].hole.length===2&&v.seats.slice(1).every(s=>s.hole===null),r.txt);
   T('deal: bots acted until hero turn (or hand over)',v.toAct===0||v.result!==null);
   const d2=w.snap();
   r=await w.deal(token);T('deal while running -> 409',r.st===409&&r.j.error==='hand in progress',r.txt);
   T('409 deal wrote nothing',w.snap()===d2);
   r=await buy(25000000);T('buyin while hand running -> 409',r.st===409&&r.j.error==='hand in progress',r.txt);
   T('buyin refusal moved no value',w.snap()===d2);
   r=await w.cash(50000000);T('cashout while hand running -> 409',r.st===409&&r.j.error==='hand in progress',r.txt);
   T('cashout refusal moved no value',w.snap()===d2);
   r=await w.state(token);T('state mid-hand equals deal view (reload recovery)',r.st===200&&JSON.stringify({...r.j,events:0})===JSON.stringify({...v,events:0}),r.txt);
   // act abuse (hero to act)
   if(v.toAct===0){
     const act=(a,o)=>w.act(token,v,a,o);const s0=w.snap();
     const L=v.legal;
     const refuse=async(nm,x,st)=>{const y=await x;T('act '+nm+' -> '+st+' and state untouched',y.st===st&&w.snap()===s0,y.st+' '+y.txt);return y;};
     await refuse('wrong token',w.call('POST','/hand/act',{addr:A,token:'c'.repeat(32),handNo:v.handNo,seq:v.seq,action:{type:'fold'}}),401);
     await refuse('other addr',w.call('POST','/hand/act',{addr:P2.addr,token,handNo:v.handNo,seq:v.seq,action:{type:'fold'}}),404);
     await refuse('stale handNo',act({type:'fold'},{handNo:v.handNo+1}),409);
     await refuse('handNo 0',act({type:'fold'},{handNo:0}),409);
     await refuse('handNo string',act({type:'fold'},{handNo:String(v.handNo)}),409);
     await refuse('seq ahead',act({type:'fold'},{seq:v.seq+1}),409);
     await refuse('seq negative',act({type:'fold'},{seq:-1}),409);
     await refuse('seq missing',act({type:'fold'},{seq:undefined}),400);
     await refuse('seq float',act({type:'fold'},{seq:0.5}),400);
     await refuse('seq string',act({type:'fold'},{seq:'0'}),400);
     for(const [nm,a] of [['null',null],['string','fold'],['array',['fold']],['no type',{}],['bogus type',{type:'allin'}],['type upper',{type:'FOLD'}],['proto',{type:'__proto__'}],['raise no amount',{type:'raise'}],['raise float',{type:'raise',amount:L.minRaiseTo+0.5}],['raise string',{type:'raise',amount:String(L.minRaiseTo)}],['raise negative',{type:'raise',amount:-L.minRaiseTo}],['raise zero',{type:'raise',amount:0}],['raise below min',{type:'raise',amount:L.minRaiseTo-1}],['raise above max',{type:'raise',amount:L.maxRaiseTo+1}],['raise over stack',{type:'raise',amount:1e9}],['raise unsafe',{type:'raise',amount:2**60}],['raise null',{type:'raise',amount:null}],['raise array',{type:'raise',amount:[L.minRaiseTo]}]])
       await refuse('illegal '+nm,act(a),422);
     {const y=await act({type:'raise',amount:L.minRaiseTo-1});T('422 body: error + why + legal',y.j.error==='illegal action'&&typeof y.j.why==='string'&&y.j.legal&&y.j.legal.minRaiseTo===L.minRaiseTo,y.txt);}
     if(!L.canCheck)await refuse('check with call owed (never converted)',act({type:'check'}),422);
     if(L.canCheck)await refuse('call when nothing owed? accepted by engine rules, skipped',Promise.resolve({st:422,txt:'',}),422);
     // a clean action after all the refusals still works, with the right seq
     const y=await act(L.canCheck?{type:'check'}:{type:'call'});T('valid action after abuse accepted',y.st===200&&y.j.seq===1||y.j.result,y.txt);
     const z=await w.act(token,v,{type:'fold'});T('replay of the same seq -> 409 (no double action)',z.st===409&&z.j.error==='bad seq',z.txt);
     // extra body keys are ignored
     const cur=y.j;if(cur.toAct===0){const q=await w.act(token,cur,{type:'fold',amount:99999,evil:true},{extra:1});T('fold with junk keys ok',q.st===200,q.txt);}
   }
  }

  // ---- resume flow
  {const {token,o}=await w.start({});await w.deal(token,hex(8));
   const s1=(await w.state(token)).j;
   const rb=await w.req('resume',{});r=await call('POST','/table/resume',rb);
   T('resume ok: new token, same view',r.st===200&&/^[0-9a-f]{32}$/.test(r.j.token)&&r.j.token!==token&&r.j.handNo===s1.handNo&&r.j.seq===s1.seq&&r.j.unit===100000&&r.j.tableId==='sol-micro'&&JSON.stringify(r.j.seats)===JSON.stringify(s1.seats),r.txt);
   const t2=r.j.token;
   r=await call('POST','/table/resume',{...rb});T('resume replay 409',r.st===409);
   r=await w.state(token);T('old token dead for state',r.st===401);
   r=await w.act(token,s1,{type:'fold'});T('old token dead for act',r.st===401);
   r=await w.deal(token);T('old token dead for deal',r.st===401);
   r=await w.state(t2);T('new token works for state',r.st===200);
   T('resume view shows no bot cards',r.j.seats.slice(1).every(x=>x.hole===null));
   r=await w.resume({signer:EV});T('resume wrong signer 401',r.st===401);
   r=await w.resume({msgAddr:P2.addr});T('resume signed for other addr 401',r.st===401);
   r=await w.resume({ts:NOW-300001});T('resume stale 400',r.st===400);
   const s0=w.snap();r=await w.resume({signer:P2,addr:P2.addr});T('resume other addr no table 404',r.st===404&&w.snap()===s0);
   r=await w.resume({n:'zz'});T('resume bad nonce 400',r.st===400);
   if(s1.toAct===0){r=await w.act(t2,s1,{type:'fold'});T('act with resumed token works',r.st===200,r.txt);}
   // closed table cannot be resumed
   kv.clear();w.setBal(1e9);await buy(25000000);r=await w.resume();T('resume with session but no table 404',r.st===404);
  }

  // ---- buy-in / cash-out with an open table
  {let {token}=await w.start({});
   r=await buy(30000000);T('buyin between hands adds chips (300 more)',r.st===200&&r.j.stack===80000000&&r.j.table===true&&w.tbl().hero===800&&w.sess().stack===80000000,r.txt);
   r=await buy(25000050);T('buyin off step still 400',r.st===400);
   r=await w.state(token);T('state shows 800 chips',r.j.heroChips===800&&r.j.stackLamports===80000000);
   kv.clear();w.setBal(1e10);await buy(5e9);let o=await w.open({table:'sol-mid'});token=o.j.token;
   const s0=w.snap();r=await buy(25100000);T('buyin not multiple of table unit -> 422',r.st===422&&r.j.error==='amount must be a multiple of the table unit'&&w.snap()===s0,r.txt);
   r=await buy(1000000*30);T('mid buyin 30 chips ok',r.st===200&&w.tbl().hero===5030&&w.sess().stack===5030000000,r.txt);
   // cashout mismatch with open table
   const stack=w.sess().stack;
   for(const bad of [stack-100000,stack+100000,0,stack*6]){const x=await w.cash(bad);T('table cashout '+bad+' != stack -> 422 mismatch',x.st===422&&x.j.error==='amount mismatch'&&x.j.stack===stack,x.txt);}
   T('mismatch left the table open',(await bal()).table===true&&w.tbl().token===token);
   const b0=(await bal()).balance;
   r=await w.cash(stack);T('cashout == stack ok',r.st===200&&r.j.balance===b0+stack&&r.j.session===0&&r.j.stack===0&&r.j.table===false,r.txt);
   T('table closed after cashout',w.tbl()===null&&(await bal()).table===false&&JSON.stringify(await bal())===JSON.stringify({balance:b0+stack,session:0,stack:0,table:false}));
   r=await w.state(token);T('state after cashout 404',r.st===404);
   r=await w.deal(token);T('deal after cashout 404',r.st===404);
   r=await w.act(token,{handNo:1,seq:0},{type:'fold'});T('act after cashout 404',r.st===404);
   r=await w.resume();T('resume after cashout 404',r.st===404);
   // reopen after cashout works
   r=await buy(25000000);const o2=await w.open({});T('reopen after cashout works with a fresh token',o2.st===200&&o2.j.token!==token,o2.txt);
  }
  {
     // deterministic privacy coverage: hero folds at once; bots finish the hand; every ending is scanned
   {kv.clear();w.setBal(1e10);await buy(5e9);const oo=await w.open({table:'sol-mid',bots:3});const tk=oo.j.token;let unc=0,sdn=0,bad=0,sdf=0;
    for(let g=0;g<250&&(unc<4||sdf<2);g++){const dd=await w.deal(tk,hex(8));if(dd.st!==200)break;let vv=dd.j;
     if(vv.result===null&&vv.toAct===0){const ff=await w.act(tk,vv,{type:'fold'});if(ff.st!==200)break;vv=ff.j;}
     if(vv.result===null)continue;
     const hasSd=(vv.events||[]).some(e=>e&&e.type==='showdown');
     if(!hasSd){unc++;if(!vv.seats.slice(1).every(x=>x.hole===null))bad++;}else{sdn++;if(vv.seats.some(x=>x.idx>0&&x.folded))sdf++;}
     if(vv.seats.some(x=>x.idx>0&&x.folded&&x.hole))bad++;}
    if(process.env.ZP_MUTONLY)console.log('  (debug) privacy block',JSON.stringify({unc,sdn,sdf,bad}));
    T('privacy: uncontested endings show no bot hole, folded bots never shown ('+unc+' uncontested, '+sdn+' showdowns)',unc>=1&&sdf>=1&&bad===0,JSON.stringify({unc,sdn,sdf,bad}));}
  }

  // ---- fairness plumbing: reveal verification, commit chain, privacy
  const rng=mulberry(0xC0FFEE);
  async function sha(s){return Buffer.from(await wc.subtle.digest('SHA-256',new TextEncoder().encode(s))).toString('hex');}
  // independent copy of the page deck algorithm
  const SUITS=['♠','♥','♦','♣'],RANKS=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  function pageDeck(hexs){const d=[];for(const s of SUITS)for(const r of RANKS)d.push({r,s});
    let h=1779033703^hexs.length;for(let i=0;i<hexs.length;i++){h=Math.imul(h^hexs.charCodeAt(i),3432918353);h=(h<<13)|(h>>>19);}
    const S=[0,0,0,0];for(let i=0;i<4;i++){h=Math.imul(h^(h>>>16),2246822507);h=Math.imul(h^(h>>>13),3266489909);h^=h>>>16;S[i]=(h>>>0)||0x9e3779b9;}
    const rnd=()=>{let t=S[3];const q=S[0];S[3]=S[2];S[2]=S[1];S[1]=q;t^=t<<11;t^=t>>>8;S[0]=(t^q^(q>>>19))>>>0;return S[0]/4294967296;};
    for(let i=d.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[d[i],d[j]]=[d[j],d[i]];}return d;}
  const key=c=>c.r+'|'+c.s;
  function holesOf(){const m={};const tb=w.tbl();if(!tb||!tb.hand)return m;walk(tb.hand,x=>{if(Array.isArray(x.hole)&&typeof x.idx==='number')m[x.idx]=x.hole.map(key);});return m;}

  // one full simulation: n hands, random legal hero play. Returns summary.
  async function simulate(n,{bots=3,table='sol-micro',stack=50000000,seed=1}={}){
    const R=mulberry(seed);const out={hands:0,responses:0,dealers:[],reloads:0,resumes:0,showdowns:0,heroBust:0,rebuys:0};
    kv.clear();const fund=1e10;w.setBal(fund);
    let s=await w.start({fund,stack,table,bots});let token=s.token;let prevNext=s.o.j.commit;
    T('sim: open ok',s.o.st===200,s.o.txt);
    const unit=w.tbl().unit;let cashedIn=stack;
    for(let h=1;h<=n;h++){
      const tb0=w.tbl();
      if(tb0.hero*1<E.CFG.BB){ // bust or tiny: top up between hands
        out.heroBust++;const x=await buy(25000000);T('sim: top-up buyin ok',x.st===200,x.txt);if(x.st===200){cashedIn+=25000000;out.rebuys++;}}
      let forcedBust=false;
      if(h===2){const tj=w.tbl();if(tj&&tj.bots&&tj.bots[0]){tj.bots[0].chips=3;kv.set('tbl:'+A,JSON.stringify(tj));forcedBust=true;}}
      const cs=hex(8);const dr=await w.deal(token,cs);
      if(dr.st!==200){T('sim: deal '+h+' ok',false,dr.txt);break;}
      if(forcedBust){const b1=dr.j.seats[1];T('sim: a bot left with 3 chips is rebought by the house before the next deal',b1&&b1.chips+b1.bet>=w.tbl().botStart-1,JSON.stringify(b1));}
      let v=dr.j;out.responses++;
      const tbD=w.tbl();const holes=holesOf();const curSeed=tbD.cur.serverSeed,nextSeed=tbD.nextSeed;
      T('sim: seq restarts at 0 each hand',dr.j.seq===0);
      T('sim: commit chain (deal '+h+')',v.commit===prevNext&&v.handNo===h,v.commit+' '+prevNext);
      T('sim: all dealt-in seats funded',(v.result||v.seats.every(x=>x.chips+x.bet>0))&&v.seats.length===bots+1);
      out.dealers.push(v.dealer);
      if(h>1)T('sim: dealer rotates ('+h+')',v.dealer!==out.dealers[h-2]);
      const total0=sumChips(v)+v.pot+(v.result?v.result.rake+v.result.bbj:0); // a hand can already be over at the deal (short stack all-in): rake is then already out of the stacks
      // local replay mirror (independent run of the same engine+bots with a continuous rng stream)
      const mir=JSON.parse(JSON.stringify(tbD.hand));const mr=E.seededRandom(curSeed+cs+h+':bots');for(let i=0;i<tbD.rngN;i++)mr();
      const mirrorRun=()=>{for(let g=0;g<400&&!E.isOver(mir);g++){const L=E.legal(mir);if(!L||L.seat===0)break;let a=B.decide(E.botView(mir,L.seat),mr);let x=E.applyAction(mir,L.seat,a);if(!x.ok)x=E.applyAction(mir,L.seat,L.canCheck?{type:'check'}:L.callAmt>0?{type:'call'}:{type:'fold'});}};
      const scan=(resp,txt,isOpen)=>{
        const over=resp.result!==null;
        T('sim: no deck/nextSeed/token in response',!txt.includes('"deck"')&&!txt.includes(nextSeed)&&!txt.includes(token));
        if(!over){T('sim: no curSeed before the hand ends',!txt.includes(curSeed));T('sim: no reveal before end',resp.reveal===null&&resp.nextCommit===null&&resp.result===null);
          const cs2=cardsIn(resp);let leak=false;for(const idx of Object.keys(holes))if(+idx!==0)for(const c of holes[idx])if(cs2.has(c))leak=true;T('sim: no bot hole card in any running response',!leak);
        }else{
          const folded=new Set(resp.seats.filter(x=>x.folded).map(x=>x.idx));const cs2=cardsIn(resp);let leak=false;for(const idx of Object.keys(holes))if(+idx!==0&&folded.has(+idx))for(const c of holes[idx])if(cs2.has(c))leak=true;
          T('sim: folded bot cards never shown',!leak);
          const sd=(resp.events||[]).some(e=>e&&e.type==='showdown');
          if(!sd)T('sim: an uncontested ending shows no bot hole at all',resp.seats.slice(1).every(x=>x.hole===null),dr.txt.slice(0,160));}
        T('sim: hero hole only for seat 0 while running',over||resp.seats.every(x=>x.idx===0||x.hole===null));
      };
      scan(v,dr.txt);
      let steps=0;
      while(v.result===null&&steps++<60){
        const L=v.legal;if(!L||v.toAct!==0){T('sim: hero turn expected',false,JSON.stringify(v));break;}
        const x=R();let a;
        if(L.canCheck)a=x<.7?{type:'check'}:(L.canRaise?{type:'raise',amount:x<.9?L.minRaiseTo+Math.floor(R()*(L.maxRaiseTo-L.minRaiseTo+1)):L.maxRaiseTo}:{type:'check'});
        else a=x<.2?{type:'fold'}:x<.75?{type:'call'}:(L.canRaise?{type:'raise',amount:x<.95?L.minRaiseTo+Math.floor(R()*(L.maxRaiseTo-L.minRaiseTo+1)):L.maxRaiseTo}:{type:'call'});
        if(a.type==='raise')a.amount=Math.min(L.maxRaiseTo,Math.max(L.minRaiseTo,a.amount));
        // mirror: apply the same hero action locally
        const mx=E.applyAction(mir,0,a);T('sim: mirror accepts the hero action the server accepts',mx.ok,JSON.stringify(a));
        mirrorRun();
        const rr=await w.act(token,v,a);out.responses++;
        if(rr.st!==200){T('sim: act ok '+h,false,rr.st+' '+rr.txt);break;}
        const nv=rr.j;scan(nv,rr.txt);
        T('sim: seq increments',nv.seq===v.seq+1);
        T('sim: mirror agrees with server (chips,pot,comm,toAct)',JSON.stringify(E.view(mir,0).seats.map(q=>q.chips))===JSON.stringify(nv.seats.map(q=>q.chips))&&E.view(mir,0).pot===nv.pot&&E.view(mir,0).comm.length===nv.comm.length&&(E.isOver(mir)===(nv.result!==null)),'');
        T('sim: act writes: 1 table write mid-hand, <=2 when the hand ends',nv.result===null?(rr.writes.length===1&&rr.writes[0]==='tbl:'+A):(rr.writes.length<=2&&rr.writes.every(k=>k==='tbl:'+A||k==='sess:'+A)));
        // chip conservation every step
        T('sim: chips+pot conserved mid-hand',nv.result!==null||sumChips(nv)+nv.pot===total0,sumChips(nv)+' '+nv.pot+' '+total0);
        v=nv;
      }
      T('sim: hand '+h+' ended',v.result!==null);
      if(v.result===null)break;
      out.hands++;
      // end of hand checks
      T('sim: chips+rake+bbj conserved at end',sumChips(v)+v.result.rake+v.result.bbj===total0,sumChips(v)+' '+JSON.stringify(v.result)+' '+total0);
      T('sim: reveal verifies sha256(seed)==commit==commit shown before the deal',!!v.reveal&&v.reveal.commit===v.commit&&await sha(v.reveal.serverSeed)===v.commit&&v.reveal.clientSeed===cs&&v.reveal.handNo===h&&v.reveal.serverSeed===curSeed);
      const deck=pageDeck(v.reveal.serverSeed+v.reveal.clientSeed+v.reveal.handNo);
      const dk=new Map(deck.map((c,i)=>[key(c),i]));const shown=[...(v.seats[0].hole||[]).map(key),...v.comm.map(key)];
      T('sim: revealed deck re-derivation contains every dealt card in the first 2n+8',shown.every(c=>dk.has(c)&&dk.get(c)<2*(bots+1)+8)&&shown.length>=2);
      T('sim: engine deck equals page deck algorithm',JSON.stringify(E.shuffleSeeded(E.mkDeck(),v.reveal.serverSeed+v.reveal.clientSeed+v.reveal.handNo))===JSON.stringify(deck));
      T('sim: nextCommit present and new',/^[0-9a-f]{64}$/.test(v.nextCommit)&&v.nextCommit!==v.commit);
      T('sim: nextSeed not leaked at end',!JSON.stringify(v).includes(w.tbl().nextSeed));
      if(v.result.winners.length&&v.seats.filter(x=>!x.folded).length>1)out.showdowns++;
      prevNext=v.nextCommit;
      const tb=w.tbl();
      T('sim: invariant hero*unit == sess.stack between hands',tb.hero*tb.unit===w.sess().stack&&v.stackLamports===w.sess().stack&&v.heroChips===tb.hero,tb.hero+' '+JSON.stringify(w.sess()));
      T('sim: hero chips = view seat 0',v.seats[0].chips===tb.hero);
      T('sim: bot stacks persisted from the hand result',tb.bots.every((b,i)=>b.chips===v.seats[i+1].chips));
      T('sim: ledger conserved (balance+stack == funded - rake path)',(await bal()).balance===fund-cashedIn);
      // reload recovery and occasional resume
      if(h%7===0){const st=await w.state(token);out.reloads++;T('sim: reload == last view',st.st===200&&JSON.stringify({...st.j,events:0})===JSON.stringify({...v,events:0}),st.txt.slice(0,200));}
      if(h%23===0){const rs=await w.resume();out.resumes++;T('sim: resume ok',rs.st===200&&rs.j.token!==token);if(rs.st===200)token=rs.j.token;}
    }
    // final cash-out equals the server stack and the ledger closes exactly
    const stk=w.sess().stack;const cr=await w.cash(stk);
    T('sim: final cashout == server stack',cr.st===200&&cr.j.balance===fund-cashedIn+stk,cr.txt);
    T('sim: ledger closed: nothing minted (balance within funded+cumulative bot winnings only)',(await bal()).session===0);
    return out;
  }
  const N=full?300:30;
  const s1=await simulate(N,{bots:3,seed:1});
  T('sim: ran the hands',s1.hands>=Math.floor(N*0.9),JSON.stringify(s1));
  if(full){
    const s2=await simulate(120,{bots:1,seed:2,stack:25000000});T('sim heads-up: hands',s2.hands>=100,JSON.stringify(s2));
    const s3=await simulate(100,{bots:7,seed:3,table:'sol-mid',stack:300000000});T('sim 7 bots mid: hands',s3.hands>=90,JSON.stringify(s3));
    T('sim: some showdowns and some top-ups happened',s1.showdowns+s2.showdowns+s3.showdowns>10,JSON.stringify([s1,s2,s3]));
  }

  // ---- KV failure injection (no value minted, state consistent, no exception text)
  const leak=x=>/SECRETLEAK|kv down/.test(x.txt);
  { // buyin without table
    for(const fk of ['sess:','bal:']){kv.clear();w.setBal(1e9);await buy(100000000);const s0=w.snap();w.failOn=k=>k.startsWith(fk);r=await buy(100000000);w.failOn=null;
      T('buyin KV fail on '+fk+' -> 502 restored, state identical',r.st===502&&r.j.error==='ledger write failed, restored'&&w.snap()===s0&&!leak(r),r.txt);
      T('buyin KV fail: no value created',(await bal()).balance+(await bal()).session===1e9);}
    kv.clear();w.setBal(1e9);w.failOn=k=>k.startsWith('bal:');r=await buy(100000000);w.failOn=null;T('buyin with failing balance write: nothing minted',(await bal()).balance+(await bal()).session<=1e9&&r.st===502);
    // restore itself failing never mints: second bal put (the restore) fails
    kv.clear();w.setBal(1e9);let n=0;w.failOn=k=>k.startsWith('sess:');let b0=await bal();r=await buy(100000000);w.failOn=null;const b1=await bal();T('buyin: sess fails, restore ok',b1.balance+b1.stack===b0.balance+b0.stack);
    kv.clear();w.setBal(1e9);n=0;w.failOn=(k)=>k.startsWith('sess:')||(k.startsWith('bal:')&&n++>=1);r=await buy(100000000);w.failOn=null;const b2=await bal();
    T('buyin: sess fails AND restore fails -> value lost not minted',b2.balance+b2.stack<=1e9&&r.st===502,JSON.stringify(b2));
  }
  { // buyin with table: tbl write fails, then sess write fails
    for(const fk of ['tbl:','sess:','bal:']){await w.start({});const s0=w.snap();w.failOn=k=>k.startsWith(fk);r=await buy(30000000);w.failOn=null;
      T('table buyin KV fail on '+fk+' -> 502, state identical',r.st===502&&w.snap()===s0&&!leak(r),r.txt);
      const x=w.tbl();T('table buyin KV fail: invariant hero*unit==stack',x.hero*x.unit===w.sess().stack);}
    // sess fails and the tbl restore fails: table has more chips than sess.stack. cashout pays min(); nothing minted
    {const {token}=await w.start({});const b0=(await bal()).balance;let nn=0;w.failOn=k=>k.startsWith('sess:')||(k.startsWith('tbl:')&&nn++>=1);r=await buy(30000000);w.failOn=null;
     const tb=w.tbl(),ss=w.sess();T('half-failed buyin: tbl ahead of sess (the unsafe direction is blocked by min())',r.st===502&&tb.hero*tb.unit>=ss.stack,JSON.stringify([tb.hero,ss]));
     const hi=tb.hero*tb.unit;const c0=await w.cash(hi);T('half-failed buyin: cashing out the higher table figure is refused',c0.st===422&&c0.j.stack===ss.stack,c0.txt);
     const c=await w.cash(ss.stack);const b1=(await bal()).balance;T('half-failed buyin: cashout of sess.stack pays exactly that',c.st===200&&b1===b0+ss.stack,c.txt);
     const total=b1+(await bal()).stack;T('half-failed buyin: user never gains',total<=1e9);}
  }
  { // tampered/inconsistent records: cash-out never pays more than the smaller of sess.stack and tbl.hero*unit
    {await w.start({});const tb=w.tbl();tb.hero=300;kv.set('tbl:'+A,JSON.stringify(tb));const x=await w.cash(50000000);T('tbl behind sess: paying the sess figure refused with the lower stack',x.st===422&&x.j.stack===30000000,x.txt);
     const y=await w.cash(30000000);T('tbl behind sess: lower figure pays',y.st===200);}
    {await w.start({});const tb=w.tbl();tb.hero=700;kv.set('tbl:'+A,JSON.stringify(tb));const x=await w.cash(70000000);T('tbl ahead of sess: higher figure refused',x.st===422&&x.j.stack===50000000,x.txt);}
    {const {token}=await w.start({});const tb=w.tbl();tb.hero=19;kv.set('tbl:'+A,JSON.stringify(tb));const s0=w.snap();const x=await w.deal(token);T('deal below the big blind -> 409',x.st===409&&x.j.error==='stack below big blind'&&w.snap()===s0,x.txt);}
    {const {token}=await w.start({});const tb=w.tbl();tb.hero=20;kv.set('tbl:'+A,JSON.stringify(tb));const x=await w.deal(token);T('deal with exactly the big blind is allowed',x.st===200,x.txt);}
  }
  { // open
    kv.clear();w.setBal(1e9);await buy(50000000);let s0=w.snap();w.failOn=k=>k.startsWith('tbl:');r=await w.open();w.failOn=null;
    T('open KV fail -> 502, no table, no leak',r.st===502&&w.tbl()===null&&!leak(r)&&(await bal()).table===false,r.txt);
    r=await w.open();T('open retry works',r.st===200,r.txt);
  }
  { // deal
    const {token,o}=await w.start({});const s0=w.snap();w.failOn=k=>k.startsWith('tbl:');r=await w.deal(token);w.failOn=null;
    T('deal KV fail -> 502, state identical, no leak',r.st===502&&w.snap()===s0&&!leak(r),r.txt);
    r=await w.deal(token);T('deal retry works with the same committed seed',r.st===200&&r.j.commit===o.j.commit,r.txt);
  }
  { // act that ends the hand: sess first, tbl second
    // a hand where the hero already has a blind in and must act: folding changes the stack (so sess.stack must be written)
    async function endingFold(){const {token}=await w.start({bots:3});let v=null;
      for(let i=0;i<60;i++){const d=await w.deal(token);if(d.st!==200){v=d.j;break;}v=d.j;if(v.toAct===0&&v.seats[0].bet>0)break;if(v.toAct===0){const f=await w.act(token,v,{type:'fold'});}v=null;}
      return {token,v:v||{toAct:-1}};}
    {const {token,v}=await endingFold();if(v.toAct===0){const s0=w.snap();w.failOn=k=>k.startsWith('tbl:');r=await w.act(token,v,{type:'fold'});w.failOn=null;
      T('hand-ending act: tbl write fails -> 502, sess restored, state identical',r.st===502&&w.snap()===s0&&!leak(r),r.txt);
      r=await w.act(token,v,{type:'fold'});T('retry of the same action succeeds',r.st===200&&r.j.result!==null,r.txt);
      T('retry: invariant holds',w.tbl().hero*w.tbl().unit===w.sess().stack);}}
    {const {token,v}=await endingFold();if(v.toAct===0){const s0=w.snap();w.failOn=k=>k.startsWith('sess:');r=await w.act(token,v,{type:'fold'});w.failOn=null;
      T('hand-ending act: sess write fails -> 502, state identical',r.st===502&&w.snap()===s0&&!leak(r),r.txt);}}
    {const {token,v}=await endingFold();if(v.toAct===0){const before=w.sess().stack;let nn=0;w.failOn=k=>(k.startsWith('tbl:'))||(k.startsWith('sess:')&&nn++>=1);r=await w.act(token,v,{type:'fold'});w.failOn=null;
      T('tbl fails AND sess restore fails -> 502',r.st===502,r.txt);
      const c=await w.cash(before);T('...cashout is refused while the old hand is still marked running',c.st===409&&c.j.error==='hand in progress',c.txt);
      const c2=await w.cash(w.sess().stack);T('...also at the new stack',c2.st===409);
      r=await w.act(token,v,{type:'fold'});T('...retry completes the hand and re-syncs hero*unit == sess.stack',r.st===200&&w.tbl().hero*w.tbl().unit===w.sess().stack,r.txt);}}
  }
  { // cashout
    for(const fk of ['tbl:','sess:','bal:']){await w.start({});const s0=w.snap();const stk=w.sess().stack;
      let nn=0;w.failOn=k=>k.startsWith(fk)&&nn++===0;r=await w.cash(stk);w.failOn=null;
      T('table cashout KV fail on '+fk+' -> 502 restored, identical',r.st===502&&w.snap()===s0&&!leak(r),r.txt);
      r=await w.cash(stk);T('table cashout retry after '+fk+' failure succeeds',r.st===200,r.txt);}
    for(const fk of ['sess:','bal:']){await w.start({});const stk=w.sess().stack;w.failOn=k=>k.startsWith(fk);r=await w.cash(stk);w.failOn=null;
      const b=await bal();T('table cashout, '+fk+' always failing: value never created',r.st===502&&b.balance+b.stack<=1e9,JSON.stringify(b));}
    kv.clear();w.setBal(1e9);await buy(100000000);const s0=w.snap();let nn=0;w.failOn=k=>k.startsWith('bal:')&&nn++===0;r=await w.cash(100000000);w.failOn=null;
    T('no-table cashout KV fail -> restored',r.st===502&&w.snap()===s0);
  }
  { // exceptions inside the engine never leak text
    const Wl=await mk(e=>e.replace('export function applyAction(','function applyAction0(')+'\nexport function applyAction(st, seat, a) { if (seat === 0) throw new Error("SECRETLEAK-engine"); return applyAction0(st, seat, a); }\n');
    const wl=await world(Wl);const {token}=await wl.start({});const d=await wl.deal(token);
    if(d.st===200&&d.j.toAct===0){const x=await wl.act(token,d.j,{type:'fold'});T('engine exception -> 500 with no text',x.st===500&&!/SECRETLEAK/.test(x.txt),x.txt);
      T('engine exception wrote nothing',x.writes.length===0);}
    else if(d.st===500){T('engine exception -> 500 with no text',!/SECRETLEAK/.test(d.txt));}
  }
  // ---- defense in depth against a leaking engine view
  {
    const holes0=(wl,H)=>{for(const k of Object.keys(H))delete H[k];walk(wl.tbl().hand,x=>{if(Array.isArray(x.hole)&&typeof x.idx==='number')H[x.idx]=x.hole.map(key);});};
    const leaky=e=>{const E0=e.replace('export function view(','function view0(');
      return E0+'\nexport function view(st, f = 0) { const v = view0(st, f); v.seats.forEach(s => { s.hole = st.seats[s.idx].hole; }); return v; }\n';};
    const Wl=await mk(leaky);const wl=await world(Wl);const {token}=await wl.start({bots:3});const d=await wl.deal(token);
    const holes={};walk(wl.tbl().hand,x=>{if(Array.isArray(x.hole)&&typeof x.idx==='number')holes[x.idx]=x.hole.map(key);});
    let lk=false;const cs2=cardsIn(d.j);for(const i of Object.keys(holes))if(+i!==0)for(const c of holes[i])if(cs2.has(c))lk=true;
    T('leaky engine view: worker still hides bot cards while running',d.st===200&&!lk&&d.j.seats.slice(1).every(s=>s.hole===null),d.txt.slice(0,200));
    // play hands to the end until one shows a folded bot at a showdown: folded bots must stay hidden even if the engine leaks
    let v=d.j,sawFolded=0,l2=false,hh=0;
    for(;hh<120&&sawFolded<1;hh++){
      if(hh>0){const dn=await wl.deal(token);if(dn.st!==200)break;v=dn.j;holes0(wl,holes);}
      let g=0;while(v.result===null&&g++<60){const L=v.legal;const x=await wl.act(token,v,L.canCheck?{type:'check'}:{type:'call'});if(x.st!==200)break;v=x.j;}
      if(v.result){const folded=v.seats.filter(s=>s.folded&&s.idx>0);if(folded.length&&(v.events||[]).some(e=>e&&e.type==='showdown')){sawFolded++;const cs3=cardsIn(v);for(const s of folded)for(const c of holes[s.idx]||[])if(cs3.has(c))l2=true;}}
    }
    T('leaky engine view: folded bots hidden after a showdown hand ('+hh+' hands)',sawFolded>=1&&!l2);
    const deckLeak=e=>{const E0=e.replace('export function view(','function view0(');return E0+'\nexport function view(st, f = 0) { const v = view0(st, f); v.deck = st.deck; return v; }\n';};
    const Wd=await mk(deckLeak);const wd=await world(Wd);const t2=await wd.start({});const dd=await wd.deal(t2.token);
    T('engine view carrying the deck -> refused, nothing sent',dd.st===500&&!dd.txt.includes('"r"'),dd.txt.slice(0,120));
    const evLeak=e=>{const E0=e.replace('export function view(','function view0(');return E0+'\nexport function view(st, f = 0) { const v = view0(st, f); v.events = st.seats.filter(s => s.idx > 0).map(s => ({ seat: s.idx, type: "deal", cards: s.hole })); return v; }\n';};
    const mint=e=>{const E0=e.replace('export function view(','function view0(');return E0+'\nexport function view(st, f = 0) { const v = view0(st, f); if (st.over) v.seats[0].chips += 5; return v; }\n';};
    const Wm=await mk(mint);const wm=await world(Wm);const t3=await wm.start({bots:2});let dm=null;for(let i=0;i<40;i++){dm=await wm.deal(t3.token);if(dm.st===200)break;}let gg=0;
    while(dm.st===200&&dm.j.result===null&&gg++<60){const L=dm.j.legal;const sn=wm.snap();dm=await wm.act(t3.token,dm.j,{type:'fold'});}
    T('engine that mints a chip at hand end -> refused (500), hand not settled, no money moved',dm.st===500&&!/chip/.test(dm.txt)&&wm.sess().stack===50000000&&wm.tbl().hero===500,dm.txt.slice(0,160));
    const c=await wm.cash(50000000);T('...and cashout stays blocked while that hand is open',c.st===409);
    // broken bots: illegal decision / throw -> fallback keeps the game moving
    const bb=await mk(null,b=>b.replace('export function decide(','export function decide0(')+'\nexport function decide() { throw new Error("SECRETLEAK-bot"); }\n');
    const wb=await world(bb);const t4=await wb.start({bots:2});const db=await wb.deal(t4.token);
    T('throwing bot policy -> check/call/fold fallback, hand still plays, no leak',db.st===200&&!/SECRETLEAK/.test(db.txt),db.txt.slice(0,120));
    const bi=await mk(null,b=>b.replace('export function decide(','export function decide0(')+'\nexport function decide() { return { type: "raise", amount: -5 }; }\n');
    const wi=await world(bi);const t5=await wi.start({bots:2});const di=await wi.deal(t5.token);
    T('illegal bot action -> fallback',di.st===200,di.txt.slice(0,120));
  }
}

// ------------------------------------------------------------------ run on the real worker (unbundled)
const mkFor=(wtext)=>async(emap,bmap)=>loadSet(wtext,emap?emap(esrc):esrc,bmap?bmap(bsrc):bsrc);
const mkReal=mkFor(wsrc);
const real=await mkReal();
await scenario(real,ok,mkReal,true);

// ------------------------------------------------------------------ bundled single file
{const d=path.join(tmp,'bundle-in');fs.mkdirSync(d);fs.writeFileSync(path.join(d,'payout-worker.js'),wsrc);fs.writeFileSync(path.join(d,'engine.js'),esrc);fs.writeFileSync(path.join(d,'bots.js'),bsrc);
 const out=path.join(tmp,'bundle.mjs');const py=cp.spawnSync('python3',[path.join(here,'bundle.py'),d,out],{encoding:'utf8'});
 ok('bundle.py runs',py.status===0&&fs.existsSync(out),py.stderr);
 if(py.status===0){const btxt=rd(out);
  ok('bundle: no import statements left',!/^\s*import\s/m.test(btxt));
  ok('bundle: keeps export default for Cloudflare',/^export default \{ fetch/m.test(btxt));
  ok('bundle: engine/bots exports are not top-level exports',!/^export (async )?function (newHand|decide|applyAction)/m.test(btxt));
  const Wb=Object.assign({},await import(require('url').pathToFileURL(out).href),{__E:real.__E,__B:real.__B});
  const mkB=async(emap,bmap)=>{ // variants re-bundle with the mapped engine/bots
    const dd=path.join(tmp,'bv'+(seq++));fs.mkdirSync(dd);fs.writeFileSync(path.join(dd,'payout-worker.js'),wsrc);fs.writeFileSync(path.join(dd,'engine.js'),emap?emap(esrc):esrc);fs.writeFileSync(path.join(dd,'bots.js'),bmap?bmap(bsrc):bsrc);
    const o2=path.join(dd,'b.mjs');const p2=cp.spawnSync('python3',[path.join(here,'bundle.py'),dd,o2],{encoding:'utf8'});if(p2.status!==0)throw new Error(p2.stderr);
    const M=await import(require('url').pathToFileURL(o2).href);const Em=await import(require('url').pathToFileURL(path.join(dd,'engine.js')).href);const Bm=await import(require('url').pathToFileURL(path.join(dd,'bots.js')).href);return Object.assign({},M,{__E:Em,__B:Bm});};
  await scenario(Wb,(n,c,dd)=>ok('[bundle] '+n,c,dd),mkB,false);
 }}

// ------------------------------------------------------------------ mutation checks
const MUT=[
 // ledger (adapted from the stream A list; the cap mutants are gone with the cap)
 ['buyin: drop min bound',"l => l >= BUYIN.min && l <= BUYIN.max","l => l <= BUYIN.max"],
 ['buyin: drop max bound',"l >= BUYIN.min && l <= BUYIN.max &&","l >= BUYIN.min &&"],
 ['buyin: drop step rule',"l % BUYIN.step === 0);\n  if (bad) return bad;\n  const { addr, lamports } = body;\n  const bal = await getBal(env, addr), s0","true);\n  if (bad) return bad;\n  const { addr, lamports } = body;\n  const bal = await getBal(env, addr), s0"],
 ['buyin: drop balance check',"if (lamports > bal) return [402, { error: 'exceeds ledger balance', balance: bal }];\n  let tbl1","let tbl1"],
 ['buyin: stack not added up',"stack: s0.stack + lamports }","stack: s0.stack }"],
 ['buyin: session total not added up',"inTotal: s0.inTotal + lamports,","inTotal: s0.inTotal,"],
 ['buyin: balance not debited',"await setBal(env, addr, bal - lamports); step = 1;","await setBal(env, addr, bal); step = 1;"],
 ['buyin: bal restore dropped',"try { if (step >= 1) await setBal(env, addr, bal); } catch (e2)","try { if (false) await setBal(env, addr, bal); } catch (e2)"],
 ['buyin: tbl restore dropped',"try { if (step >= 2) await putTbl(env, addr, tbl); } catch (e2)","try { if (false) await putTbl(env, addr, tbl); } catch (e2)"],
 ['buyin: credit before debit (order)',"await setBal(env, addr, bal - lamports); step = 1;\n    if (tbl1) { await putTbl(env, addr, tbl1); step = 2; }\n    await setSess(env, addr, s1);","await setSess(env, addr, s1); step = 1;\n    if (tbl1) { await putTbl(env, addr, tbl1); step = 2; }\n    await setBal(env, addr, bal - lamports);"],
 ['buyin: table hand-in-progress guard removed',"if (running(tbl)) return [409, { error: 'hand in progress' }];\n    if (lamports % tbl.unit","if (lamports % tbl.unit"],
 ['buyin: unit multiple rule removed',"if (lamports % tbl.unit !== 0) return","if (false) return"],
 ['buyin: table chips not added',"hero: tbl.hero + lamports / tbl.unit","hero: tbl.hero"],
 ['cashout: amount must equal removed',"if (lamports !== stack) return","if (false) return"],
 ['cashout: one step slack',"if (lamports !== stack) return","if (Math.abs(lamports - stack) > 100000) return"],
 ['cashout: hand-in-progress guard removed',"if (running(tbl)) return [409, { error: 'hand in progress' }];\n  // The server stack","// The server stack"],
 ['cashout: stack = sess only (no min)',"Math.min(s0.stack, tbl.hero * tbl.unit)","s0.stack"],
 ['cashout: stack = table only',"Math.min(s0.stack, tbl.hero * tbl.unit)","tbl.hero * tbl.unit"],
 ['cashout: stack = max (unsafe)',"Math.min(s0.stack, tbl.hero * tbl.unit)","Math.max(s0.stack, tbl.hero * tbl.unit)"],
 ['cashout: no session check',"if (s0.inTotal <= 0) return [409","if (false) return [409"],
 ['cashout: table not closed',"if (tbl) await env.LEDGER.put('tbl:' + addr, 'null'); step = 1;","step = 1;"],
 ['cashout: session not closed',"await setSess(env, addr, { inTotal: 0, stack: 0 }); step = 2;","step = 2;"],
 ['cashout: clamped by maxLedger',"await setBal(env, addr, bal + lamports); // not clamped","await setBal(env, addr, Math.min(LIMITS.maxLedger, bal + lamports)); // not clamped"],
 ['cashout: negative allowed',"l => l >= 0 && l % CASHOUT.step === 0","l => l % CASHOUT.step === 0"],
 ['cashout: sess restore dropped',"try { if (step >= 2) await setSess(env, addr, s0); } catch (e2)","try { if (false) await setSess(env, addr, s0); } catch (e2)"],
 ['cashout: tbl restore dropped',"try { if (step >= 1 && tbl) await putTbl(env, addr, tbl); } catch (e2)","try { if (false) await putTbl(env, addr, tbl); } catch (e2)"],
 ['cashout signs buyin text',"checkSigned(env, body, now, mark, cashoutMessage","checkSigned(env, body, now, mark, buyinMessage"],
 ['replay check removed',"if (await env.LEDGER.get('nonce:' + addr + ':' + nonce)) return [409, { error: 'replayed request' }];\n  await env.LEDGER.put('nonce:' + addr + ':' + nonce, '1', { expirationTtl: 3600 });\n  return null;","return null;"],
 ['signature check skipped',"if (!(await verifySig(addr, new TextEncoder().encode(msgFn(addr, lamports, nonce, ts)), sig)))","if (false)"],
 ['timestamp check removed',"if (!Number.isSafeInteger(ts) || Math.abs(now - ts) > LIMITS.tsSkewMs) return [400, { error: 'stale request' }];\n  let sig;\n  try { sig = b64dec(signature); } catch (e) { return [400, { error: 'bad signature encoding' }]; }\n  if (sig.length !== 64) return [400, { error: 'bad signature' }];\n  mark('verify-signature');\n  if (!(await verifySig(addr, new TextEncoder().encode(msgFn","let sig;\n  try { sig = b64dec(signature); } catch (e) { return [400, { error: 'bad signature encoding' }]; }\n  if (sig.length !== 64) return [400, { error: 'bad signature' }];\n  mark('verify-signature');\n  if (!(await verifySig(addr, new TextEncoder().encode(msgFn"],
 ['balance omits stack',"stack: s.stack, table:","stack: 0, table:"],
 ['balance omits table flag',"table: !!(await getTbl(env, a)) }","table: false }"],
 ['open message = resume text',"(a, l, n, t) => openMessage(a, tableId, bots, n, t)","(a, l, n, t) => resumeMessage(a, n, t)"],
 // table rules
 ['open: table whitelist removed',"!Object.prototype.hasOwnProperty.call(TABLES, tableId)","typeof tableId !== 'string'"],
 ['open: bots upper bound 8',"bots < 1 || bots > 7","bots < 1 || bots > 8"],
 ['open: bots integer check removed',"!Number.isSafeInteger(bots) || bots < 1","bots < 1"],
 ['open: already-open guard removed',"if (await getTbl(env, addr)) return [409, { error: 'table already open' }];","/* removed */"],
 ['open: minimum stack removed',"|| chips < MIN_STACK_CHIPS)","|| chips < 1)"],
 ['open: no-stack guard removed',"if (s.stack <= 0) return [422, { error: 'no table stack' }];","/* removed */"],
 ['open: micro unit wrong',"'sol-micro': 100000,","'sol-micro': 10000,"],
 ['open: token returned from weak source',"token: randHex(16),","token: '0'.repeat(32),"],
 ['open: commit is not sha256(seed)',"nextCommit: await E.sha256Hex(seed),","nextCommit: seed,"],
 ['state: token check removed',"if (!tokenOk(t, token)) return [401, { error: 'bad token' }];\n  return [200, tableView(t, [])];","return [200, tableView(t, [])];"],
 ['token compare accepts any',"HEX(tok, 32) && tok === t.token","true"],
 ['token compare accepts prefix',"HEX(tok, 32) && tok === t.token","typeof tok === 'string' && t.token.startsWith(tok)"],
 ['resume: token not rotated',"t.token = randHex(16); // the old token dies here","/* kept */"],
 ['resume: new token weak',"t.token = randHex(16); // the old token dies here","t.token = t.token; /* weak */"],
 ['deal: running guard removed',"if (running(t)) return [409, { error: 'hand in progress' }];\n  if (t.hero < E.CFG.BB)","if (t.hero < E.CFG.BB)"],
 ['deal: big-blind guard removed',"if (t.hero < E.CFG.BB) return [409, { error: 'stack below big blind' }];","/* removed */"],
 ['deal: clientSeed check removed',"if (!HEX(clientSeed, 16)) return [400, { error: 'bad client seed' }];","/* removed */"],
 ['deal: next seed not rotated',"t.nextSeed = randHex(32); t.nextCommit = await E.sha256Hex(t.nextSeed);","/* not rotated */"],
 ['deal: dealer not rotated',"dealer = (t.dealer + 1) % seats.length","dealer = t.dealer % seats.length"],
 ['deal: bot rebuy removed',"t.bots.forEach(b => { if (b.chips < E.CFG.BB) b.chips = t.botStart; });","/* none */"],
 ['deal: handNo not advanced',"const handNo = t.handNo + 1,","const handNo = t.handNo,"],
 ['deal: seq not reset',"t.handNo = handNo; t.seq = 0; t.rngN = 0;","t.handNo = handNo; t.rngN = 0;"],
 ['act: handNo check removed',"if (handNo !== t.cur.handNo) return [409, { error: 'stale hand', handNo: t.cur.handNo }];","/* removed */"],
 ['act: seq check removed',"if (seq !== t.seq) return [409, { error: 'bad seq', seq: t.seq }];","/* removed */"],
 ['act: seq not incremented',"  t.seq++;\n","  /* no seq */\n"],
 ['act: hand-running guard removed',"if (!running(t)) return [409, { error: 'no hand in progress' }];","/* removed */"],
 ['act: token check removed',"if (!tokenOk(t, token)) return [401, { error: 'bad token' }];\n  if (!running(t))","if (!running(t))"],
 ['act: engine refusal ignored',"if (!r.ok) return [422,","if (false) return [422,"],
 ['bots: rng stream not resumed',"for (let i = 0; i < t.rngN; i++) r();","/* no burn */"],
 ['bots: rng count not stored',"t.rngN = n;","/* lost */"],
 ['bots: fallback removed',"if (!x.ok) x = E.applyAction(h, L.seat, L.canCheck ? { type: 'check' } : L.callAmt > 0 ? { type: 'call' } : { type: 'fold' });","/* none */"],
 ['bots: throw not caught',"try { a = BOT.decide(E.botView(h, L.seat), rng); } catch (e) { a = null; }","a = BOT.decide(E.botView(h, L.seat), rng);"],
 // settle / persistence
 ['settle: chip invariant removed',"|| sum + res.rake + res.bbj !== before) throw","|| false) throw"],
 ['settle: hero chips not stored',"t.hero = chips[0];","/* kept */"],
 ['settle: bot chips not stored',"t.bots.forEach((b, i) => { b.chips = chips[i + 1]; });","/* kept */"],
 ['settle: reveal uses next seed',"t.lastReveal = { serverSeed: t.cur.serverSeed,","t.lastReveal = { serverSeed: t.nextSeed,"],
 ['settle: reveal wrong client seed',"clientSeed: t.cur.clientSeed, handNo: t.cur.handNo };\n  return","clientSeed: t.cur.commit.slice(0, 16), handNo: t.cur.handNo };\n  return"],
 ['persist: sess.stack not updated',"if (sessStack !== null && sessStack !== sess0.stack) {","if (false) {"],
 ['persist: sess restore dropped',"try { await setSess(env, addr, sess0); } catch (e2) { /* hand still marked running","try { /* skipped */ } catch (e2) { /* hand still marked running"],
 ['persist: tbl written before sess',"await setSess(env, addr, { inTotal: sess0.inTotal, stack: sessStack });\n      try { await putTbl(env, addr, t); } catch (e) {","try { await putTbl(env, addr, t); await setSess(env, addr, { inTotal: sess0.inTotal, stack: sessStack }); } catch (e) {"],
 // view / privacy
 ['view: bot hole filter removed (running)',"(s.idx === 0 ? s.hole || null : null)","(s.hole || null)"],
 ['view: bot hole filter removed (over)',"over ? (holeVisible(v, s) ? s.hole || null : null)","over ? (s.hole || null)"],
 ['view: showdown rule drops folded check',"!!seat.hole && !seat.folded && v.seats.filter","!!seat.hole && v.seats.filter"],
 ['view: event card stripping removed',"if (c.cards && c.seat > 0 && !(over && c.type === 'showdown' && out.seats[c.seat] && out.seats[c.seat].hole)) delete c.cards;","/* none */"],
 ['view: privacy scan removed',"if (j.includes('\"deck\"') || j.includes(t.nextSeed) || (t.cur && !over && j.includes(t.cur.serverSeed))) throw new Error('privacy');","/* none */"],
 ['view: commit shows next commit',"commit: t.cur.commit, seats,","commit: t.nextCommit, seats,"],
 ['view: nextCommit shown while running',"nextCommit: over ? t.nextCommit : null,","nextCommit: t.nextCommit,"],
 ['view: seq not exposed',"out.seq = t.seq;","out.seq = 0;"],
 ['view: stackLamports wrong unit',"out.stackLamports = t.hero * t.unit;","out.stackLamports = t.hero * 1000;"],
];

for(const [name,from,to] of (process.env.ZP_NOMUT?[]:MUT.filter(m=>!process.env.ZP_MUTONLY||m[0].includes(process.env.ZP_MUTONLY)))){
  const i=wsrc.indexOf(from);
  if(i<0||wsrc.indexOf(from,i+1)>=0){ok('mutant anchor unique: '+name,false,i<0?'not found':'ambiguous');continue;}
  let red=0;
  try{const mk=mkFor(wsrc.replace(from,to));const W=await mk();await scenario(W,(n,c)=>{if(!c)red++;},mk,false);}catch(e){red++;}
  ok('mutant killed: '+name,red>0,'suite stayed green');if(!red&&process.env.ZP_MUTONLY)console.log('  (debug) mutant survived',name);
}
try{fs.rmSync(tmp,{recursive:true,force:true});}catch(e){}
return {name:'engine-endpoints.js (stream W, engine='+(IS_STUB?'STUB':'REAL')+')',pass,fail};};
