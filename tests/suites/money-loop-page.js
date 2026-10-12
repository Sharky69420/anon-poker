// Money-loop PAGE suite (stream B). Runs the REAL page code in a vm sandbox with a stubbed DOM.
// STRICT MOCK SERVER: implements CONTRACT.md byte for byte (exact message text, real Ed25519 verify via
// webcrypto, shared replay set, limits, check order). STRICT MOCK PHANTOM: signMessage requires a
// Uint8Array + 'utf8', returns {signature:Uint8Array(64)}, records every request.
// NOT run against the real worker, real Phantom or devnet (the integrator's cross test covers the worker).
module.exports=async function(){
let pass=0,fail=0;const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
const vm=require('vm'),fs=require('fs'),path=require('path'),nodeCrypto=require('crypto');
const wc=nodeCrypto.webcrypto;
const html=fs.readFileSync(path.join(__dirname,'..','..','app','index.html'),'utf8');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
const ALPHA='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58enc(u8){let n=0n;for(const b of u8)n=n*256n+BigInt(b);let o='';while(n>0n){o=ALPHA[Number(n%58n)]+o;n/=58n;}for(const b of u8){if(b===0)o='1'+o;else break;}return o;}
function b58dec(str){let n=0n;for(const c of str){const i=ALPHA.indexOf(c);if(i<0)throw new Error('bad b58');n=n*58n+BigInt(i);}const o=[];while(n>0n){o.push(Number(n&255n));n>>=8n;}for(const c of str){if(c==='1')o.push(0);else break;}return Uint8Array.from(o.reverse());}
const API='https://ledger.test';
const SOL=1e9;

// ---- independent message builders (copied from CONTRACT.md, NOT from the page) ----
const MSG={
 buyin:(a,l,n,t)=>'Anon Poker table buy-in\nChain: Solana devnet\nAddress: '+a+'\nLamports: '+l+'\nNonce: '+n+'\nTimestamp: '+t+'\nThis signature authorises moving exactly this amount from your balance to your table stack.',
 cashout:(a,l,n,t)=>'Anon Poker table cash-out\nChain: Solana devnet\nAddress: '+a+'\nLamports: '+l+'\nNonce: '+n+'\nTimestamp: '+t+'\nThis signature reports your final table stack and moves exactly this amount to your balance.',
 withdraw:(a,l,n,t)=>'Anon Poker withdraw\nChain: Solana devnet\nAddress: '+a+'\nLamports: '+l+'\nNonce: '+n+'\nTimestamp: '+t+'\nThis signature authorises one payout of exactly this amount to this address.'};
const BUYIN={min:25000000,max:5000000000,step:100000};
const kindOf=text=>/^Anon Poker table buy-in\n/.test(text)?'buyin':/^Anon Poker table cash-out\n/.test(text)?'cashout':/^Anon Poker withdraw\n/.test(text)?'withdraw':'signin';
function parseMsg(text){const m=/^(Anon Poker [a-z -]+)\nChain: Solana devnet\nAddress: (\S+)\nLamports: (\d+)\nNonce: (\S+)\nTimestamp: (\d+)\n/.exec(text);return m?{addr:m[2],lamports:Number(m[3]),nonce:m[4],ts:Number(m[5])}:null;}

// ---- one world = one fresh page context + strict server + strict Phantom ----
async function world(o){
 o=o||{};
 const kp=await wc.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
 const ADDR=b58enc(new Uint8Array(await wc.subtle.exportKey('raw',kp.publicKey)));
 // ---- strict server ----
 const S={bal:{},sess:{},seen:new Set(),calls:[],chain:{},failNext:null,dropReply:null,withdrawn:[],now:()=>Date.now()};
 S.bal[ADDR]=o.bal===undefined?1*SOL:o.bal;
 if(o.sess)S.sess[ADDR]={inTotal:o.sess};
 async function verify(addr,text,b64){
  if(typeof b64!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))return false;
  const sg=Buffer.from(b64,'base64');if(sg.length!==64)return false;
  try{const k=await wc.subtle.importKey('raw',b58dec(addr),{name:'Ed25519'},false,['verify']);return await wc.subtle.verify({name:'Ed25519'},k,sg,Buffer.from(text,'utf8'));}catch(e){return false;}
 }
 const isAddr=a=>typeof a==='string'&&a.length>=32&&a.length<=44&&[...a].every(c=>ALPHA.includes(c));
 async function signed(kind,b){ // shared check chain; returns {st,j} on rejection or {addr,lamports}
  const keys=Object.keys(b||{}).sort().join();
  if(keys!=='addr,lamports,nonce,signature,ts')return {st:400,j:{error:'bad body keys '+keys}};
  if(!isAddr(b.addr))return {st:400,j:{error:'bad address'}};
  const L=b.lamports;
  if(!Number.isSafeInteger(L))return {st:400,j:{error:'lamports must be a safe integer'}};
  if(kind==='buyin'){if(L<BUYIN.min||L>BUYIN.max||L%BUYIN.step!==0)return {st:400,j:{error:'bad buy-in amount'}};}
  else{if(L<0||L%BUYIN.step!==0)return {st:400,j:{error:'bad cash-out amount'}};}
  if(typeof b.nonce!=='string'||!/^[0-9a-f]{16,64}$/.test(b.nonce))return {st:400,j:{error:'bad nonce'}};
  if(!Number.isSafeInteger(b.ts)||Math.abs(S.now()-b.ts)>300000)return {st:400,j:{error:'stale timestamp'}};
  if(!(await verify(b.addr,MSG[kind](b.addr,L,b.nonce,b.ts),b.signature)))return {st:401,j:{error:'bad signature'}};
  const rk='nonce:'+b.addr+':'+b.nonce;
  if(S.seen.has(rk))return {st:409,j:{error:'replay'}};
  S.seen.add(rk);
  return {addr:b.addr,lamports:L};
 }
 S.handle=async(method,pathn,q,b)=>{
  S.calls.push({method,path:pathn,body:b});
  if(S.failNext===pathn){S.failNext=null;return {st:500,j:{error:'boom'}};}
  if(pathn==='/balance'){
   if(method!=='GET')return {st:405,j:{error:'GET only'}};
   const a=q.get('addr');if(!isAddr(a))return {st:400,j:{error:'bad address'}};
   return {st:200,j:{balance:S.bal[a]||0,session:(S.sess[a]&&S.sess[a].inTotal)||0}};
  }
  if(method!=='POST')return {st:405,j:{error:'POST only'}};
  if(pathn==='/credit'){
   const c=S.chain[b.sig];if(!c||c.used)return {st:400,j:{error:'unknown deposit'}};c.used=true;
   S.bal[c.from]=(S.bal[c.from]||0)+c.lamports;return {st:200,j:{balance:S.bal[c.from]}};
  }
  if(pathn==='/withdraw'){
   const r=await signed('withdraw',b);if(r.st)return r;
   if(r.lamports>(S.bal[r.addr]||0))return {st:402,j:{error:'exceeds ledger balance',balance:S.bal[r.addr]||0}};
   S.bal[r.addr]-=r.lamports;S.withdrawn.push(r.lamports);return {st:200,j:{signature:'W'.repeat(88),balance:S.bal[r.addr]}};
  }
  if(pathn==='/buyin'){
   const r=await signed('buyin',b);if(r.st)return r;
   const bal=S.bal[r.addr]||0;
   if(r.lamports>bal)return {st:402,j:{error:'exceeds ledger balance',balance:bal}};
   S.bal[r.addr]=bal-r.lamports;
   const cur=S.sess[r.addr]?S.sess[r.addr].inTotal:0;S.sess[r.addr]={inTotal:cur+r.lamports};
   return {st:200,j:{balance:S.bal[r.addr],session:S.sess[r.addr].inTotal}};
  }
  if(pathn==='/cashout'){
   const r=await signed('cashout',b);if(r.st)return r;
   const s=S.sess[r.addr]?S.sess[r.addr].inTotal:0;
   if(!(s>0))return {st:409,j:{error:'no open table session'}};
   const cap=Math.min(s*6,60000000000);
   if(r.lamports>cap)return {st:422,j:{error:'exceeds table limit',limit:cap}};
   S.bal[r.addr]=(S.bal[r.addr]||0)+r.lamports;delete S.sess[r.addr];
   return {st:200,j:{balance:S.bal[r.addr],session:0}};
  }
  return {st:404,j:{error:'not found'}};
 };
 // ---- strict Phantom ----
 const W={signs:[],requests:[],mode:'ok',hold:null,connects:0};
 const ph={isPhantom:true,
  async connect(){W.connects++;return {publicKey:{toString:()=>ADDR}};},
  on(){},disconnect(){},
  async signMessage(msg,display){
   if(!(msg instanceof Uint8Array))throw new Error('Phantom: message must be a Uint8Array');
   if(display!=='utf8'&&display!=='hex')throw new Error('Phantom: bad display format');
   const text=new TextDecoder('utf-8',{fatal:true}).decode(msg);
   const kind=kindOf(text);
   const rec={kind,text,display};W.signs.push(rec);
   if(kind!=='signin'){ // the wallet shows the text: it must be a well-formed ledger message for THIS account
    const p=parseMsg(text);if(!p||p.addr!==ADDR)throw new Error('Phantom: malformed ledger message');
   }
   if(W.mode==='decline'&&kind!=='signin')throw Object.assign(new Error('User rejected the request.'),{code:4001});
   if(W.hold&&kind!=='signin')await W.hold;
   if(W.mode==='badsig'&&kind!=='signin')return {signature:new Uint8Array(10)};
   return {signature:new Uint8Array(await wc.subtle.sign({name:'Ed25519'},kp.privateKey,msg))};
  },
  async request(args){ // deposit transfer: record what would go on chain
   W.requests.push(args);
   if(!args||args.method!=='signAndSendTransaction')throw new Error('unsupported');
   const raw=b58dec(args.params.message);
   const m=raw.slice(65);let off=4; // header(3)+shortvec(4 keys)
   const keys=[];for(let i=0;i<4;i++){keys.push(b58enc(m.slice(off,off+32)));off+=32;}
   off+=32; // blockhash
   const data=m.slice(m.length-12);let v=0n;for(let i=11;i>=4;i--)v=v*256n+BigInt(data[i]);
   const sig=b58enc(nodeCrypto.randomBytes(64));
   S.chain[sig]={from:keys[0],to:keys[1],ref:keys[2],lamports:Number(v)};
   return {signature:sig};
  }};
 // ---- sandbox ----
 const els={};
 const nop=new Proxy(function(){},{get:(t,p)=>p===Symbol.toPrimitive?()=>0:(p==='then'?undefined:nop),apply:()=>nop,set:()=>true});
 function el(id){if(els[id])return els[id];const cls=new Set();
  const base={style:new Proxy({},{get:(t,p)=>p in t?t[p]:nop}),classList:{add:c=>cls.add(c),remove:c=>cls.delete(c),toggle:(c,f)=>{(f===undefined?!cls.has(c):f)?cls.add(c):cls.delete(c);},contains:c=>cls.has(c)},innerHTML:'',textContent:'',value:'',disabled:false,className:'',children:[],scrollTop:0,
   insertAdjacentHTML(w,h){this.innerHTML+=h;},appendChild(){},querySelector:()=>el('q:'+id),querySelectorAll:()=>[],addEventListener(){},getContext:()=>nop,setAttribute(){},dataset:{}};
  return els[id]=new Proxy(base,{get:(t,p)=>p in t?t[p]:nop});}
 const s={console,Math,Object,Array,Set,Map,JSON,Number,Date,Uint8Array,TextEncoder,TextDecoder,BigInt,String,Error,Promise,Buffer,RegExp,btoa,atob,encodeURIComponent,decodeURIComponent,parseFloat,parseInt,isNaN,URL};
 s.document={getElementById:id=>el(id),createElement:()=>el('c'+Math.random()),querySelector:()=>el('q'),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}},body:el('body')};
 s.window={matchMedia:()=>({matches:true,addEventListener(){}}),addEventListener(){}};
 if(!o.noPhantom)s.window.phantom={solana:ph};
 s.matchMedia=s.window.matchMedia;s.localStorage={getItem:()=>null,setItem(){}};
 s.crypto=wc;s.navigator={};s.setInterval=()=>0;s.clearInterval=()=>{};s.requestAnimationFrame=()=>0;s.cancelAnimationFrame=()=>{};s.performance={now:()=>0};s.clearTimeout=()=>{};
 const timers=[];s.setTimeout=(f,ms)=>{if(ms===undefined||ms<=0){setImmediate(f);return 0;}timers.push({f,ms});return timers.length;};
 s.fetch=async(url,opt)=>{
  opt=opt||{};
  if(url.startsWith(API)){
   const u=new URL(url);const method=opt.method||'GET';
   if(method==='POST'&&!(opt.headers&&opt.headers['content-type']==='application/json'))return {ok:false,status:415,json:async()=>({error:'content-type'})};
   const r=await S.handle(method,u.pathname,u.searchParams,opt.body?JSON.parse(opt.body):undefined);
   if(S.dropReply===u.pathname){S.dropReply=null;throw new Error('network lost reply');}
   return {ok:r.st<400,status:r.st,json:async()=>r.j};
  }
  const b=JSON.parse(opt.body);const res=r=>({ok:true,json:async()=>({jsonrpc:'2.0',id:1,result:r})});
  if(b.method==='getLatestBlockhash')return res({value:{blockhash:b58enc(nodeCrypto.randomBytes(32))}});
  if(b.method==='getSignatureStatuses')return res({value:[{err:null,confirmationStatus:'confirmed'}]});
  if(b.method==='getTransaction'){const c=S.chain[b.params[0]];if(!c)return res(null);
   return res({meta:{err:null},transaction:{message:{accountKeys:[{pubkey:c.from,signer:true},{pubkey:c.to,signer:false},{pubkey:c.ref,signer:false}],instructions:[{program:'system',parsed:{type:'transfer',info:{source:c.from,destination:c.to,lamports:c.lamports}}}]}}});}
  throw new Error('unexpected rpc '+b.method);
 };
 vm.createContext(s);
 vm.runInContext(code+';globalThis.T={G,WALLET,TABLES,LOOP,SOL_CFG,SOLWAL,SOLWD,SOLDEP,startGame,startHand,act,openBuyIn,confirmBuyIn,doRebuy,doAddOn,checkRebuy,leaveTable,closeCashout,solConnect,solDisconnect,solDeposit,solWithdraw,renderLobbyTables,openWalletModal,loopRetryClick,loopRecoverClick,loopLamports,loopMsg,loopSync,loopRender,BUYIN_MIN,BUYIN_MAX,get pendingTable(){return pendingTable;},set pendingTable(v){pendingTable=v;}};',s);
 const T=s.T;
 T.SOL_CFG.api=o.api===undefined?API:o.api;T.SOL_CFG.pollMs=0;T.SOL_CFG.pollMax=3;
 const E={T,S,W,ADDR,el,s,timers,kp,
  tbl:id=>T.TABLES.find(t=>t.id===id),
  async connect(){W.signs.length=0;const r=await T.solConnect();return r;},
  setSlider(v){el('biSlider').value=String(v);},
  async buyIn(id,chips){T.openBuyIn(id);if(chips!==undefined)E.setSlider(chips);return T.confirmBuyIn();},
  me:()=>T.G.seats&&T.G.seats[0],
  ledgerSigns:()=>W.signs.filter(x=>x.kind!=='signin'),
  async bal(){const r=await S.handle('GET','/balance',new URL(API+'/balance?addr='+ADDR).searchParams);return r.j;}};
 return E;
}
const sleep=()=>new Promise(r=>setImmediate(r));
const tick=async()=>{for(let i=0;i<10;i++)await sleep();};
// wait until the page's ledger operation (async crypto + fake network) has finished
async function settle(E){await tick();for(let i=0;i<400&&E.T.LOOP.busy;i++)await new Promise(r=>setTimeout(r,2));await tick();}

// =====================================================================
// 0. the strict mocks are really strict
// =====================================================================
{
 const E=await world();const {S,ADDR,W}=E;
 const now=Date.now();
 const signOf=async(text)=>Buffer.from(new Uint8Array(await wc.subtle.sign({name:'Ed25519'},E.kp.privateKey,Buffer.from(text)))).toString('base64');
 const post=async(p,b)=>(await S.handle('POST',p,new URLSearchParams(),b));
 const mk=async(kind,l,n,t,over)=>Object.assign({addr:ADDR,lamports:l,nonce:n,ts:t,signature:await signOf(MSG[kind](ADDR,l,n,t))},over||{});
 const N=i=>(''+i).padStart(16,'a');
 let r=await post('/buyin',await mk('buyin',100e6,N(1),now));
 ok('mock: valid buy-in accepted, balance and session move together',r.st===200&&r.j.balance===900e6&&r.j.session===100e6,JSON.stringify(r));
 ok('mock: replay of the same nonce refused',(await post('/buyin',await mk('buyin',100e6,N(1),now))).st===409);
 ok('mock: replay key is shared across endpoints',(await post('/cashout',await mk('cashout',0,N(1),now))).st===409);
 ok('mock: buy-in signature does not validate as cash-out',(await post('/cashout',await mk('cashout',0,N(2),now,{signature:await signOf(MSG.buyin(ADDR,0,N(2),now))}))).st===401);
 ok('mock: cash-out signature does not validate as buy-in',(await post('/buyin',await mk('buyin',100e6,N(3),now,{signature:await signOf(MSG.cashout(ADDR,100e6,N(3),now))}))).st===401);
 ok('mock: withdraw signature replayed to /buyin refused',(await post('/buyin',await mk('buyin',100e6,N(4),now,{signature:await signOf(MSG.withdraw(ADDR,100e6,N(4),now))}))).st===401);
 ok('mock: withdraw signature replayed to /cashout refused',(await post('/cashout',await mk('cashout',100e6,N(5),now,{signature:await signOf(MSG.withdraw(ADDR,100e6,N(5),now))}))).st===401);
 ok('mock: wrong amount in the message is refused',(await post('/buyin',await mk('buyin',100e6,N(6),now,{signature:await signOf(MSG.buyin(ADDR,200e6,N(6),now))}))).st===401);
 ok('mock: off-step / below-min / above-max buy-in refused',(await post('/buyin',await mk('buyin',100050000,N(7),now))).st===400&&(await post('/buyin',await mk('buyin',24900000,N(8),now))).st===400&&(await post('/buyin',await mk('buyin',5100000000,N(9),now))).st===400);
 ok('mock: stale timestamp refused',(await post('/buyin',await mk('buyin',100e6,N(10),now-400000))).st===400);
 ok('mock: bad nonce refused',(await post('/buyin',await mk('buyin',100e6,'XYZ',now))).st===400);
 ok('mock: more than ledger balance refused 402',(await post('/buyin',await mk('buyin',4e9,N(11),now))).st===402);
 ok('mock: cash-out above cap(inTotal)=6x refused 422 with limit',await (async()=>{const x=await post('/cashout',await mk('cashout',700e6,N(12),now));return x.st===422&&x.j.limit===600e6;})());
 ok('mock: cash-out 6x exactly accepted, session closed, balance credited',await (async()=>{const x=await post('/cashout',await mk('cashout',600e6,N(13),now));return x.st===200&&x.j.session===0&&x.j.balance===900e6+600e6;})());
 ok('mock: cash-out without a session 409',(await post('/cashout',await mk('cashout',0,N(14),now))).st===409);
 await post('/buyin',await mk('buyin',50e6,N(15),now));
 ok('mock: cash-out of 0 allowed',(await post('/cashout',await mk('cashout',0,N(16),now))).st===200);
 const w=await E.T.solWithdraw; // keep reference check below
 ok('mock phantom: signMessage rejects a string payload',await (async()=>{try{await window_ph(E).signMessage('hello','utf8');return false;}catch(e){return /Uint8Array/.test(e.message);}})());
 ok('mock phantom: signMessage returns {signature:Uint8Array(64)}',await (async()=>{const x=await window_ph(E).signMessage(new TextEncoder().encode('hi'),'utf8');return x.signature instanceof Uint8Array&&x.signature.length===64;})());
 ok('mock phantom: rejects a ledger message for another account',await (async()=>{try{await window_ph(E).signMessage(new TextEncoder().encode(MSG.buyin('1'.repeat(32),1,'a'.repeat(16),1)),'utf8');return false;}catch(e){return /malformed/.test(e.message);}})());
}
function window_ph(E){return E.s.window.phantom.solana;}

// =====================================================================
// 1. free play is exactly as before
// =====================================================================
for(const variant of ['not-connected','no-api']){
 const E=await world({api:variant==='no-api'?'':undefined});const {T,S,W}=E;
 if(variant==='no-api')await E.connect();
 ok(variant+': ledger mode off',T.SOLWAL.addr===(variant==='no-api'?E.ADDR:null)&&!T.LOOP.busy&&(await tick(),true));
 ok(variant+': wallet is the free-play {ZEC:30,SOL:10}',T.WALLET.ZEC===30&&T.WALLET.SOL===10);
 T.openBuyIn('sol-mid');
 ok(variant+': buy-in modal opens, free-play label',E.el('buyinOverlay').classList.contains('show')&&/Free play/.test(E.el('biBal').innerHTML)&&!/Ledger/.test(E.el('biBal').innerHTML));
 E.setSlider(500);
 const before=W.signs.length;
 await T.confirmBuyIn();
 ok(variant+': buy-in is synchronous local debit, no signature, no server call',W.signs.length===before&&S.calls.length===0&&T.WALLET.SOL===9.5&&E.me().chips===500&&T.G.ledger===false,JSON.stringify([W.signs.length,S.calls.length,T.WALLET.SOL]));
 ok(variant+': buy-in modal closed',!E.el('buyinOverlay').classList.contains('show'));
 E.me().chips=700.9;
 T.leaveTable();
 ok(variant+': leave credits the local wallet, no server call, no signature',T.WALLET.SOL===+(9.5+0.7).toFixed(6)&&S.calls.length===0&&W.signs.length===before,T.WALLET.SOL);
 ok(variant+': no ledger receipt line, no retry button',E.el('loopCoTrust').style.display==='none'&&E.el('loopRetryBtn').style.display==='none');
 T.closeCashout();
 ok(variant+': faucet visible and works',E.el('demoFundBtn').style.display!=='none'&&(()=>{const b=T.WALLET.SOL;E.el('demoFundBtn').onclick();return T.WALLET.SOL===+(b+1).toFixed(6);})());
 ok(variant+': lobby labels say Free play for SOL tables',(T.renderLobbyTables(),true)&&/Free play/.test(E.el('tableList').innerHTML)&&!/Ledger/.test(E.el('tableList').innerHTML));
 ok(variant+': wallet row label says free play',/free play/i.test(E.el('walSolLbl').textContent));
}
ok('page markup: Zcash row labeled free play, SOL row has a dynamic label',/<span>Zcash · free play<\/span>/.test(html)&&/id="walSolLbl"/.test(html));

// =====================================================================
// 2. connect / disconnect mirror the server balance
// =====================================================================
{
 const E=await world({bal:0.5*SOL,sess:0});const {T,S,W}=E;
 ok('before connect: free play, nothing sent',T.WALLET.SOL===10&&S.calls.length===0);
 const r=await E.connect();
 ok('connect ok',r.ok===true);
 ok('connect: exactly one signature (the sign-in), no ledger signature',W.signs.length===1&&W.signs[0].kind==='signin');
 ok('connect: WALLET.SOL = server balance (0.5), not the free-play 10',T.WALLET.SOL===0.5,T.WALLET.SOL);
 ok('connect: GET /balance?addr=<this address>',S.calls.length===1&&S.calls[0].method==='GET'&&S.calls[0].path==='/balance');
 ok('ledger label shown, faucet hidden',/Ledger balance \(devnet\)/.test(E.el('walSolLbl').textContent)&&E.el('demoFundBtn').style.display==='none');
 ok('wallet balance line shows the ledger amount',/0\.5/.test(E.el('walSolRow').innerHTML));
 ok('faucet click does nothing in ledger mode',(()=>{E.el('demoFundBtn').onclick();return T.WALLET.SOL===0.5&&T.WALLET.ZEC===30;})());
 S.bal[E.ADDR]=0.9*SOL;await T.loopSync();
 ok('loopSync re-reads the server (truth wins)',T.WALLET.SOL===0.9);
 T.solDisconnect();
 ok('disconnect: WALLET.SOL back to free-play 10',T.WALLET.SOL===10&&T.SOLWAL.addr===null);
 ok('disconnect: faucet visible again, label free play',E.el('demoFundBtn').style.display!=='none'&&/free play/i.test(E.el('walSolLbl').textContent));
 ok('disconnect: ZEC untouched',T.WALLET.ZEC===30);
}
{ // server unreachable at connect: never show free-play money as ledger money
 const E=await world();const {T,S}=E;S.failNext='/balance';
 await E.connect();
 ok('balance read fails at connect: shows 0, not the free-play 10',T.WALLET.SOL===0&&/Could not read/.test(E.el('loopBox').innerHTML),T.WALLET.SOL);
 ok('...and a ledger buy-in is impossible (nothing to buy with)',await (async()=>{T.openBuyIn('sol-micro');return !E.el('buyinOverlay').classList.contains('show')&&E.ledgerSigns().length===0;})());
 await T.loopSync();
 ok('...a later successful read recovers',T.WALLET.SOL===1);
}
{ // malformed /balance reply
 const E=await world();const {T,S}=E;
 const orig=S.handle;S.handle=async(m,p,q,b)=>{const r=await orig(m,p,q,b);if(p==='/balance')r.j={balance:'1000',session:0};return r;};
 await E.connect();
 ok('non-integer balance in the reply is rejected',T.WALLET.SOL===0);
}

// =====================================================================
// 3. deposit mirrors the server balance
// =====================================================================
{
 const E=await world({bal:0});const {T,S,W}=E;await E.connect();
 ok('start: ledger balance 0',T.WALLET.SOL===0);
 const r=await T.solDeposit('0.2');
 ok('deposit ok',r.ok===true&&r.credited===true,JSON.stringify(r));
 ok('deposit: server credited exactly the lamports',S.bal[E.ADDR]===0.2*SOL);
 ok('deposit: WALLET.SOL mirrors the server balance',T.WALLET.SOL===0.2,T.WALLET.SOL);
 ok('deposit: /credit then /balance were called',S.calls.map(c=>c.path).join()==='/balance,/credit,/balance',S.calls.map(c=>c.path).join());
 ok('deposit: no ledger signature (deposit is a transfer, not signMessage)',E.ledgerSigns().length===0&&W.requests.length===1);
}
{ // /credit fails: local credit must not survive as fake ledger money
 const E=await world({bal:0});const {T,S}=E;await E.connect();
 S.failNext='/credit';
 const r=await T.solDeposit('0.2');
 ok('credit failure: balance snaps back to server truth (0), not the local +0.2',T.WALLET.SOL===0&&S.bal[E.ADDR]===0,T.WALLET.SOL);
 ok('credit failure: user is told',/ledger could not be updated/.test(E.el('solDepNote').textContent));
}

// =====================================================================
// 4. withdraw mirrors the server balance
// =====================================================================
{
 const E=await world({bal:1*SOL});const {T,S,W}=E;await E.connect();
 const r=await T.solWithdraw('0.3');
 ok('withdraw ok, signed with the withdraw message only',r.ok===true&&E.ledgerSigns().length===1&&E.ledgerSigns()[0].kind==='withdraw');
 ok('withdraw: server debited, WALLET.SOL mirrors it',S.bal[E.ADDR]===0.7*SOL&&T.WALLET.SOL===0.7,T.WALLET.SOL);
 ok('withdraw: /balance re-read after the payout',S.calls.map(c=>c.path).slice(-2).join()==='/withdraw,/balance');
 const r2=await T.solWithdraw('2');
 ok('over-balance withdraw refused before any signature',r2.ok===false&&r2.why==='insufficient'&&E.ledgerSigns().length===1);
}
{ // no overlap between a ledger move and a withdraw
 const E=await world({bal:1*SOL});const {T,W}=E;await E.connect();
 let release;W.hold=new Promise(r=>release=r);
 const p=E.buyIn('sol-mid',300);await tick();
 const w=await T.solWithdraw('0.1');
 ok('withdraw while a buy-in is in flight is refused (busy)',w.ok===false&&w.why==='busy');
 release();await p;
}

// =====================================================================
// 5. SOL buy-in
// =====================================================================
{
 const E=await world({bal:1*SOL});const {T,S,W}=E;await E.connect();
 T.openBuyIn('sol-mid');
 ok('buy-in modal: ledger label',/Ledger balance \(devnet\)/.test(E.el('biBal').innerHTML));
 ok('buy-in modal: slider max = ledger balance in chips (1 SOL = 1000 chips at 0.001)',E.el('biSlider').max===1000,E.el('biSlider').max);
 E.setSlider(500);
 W.signs.length=0;S.calls.length=0;
 await T.confirmBuyIn();
 const sg=E.ledgerSigns();
 ok('buy-in: exactly one signature, the buy-in message',sg.length===1&&sg[0].kind==='buyin'&&sg[0].display==='utf8');
 const pm=parseMsg(sg[0].text);
 ok('buy-in: message is byte-exact per contract (independently rebuilt)',sg[0].text===MSG.buyin(E.ADDR,500e6,pm.nonce,pm.ts)&&pm.lamports===500e6);
 ok('buy-in: 500 chips * 0.001 * 1e9 = 500000000 lamports',pm.lamports===500000000&&pm.lamports%100000===0);
 ok('buy-in: one POST /buyin with the right body shape',S.calls.length===1&&S.calls[0].path==='/buyin'&&S.calls[0].body.lamports===500e6&&S.calls[0].body.addr===E.ADDR);
 ok('buy-in: server moved balance to the session',S.bal[E.ADDR]===500e6&&S.sess[E.ADDR].inTotal===500e6);
 ok('buy-in: chips given, table started on the SOL ledger table',E.me().chips===500&&T.G.table.id==='sol-mid'&&T.G.ledger===true&&T.G.left===false);
 ok('buy-in: WALLET.SOL = server balance (not double debited)',T.WALLET.SOL===0.5,T.WALLET.SOL);
 ok('buy-in: modal closed, pendingTable cleared, busy released',!E.el('buyinOverlay').classList.contains('show')&&T.pendingTable===null&&T.LOOP.busy===false);
 ok('buy-in: session tracked from the reply',T.LOOP.session===500e6);
 ok('no orphan-session recovery row while the table is open',!/return to balance/.test(E.el('loopBox').innerHTML));
}
// unit rounding on every table tier
{
 const E=await world({bal:20*SOL});const {T}=E;
 const micro=E.tbl('sol-micro'),mid=E.tbl('sol-mid'),high=E.tbl('sol-high');
 ok('lamports per chip: micro 100000, mid 1000000, high 10000000',T.loopLamports(1,micro)===100000&&T.loopLamports(1,mid)===1e6&&T.loopLamports(1,high)===1e7);
 ok('lamports: fractional chips floor, never round up (1999.99 micro)',T.loopLamports(1999.99,micro)===199900000);
 ok('lamports: 249.9999 chips never yields a multiple-of-step overshoot',T.loopLamports(249.9999,micro)===24900000);
 ok('lamports: 0 and 0.9 chips -> 0',T.loopLamports(0,mid)===0&&T.loopLamports(0.9,mid)===0);
 let allStep=true;for(let c=0;c<=4000;c+=7){for(const t of [micro,mid,high]){const l=T.loopLamports(c+0.37,t);if(!Number.isSafeInteger(l)||l%100000!==0)allStep=false;}}
 ok('lamports always a safe integer and a multiple of 100000 (sweep)',allStep);
 let exact=true;for(let c=1;c<=4000;c++){if(T.loopLamports(c,micro)!==c*100000)exact=false;}
 ok('micro tier exact for every integer chip count (no float drift)',exact);
 await E.connect();
 await E.buyIn('sol-micro',250);
 ok('micro minimum 250 chips = 25000000 lamports accepted by the strict server',E.me()&&E.me().chips===250&&E.S.sess[E.ADDR].inTotal===25000000);
}
{
 const E=await world({bal:20*SOL});const {T,S}=E;await E.connect();
 T.openBuyIn('sol-high');
 ok('high roller slider capped at 5 SOL per buy-in (500 chips), not the 4000 chip table max',E.el('biSlider').max===500,E.el('biSlider').max);
 E.setSlider(500);await T.confirmBuyIn();
 ok('high roller 500 chips = 5000000000 lamports (the contract max) accepted',E.me()&&E.me().chips===500&&S.sess[E.ADDR].inTotal===5e9);
}
// buy-in decline
{
 const E=await world({bal:1*SOL});const {T,S,W}=E;await E.connect();
 W.mode='decline';
 await E.buyIn('sol-mid',500);
 ok('decline: no chips, no table',!E.me());
 ok('decline: no server call at all',S.calls.filter(c=>c.path==='/buyin').length===0);
 ok('decline: wallet and server unchanged',T.WALLET.SOL===1&&S.bal[E.ADDR]===1*SOL&&!S.sess[E.ADDR]);
 ok('decline: clear message, modal stays open for another try',/declined in Phantom/i.test(E.el('loopBiNote').textContent)&&E.el('buyinOverlay').classList.contains('show'));
 ok('decline: busy flag released, ledger flag not set',T.LOOP.busy===false&&T.G.ledger!==true);
 W.mode='ok';
 await T.confirmBuyIn();
 ok('decline then retry works with a fresh nonce',E.me()&&E.me().chips===500&&S.sess[E.ADDR].inTotal===500e6);
}
// buy-in server errors
{
 const E=await world({bal:1*SOL});const {T,S,W}=E;await E.connect();
 S.failNext='/buyin';
 await E.buyIn('sol-mid',500);
 ok('server 500: no chips, wallet unchanged, message shown',!E.me()&&T.WALLET.SOL===1&&/boom/.test(E.el('loopBiNote').textContent)&&/No chips were given/.test(E.el('loopBiNote').textContent));
 ok('server 500: balance re-read from the server afterwards',S.calls.slice(-1)[0].path==='/balance');
 ok('server 500: busy released, can try again',T.LOOP.busy===false);
}
{ // stale page balance: server says 402
 const E=await world({bal:1*SOL});const {T,S}=E;await E.connect();
 T.openBuyIn('sol-mid');E.setSlider(800);
 S.bal[E.ADDR]=0.3*SOL; // balance changed elsewhere (another tab withdrew)
 await T.confirmBuyIn();
 ok('stale balance: server 402, no chips',!E.me()&&/exceeds ledger balance/.test(E.el('loopBiNote').textContent));
 ok('stale balance: page re-synced to server truth',T.WALLET.SOL===0.3);
}
{ // server lost the reply after committing
 const E=await world({bal:1*SOL});const {T,S}=E;await E.connect();
 S.dropReply='/buyin';
 await E.buyIn('sol-mid',500);
 ok('reply lost: no chips given',!E.me());
 ok('reply lost: page shows server truth (funds are in the session, not lost)',T.WALLET.SOL===0.5&&T.LOOP.session===500e6);
 ok('reply lost: orphan session is offered for return',/Open table stack 0\.5 SOL: return to balance/.test(E.el('loopBox').innerHTML));
 await T.loopRecoverClick();
 ok('reply lost: recovery refunds exactly the session',S.bal[E.ADDR]===1*SOL&&!S.sess[E.ADDR]&&T.WALLET.SOL===1);
}
{ // wallet returns a bad signature
 const E=await world({bal:1*SOL});const {T,S,W}=E;await E.connect();
 W.mode='badsig';await E.buyIn('sol-mid',500);
 ok('wallet returned a short signature: nothing sent, no chips',!E.me()&&S.calls.filter(c=>c.path==='/buyin').length===0&&T.WALLET.SOL===1);
}
{ // malformed buy-in reply
 const E=await world({bal:1*SOL});const {T,S}=E;await E.connect();
 const orig=S.handle;S.handle=async(m,p,q,b)=>{const r=await orig(m,p,q,b);if(p==='/buyin'&&r.st===200)r.j={balance:'x'};return r;};
 await E.buyIn('sol-mid',500);
 ok('malformed buy-in reply: no chips given',!E.me());
}
// amounts outside the contract never reach the wallet
{
 const E=await world({bal:1*SOL});const {T,S,W}=E;await E.connect();
 T.openBuyIn('sol-micro');E.setSlider(100); // 100 chips = 10,000,000 lamports < 25,000,000 min
 await T.confirmBuyIn();
 ok('below the 0.025 SOL minimum: refused client-side, no popup, no call',!E.me()&&E.ledgerSigns().length===0&&S.calls.filter(c=>c.path==='/buyin').length===0&&E.el('loopBiNote').textContent!=='');
}
// double click
{
 const E=await world({bal:1*SOL});const {T,S,W}=E;await E.connect();
 let release;W.hold=new Promise(r=>release=r);
 T.openBuyIn('sol-mid');E.setSlider(500);
 const a=T.confirmBuyIn(),b=T.confirmBuyIn();await tick();
 ok('double click on Take a Seat: one signature while the first is pending',E.ledgerSigns().length===1,E.ledgerSigns().length);
 release();await a;await b;
 ok('double click: one /buyin, one stack, balance debited once',S.calls.filter(c=>c.path==='/buyin').length===1&&E.me().chips===500&&S.sess[E.ADDR].inTotal===500e6&&T.WALLET.SOL===0.5);
 ok('...and busy flag cleared',T.LOOP.busy===false);
}
{ // leave pressed while a buy-in is in flight: ignored, no state change
 const E=await world({bal:1*SOL});const {T,S,W}=E;await E.connect();
 await E.buyIn('sol-mid',500);
 let release;W.hold=new Promise(r=>release=r);
 const p=T.doRebuy(250);await tick();
 T.leaveTable();
 ok('leave while add-on in flight: ignored, table still open',T.G.left===false&&E.ledgerSigns().filter(x=>x.kind==='cashout').length===0);
 release();await p;
 ok('add-on completed after the ignored leave',E.me().chips===750);
}

// =====================================================================
// 6. rebuy and add-on
// =====================================================================
{
 const E=await world({bal:2*SOL});const {T,S,W}=E;await E.connect();
 await E.buyIn('sol-mid',500);
 W.signs.length=0;S.calls.length=0;
 T.doAddOn();
 ok('add-on opens the overlay without any popup',E.el('rebuyOverlay').classList.contains('show')&&W.signs.length===0&&S.calls.length===0);
 ok('add-on options are built from the ledger balance (250 offered, 4000 not: 1.5 SOL = 1500 chips)',/doRebuy\(250\)/.test(E.el('q').innerHTML)&&/doRebuy\(1000\)/.test(E.el('q').innerHTML)&&!/doRebuy\(2500\)/.test(E.el('q').innerHTML),E.el('q').innerHTML.slice(0,200));
 await T.doRebuy(250);
 const sg=E.ledgerSigns();
 ok('add-on: one buy-in signature for 250 chips = 250000000 lamports',sg.length===1&&sg[0].kind==='buyin'&&parseMsg(sg[0].text).lamports===250e6);
 ok('add-on: chips added only after the server accepted',E.me().chips===750&&S.sess[E.ADDR].inTotal===750e6);
 ok('add-on: server balance mirrored (2 - 0.5 - 0.25)',T.WALLET.SOL===1.25&&S.bal[E.ADDR]===1.25*SOL);
 ok('add-on: overlay closed, flags reset',!E.el('rebuyOverlay').classList.contains('show')&&T.G.rebuyShown===false&&T.G.rebuyPending===false&&T.LOOP.busy===false);
 W.mode='decline';
 await T.doRebuy(500);
 ok('add-on declined: no chips, wallet and server unchanged',E.me().chips===750&&T.WALLET.SOL===1.25&&S.sess[E.ADDR].inTotal===750e6);
 W.mode='ok';S.failNext='/buyin';
 await T.doRebuy(500);
 ok('add-on server error: no chips, wallet unchanged',E.me().chips===750&&T.WALLET.SOL===1.25&&S.sess[E.ADDR].inTotal===750e6&&T.LOOP.busy===false);
 E.me().chips=3900;
 await T.doRebuy(1000);
 ok('add-on capped by the table max (4000): only 100 chips bought, 100000000 lamports',E.me().chips===4000&&parseMsg(E.ledgerSigns().slice(-1)[0].text).lamports===100e6);
 const n=E.ledgerSigns().length;
 await T.doRebuy(500);
 ok('add-on at the table max: nothing signed',E.ledgerSigns().length===n&&E.me().chips===4000);
}
{ // busted stack prompt uses the same path
 const E=await world({bal:2*SOL});const {T,S,W}=E;await E.connect();
 await E.buyIn('sol-mid',500);
 E.me().chips=5;T.G.over=true;T.G.left=false;T.G.rebuyShown=false;T.G.sitOut=false;
 T.checkRebuy();
 ok('busted prompt shown with no popup',E.el('rebuyOverlay').classList.contains('show')&&T.G.rebuyPending===true&&E.ledgerSigns().length===1);
 await T.doRebuy(500);
 ok('busted rebuy goes through /buyin',E.me().chips===505&&T.G.rebuyPending===false&&S.sess[E.ADDR].inTotal===1000e6);
}
{ // micro add-on below the minimum
 const E=await world({bal:2*SOL});const {T,S,W}=E;await E.connect();
 await E.buyIn('sol-micro',500);
 const n=E.ledgerSigns().length;
 await T.doRebuy(100); // 10,000,000 lamports < min
 ok('add-on below the 0.025 SOL minimum: no popup, no call, no chips',E.ledgerSigns().length===n&&E.me().chips===500);
}
{ // add-on double click
 const E=await world({bal:2*SOL});const {T,S,W}=E;await E.connect();
 await E.buyIn('sol-mid',500);
 let release;W.hold=new Promise(r=>release=r);
 const a=T.doRebuy(250),b=T.doRebuy(250);await tick();
 ok('add-on double click: one signature in flight',E.ledgerSigns().length===2); // buy-in + one add-on
 release();await a;await b;
 ok('add-on double click: chips added once',E.me().chips===750&&S.sess[E.ADDR].inTotal===750e6);
}

// =====================================================================
// 7. cash-out
// =====================================================================
async function seated(bal,chips,id){const E=await world({bal:bal===undefined?1*SOL:bal});await E.connect();await E.buyIn(id||'sol-mid',chips===undefined?500:chips);E.W.signs.length=0;E.S.calls.length=0;return E;}
{ // win
 const E=await seated();const {T,S,W}=E;
 E.me().chips=1200.7;
 T.leaveTable();await settle(E);
 const sg=E.ledgerSigns();
 ok('win: exactly one signature, the cash-out message',sg.length===1&&sg[0].kind==='cashout');
 const pm=parseMsg(sg[0].text);
 ok('win: amount = floor(1200.7)*0.001 SOL = 1200000000 lamports, byte-exact message',pm.lamports===1200e6&&sg[0].text===MSG.cashout(E.ADDR,1200e6,pm.nonce,pm.ts));
 ok('win: server credited balance, session closed',S.bal[E.ADDR]===500e6+1200e6&&!S.sess[E.ADDR]);
 ok('win: WALLET.SOL = returned balance (1.7), not locally computed',T.WALLET.SOL===1.7,T.WALLET.SOL);
 ok('win: not double credited (no local credit + server credit)',T.WALLET.SOL===S.bal[E.ADDR]/SOL);
 ok('win: receipt shown, trust line shown, no retry button',E.el('cashoutOverlay').classList.contains('show')&&E.el('loopCoTrust').style.display==='block'&&/Result reported by this browser; devnet only\./.test(html)&&E.el('loopRetryBtn').style.display==='none');
 ok('win: receipt text says returned to ledger balance',/1\.2 SOL returned to your ledger balance/.test(E.el('loopCoNote').textContent),E.el('loopCoNote').textContent);
 ok('win: pending cleared, busy released, session 0',T.LOOP.pending===null&&T.LOOP.busy===false&&T.LOOP.session===0&&T.G.left===true);
 T.closeCashout();
 ok('after cash-out the lobby opens a fresh buy-in with no recovery block',(()=>{T.openBuyIn('sol-mid');return E.el('buyinOverlay').classList.contains('show');})());
}
{ // lose
 const E=await seated();const {T,S}=E;
 E.me().chips=100;T.leaveTable();await settle(E);
 ok('lose: cash-out of 100 chips = 100000000 lamports, balance 0.6',S.bal[E.ADDR]===500e6+100e6&&T.WALLET.SOL===0.6&&!S.sess[E.ADDR]);
}
{ // zero
 const E=await seated();const {T,S}=E;
 E.me().chips=0;T.leaveTable();await settle(E);
 const sg=E.ledgerSigns();
 ok('zero stack: cash-out of 0 lamports is signed and accepted (session must close)',sg.length===1&&parseMsg(sg[0].text).lamports===0&&!S.sess[E.ADDR]&&T.WALLET.SOL===0.5&&T.LOOP.pending===null);
}
{ // fractional chips round down to the step
 const E=await seated(undefined,500,'sol-micro');const {T,S}=E;
 E.me().chips=1234.99;T.leaveTable();await settle(E);
 ok('micro fractional stack: floor to 100000 lamports (1234 chips = 123400000)',parseMsg(E.ledgerSigns()[0].text).lamports===123400000);
}
{ // cap
 const E=await seated();const {T,S}=E;
 E.me().chips=3100; // 3.1 SOL > 6x * 0.5 SOL = 3 SOL
 T.leaveTable();await settle(E);
 ok('over the table limit: server refuses 422, nothing credited',S.bal[E.ADDR]===500e6&&S.sess[E.ADDR].inTotal===500e6);
 ok('over the table limit: stays pending with the retry button, stack not discarded',T.LOOP.pending&&T.LOOP.pending.lamports===3100e6&&E.el('loopRetryBtn').style.display==='block'&&/exceeds table limit/.test(E.el('loopCoNote').textContent));
}
// decline at cash-out -> pending retry keeps the stack
{
 const E=await seated();const {T,S,W}=E;
 E.me().chips=900;
 W.mode='decline';
 T.leaveTable();await settle(E);
 ok('decline at cash-out: not credited locally or on the server',T.WALLET.SOL===0.5&&S.bal[E.ADDR]===500e6&&S.sess[E.ADDR].inTotal===500e6&&S.calls.filter(c=>c.path==='/cashout').length===0);
 ok('decline at cash-out: visible Cash-out pending, retry button on the receipt',E.el('loopRetryBtn').style.display==='block'&&/Cash-out pending, retry/.test(html)&&/declined in Phantom/i.test(E.el('loopCoNote').textContent));
 ok('decline: stack remembered exactly (900 chips = 900000000 lamports)',T.LOOP.pending.lamports===900e6&&T.LOOP.pending.addr===E.ADDR);
 ok('decline: wallet menu shows the retry button too',/Cash-out pending, retry \(0\.9 SOL\)/.test(E.el('loopBox').innerHTML));
 ok('decline: busy released so the retry can run',T.LOOP.busy===false);
 T.closeCashout();
 ok('closing the receipt keeps the pending retry (wallet menu)',T.LOOP.pending!==null&&/Cash-out pending, retry/.test(E.el('loopBox').innerHTML));
 ok('...and no "return open stack" refund row competes with it',!/return to balance/.test(E.el('loopBox').innerHTML));
 T.openBuyIn('sol-mid');
 ok('...and a new buy-in is blocked until it is settled',!E.el('buyinOverlay').classList.contains('show')&&/pending cash-out/i.test(E.el('loopBox').innerHTML));
 W.mode='ok';W.signs.length=0;
 await T.loopRetryClick();
 const sg=E.ledgerSigns();
 ok('retry: fresh signature for the same amount',sg.length===1&&parseMsg(sg[0].text).lamports===900e6);
 ok('retry: server credited the full stack, session closed, wallet mirrors',S.bal[E.ADDR]===500e6+900e6&&!S.sess[E.ADDR]&&T.WALLET.SOL===1.4);
 ok('retry: pending cleared, button hidden',T.LOOP.pending===null&&E.el('loopRetryBtn').style.display==='none'&&!/Cash-out pending/.test(E.el('loopBox').innerHTML));
 const n=W.signs.length;await T.loopRetryClick();
 ok('retry with nothing pending is a no-op',W.signs.length===n);
}
{ // server error at cash-out, then retry
 const E=await seated();const {T,S,W}=E;
 E.me().chips=800;S.failNext='/cashout';
 T.leaveTable();await settle(E);
 ok('server error at cash-out: pending, session still open, wallet unchanged',T.LOOP.pending&&T.LOOP.pending.lamports===800e6&&S.sess[E.ADDR].inTotal===500e6&&T.WALLET.SOL===0.5&&/boom/.test(E.el('loopCoNote').textContent));
 await T.loopRetryClick();
 ok('retry after a server error succeeds',S.bal[E.ADDR]===500e6+800e6&&!S.sess[E.ADDR]&&T.LOOP.pending===null);
}
{ // reply lost after the server closed the session
 const E=await seated();const {T,S,W}=E;
 E.me().chips=800;S.dropReply='/cashout';
 T.leaveTable();await settle(E);
 ok('reply lost: server already paid, page keeps the pending retry',S.bal[E.ADDR]===500e6+800e6&&!S.sess[E.ADDR]&&T.LOOP.pending&&T.LOOP.pending.lamports===800e6);
 await T.loopRetryClick();
 ok('retry hits 409: pending dropped and balance refreshed from the server (no double pay)',T.LOOP.pending===null&&T.WALLET.SOL===1.3&&S.bal[E.ADDR]===1.3*SOL&&/already closed/.test(E.el('loopCoNote').textContent),JSON.stringify([T.LOOP.pending,T.WALLET.SOL,E.el('loopCoNote').textContent]));
}
{ // double click on leave
 const E=await seated();const {T,S,W}=E;
 let release;W.hold=new Promise(r=>release=r);
 E.me().chips=700;
 T.leaveTable();T.leaveTable();await settle(E);
 ok('double leave: one signature while pending',E.ledgerSigns().length===1);
 release();await tick();
 T.leaveTable();await settle(E);
 ok('double leave: a third call after leaving is ignored too',E.ledgerSigns().length===1&&S.calls.filter(c=>c.path==='/cashout').length===1);
 ok('double leave: credited once',S.bal[E.ADDR]===500e6+700e6&&T.WALLET.SOL===1.2);
}
{ // retry double click
 const E=await seated();const {T,S,W}=E;
 E.me().chips=700;W.mode='decline';T.leaveTable();await settle(E);
 W.mode='ok';let release;W.hold=new Promise(r=>release=r);W.signs.length=0;
 const a=T.loopRetryClick(),b=T.loopRetryClick();await tick();
 ok('retry double click: one signature',E.ledgerSigns().length===1);
 release();await a;await b;
 ok('retry double click: credited once',S.bal[E.ADDR]===500e6+700e6);
}
// replay safety: every action uses a fresh nonce
{
 const E=await seated(2*SOL,500);const {T,S,W}=E;
 await T.doRebuy(250);await T.doRebuy(250);
 E.me().chips=10;T.leaveTable();await settle(E);
 const ns=S.calls.filter(c=>c.body&&c.body.nonce).map(c=>c.body.nonce);
 ok('every ledger request used a distinct nonce',ns.length===3&&new Set(ns).size===3,ns.length);
 ok('nonces are 32 lowercase hex',ns.every(n=>/^[0-9a-f]{32}$/.test(n)));
 ok('timestamps are fresh integers',S.calls.filter(c=>c.body&&c.body.ts).every(c=>Number.isSafeInteger(c.body.ts)&&Math.abs(Date.now()-c.body.ts)<60000));
 ok('signature is base64 of 64 bytes',S.calls.filter(c=>c.body&&c.body.signature).every(c=>Buffer.from(c.body.signature,'base64').length===64));
}

// =====================================================================
// 8. open session recovery
// =====================================================================
{
 const E=await world({bal:700e6,sess:300e6});const {T,S,W}=E;
 await E.connect();
 ok('recovery: balance and session read at connect',T.WALLET.SOL===0.7&&T.LOOP.session===300e6);
 ok('recovery: wallet menu offers "Open table stack 0.3 SOL: return to balance"',/Open table stack 0\.3 SOL: return to balance/.test(E.el('loopBox').innerHTML));
 T.openBuyIn('sol-mid');
 ok('recovery: a new buy-in is blocked while the old stack is open',!E.el('buyinOverlay').classList.contains('show'));
 await T.loopRecoverClick();
 const sg=E.ledgerSigns();
 ok('recovery: one cash-out signature for exactly the session lamports',sg.length===1&&sg[0].kind==='cashout'&&parseMsg(sg[0].text).lamports===300e6);
 ok('recovery: refunded, session closed, wallet mirrors',S.bal[E.ADDR]===1e9&&!S.sess[E.ADDR]&&T.WALLET.SOL===1&&T.LOOP.session===0);
 ok('recovery: row gone',!/return to balance/.test(E.el('loopBox').innerHTML));
}
{ // recovery declined -> row stays, retry possible
 const E=await world({bal:700e6,sess:300e6});const {T,S,W}=E;await E.connect();
 W.mode='decline';await T.loopRecoverClick();
 ok('recovery declined: nothing moved, pending retry offered',S.sess[E.ADDR].inTotal===300e6&&T.WALLET.SOL===0.7&&T.LOOP.pending&&T.LOOP.pending.lamports===300e6);
 W.mode='ok';await T.loopRetryClick();
 ok('recovery retry works',!S.sess[E.ADDR]&&T.WALLET.SOL===1);
}
{ // recovery click while a table is open does nothing
 const E=await seated();const {T,S,W}=E;
 await T.loopRecoverClick();
 ok('recovery while a table is open is a no-op',E.ledgerSigns().length===0);
}
{ // disconnect with pending: kept per address
 const E=await seated();const {T,S,W}=E;
 E.me().chips=900;W.mode='decline';T.leaveTable();await settle(E);
 T.solDisconnect();
 ok('disconnect keeps the pending amount but falls back to free play',T.LOOP.pending&&T.WALLET.SOL===10&&E.el('loopBox').innerHTML==='');
 const n=E.ledgerSigns().length;await T.loopRetryClick();
 ok('while disconnected the retry does nothing',E.ledgerSigns().length===n);
 W.mode='ok';await E.connect();
 ok('reconnect with the same account: pending is back with the stack',/Cash-out pending, retry \(0\.9 SOL\)/.test(E.el('loopBox').innerHTML)&&T.WALLET.SOL===0.5);
 await T.loopRetryClick();
 ok('...and can be completed',S.bal[E.ADDR]===500e6+900e6&&!S.sess[E.ADDR]);
}
{ // a different account must not see or retry another account's pending
 const E=await seated();const {T}=E;
 T.LOOP.pending={lamports:123e6,addr:'1'.repeat(32)};T.loopRender();
 ok("another account's pending cash-out is neither shown nor retried",!/Cash-out pending/.test(E.el('loopBox').innerHTML)&&(await T.loopRetryClick(),E.ledgerSigns().length===0)&&E.el('loopRetryBtn').style.display==='none');
}
{ // leave while disconnected
 const E=await seated();const {T,S,W}=E;
 E.me().chips=900;T.solDisconnect();
 const w0=T.WALLET.SOL;T.leaveTable();await settle(E);
 ok('leave while Phantom is disconnected: no signature, no call, no free-play credit',E.ledgerSigns().length===0&&S.calls.length===0&&T.WALLET.SOL===w0&&w0===10);
 ok('...user told the stack stays open on the ledger',/stays open on the ledger/.test(E.el('loopCoNote').textContent));
 await E.connect();
 ok('...and it is recoverable after reconnecting',/Open table stack 0\.5 SOL: return to balance/.test(E.el('loopBox').innerHTML));
}
{ // free-play SOL table played, then Phantom connects: no minting
 const E=await world({bal:1*SOL});const {T,S,W}=E;
 await E.buyIn('sol-mid',500); // free play (not connected)
 ok('setup: free-play table',T.G.ledger===false&&E.me().chips===500);
 await E.connect();
 E.me().chips=5000;
 const w0=T.WALLET.SOL;T.leaveTable();await settle(E);
 ok('free-play stack left after connecting: not added to the ledger balance, no call',T.WALLET.SOL===w0&&S.calls.filter(c=>c.path!=='/balance').length===0&&E.ledgerSigns().length===0);
 ok('...told the user',/Free-play stack/.test(E.el('loopCoNote').textContent));
}
{ // add-on at a free-play SOL table after connecting is refused
 const E=await world({bal:1*SOL});const {T,S}=E;
 await E.buyIn('sol-mid',500);await E.connect();
 const w0=T.WALLET.SOL;await T.doRebuy(250);
 ok('add-on on a free-play table while in ledger mode: refused, no chips, no debit',E.me().chips===500&&T.WALLET.SOL===w0&&E.ledgerSigns().length===0);
}

// =====================================================================
// 9. ZEC tables stay free play
// =====================================================================
{
 const E=await world({bal:1*SOL});const {T,S,W}=E;await E.connect();
 W.signs.length=0;S.calls.length=0;
 await E.buyIn('zec-mid',500);
 ok('ZEC buy-in: local debit only, no popup, no server call',T.WALLET.ZEC===29.5&&E.me().chips===500&&W.signs.length===0&&S.calls.length===0&&T.G.ledger===false);
 ok('ZEC buy-in did not touch the ledger SOL balance',T.WALLET.SOL===1);
 await T.doRebuy(250);
 ok('ZEC add-on: local, no popup',E.me().chips===750&&T.WALLET.ZEC===29.25&&W.signs.length===0&&S.calls.length===0);
 E.me().chips=1000;T.leaveTable();await settle(E);
 ok('ZEC leave: local credit, no popup, no server call',T.WALLET.ZEC===+(29.25+1).toFixed(6)&&W.signs.length===0&&S.calls.length===0);
 ok('ZEC leave: no ledger receipt line',E.el('loopCoTrust').style.display==='none'&&E.el('loopRetryBtn').style.display==='none');
}
{
 const E=await world({bal:1*SOL});const {T}=E;await E.connect();
 const src=E.el('tableList');
 ok('lobby rows are tagged per table (ZEC always Free play, SOL ledger in ledger mode)',await (async()=>{
   const run=(cur)=>{return vm.runInContext("lobbyCur='"+cur+"';renderLobbyTables();document.getElementById('tableList').innerHTML",E.s);};
   const z=run('ZEC'),sl=run('SOL');
   return /Free play/.test(z)&&!/Ledger/.test(z)&&/Ledger \(devnet\)/.test(sl)&&!/Free play/.test(sl);})());
}

// =====================================================================
// 10. no Phantom popup on a deal
// =====================================================================
{
 const src=code;
 const n=(src.match(/signMessage\(/g)||[]).length;
 ok('static: signMessage( is called in exactly 3 places (connect, withdraw, loopPost)',n===3,n);
 ok('static: startHand and the dealing code never reference the ledger or the wallet',(()=>{const i=src.indexOf('function startHand');const j=src.indexOf('\nfunction ',i+10);const body=src.slice(i,j);return !/loop[A-Z]|solProvider|signMessage|request\(/.test(body);})());
 ok('static: loopPost is only called from buy-in and cash-out',(src.match(/loopPost\(/g)||[]).length===3); // definition + loopBuy + loopCashout
}
{
 const E=await world({bal:1*SOL});const {T,S,W}=E;await E.connect();
 await E.buyIn('sol-mid',500);
 W.signs.length=0;const reqs=W.requests.length;S.calls.length=0;
 // let the table run: pump every queued page timer (deals, bot actions, hand transitions)
 let pumped=0,folds=0;
 for(let i=0;i<20000&&T.G.hc<4;i++){
  if(E.timers.length){const t=E.timers.shift();try{t.f();}catch(e){}pumped++;}
  else if(T.G.ai===0&&!T.G.over){try{T.act(0,'fold');folds++;}catch(e){}}
  else break;
  await sleep();
 }
 ok('table ran: 3+ hands dealt and played ('+pumped+' timers, '+folds+' hero folds)',T.G.hc>=3&&pumped>20,JSON.stringify([T.G.hc,pumped,folds]));
 ok('dealing and playing hands: zero Phantom signatures',W.signs.length===0,W.signs.length);
 ok('dealing and playing hands: zero Phantom transactions',W.requests.length===reqs);
 ok('dealing and playing hands: zero server calls',S.calls.length===0,JSON.stringify(S.calls.map(c=>c.path)));
}

// =====================================================================
// 11. busy flag hygiene
// =====================================================================
{
 const E=await world({bal:1*SOL});const {T,S,W}=E;await E.connect();
 for(const m of ['decline','badsig']){W.mode=m;await E.buyIn('sol-mid',500);ok('busy released after '+m,T.LOOP.busy===false);}
 W.mode='ok';S.failNext='/buyin';await T.confirmBuyIn();ok('busy released after server error',T.LOOP.busy===false);
 // wallet that never answers: timeout path
 T.SOL_CFG.connectTimeoutMs=5;
 W.hold=new Promise(()=>{});
 E.s.setTimeout=(f,ms)=>{setImmediate(f);return 0;};
 await T.confirmBuyIn();
 ok('hung wallet: times out, no chips, busy released, message shown',!E.me()&&T.LOOP.busy===false&&/did not respond/i.test(E.el('loopBiNote').textContent)&&T.WALLET.SOL===1,E.el('loopBiNote').textContent);
}

// =====================================================================
// 12. page <-> contract parity of the message builder
// =====================================================================
{
 const E=await world();const {T}=E;
 const a='A'.repeat(32),n='0123456789abcdef0123456789abcdef',ts=1760000000000;
 ok('page buyin message == contract text byte for byte',T.loopMsg('buyin',a,12345600000,n,ts)===MSG.buyin(a,12345600000,n,ts));
 ok('page cashout message == contract text byte for byte',T.loopMsg('cashout',a,0,n,ts)===MSG.cashout(a,0,n,ts));
 ok('first lines differ so one signature cannot serve another endpoint',T.loopMsg('buyin',a,1,n,ts).split('\n')[0]!==T.loopMsg('cashout',a,1,n,ts).split('\n')[0]&&T.loopMsg('buyin',a,1,n,ts).split('\n')[0]!=='Anon Poker withdraw');
}
// trust model wording
ok('trust line present in the markup (cash-out receipt)',/Result reported by this browser; devnet only\./.test(html));
ok('no other ledger label drift: "Ledger balance (devnet)" is the SOL ledger label',/Ledger balance \(devnet\)/.test(code));
return {name:'money-loop-page.js (stream B)',pass,fail};
};
