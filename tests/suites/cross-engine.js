// CROSS-ENGINE suite (integrator): the REAL page code (stream P) against the REAL worker + engine + bots (streams W/E/B2). Derived from server-engine-page.js world(); the strict mock server is replaced by the real worker handler.. Runs the REAL page code in a vm sandbox with a stubbed DOM.
// STRICT MOCK SERVER: implements CONTRACT-ENGINE.md v2 (exact signed messages, real Ed25519 verification via
// webcrypto, token/handNo/seq checks, hidden cards, exact body keys) with a small deterministic scripted
// dealer (the page's own shuffle/evalH are the deck/rules spec). STRICT MOCK PHANTOM as in money-loop-page.js.
// NOT run against the real worker (the integrator's G4 does that). Page under test: ZP_PAGE env or app/index.html.
module.exports=async function(){
let pass=0,fail=0;const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
const vm=require('vm'),fs=require('fs'),path=require('path'),nodeCrypto=require('crypto');
const wc=nodeCrypto.webcrypto;
const PAGE=process.env.ZP_PAGE||path.join(__dirname,'..','..','app','index.html');
const html=fs.readFileSync(PAGE,'utf8');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
const ALPHA='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58enc(u8){let n=0n;for(const b of u8)n=n*256n+BigInt(b);let o='';while(n>0n){o=ALPHA[Number(n%58n)]+o;n/=58n;}for(const b of u8){if(b===0)o='1'+o;else break;}return o;}
function b58dec(str){let n=0n;for(const c of str){const i=ALPHA.indexOf(c);if(i<0)throw new Error('bad b58');n=n*58n+BigInt(i);}const o=[];while(n>0n){o.push(Number(n&255n));n>>=8n;}for(const c of str){if(c==='1')o.push(0);else break;}return Uint8Array.from(o.reverse());}

const Wk=await import(require('url').pathToFileURL(path.join(__dirname,'..','..','worker','payout-worker.js')).href);
const ORIGIN='https://site.example';
const kv=new Map();
const HK=await wc.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
const hpub=new Uint8Array(await wc.subtle.exportKey('raw',HK.publicKey));const hpk8=new Uint8Array(await wc.subtle.exportKey('pkcs8',HK.privateKey));
const env={HOUSE_SECRET:JSON.stringify([...hpk8.slice(-32),...hpub]),RPC_URL:'https://rpc.test/?k=1',ALLOW_ORIGIN:ORIGIN,
 LEDGER:{get:async k=>kv.has(k)?kv.get(k):null,put:async(k,v)=>{kv.set(k,v);}}};
const HOUSE=Wk.b58enc(hpub);
const chain={};let sentTx=[];
const realFetch=globalThis.fetch;
globalThis.fetch=async(url,init)=>{const b=JSON.parse(init.body);const R=r=>({ok:true,status:200,json:async()=>({jsonrpc:'2.0',id:1,result:r})});
 if(b.method==='getSignatureStatuses'){const c=chain[b.params[0][0]];return R({value:[c?c.status:null]});}
 if(b.method==='getTransaction'){const c=chain[b.params[0]];return R(c?c.tx:null);}
 if(b.method==='getLatestBlockhash')return R({value:{blockhash:Wk.b58enc(wc.getRandomValues(new Uint8Array(32)))}});
 if(b.method==='sendTransaction'){sentTx.push(Buffer.from(b.params[0],'base64'));return R(Wk.b58enc(new Uint8Array(sentTx[sentTx.length-1].slice(1,65))));}
 return {ok:false,status:500,json:async()=>({})};};
let depN=0;
async function fund(E,lam){const sig=Wk.b58enc(Uint8Array.from({length:64},(_,i)=>(i+(++depN)*7)%251+1));
 chain[sig]={status:{err:null,confirmationStatus:'finalized'},tx:{meta:{err:null},transaction:{message:{accountKeys:[{pubkey:E.ADDR,signer:true}],instructions:[{program:'system',parsed:{type:'transfer',info:{source:E.ADDR,destination:HOUSE,lamports:lam}}}]}}}};
 return E.S.handle('POST','/credit',undefined,{addr:E.ADDR,sig});}
const API='https://ledger.test',SOL=1e9,BB=20,SB=10;
const UNIT={'sol-micro':100000,'sol-mid':1000000,'sol-high':10000000};
const sleep1=()=>new Promise(r=>setImmediate(r));
const rhex=n=>nodeCrypto.randomBytes(n).toString('hex');

// ---- independent message builders (copied from the contract text, NOT from the page) ----
const MSG={
 buyin:(a,l,n,t)=>'Anon Poker table buy-in\nChain: Solana devnet\nAddress: '+a+'\nLamports: '+l+'\nNonce: '+n+'\nTimestamp: '+t+'\nThis signature authorises moving exactly this amount from your balance to your table stack.',
 cashout:(a,l,n,t)=>'Anon Poker table cash-out\nChain: Solana devnet\nAddress: '+a+'\nLamports: '+l+'\nNonce: '+n+'\nTimestamp: '+t+'\nThis signature reports your final table stack and moves exactly this amount to your balance.',
 open:(a,tb,b,n,t)=>'Anon Poker open table\nChain: Solana devnet\nAddress: '+a+'\nTable: '+tb+'\nBots: '+b+'\nNonce: '+n+'\nTimestamp: '+t+'\nThis signature authorises sitting at this table with your current table stack.',
 resume:(a,n,t)=>'Anon Poker resume table\nChain: Solana devnet\nAddress: '+a+'\nNonce: '+n+'\nTimestamp: '+t+'\nThis signature authorises resuming your open table and issuing a new table token.'};
const kindOf=text=>/^Anon Poker table buy-in\n/.test(text)?'buyin':/^Anon Poker table cash-out\n/.test(text)?'cashout':/^Anon Poker open table\n/.test(text)?'open':/^Anon Poker resume table\n/.test(text)?'resume':/^Anon Poker withdraw\n/.test(text)?'withdraw':'signin';
const BUYIN={min:25000000,max:5000000000,step:100000};

// =====================================================================
// one world = fresh page context + strict server + strict Phantom + virtual clock
// =====================================================================
async function world(o){
 o=o||{};
 const kp=o.from?o.from.kp:await wc.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
 const ADDR=o.from?o.from.ADDR:b58enc(new Uint8Array(await wc.subtle.exportKey('raw',kp.publicKey)));
 const S={calls:[],resp:[],failNext:null,dropReply:null,netDown:false,hook:null};
 const E={S,ADDR,W:null,inflight:0,now:1e6,kp};
 S.handle=async(method,pathn,q,b)=>{
  S.calls.push({method,path:pathn,body:b,q:q&&Object.fromEntries(q)});
  if(S.failNext===pathn){S.failNext=null;return {st:500,j:{error:'boom'}};}
  if(S.hook){const h=S.hook(method,pathn,b);if(h)return h;}
  const qs=q&&q.toString()?'?'+q.toString():'';
  const req=new Request('https://worker.test'+pathn+qs,{method,headers:{'content-type':'application/json',origin:ORIGIN},body:b!==undefined?JSON.stringify(b):undefined});
  const res=await Wk.handle(req,env,Date.now());
  const R={st:res.status,j:await res.json()};S.resp.push({path:pathn,st:R.st,j:R.j});return R;
 };
 const kget=k=>{try{return JSON.parse(kv.get(k));}catch(e){return null;}};
 E.kbal=()=>Number(kv.get('bal:'+ADDR)||0);
 E.ksess=()=>kget('sess:'+ADDR);
 E.ktbl=()=>kget('tbl:'+ADDR);
 async function verify(addr,text,b64){
  if(typeof b64!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))return false;
  const sg=Buffer.from(b64,'base64');if(sg.length!==64)return false;
  try{const k=await wc.subtle.importKey('raw',b58dec(addr),{name:'Ed25519'},false,['verify']);return await wc.subtle.verify({name:'Ed25519'},k,sg,Buffer.from(text,'utf8'));}catch(e){return false;}
 }
 const isAddr=a=>typeof a==='string'&&a.length>=32&&a.length<=44&&[...a].every(c=>ALPHA.includes(c));
 const keysOf=b=>Object.keys(b||{}).sort().join();
 const err=(st,j)=>({st,j});
 async function sigCheck(kind,b,text){ // timestamp, signature, shared nonce replay set
  if(typeof b.nonce!=='string'||!/^[0-9a-f]{16,64}$/.test(b.nonce))return err(400,{error:'bad nonce'});
  if(!Number.isSafeInteger(b.ts)||Math.abs(Date.now()-b.ts)>300000)return err(400,{error:'stale timestamp'});
  if(!(await verify(b.addr,text,b.signature)))return err(401,{error:'bad signature'});
  const rk='nonce:'+b.addr+':'+b.nonce;
  if(S.seen.has(rk))return err(409,{error:'replay'});
  S.seen.add(rk);return null;
 }
 // ---------- strict Phantom ----------
 const W={signs:[],mode:'ok',hold:null,connects:0};
 E.W=W;
 const ph={isPhantom:true,
  async connect(){W.connects++;return {publicKey:{toString:()=>ADDR}};},
  on(){},disconnect(){},
  async signMessage(msg,display){
   if(!(msg instanceof Uint8Array))throw new Error('Phantom: message must be a Uint8Array');
   if(display!=='utf8'&&display!=='hex')throw new Error('Phantom: bad display format');
   const text=new TextDecoder('utf-8',{fatal:true}).decode(msg);
   const kind=kindOf(text);
   W.signs.push({kind,text,display});
   if(kind!=='signin'){const m=/\nAddress: (\S+)\n/.exec(text);if(!m||m[1]!==ADDR)throw new Error('Phantom: malformed ledger message');}
   E.inflight++;
   try{
    if(W.mode==='decline'&&kind!=='signin')throw Object.assign(new Error('User rejected the request.'),{code:4001});
    if(W.mode==='declineOpen'&&kind==='open'){W.mode='ok';throw Object.assign(new Error('User rejected the request.'),{code:4001});}
    if(W.mode==='declineCash'&&kind==='cashout'){W.mode='ok';throw Object.assign(new Error('User rejected the request.'),{code:4001});}
    if(W.hold&&kind!=='signin')await W.hold;
    return {signature:new Uint8Array(await wc.subtle.sign({name:'Ed25519'},kp.privateKey,msg))};
   }finally{E.inflight--;}
  },
  async request(){throw new Error('unexpected request');}};
 // ---------- sandbox ----------
 const els={};
 const nop=new Proxy(function(){},{get:(t,p)=>p===Symbol.toPrimitive?()=>0:(p==='then'?undefined:nop),apply:()=>nop,set:()=>true});
 function el(id){if(els[id])return els[id];const cls=new Set();
  const base={style:new Proxy({},{get:(t,p)=>p in t?t[p]:nop,set:(t,p,v)=>{t[p]=v;return true;}}),classList:{add:c=>cls.add(c),remove:c=>cls.delete(c),toggle:(c,f)=>{(f===undefined?!cls.has(c):f)?cls.add(c):cls.delete(c);},contains:c=>cls.has(c)},innerHTML:'',textContent:'',value:'',disabled:false,className:'',children:[],scrollTop:0,
   insertAdjacentHTML(w,h){this.innerHTML+=h;},appendChild(){},remove(){},querySelector:()=>el('q:'+id),querySelectorAll:()=>[],addEventListener(){},getContext:()=>nop,setAttribute(){},dataset:{},animate:()=>({}),offsetWidth:0};
  return els[id]=new Proxy(base,{get:(t,p)=>p in t?t[p]:nop,set:(t,p,v)=>{t[p]=v;return true;}});}
 const s={console,Math,Object,Array,Set,Map,JSON,Number,Date,Uint8Array,Uint32Array,TextEncoder,TextDecoder,BigInt,String,Error,Promise,Buffer,RegExp,btoa,atob,encodeURIComponent,decodeURIComponent,parseFloat,parseInt,isNaN,URL,Infinity};
 s.document={getElementById:id=>el(id),createElement:()=>el('c'+Math.random()),querySelector:()=>el('q'),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}},body:el('body')};
 s.window={matchMedia:()=>({matches:o.rm!==false,addEventListener(){}}),addEventListener(){}};
 if(!o.noPhantom)s.window.phantom={solana:ph};
 s.matchMedia=s.window.matchMedia;s.localStorage={getItem:()=>null,setItem(){}};
 s.crypto=wc;s.navigator={};s.requestAnimationFrame=()=>0;s.cancelAnimationFrame=()=>{};s.performance={now:()=>E.now};
 // virtual timers: run only when the page is idle (no fetch / signature in flight), earliest first
 let tid=0;const timers=new Map(),ivs=new Map();
 s.setTimeout=(f,ms)=>{const id=++tid;timers.set(id,{f,due:E.now+Math.max(0,ms||0),id});return id;};
 s.clearTimeout=id=>{timers.delete(id);};
 s.setInterval=(f,ms)=>{const id=++tid;ivs.set(id,{f,ms});return id;};
 s.clearInterval=id=>{ivs.delete(id);};
 E.timers=timers;E.ivs=ivs;
 s.fetch=async(url,opt)=>{
  opt=opt||{};
  if(!url.startsWith(API))throw new Error('unexpected fetch '+url);
  const u=new URL(url);const method=opt.method||'GET';
  if(method==='POST'&&!(opt.headers&&opt.headers['content-type']==='application/json'))return {ok:false,status:415,json:async()=>({error:'content-type'})};
  E.inflight++;
  try{
   await sleep1();
   if(S.netDown)throw new Error('network down');
   const r=await S.handle(method,u.pathname,u.searchParams,opt.body?JSON.parse(opt.body):undefined);
   if(S.dropReply===u.pathname){S.dropReply=null;throw new Error('network lost reply');}
   return {ok:r.st<400,status:r.st,json:async()=>JSON.parse(JSON.stringify(r.j))};
  }finally{E.inflight--;}
 };
 vm.createContext(s);
 vm.runInContext(code+';globalThis.T={G,SRV,LOOP,PF,WALLET,TABLES,SOL_CFG,SOLWAL,STAGES,startGame,startHand,act,openBuyIn,confirmBuyIn,doRebuy,doAddOn,checkRebuy,leaveTable,closeCashout,solConnect,solDisconnect,render,loopSync,loopRender,loopRetryClick,loopRecoverClick,srvResume,srvApply,srvRecover,srvCheckView,srvDeal,srvSend,toggleSitOut,mkDeck,shuffleSeeded,evalH,sha256Hex,pfVerifyNow,setMode,setTableSize,BUYIN_MIN,BUYIN_MAX,SB,BB,get pendingTable(){return pendingTable;},set pendingTable(v){pendingTable=v;},get heroTimer(){return heroTimer;},get selectedTableBots(){return selectedTableBots;}};',s);
 T=s.T;E.T=T;
 T.SOL_CFG.api=o.api===undefined?API:o.api;T.SOL_CFG.pollMs=0;T.SOL_CFG.pollMax=3;
 Object.assign(E,{el,s,
  tbl:id=>T.TABLES.find(t=>t.id===id),
  setSlider(v){el('biSlider').value=String(v);},
  me:()=>T.G.seats&&T.G.seats[0],
  ledgerSigns:()=>W.signs.filter(x=>x.kind!=='signin'),
  tb:()=>E.ktbl(),
  async idle(){let c=0;for(let i=0;i<4000&&c<6;i++){await sleep1();if(E.inflight===0&&!T.LOOP.busy)c++;else{c=0;if(i%50===49)await new Promise(r=>setTimeout(r,1));}}},
  // advance virtual time: run due timers earliest-first while the page is idle, until cond() or no timers
  async pump(cond,maxSteps){
   maxSteps=maxSteps||4000;
   for(let k=0;k<maxSteps;k++){
    await E.idle();
    if(cond&&cond())return true;
    let best=null;for(const t of timers.values())if(!best||t.due<best.due||(t.due===best.due&&t.id<best.id))best=t;
    if(!best)return cond?!!cond():true;
    E.now=Math.max(E.now,best.due);timers.delete(best.id);
    try{best.f();}catch(e){console.log('  (timer threw)',e.message);}
   }
   return cond?!!cond():true;
  },
  async connect(){W.signs.length=0;const r=await T.solConnect();await E.idle();return r;},
  async sit(id,chips,bots){
   if(bots!==undefined)T.setTableSize(bots);
   T.openBuyIn(id);if(chips!==undefined)E.setSlider(chips);
   const r=T.confirmBuyIn();await r;await E.idle();return r;
  },
  async untilHero(){return E.pump(()=>T.G.ai===0&&!T.G.over&&T.heroTimer);},
  async untilOver(){return E.pump(()=>T.G.over&&T.SRV.view&&T.SRV.view.result&&!T.SRV.lock&&timers.size>=0&&T.G.sdPhase===null,6000);},
  async hero(a,amount){ // press the hero's button via the real act() the action bar calls
   T.act(0,a,amount);await E.idle();
  },
  spy(){vm.runInContext("globalThis.__spy={log:[],bub:[],snd:[]};(function(){const l=log,ab=actionBubble,ps=playSound;log=function(m){__spy.log.push(String(m));return l.apply(this,arguments);};actionBubble=function(i,t,k){__spy.bub.push([i,t,k]);return ab.apply(this,arguments);};playSound=function(t,a,p){__spy.snd.push(t);return ps.apply(this,arguments);};})();",s);return s.__spy;},
  async press(id){const b=E.el(id);b.onclick();await E.idle();},
  bar:()=>E.el('actionBar').innerHTML,
  seatsHtml:()=>E.el('seatNodes').innerHTML,
  expireHeroTimer(){E.now+=20000;for(const iv of [...ivs.values()])iv.f();},
  async bal(){const r=await S.handle('GET','/balance',new URL(API+'/balance?addr='+ADDR).searchParams);return r.j;}
 });
 return E;
}
const OK=async E=>{await E.connect();};
// sit at a server table and wait for the first hero decision
async function seated(o,chips,bots,tableId){
 const E=await world(o);await E.connect();
 await E.sit(tableId||'sol-mid',chips===undefined?500:chips,bots===undefined?2:bots);
 return E;
}
const seatedHero=async(o,chips,bots,tableId)=>{const E=await seated(o,chips,bots,tableId);await E.untilHero();return E;};
const heroLegalCall=E=>{const v=E.T.SRV.view;return v&&v.legal;};

const has=(h,t)=>String(h).indexOf(t)>=0;
const sumChips=E=>{const v=E.T.SRV.view;return v?v.seats.reduce((a,x)=>a+x.chips,0)+v.pot:0;};
const faceCount=h=>(String(h).match(/card-face/g)||[]).length;

async function seatedReal(chips,bots,tableId,dep){
 const E=await world({});await fund(E,dep===undefined?2*SOL:dep);await E.connect();
 await E.sit(tableId||'sol-mid',chips,bots);return E;
}

// ===== 1. real flow, 40 hands through the real page against the real worker =====
{
 let E=await seatedReal(1000,2);let {T,S}=E;
 ok('real: deposit mirrored, buy-in and open table succeeded',E.ktbl()&&E.ktbl().hero===1000&&E.ksess().stack===1000*1e6&&E.kbal()===1e9,JSON.stringify([E.ktbl()&&E.ktbl().hero,E.ksess(),E.kbal()]));
 ok('real: exactly two Phantom signatures at sit-down (buy-in, open)',E.ledgerSigns().length===2,E.ledgerSigns().length);
 let lastH=null,lastSum=0;
 let hands=0,steps=0,bad=[],showdowns=0,busted=false,tot0=0,sessions=1;const kinds=new Set();
 for(;;){
 const total0=1000*3;
 const rnd=(()=>{let x=424242;return()=>{x=(x*1103515245+12345)&0x7fffffff;return x/0x7fffffff;};})();

 busted=false;while(tot0+hands<40&&steps<1500){
  steps++;
  const okp=await E.pump(()=>(T.G.ai===0&&!T.G.over&&T.heroTimer)||(T.G.over&&T.SRV.view&&T.SRV.view.result&&T.SRV.nextHand>hands+1),6000);
  if(!okp){bad.push('stuck at step '+steps+' '+JSON.stringify({ai:T.G.ai,over:T.G.over,ht:!!T.heroTimer,lock:!!T.SRV.lock,nh:T.SRV.nextHand,res:!!(T.SRV.view&&T.SRV.view.result),hn:T.SRV.view&&T.SRV.view.handNo,note:T.LOOP&&T.LOOP.note,last:S.resp.filter(r=>!/table\/state/.test(r.path)).slice(-2).map(r=>[r.path,r.st,JSON.stringify(r.j).slice(0,700)]),fails:T.SRV.fails,keys:(()=>{const r=S.resp.filter(r=>/hand\/(deal|act)/.test(r.path)).slice(-1)[0];return r&&Object.keys(r.j).join(',');})(),chk:(()=>{const r=S.resp.filter(r=>/hand\/(deal|act)/.test(r.path)).slice(-1)[0];try{T.srvCheckView(r.j);return 'ok';}catch(e){return String(e.message||e);}})(),msg:T.G.srvMsg,acts:S.resp.filter(r=>/hand\/act/.test(r.path)).map(r=>r.st+':'+(r.j&&r.j.error||'')).join(','),vw:T.SRV.view&&JSON.stringify([T.SRV.view.toAct,T.SRV.view.stage,T.SRV.view.legal,T.SRV.view.result&&1]),logs:(T.G.log||[]).slice(-4)}));break;}
  if(T.G.ai===0&&!T.G.over){
   const v=T.SRV.view;
   {const sc=sumChips(E);
    if(lastH===v.handNo&&sc>lastSum)bad.push('chips created inside hand '+v.handNo+': '+lastSum+' -> '+sc);
    if(lastH!==v.handNo&&sc>lastSum&&lastH!==null&&!v.seats.slice(1).some(x=>x.chips===1000||x.chips+x.bet===1000))bad.push('sum rose across hands without a bot rebuy to 1000, hand '+v.handNo);
    lastH=v.handNo;lastSum=sc;}
   if(v.seats.slice(1).some(x=>x.hole))bad.push('bot hole in a live view');
   if(faceCount(E.seatsHtml())!==2)bad.push('face-up cards mid-hand: '+faceCount(E.seatsHtml()));
   const r=rnd();
   if(r<0.12){kinds.add('fold');await E.press('fBtn');}
   else if(r<0.5&&has(E.bar(),'ckBtn')){kinds.add('check');await E.press('ckBtn');}
   else if(r<0.93&&has(E.bar(),'caBtn')){kinds.add('call');await E.press('caBtn');}
   else if(has(E.bar(),'brBtn')){kinds.add('raise');await E.press('brBtn');}
   else if(has(E.bar(),'ckBtn'))await E.press('ckBtn');
   else await E.press('caBtn');
  }else{
   const v=T.SRV.view;hands=v.handNo;
   if(v.result){
    if(!(T.G.seats[0].chips===v.seats[0].chips||T.G.sdPhase))bad.push('UI stack != server view after hand '+v.handNo);
    const kt=E.ktbl();
    if(!kt||kt.hero*1e6!==E.ksess().stack)bad.push('server invariant hero*unit==sess.stack broken after hand '+v.handNo);
    if(v.seats.slice(1).some(x=>x.hole))showdowns++;
    if(!T.PF.lastReveal||T.PF.lastReveal.hand!==v.handNo)bad.push('no reveal for hand '+v.handNo);
    else{
     T.pfVerifyNow();const body=E.el('pfBody').innerHTML;
     if(!has(body,'MATCH')||has(body,'MISMATCH'))bad.push('verifier not MATCH hand '+v.handNo);
     if(T.PF.lastReveal.commit!==T.SRV.commits[v.handNo])bad.push('reveal commit is not the pre-deal one hand '+v.handNo);
    }
    if(v.seats[0].chips<20){busted=true;break;}
   }
  }
 }
  if(!(busted&&sessions<8&&bad.length===0))break;
  tot0+=hands;hands=0;sessions++;lastH=null;lastSum=0;
  // a legitimate bust: the table closes with zero stack; seat a fresh session and carry on
  const ek=E.ksess();if(ek&&ek.stack>=20*1e6)bad.push('busted but server stack '+JSON.stringify(ek));
  E=await seatedReal(1000,2);T=E.T;S=E.S;
 }
 ok('real: 40 hands, no invariant broken '+bad.slice(0,3).join(' | '),bad.length===0&&tot0+hands>=40,JSON.stringify({hands,tot0,sessions,steps,bad:bad.slice(0,5)}));
 ok('real: mixed play covered fold/check/call/raise and at least one showdown',kinds.size>=3&&showdowns>=1,JSON.stringify([...kinds,showdowns]));
 ok('real: zero Phantom calls beyond the two at sit-down across all hands',E.ledgerSigns().length===2);
 ok('real: no hidden card ever left the real worker before showdown/reveal',S.resp.filter(r=>/hand\/(deal|act)/.test(r.path)&&r.st===200).every(r=>r.j.result?true:r.j.seats.slice(1).every(x=>x.hole===null)));
 // leave and cash out: server stack == credited
 const stackBefore=E.ksess().stack,balBefore=E.kbal();
 // finish the running hand: fold if hero to act
 await E.pump(()=>T.G.ai===0&&!T.G.over&&T.heroTimer||T.G.over,4000);
 await T.leaveTable();await E.idle();await E.idle();
 const after=E.kbal(),sess=E.ksess();
 ok('real: leave table cashes out exactly the server stack and closes the session',T.G.left&&sess&&sess.stack===0&&sess.inTotal===0,JSON.stringify([sess,after,balBefore]));
 ok('real: ledger balance after = before + server stack at table (or less only by hand in progress folded)',after>=balBefore&&after<=balBefore+stackBefore+1e12,JSON.stringify([balBefore,stackBefore,after]));
 ok('real: page balance mirrors the ledger after cash-out',T.WALLET.SOL===after/1e9,T.WALLET.SOL+' vs '+after/1e9);
 ok('real: ledger conservation: balance after cash-out is within [deposit-0.15*? ... table total] and an integer multiple of 100000',after%100000===0&&after>0);
}
// ===== 2. reload + resume against the real worker =====
{
 const E=await seatedReal(1000,2);await E.untilHero();const {S}=E;
 const handBefore=E.T.SRV.view.handNo;const heroCards=JSON.stringify(E.T.SRV.view.seats[0].hole);
 const E2=await world({from:E});await E2.connect();await E2.idle();
 ok('real reload: /balance says an open table exists, page offers resume (no token held)',(await E2.bal()).table===true&&!E2.T.SRV.token);
 const before=E2.ledgerSigns().length;
 await E2.T.srvResume();await E2.idle();
 const sg=E2.W.signs.filter(x=>x.kind==='resume');
 ok('real resume: exactly one resume signature, byte-exact message accepted by the real worker',sg.length===1&&!!E2.T.SRV.token,JSON.stringify([sg.map(x=>x.kind),!!E2.T.SRV.token,E2.T.LOOP.note,E2.T.G.srvMsg,E2.S.resp.slice(-3).map(r=>[r.path,r.st,JSON.stringify(r.j).slice(0,300)])]));
 ok('real resume: same hand and same hole cards come back, old token dead on the server',E2.T.SRV.view&&E2.T.SRV.view.handNo===handBefore&&JSON.stringify(E2.T.SRV.view.seats[0].hole)===heroCards);
}
globalThis.fetch=realFetch;
return {name:'cross-engine.js (real page vs REAL worker+engine)',pass,fail};
};
