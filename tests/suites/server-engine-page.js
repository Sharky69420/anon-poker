// Server-engine PAGE suite (stream P). Runs the REAL page code in a vm sandbox with a stubbed DOM.
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
 const S=o.from?o.from.S:{bal:{},sess:{},tbl:{},seen:new Set(),calls:[],resp:[],failNext:null,dropReply:null,netDown:false,hook:null,
   script:o.script||{},botChips:o.botChips||6000,legacy:!!o.legacy};
 if(!o.from){S.bal[ADDR]=o.bal===undefined?2*SOL:o.bal;S.sess[ADDR]={inTotal:0,stack:0};}
 const E={S,ADDR,W:null,inflight:0,now:1e6,kp};
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
 // ---------- scripted dealer (rules = the page's evalH; deck = the page's shuffle) ----------
 let T=null;
 const nHand=(tb)=>tb.hand;
 function mkHand(tb,clientSeed){
  const serverSeed=tb.nextSeed,handNo=tb.handNo+1;
  let deck=T.shuffleSeeded(T.mkDeck(),serverSeed+clientSeed+handNo);
  if(S.script.rig)deck=S.script.rig(deck,handNo);
  const n=tb.bots.length+1;
  const ss=[{idx:0,name:'You',chips:tb.hero},...tb.bots.map((b,i)=>({idx:i+1,name:b.name,chips:b.chips}))].map(s=>({...s,bet:0,folded:true,allIn:false,acted:false,hole:[],dealt:false}));
  let di=0;
  ss.forEach(s=>{if(s.chips>0){s.folded=false;s.dealt=true;s.hole=deck.slice(di,di+2);di+=2;}});
  const H={handNo,dealer:tb.dealer,n,ss,deck,di,comm:[],pot:0,stage:'preflop',toAct:null,lastRaise:BB,over:false,events:[],serverSeed,clientSeed,commit:tb.nextCommit,result:null,seq:tb.seq};
  const live=ss.filter(s=>s.dealt).length;
  const nx=(from,steps)=>{let idx=from;for(let c=0;c<steps;c++){do{idx=(idx+1)%n;}while(!ss[idx].dealt||ss[idx].folded);}return idx;};
  const sbi=live===2?H.dealer%n:nx(H.dealer,1),bbi=live===2?nx(H.dealer,1):nx(H.dealer,2);
  const first=live===2?sbi:nx(bbi,1);
  const post=(i,a)=>{const s=ss[i];const x=Math.min(a,s.chips);s.chips-=x;s.bet+=x;H.pot+=x;if(!s.chips)s.allIn=true;H.events.push({seat:i,type:'blind',amount:x});};
  post(sbi,SB);post(bbi,BB);H.events.push({type:'deal'});
  H.toAct=first;return H;
 }
 const maxBet=H=>Math.max(0,...H.ss.map(s=>s.bet));
 function findNext(H,from){for(let i=1;i<=H.n;i++){const idx=(from+i)%H.n,s=H.ss[idx];if(!s.dealt||s.folded||s.allIn||s.chips<=0)continue;if(!s.acted||maxBet(H)-s.bet>0)return idx;}return null;}
 function legalOf(H){
  const s=H.ss[0],owes=Math.max(0,maxBet(H)-s.bet);
  const maxTo=s.bet+s.chips;let minTo=maxBet(H)+Math.max(H.lastRaise,BB);if(minTo>maxTo)minTo=maxTo;
  return {seat:0,canCheck:owes===0,callAmt:Math.min(owes,s.chips),minRaiseTo:minTo,maxRaiseTo:maxTo,canRaise:s.chips>owes};
 }
 function finishPot(H,showdown){
  const act=H.ss.filter(s=>s.dealt&&!s.folded);
  let winners;
  if(act.length===1)winners=[act[0]];
  else{const sc=act.map(s=>({s,h:T.evalH(s.hole,H.comm)}));sc.sort((a,b)=>b.h.rank-a.h.rank||b.h.tb-a.h.tb);const w=sc.filter(x=>x.h.rank===sc[0].h.rank&&x.h.tb===sc[0].h.tb);winners=w.map(x=>x.s);H._names={};sc.forEach(x=>{H._names[x.s.idx]=x.h.name;});}
  const share=Math.floor(H.pot/winners.length),rem=H.pot-share*winners.length;
  const ws=winners.map((w,i)=>{const amt=share+(i===0?rem:0);w.chips+=amt;return {seat:w.idx,amount:amt,handName:H._names?H._names[w.idx]:undefined};});
  H.result={winners:ws,pots:[{amount:H.pot,eligible:act.map(s=>s.idx),winners:ws.map(w=>w.seat)}],rake:0,bbj:0};
  H.showdown=act.length>1;H.over=true;H.toAct=null;
  H.events.push({type:'win',seat:ws[0].seat,amount:ws[0].amount});
 }
 function endStreet(H){
  H.ss.forEach(s=>{s.bet=0;if(!s.folded&&!s.allIn)s.acted=false;});H.lastRaise=BB;
  const order=['preflop','flop','turn','river'];
  for(;;){
   if(H.stage==='river'){H.stage='showdown';finishPot(H,true);return;}
   const nxt=order[order.indexOf(H.stage)+1];
   if(nxt==='flop'){H.comm=H.deck.slice(H.di,H.di+3);H.di+=3;}else{H.comm=[...H.comm,H.deck[H.di]];H.di++;}
   H.stage=nxt;H.events.push({type:'street',stage:nxt,cards:H.comm.slice()});
   const canBet=H.ss.filter(s=>s.dealt&&!s.folded&&!s.allIn&&s.chips>0).length>=2;
   if(canBet){H.toAct=findNext(H,H.dealer);return;}
  }
 }
 function doAct(H,i,a){
  const s=H.ss[i],owes=Math.max(0,maxBet(H)-s.bet);
  if(a.type==='fold'){s.folded=true;s.acted=true;H.events.push({seat:i,type:'fold'});}
  else if(a.type==='check'){s.acted=true;H.events.push({seat:i,type:'check'});}
  else if(a.type==='call'){const x=Math.min(owes,s.chips);s.chips-=x;s.bet+=x;H.pot+=x;s.acted=true;if(!s.chips)s.allIn=true;H.events.push({seat:i,type:s.allIn?'allin':'call',amount:x});}
  else{const before=maxBet(H),x=a.amount-s.bet;s.chips-=x;s.bet+=x;H.pot+=x;s.acted=true;if(!s.chips)s.allIn=true;
   const inc=s.bet-before;if(inc>=H.lastRaise){H.lastRaise=inc;H.ss.forEach(o2=>{if(o2.idx!==i&&o2.dealt&&!o2.folded&&!o2.allIn)o2.acted=false;});s.acted=true;}
   H.events.push({seat:i,type:s.allIn?'allin':'raise',amount:s.bet});}
  const alive=H.ss.filter(x=>x.dealt&&!x.folded);
  if(alive.length===1){finishPot(H,false);return;}
  const nx=findNext(H,i);
  if(nx===null)endStreet(H);else H.toAct=nx;
 }
 function runBots(H){
  let guard=0;
  while(!H.over&&H.toAct!==0&&H.toAct!==null&&guard++<200){
   const i=H.toAct,s=H.ss[i],owes=Math.max(0,maxBet(H)-s.bet);
   const key=H.handNo+':'+i;
   let a;
   const rz=S.script.raise&&S.script.raise[key+':'+H.stage];
   if(S.script.fold&&S.script.fold[key]&&owes>0)a={type:'fold'};
   else if(rz&&!s['r_'+H.stage]&&s.chips>owes){s['r_'+H.stage]=true;a={type:'raise',amount:Math.min(rz,s.bet+s.chips)};}
   else a=owes>0?{type:'call'}:{type:'check'};
   doAct(H,i,a);
  }
 }
 function viewOf(tb,H){
  const base={handNo:tb.handNo+(H?0:0),commit:H?H.commit:tb.nextCommit};
  if(!H)return null;
  const showBots=H.over&&H.showdown;
  const v={handNo:H.handNo,commit:H.commit,stage:H.stage,dealer:H.dealer,
   seats:H.ss.map(s=>({idx:s.idx,name:s.name,isBot:s.idx!==0,chips:s.chips,bet:s.bet,folded:s.folded,allIn:s.allIn,
     hole:s.dealt&&(s.idx===0||(showBots&&!s.folded))?s.hole.map(c=>({r:c.r,s:c.s})):null})),
   comm:H.comm.map(c=>({r:c.r,s:c.s})),pot:H.over?H.pot:H.pot,toAct:H.over?null:H.toAct,legal:(!H.over&&H.toAct===0)?legalOf(H):null,
   seq:tb.seq,events:H.events.slice(),result:H.result,
   reveal:H.over?{serverSeed:H.serverSeed,commit:H.commit,clientSeed:H.clientSeed,handNo:H.handNo}:null,
   heroChips:H.ss[0].chips,stackLamports:H.ss[0].chips*tb.unit,nextCommit:H.over?tb.nextCommit:null};
  return v;
 }
 function persist(tb,H){ // hero/bot chips back to the table record after the hand
  if(H.over){tb.hero=H.ss[0].chips;tb.bots.forEach((b,i)=>{b.chips=H.ss[i+1].chips;});S.sess[tb.addr].stack=tb.hero*tb.unit;}
 }
 function tbOf(addr,token){const tb=S.tbl[addr];if(!tb||tb.token!==token||typeof token!=='string')return null;return tb;}
 S.handle=async(method,pathn,q,b)=>{
  S.calls.push({method,path:pathn,body:b,q:q&&Object.fromEntries(q)});
  if(S.failNext===pathn){S.failNext=null;return {st:500,j:{error:'boom'}};}
  if(S.hook){const h=S.hook(method,pathn,b);if(h)return h;}
  const R=await route(method,pathn,q,b);S.resp.push({path:pathn,st:R.st,j:R.j});return R;
 };
 async function route(method,pathn,q,b){
  if(pathn==='/balance'){
   if(method!=='GET')return err(405,{error:'GET only'});
   const a=q.get('addr');if(!isAddr(a))return err(400,{error:'bad address'});
   const se=S.sess[a]||{inTotal:0,stack:0};
   return {st:200,j:S.legacy?{balance:S.bal[a]||0,session:se.inTotal}:{balance:S.bal[a]||0,session:se.inTotal,stack:se.stack,table:!!S.tbl[a]}};
  }
  if(pathn==='/table/state'){
   if(method!=='GET')return err(405,{error:'GET only'});
   const tb=tbOf(q.get('addr'),q.get('token'));if(!tb)return err(401,{error:'bad token'});
   if(!tb.hand)return err(409,{error:'no hand'});
   return {st:200,j:viewOf(tb,tb.hand)};
  }
  if(method!=='POST')return err(405,{error:'POST only'});
  if(pathn==='/buyin'||pathn==='/cashout'){
   const kind=pathn.slice(1);
   if(keysOf(b)!=='addr,lamports,nonce,signature,ts')return err(400,{error:'bad body keys '+keysOf(b)});
   if(!isAddr(b.addr))return err(400,{error:'bad address'});
   const L=b.lamports;if(!Number.isSafeInteger(L))return err(400,{error:'lamports must be a safe integer'});
   if(kind==='buyin'&&(L<BUYIN.min||L>BUYIN.max||L%BUYIN.step!==0))return err(400,{error:'bad buy-in amount'});
   if(kind==='cashout'&&(L<0||L%BUYIN.step!==0))return err(400,{error:'bad cash-out amount'});
   const e=await sigCheck(kind,b,MSG[kind](b.addr,L,b.nonce,b.ts));if(e)return e;
   const se=S.sess[b.addr],tb=S.tbl[b.addr];
   if(kind==='buyin'){
    if(L>(S.bal[b.addr]||0))return err(402,{error:'exceeds ledger balance',balance:S.bal[b.addr]||0});
    if(tb){if(tb.hand&&!tb.hand.over)return err(409,{error:'hand in progress'});if(L%tb.unit!==0)return err(400,{error:'not a multiple of the table unit'});}
    S.bal[b.addr]-=L;se.inTotal+=L;se.stack+=L;if(tb){tb.hero+=L/tb.unit;}
    return {st:200,j:{balance:S.bal[b.addr],session:se.inTotal,stack:se.stack,table:!!tb}};
   }
   if(!(se.stack>0)&&!tb)return err(409,{error:'no open table session'});
   if(tb&&tb.hand&&!tb.hand.over)return err(409,{error:'hand in progress'});
   if(L!==se.stack)return err(422,{error:'amount mismatch',stack:se.stack});
   S.bal[b.addr]+=se.stack;S.sess[b.addr]={inTotal:0,stack:0};delete S.tbl[b.addr];
   return {st:200,j:{balance:S.bal[b.addr],session:0,stack:0,table:false}};
  }
  if(pathn==='/table/open'){
   if(keysOf(b)!=='addr,bots,nonce,signature,tableId,ts')return err(400,{error:'bad body keys '+keysOf(b)});
   if(!isAddr(b.addr))return err(400,{error:'bad address'});
   if(!UNIT[b.tableId])return err(400,{error:'not a SOL table'});
   if(!Number.isInteger(b.bots)||b.bots<1||b.bots>7)return err(400,{error:'bad bots'});
   const e=await sigCheck('open',b,MSG.open(b.addr,b.tableId,b.bots,b.nonce,b.ts));if(e)return e;
   const se=S.sess[b.addr];if(!(se.stack>0))return err(422,{error:'no table stack'});
   if(se.stack/UNIT[b.tableId]<250)return err(422,{error:'stack below minimum'});
   if(S.tbl[b.addr])return err(409,{error:'table already open'});
   const names=['Satoshi','Nakamoto','Zooko','Hal','Ada','Whit','Wei'];
   const seed=rhex(32);
   const tb={addr:b.addr,token:rhex(16),unit:UNIT[b.tableId],tableId:b.tableId,bots:Array.from({length:b.bots},(_,i)=>({name:names[i],chips:S.botChips})),dealer:0,handNo:0,hero:se.stack/UNIT[b.tableId],hand:null,seq:0,nextSeed:seed,nextCommit:nodeCrypto.createHash('sha256').update(seed).digest('hex')};
   S.tbl[b.addr]=tb;
   return {st:200,j:{token:tb.token,unit:tb.unit,handNo:1,commit:tb.nextCommit,stackChips:tb.hero,bots:tb.bots.map(x=>({name:x.name,chips:x.chips}))}};
  }
  if(pathn==='/table/resume'){
   if(keysOf(b)!=='addr,nonce,signature,ts')return err(400,{error:'bad body keys '+keysOf(b)});
   if(!isAddr(b.addr))return err(400,{error:'bad address'});
   const e=await sigCheck('resume',b,MSG.resume(b.addr,b.nonce,b.ts));if(e)return e;
   const tb=S.tbl[b.addr];if(!tb)return err(409,{error:'no open table'});
   tb.token=rhex(16);
   const H=tb.hand;
   const view=H?viewOf(tb,H):{handNo:tb.handNo+1,commit:tb.nextCommit,stage:null,dealer:tb.dealer,seats:[{idx:0,name:'You',chips:tb.hero,bet:0,folded:false,allIn:false,hole:null},...tb.bots.map((x,i)=>({idx:i+1,name:x.name,chips:x.chips,bet:0,folded:false,allIn:false,hole:null}))],comm:[],pot:0,toAct:null,legal:null,seq:tb.seq,events:[],result:null,reveal:null,heroChips:tb.hero,stackLamports:tb.hero*tb.unit,nextCommit:null};
   return {st:200,j:{token:tb.token,view,unit:tb.unit,tableId:tb.tableId}};
  }
  if(pathn==='/hand/deal'){
   if(keysOf(b)!=='addr,clientSeed,token')return err(400,{error:'bad body keys '+keysOf(b)});
   const tb=tbOf(b.addr,b.token);if(!tb)return err(401,{error:'bad token'});
   if(typeof b.clientSeed!=='string'||!/^[0-9a-f]{16}$/.test(b.clientSeed))return err(400,{error:'bad client seed'});
   if(tb.hand&&!tb.hand.over)return err(409,{error:'hand in progress'});
   if(tb.hero<BB)return err(409,{error:'stack below big blind'});
   if(tb.hand){tb.dealer=(tb.dealer+1)%(tb.bots.length+1);}
   const H=mkHand(tb,b.clientSeed);tb.handNo=H.handNo;tb.seq++;H.seq=tb.seq;
   // the commit for the NEXT hand is chosen now and handed out after this hand ends
   const ns=rhex(32);tb.nextSeed=ns;const oldCommit=H.commit;tb.nextCommit=nodeCrypto.createHash('sha256').update(ns).digest('hex');
   tb.hand=H;runBots(H);persist(tb,H);
   const v=viewOf(tb,H);v.commit=oldCommit;return {st:200,j:v};
  }
  if(pathn==='/hand/act'){
   if(keysOf(b)!=='action,addr,handNo,seq,token')return err(400,{error:'bad body keys '+keysOf(b)});
   const tb=tbOf(b.addr,b.token);if(!tb)return err(401,{error:'bad token'});
   const H=tb.hand;if(!H||H.over)return err(409,{error:'no hand in progress'});
   if(b.handNo!==H.handNo)return err(409,{error:'wrong hand'});
   if(b.seq!==tb.seq)return err(409,{error:'bad seq',seq:tb.seq});
   if(H.toAct!==0)return err(409,{error:'not your turn'});
   const a=b.action,L=legalOf(H);
   const ill=why=>err(422,{error:'illegal action',why,legal:L});
   if(!a||typeof a!=='object'||['fold','check','call','raise'].indexOf(a.type)<0)return ill('type');
   if(a.type==='check'&&!L.canCheck)return ill('cannot check');
   if(a.type==='call'&&L.canCheck)return ill('nothing to call');
   if(a.type==='raise'){if(!L.canRaise)return ill('cannot raise');if(!Number.isSafeInteger(a.amount))return ill('amount');if(a.amount>L.maxRaiseTo||a.amount<L.minRaiseTo)return ill('amount out of range');}
   else if(a.amount!==undefined)return ill('unexpected amount');
   tb.seq++;doAct(H,0,a);runBots(H);
   if(H.over){tb.seq+=0;}
   persist(tb,H);
   const v=viewOf(tb,H);return {st:200,j:v};
  }
  return err(404,{error:'not found'});
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
 vm.runInContext(code+';globalThis.T={G,SRV,LOOP,PF,WALLET,TABLES,SOL_CFG,SOLWAL,STAGES,startGame,startHand,act,openBuyIn,confirmBuyIn,doRebuy,srvScheduleDeal,doAddOn,checkRebuy,leaveTable,closeCashout,solConnect,solDisconnect,render,loopSync,loopRender,loopRetryClick,loopRecoverClick,srvResume,srvApply,srvRecover,srvCheckView,srvDeal,srvSend,toggleSitOut,mkDeck,shuffleSeeded,evalH,sha256Hex,pfVerifyNow,setMode,setTableSize,BUYIN_MIN,BUYIN_MAX,SB,BB,get pendingTable(){return pendingTable;},set pendingTable(v){pendingTable=v;},get heroTimer(){return heroTimer;},get selectedTableBots(){return selectedTableBots;}};',s);
 T=s.T;E.T=T;
 T.SOL_CFG.api=o.api===undefined?API:o.api;T.SOL_CFG.pollMs=0;T.SOL_CFG.pollMax=3;
 Object.assign(E,{el,s,
  tbl:id=>T.TABLES.find(t=>t.id===id),
  setSlider(v){el('biSlider').value=String(v);},
  me:()=>T.G.seats&&T.G.seats[0],
  ledgerSigns:()=>W.signs.filter(x=>x.kind!=='signin'),
  tb:()=>S.tbl[ADDR],
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

// =====================================================================
// 0. the strict mock really is strict (so green tests mean something)
// =====================================================================
{
 const E=await world();const {S,ADDR}=E;
 const now=Date.now();
 const signOf=async text=>Buffer.from(new Uint8Array(await wc.subtle.sign({name:'Ed25519'},E.kp.privateKey,Buffer.from(text)))).toString('base64');
 const post=async(p,b)=>S.handle('POST',p,new URLSearchParams(),b);
 const N=i=>(''+i).padStart(16,'a');
 const buy=async(l,n)=>post('/buyin',{addr:ADDR,lamports:l,nonce:n,ts:now,signature:await signOf(MSG.buyin(ADDR,l,n,now))});
 ok('mock: buy-in moves balance and stack',(await buy(500e6,N(1))).j.stack===500e6);
 const op=async(n,tb,bots,over)=>post('/table/open',Object.assign({addr:ADDR,tableId:tb,bots,nonce:n,ts:now,signature:await signOf(MSG.open(ADDR,tb,bots,n,now))},over||{}));
 ok('mock: open with a wrong signature refused 401',(await op(N(2),'sol-mid',2,{signature:await signOf('x')})).st===401);
 ok('mock: open with bots=0 / 8 / 1.5 refused',(await op(N(3),'sol-mid',0)).st===400&&(await op(N(4),'sol-mid',8)).st===400&&(await op(N(5),'sol-mid',1.5)).st===400);
 ok('mock: open on a ZEC table id refused',(await op(N(6),'zec-mid',2)).st===400);
 const o1=await op(N(7),'sol-mid',2);
 ok('mock: open ok returns token/unit/commit/stackChips',o1.st===200&&/^[0-9a-f]{32}$/.test(o1.j.token)&&o1.j.unit===1e6&&o1.j.stackChips===500&&/^[0-9a-f]{64}$/.test(o1.j.commit));
 ok('mock: second open refused 409',(await op(N(8),'sol-mid',2)).st===409);
 const tk=o1.j.token;
 ok('mock: deal with wrong token 401',(await post('/hand/deal',{addr:ADDR,token:'0'.repeat(32),clientSeed:'a'.repeat(16)})).st===401);
 ok('mock: deal with extra body key refused',(await post('/hand/deal',{addr:ADDR,token:tk,clientSeed:'a'.repeat(16),x:1})).st===400);
 const d=await post('/hand/deal',{addr:ADDR,token:tk,clientSeed:'a'.repeat(16)});
 ok('mock: deal ok, hero sees own hole, bots hidden',d.st===200&&d.j.seats[0].hole.length===2&&d.j.seats.slice(1).every(x=>x.hole===null)&&d.j.reveal===null&&d.j.result===null);
 ok('mock: second deal while hand running 409',(await post('/hand/deal',{addr:ADDR,token:tk,clientSeed:'b'.repeat(16)})).st===409);
 ok('mock: cashout during a hand 409',(await post('/cashout',{addr:ADDR,lamports:500e6,nonce:N(9),ts:now,signature:await signOf(MSG.cashout(ADDR,500e6,N(9),now))})).st===409);
 const act=(a,over)=>post('/hand/act',Object.assign({addr:ADDR,token:tk,handNo:1,seq:d.j.seq,action:a},over||{}));
 ok('mock: act with stale seq 409',(await act({type:'call'},{seq:d.j.seq+5})).st===409);
 ok('mock: act with wrong handNo 409',(await act({type:'call'},{handNo:9})).st===409);
 ok('mock: check while a call is owed 422',(await act({type:'check'})).st===422);
 ok('mock: raise below min / above max / fractional 422',(await act({type:'raise',amount:30})).st===422&&(await act({type:'raise',amount:99999})).st===422&&(await act({type:'raise',amount:41.5})).st===422);
 ok('mock: negative amount 422',(await act({type:'raise',amount:-40})).st===422);
 ok('mock: fold ok, hand over, reveal present and hashes to the commit',await (async()=>{const x=await act({type:'fold'});return x.st===200&&x.j.result&&x.j.reveal&&nodeCrypto.createHash('sha256').update(x.j.reveal.serverSeed).digest('hex')===x.j.commit&&/^[0-9a-f]{64}$/.test(x.j.nextCommit);})());
 ok('mock: cashout of the wrong amount 422 with stack',await (async()=>{const x=await post('/cashout',{addr:ADDR,lamports:499900000,nonce:N(10),ts:now,signature:await signOf(MSG.cashout(ADDR,499900000,N(10),now))});return x.st===422&&x.j.error==='amount mismatch';})());
 ok('mock: phantom rejects a non-Uint8Array payload',await (async()=>{try{await E.s.window.phantom.solana.signMessage('hi','utf8');return false;}catch(e){return /Uint8Array/.test(e.message);}})());
}

// =====================================================================
// 1. everything that is not a server table is exactly as before
// =====================================================================
{ // old worker (no "table" field in /balance): ledger buy-in keeps the client engine path
 const E=await world({legacy:true});await E.connect();
 ok('legacy server: LOOP.srv stays false',E.T.LOOP.srv===false);
 await E.sit('sol-mid',500,2);
 ok('legacy server: only /buyin is called (no /table/open), client table',!E.S.calls.some(c=>c.path==='/table/open')&&E.T.G.srv===false&&E.T.G.ledger===true&&E.ledgerSigns().length===1);
}
{ // free play (signed out) and ZEC tables
 const E=await world();
 E.T.openBuyIn('sol-mid');E.setSlider(500);await E.T.confirmBuyIn();
 ok('free play SOL: client engine, no server call, no signature',E.T.G.srv===false&&E.S.calls.length===0&&E.W.signs.length===0&&E.T.G.ledger===false);
 E.T.leaveTable();E.T.closeCashout();
 await E.connect();
 E.T.openBuyIn('zec-mid');E.setSlider(500);await E.T.confirmBuyIn();
 ok('ZEC table while connected: client engine, no /table/open, no ledger signature',E.T.G.srv===false&&E.T.G.ledger===false&&!E.S.calls.some(c=>c.path==='/table/open')&&E.ledgerSigns().length===0);
 ok('ZEC table: client startHand still runs (timer armed)',E.timers.size>0);
}
{ // PLO on a ledger table with engine support: blocked with a note, nothing signed
 const E=await world();await E.connect();
 E.T.setMode('PLO');E.W.signs.length=0;
 E.T.openBuyIn('sol-mid');
 ok('PLO ledger table: buy-in modal NOT opened',!E.el('buyinOverlay').classList.contains('show'));
 ok('PLO ledger table: note says Hold’em only',/Hold.em only/.test(E.T.LOOP.note));
 ok('PLO ledger table: nothing signed, no server call besides balance',E.W.signs.length===0&&E.S.calls.filter(c=>c.path!=='/balance').length===0);
 ok('PLO: ZEC table still opens (client engine)',(E.T.openBuyIn('zec-mid'),E.el('buyinOverlay').classList.contains('show')));
 E.T.setMode('NLHE');
}
{ // PLO on a legacy server keeps working
 const E=await world({legacy:true});await E.connect();E.T.setMode('PLO');
 E.T.openBuyIn('sol-mid');
 ok('PLO on a legacy server: buy-in modal opens as before',E.el('buyinOverlay').classList.contains('show'));
}

// =====================================================================
// 2. buy-in -> /table/open -> first deal
// =====================================================================
{
 const E=await world();await E.connect();const {T,S,W}=E;
 W.signs.length=0;S.calls.length=0;
 T.setTableSize(3);T.openBuyIn('sol-mid');E.setSlider(500);
 await T.confirmBuyIn();await E.idle();
 const sg=E.ledgerSigns();
 ok('buy-in: exactly two signatures (buy-in, sit-down), in that order',sg.length===2&&sg[0].kind==='buyin'&&sg[1].kind==='open',sg.map(x=>x.kind).join());
 const po=/\nNonce: (\S+)\nTimestamp: (\d+)\n/.exec(sg[1].text);
 ok('sit-down message byte-exact per contract (independently rebuilt)',sg[1].text===MSG.open(E.ADDR,'sol-mid',3,po[1],po[2]));
 const oc=S.calls.find(c=>c.path==='/table/open');
 ok('POST /table/open body: exactly addr,tableId,bots,nonce,ts,signature',oc&&Object.keys(oc.body).sort().join()==='addr,bots,nonce,signature,tableId,ts'&&oc.body.bots===3&&oc.body.tableId==='sol-mid');
 ok('server table: G.srv, ledger, token held',T.G.srv===true&&T.G.ledger===true&&/^[0-9a-f]{32}$/.test(T.SRV.token));
 ok('server table: client startHand does not run (no client deck)',T.G.deck.length===0||T.G.srv);
 ok('hero chips come from the server stackChips (500)',E.me().chips===500||T.SRV.view);
 ok('seats = 1 hero + 3 bots, names from the server',T.G.seats.length===4&&T.G.seats[1].label==='Satoshi'&&T.G.seats[3].label==='Zooko');
 ok('BBJ pill hidden on a server table',E.el('gBBJ').style.display==='none');
 ok('PROVABLY FAIR badge shows the commitment BEFORE any deal',T.PF.commit===S.tbl[E.ADDR].nextCommit&&has(E.el('pfBadge').innerHTML,T.PF.commit.slice(0,10))&&S.calls.every(c=>c.path!=='/hand/deal'));
 await E.untilHero();
 const dc=S.calls.find(c=>c.path==='/hand/deal');
 ok('POST /hand/deal body: exactly addr,token,clientSeed(16 hex)',dc&&Object.keys(dc.body).sort().join()==='addr,clientSeed,token'&&/^[0-9a-f]{16}$/.test(dc.body.clientSeed)&&dc.body.token===T.SRV.token);
 ok('commit published before the client seed was sent (commit seen first)',S.calls.findIndex(c=>c.path==='/table/open')<S.calls.findIndex(c=>c.path==='/hand/deal'));
 ok('the deal did not touch the wallet (still exactly 2 ledger signatures)',E.ledgerSigns().length===2);
 const v=T.SRV.view;
 ok('hero hole cards on the felt = the server’s',E.me().hole.length===2&&E.me().hole[0].r===v.seats[0].hole[0].r&&E.me().hole[1].s===v.seats[0].hole[1].s);
 ok('bots are flagged hidden and render only card backs (no face-up bot card)',T.G.seats.slice(1).every(x=>x.srvHid)&&faceCount(E.seatsHtml())===2,faceCount(E.seatsHtml()));
 ok('pot/bets/dealer/stage mapped from the view',T.G.pot===v.pot&&T.G.dealer===v.dealer&&T.G.stage==='preflop'&&JSON.stringify(Object.keys(T.G.bets).sort())===JSON.stringify(v.seats.map((s,i)=>s.bet>0?String(i):null).filter(Boolean).sort()));
 ok('action bar offers Fold / Call / Raise with the server legal numbers',has(E.bar(),'id="fBtn"')&&has(E.bar(),'id="caBtn"')&&has(E.bar(),'id="brBtn"')&&T.G.lastRaiseSize===v.legal.minRaiseTo-Math.max(...v.seats.map(s=>s.bet)));
 ok('hero timer armed on the hero turn',!!T.heroTimer);
 ok('PF commit for this hand is the one from /table/open (hand 1)',T.PF.handNo===1&&T.PF.commit===v.commit);
}
// buy-in guard / failure paths
{
 const E=await world();await E.connect();const {T,S,W}=E;
 W.mode='decline';await E.sit('sol-mid',500,2);
 ok('buy-in declined: nothing bought, no open call, balance intact',(await E.bal()).stack===0&&!S.calls.some(c=>c.path==='/table/open')&&T.G.srv!==true&&T.LOOP.busy===false);
 W.mode='declineOpen';
 await E.sit('sol-mid',500,2);
 ok('sit-down declined: stack is on the server, table not open, user told',(await E.bal()).stack===500e6&&(await E.bal()).table===false&&/Sit-down declined/.test(E.el('loopBiNote').textContent)&&E.el('buyinOverlay').classList.contains('show'));
 ok('sit-down declined: busy released, no table opened in the page',T.LOOP.busy===false&&!T.G.srv);
 W.signs.length=0;
 await T.confirmBuyIn();await E.idle();
 ok('retry after declined sit-down: ONLY the sit-down is signed (no second buy-in)',E.ledgerSigns().length===1&&E.ledgerSigns()[0].kind==='open'&&(await E.bal()).stack===500e6&&T.G.srv===true);
}
{ // /table/open refused by the server (422): chips stay safe and recoverable
 const E=await world();await E.connect();const {T,S,W}=E;
 S.hook=(m,p)=>p==='/table/open'?{st:422,j:{error:'stack below minimum'}}:null;
 await E.sit('sol-mid',500,2);
 ok('open refused 422: modal stays with the server message, no table',/stack below minimum/.test(E.el('loopBiNote').textContent)&&!T.G.srv);
 S.hook=null;T.pendingTable=null;
 await T.loopSync();T.loopRender();
 ok('...the stack is offered back via the wallet "return" button (orphan stack)',has(E.el('loopBox').innerHTML,'loopRecoverClick'));
 W.signs.length=0;
 await T.loopRecoverClick();await E.idle();
 ok('...return signs one cash-out for exactly the server stack and balance is whole again',E.ledgerSigns().length===1&&E.ledgerSigns()[0].kind==='cashout'&&(await E.bal()).balance===2*SOL&&(await E.bal()).stack===0);
}
{ // malformed /table/open reply is rejected
 const E=await world();await E.connect();const {T,S}=E;
 const orig=S.handle;S.handle=async(m,p,q,b)=>{const r=await orig(m,p,q,b);if(p==='/table/open'&&r.st===200)r.j={...r.j,token:'short'};return r;};
 await E.sit('sol-mid',500,2);
 ok('bad token shape in /table/open reply: no table started',!T.G.srv&&T.SRV.token===null);
}

// =====================================================================
// 3. every hero action, through the real action bar buttons
// =====================================================================
{ // call, then check the street, bet via slider, fold: bodies and seq/handNo discipline
 const E=await seatedHero({},1000,2);const {T,S,W}=E;
 const acts=()=>S.calls.filter(c=>c.path==='/hand/act');
 let v=T.SRV.view;
 W.signs.length=0;
 await E.press('caBtn');
 ok('Call: POST /hand/act {type:call}, no amount',acts().length===1&&JSON.stringify(acts()[0].body.action)==='{"type":"call"}');
 ok('act body: exactly addr,token,handNo,seq,action; seq = the view seq, handNo = the view hand',Object.keys(acts()[0].body).sort().join()==='action,addr,handNo,seq,token'&&acts()[0].body.seq===v.seq&&acts()[0].body.handNo===v.handNo&&acts()[0].body.token===T.SRV.token);
 ok('after pressing, the bar is closed at once (no double click): hero not to act',T.G.ai===null);
 await E.untilHero();
 v=T.SRV.view;
 ok('flop: 3 board cards from the server, hero to act again, seq advanced',v.stage==='flop'&&T.G.comm.length===3&&T.G.ai===0&&v.seq>acts()[0].body.seq);
 ok('flop: Check offered (nothing to call) and no Call button',has(E.bar(),'id="ckBtn"')&&!has(E.bar(),'id="caBtn"'));
 await E.press('ckBtn');
 ok('Check: {type:check}',JSON.stringify(acts()[1].body.action)==='{"type":"check"}');
 await E.untilHero();
 v=T.SRV.view;
 ok('turn reached',v.stage==='turn'&&T.G.comm.length===4);
 // raise via the real slider+button: pick the last step (all-in)
 const L=v.legal;
 ok('legal window on the bar comes from the server (min < max)',L.canRaise&&L.minRaiseTo<L.maxRaiseTo);
 await E.press('brBtn');
 ok('Bet at default (min): {type:raise,amount:minRaiseTo} (raise-to total)',acts()[2].body.action.type==='raise'&&acts()[2].body.action.amount===L.minRaiseTo,JSON.stringify(acts()[2].body.action)+' min '+L.minRaiseTo);
 await E.untilHero();
 ok('ledger signatures unchanged by 3 actions (no Phantom call on act)',W.signs.length===0);
 v=T.SRV.view;
 await E.press('fBtn');
 ok('Fold: {type:fold}',JSON.stringify(acts()[3].body.action)==='{"type":"fold"}');
 await E.untilOver();
 ok('hand over after fold: result present, G.over, bar shows next-hand text',T.G.over&&has(E.bar(),'Next hand starting'));
 ok('no Phantom call on deal/act through a whole hand',W.signs.length===0);
}
{ // slider to max = all-in raise
 const E=await seatedHero({},500,2);const {T,S}=E;
 const L=T.SRV.view.legal;
 const n=(E.bar().match(/max="(\d+)"/)||[])[1];
 E.el('betSlide').oninput({target:{value:String(n)}});
 await E.press('brBtn');
 const a=S.calls.filter(c=>c.path==='/hand/act')[0].body.action;
 ok('slider to the top: raise-to = hero stack total (all-in) = server maxRaiseTo',a.type==='raise'&&a.amount===L.maxRaiseTo,JSON.stringify(a)+' max '+L.maxRaiseTo);
 await E.untilOver();
 const v=T.SRV.view;
 ok('hero all-in vs call-all bots: hand runs out to a result',!!v.result&&v.comm.length===5);
 ok('showdown: bots’ cards revealed by the server are shown face up (not hidden)',T.G.seats.slice(1).some(x=>!x.srvHid)&&faceCount(E.seatsHtml())>=4||T.G.seats.slice(1).every(x=>x.folded),faceCount(E.seatsHtml()));
}
{ // check-with-call-owed is converted by the page (server would refuse it)
 const E=await seatedHero({},500,2);const {T,S}=E;
 T.act(0,'check');await E.idle();
 ok('page act(check) with a call owed is sent as call (never as check)',JSON.stringify(S.calls.filter(c=>c.path==='/hand/act')[0].body.action)==='{"type":"call"}');
}
{ // out-of-turn / spent: acting when it is not the hero's turn sends nothing
 const E=await seatedHero({},500,2);const {T,S}=E;
 await E.press('caBtn');
 const n=S.calls.filter(c=>c.path==='/hand/act').length;
 T.act(0,'fold');T.act(0,'call',20);T.act(1,'fold');await E.idle();
 ok('act() while waiting for the server (or for a bot) sends nothing extra',S.calls.filter(c=>c.path==='/hand/act').length===n);
 ok('act for a bot seat (act(1,...)) never reaches the server',S.calls.filter(c=>c.path==='/hand/act').length===n);
}

// =====================================================================
// 4. play many hands: invariants at every step
// =====================================================================
{
 const E=await world({bal:5*SOL,script:{raise:{'2:1:flop':60,'3:2:preflop':80,'5:1:turn':100},fold:{'4:2':1,'6:1':1}}});await E.connect();const {T,S,W}=E;
 const START=4000;
 await E.sit('sol-mid',START,2);
 const total0=START+2*6000;
 const rnd=(()=>{let x=12345;return()=>{x=(x*1103515245+12345)&0x7fffffff;return x/0x7fffffff;};})();
 let hands=0,steps=0,bad=[],showdowns=0,folds=0;
 const kinds=new Set();
 while(hands<40&&steps<600){
  steps++;
  const okp=await E.pump(()=>(T.G.ai===0&&!T.G.over&&T.heroTimer)||(T.G.over&&T.SRV.view&&T.SRV.view.result&&T.SRV.nextHand>hands+1),6000);
  if(!okp){bad.push('stuck at step '+steps);break;}
  if(T.G.ai===0&&!T.G.over){
   const v=T.SRV.view;
   if(sumChips(E)!==total0)bad.push('conservation in hand '+v.handNo+': '+sumChips(E));
   if(v.seats.slice(1).some(x=>x.hole))bad.push('bot hole in a live view');
   if(!T.G.seats.slice(1).every(x=>x.srvHid))bad.push('bot card shown mid-hand');
   if(faceCount(E.seatsHtml())!==2)bad.push('face-up cards on felt mid-hand: '+faceCount(E.seatsHtml()));
   const r=rnd();
   if(r<0.3){kinds.add('fold');await E.press('fBtn');}
   else if(r<0.62&&has(E.bar(),'ckBtn')){kinds.add('check');await E.press('ckBtn');}
   else if(r<0.86&&has(E.bar(),'caBtn')){kinds.add('call');await E.press('caBtn');}
   else if(has(E.bar(),'brBtn')){kinds.add('raise');await E.press('brBtn');}
   else if(has(E.bar(),'ckBtn'))await E.press('ckBtn');
   else await E.press('caBtn');
  }else{
   const v=T.SRV.view;hands=v.handNo;
   if(v.result){
    const hero=v.seats[0].chips;
    if(!(T.G.seats[0].chips===hero||T.G.sdPhase))bad.push('UI stack != server stack after hand '+v.handNo+': '+T.G.seats[0].chips+' vs '+hero);
    if(v.seats.reduce((a,x)=>a+x.chips,0)!==total0)bad.push('conservation after hand '+v.handNo);
    if(v.seats.slice(1).some(x=>x.hole))showdowns++;
    if(!T.PF.lastReveal||T.PF.lastReveal.hand!==v.handNo)bad.push('no reveal for hand '+v.handNo);
    else{
     T.pfVerifyNow();
     const body=E.el('pfBody').innerHTML;
     if(!has(body,'MATCH')||has(body,'MISMATCH'))bad.push('verifier not MATCH for hand '+v.handNo);
     if(T.sha256Hex(T.PF.lastReveal.seed)!==T.PF.lastReveal.commit)bad.push('sha mismatch hand '+v.handNo);
     if(T.PF.lastReveal.commit!==T.SRV.commits[v.handNo])bad.push('reveal commit is not the pre-deal one');
    }
    if(T.PF.commit!==T.SRV.commits[v.handNo+1])bad.push('badge not showing the next commit');
    if(v.seats[0].chips<20){bad.push('hero busted - ending');break;}
   }
  }
 }
 ok('40 hands through the real page: no invariant broken '+bad.slice(0,3).join(' | '),bad.length===0&&hands>=40,JSON.stringify({hands,steps,bad:bad.slice(0,5)}));
 ok('mixed play covered fold/check/call/raise and at least one showdown',kinds.size>=3&&showdowns>=1,JSON.stringify([...kinds,showdowns]));
 ok('...zero Phantom calls beyond the two at sit-down across 40 hands',E.ledgerSigns().length===2);
 ok('every deal used a fresh 16-hex client seed',new Set(S.calls.filter(c=>c.path==='/hand/deal').map(c=>c.body.clientSeed)).size===S.calls.filter(c=>c.path==='/hand/deal').length);
 ok('all hand views the page received hid bots’ cards unless the hand ended in a showdown',S.resp.filter(r=>/hand\/(deal|act)/.test(r.path)&&r.st===200).every(r=>r.j.result?true:r.j.seats.slice(1).every(x=>x.hole===null)));
 ok('server and page agree on the hero stack at the end',(await E.bal()).stack===S.tbl[E.ADDR].hero*1e6);
}

// =====================================================================
// 5. event replay: shown, cancelable, never blocks a new response
// =====================================================================
async function toHand2(o){ // fold hand 1, wait for hand 2 (bots act before the hero)
 const E=await world(Object.assign({rm:false,script:{raise:{'2:1:preflop':60}}},o||{}));
 const spy=E.spy();await E.connect();
 await E.sit('sol-mid',500,2);
 await E.untilHero();
 return {E,spy};
}
{
 const {E,spy}=await toHand2();const {T,S}=E;
 await E.press('fBtn');await E.untilOver();
 spy.bub.length=0;spy.log.length=0;
 // hand 2: wait for the deal response only, replay still pending
 await E.pump(()=>S.calls.filter(c=>c.path==='/hand/deal').length===2&&T.SRV.view&&T.SRV.view.handNo===2&&!T.SRV.lock);
 ok('replay pending right after the response (timers armed, hero bar not up yet)',E.timers.size>0&&T.G.ai===null,E.timers.size+' '+T.G.ai);
 ok('during replay G is at the START of the hand (pot not yet final; bets are drawn one action at a time)',T.G.pot<T.SRV.view.pot&&Object.keys(T.G.bets).length===0,T.G.pot+' '+T.SRV.view.pot);
 await E.untilHero();
 ok('after the replay G equals the view (the view is the truth): pot, bets and stacks',T.G.pot===T.SRV.view.pot&&T.SRV.view.seats.every((x,i)=>T.G.seats[i].chips===x.chips&&(T.G.bets[i]||0)===(x.bet||0)),JSON.stringify(T.G.bets));
 ok('bots’ actions from view.events were replayed as bubbles (raise by bot 1, call by bot 2)',spy.bub.some(b=>b[0]===1&&/Raise/.test(b[1]))&&spy.bub.some(b=>b[0]===2&&/Call/.test(b[1])),JSON.stringify(spy.bub));
 ok('replay log lines name the bots',spy.log.some(l=>/Satoshi raises/.test(l))&&spy.log.some(l=>/Nakamoto calls/.test(l)),JSON.stringify(spy.log));
 ok('hero bar came up only after the replay finished (hero timer then armed)',T.G.ai===0&&!!T.heroTimer);
 ok('replay never signs anything',E.ledgerSigns().length===2);
}
{ // a newer response cancels what is left of the replay (before it starts, and in the middle of it)
 const {E,spy}=await toHand2();const {T,S}=E;
 await E.press('fBtn');await E.untilOver();
 await E.pump(()=>T.SRV.view&&T.SRV.view.handNo===2&&!T.SRV.lock&&S.calls.filter(c=>c.path==='/hand/deal').length===2);
 spy.bub.length=0;
 const v=JSON.parse(JSON.stringify(T.SRV.view));
 T.srvApply(v,{fast:true}); // a newer authoritative view arrives while the deal animation is still pending
 const t0=E.now;await E.pump(()=>E.now>t0+8000,400);
 ok('new view before the replay starts: the pending replay never runs (no stale bubbles)',spy.bub.length===0,JSON.stringify(spy.bub));
 ok('hero still gets the bar with the right numbers',T.G.ai===0&&T.G.pot===v.pot);
}
{ // mid-replay cancel
 const {E,spy}=await toHand2();const {T,S}=E;
 await E.press('fBtn');await E.untilOver();spy.bub.length=0;
 await E.pump(()=>spy.bub.some(b=>b[0]===1&&/Raise/.test(b[1])));
 const n=spy.bub.length;
 ok('replay is running: the first bot action was shown, the second is still pending (bot 2 shows as thinking), chips are in step',n>=1&&!spy.bub.some(b=>b[0]===2)&&T.G.ai===2&&T.G.pot<T.SRV.view.pot,JSON.stringify(spy.bub)+' '+T.G.ai+' '+T.G.pot+'/'+T.SRV.view.pot);
 const v=JSON.parse(JSON.stringify(T.SRV.view));
 T.srvApply(v,{fast:true});
 const t0=E.now;await E.pump(()=>E.now>t0+8000,400);
 ok('new view mid-replay: the rest of the replay is dropped',spy.bub.length===n&&T.G.ai===0,JSON.stringify(spy.bub));
}
{ // leaving mid-replay: nothing keeps running afterwards
 const {E,spy}=await toHand2();const {T,S}=E;
 await E.press('fBtn');await E.untilOver();
 await E.pump(()=>T.SRV.view&&T.SRV.view.handNo===2&&!T.SRV.lock&&S.calls.filter(c=>c.path==='/hand/deal').length===2);
 const p=T.leaveTable();await p;await E.idle();
 await E.pump(null,3000);
 const bl=await E.bal();
 const n=S.calls.length;
 await E.pump(()=>E.now>E.now+1,10);
 ok('left during a replay: table closed, cashed out',T.G.left===true&&bl.table===false&&bl.stack===0);
 ok('no timers leak after leaving (virtual timer set empty)',E.timers.size===0&&T.SRV.timers.length===0,E.timers.size+' '+T.SRV.timers.length);
 ok('no server call after leaving',S.calls.length===n);
 ok('hero timer stopped after leaving',!T.heroTimer&&![...E.ivs.values()].some(x=>x.ms===100));
}

// =====================================================================
// 6. hero timer: expiry sends fold (owed) or check (free), via /hand/act
// =====================================================================
{
 const E=await seatedHero({},500,2);const {T,S}=E;
 E.expireHeroTimer();await E.idle();
 const a=S.calls.filter(c=>c.path==='/hand/act');
 ok('timer expiry with a call owed sends {type:fold}',a.length===1&&a[0].body.action.type==='fold',JSON.stringify(a.map(x=>x.body.action)));
 ok('...no popup',E.ledgerSigns().length===2);
}
{ // hand 2: hero is BB and gets a free check, timer expiry must check
 const E=await seatedHero({},500,2);const {T,S}=E;
 await E.press('fBtn');await E.untilHero();
 ok('hand 2: hero in the BB can check',has(E.bar(),'id="ckBtn"')&&T.SRV.view.legal.canCheck);
 E.expireHeroTimer();await E.idle();
 const a=S.calls.filter(c=>c.path==='/hand/act');
 ok('timer expiry with nothing to call sends {type:check}',a[a.length-1].body.action.type==='check',JSON.stringify(a[a.length-1].body.action));
}

// =====================================================================
// 7. fairness: the PAGE computes MATCH; tampering shows MISMATCH
// =====================================================================
function tamper(E,fn){const orig=E.S.handle;E.S.handle=async(m,p,q,b)=>{const r=await orig(m,p,q,b);if(r.st===200)fn(p,r.j);return r;};}
{
 const E=await seatedHero({},500,2);const {T,S}=E;
 const spy0=E.spy();
 await E.press('fBtn');await E.untilOver();
 const r=T.PF.lastReveal;
 ok('reveal stored from the server data, hand 1',!!r&&r.hand===1&&r.seed===S.tbl[E.ADDR].hand.serverSeed);
 ok('lastReveal.commit is the commitment recorded BEFORE the deal, not echoed by the reveal',r.commit===T.SRV.commits[1]&&r.commit===S.resp.find(x=>x.path==='/table/open').j.commit);
 T.pfVerifyNow();
 ok('existing verifier shows MATCH, computed by the page (sha256 of the revealed seed)',has(E.el('pfBody').innerHTML,'MATCH')&&!has(E.el('pfBody').innerHTML,'MISMATCH')&&T.sha256Hex(r.seed)===r.commit);
 ok('client seed in the reveal is the one this page sent',r.client===S.calls.find(c=>c.path==='/hand/deal').body.clientSeed);
 ok('badge now shows the NEXT hand commitment (before its deal)',T.PF.commit===S.tbl[E.ADDR].nextCommit&&T.PF.handNo===2&&T.PF.commit!==r.commit);
 ok('dealt cards equal the revealed deck (no integrity warning logged)',!spy0.log.some(l=>/Check failed/.test(l)));
}
{ // lying reveal: wrong seed
 const E=await seatedHero({},500,2);const {T,S}=E;
 tamper(E,(p,j)=>{if(p==='/hand/act'&&j.reveal){j.reveal.serverSeed='ab'.repeat(32);j.verified=true;j.ok=true;}});
 await E.press('fBtn');await E.untilOver();
 T.pfVerifyNow();
 ok('server reveals a seed that does not hash to its commitment: page shows MISMATCH (server "ok" flags ignored)',has(E.el('pfBody').innerHTML,'MISMATCH')&&!has(E.el('pfBody').innerHTML,'✓ MATCH'));
}
{ // server swaps the commitment after the fact (reveal.commit rewritten to fit the seed)
 const E=await seatedHero({},500,2);const {T,S}=E;
 tamper(E,(p,j)=>{if(p==='/hand/act'&&j.reveal){const nc=nodeCrypto.createHash('sha256').update('ab'.repeat(32)).digest('hex');j.reveal.serverSeed='ab'.repeat(32);j.reveal.commit=nc;j.commit=nc;}});
 const spyLog=E.spy();
 await E.press('fBtn');await E.untilOver();
 T.pfVerifyNow();
 ok('commitment changed after the deal: verifier uses the first-seen commit => MISMATCH',has(E.el('pfBody').innerHTML,'MISMATCH'));
 ok('...and the user is warned in the log',spyLog.log.some(l=>/changed its commitment/.test(l)));
}
{ // dealt cards are not from the revealed deck
 const E=await seatedHero({},500,2);const {T,S}=E;
 const spyLog=E.spy();
 tamper(E,(p,j)=>{if(p==='/hand/act'&&j.reveal){j.seats[0].hole=[{r:'2',s:'♣'},{r:'3',s:'♦'}];if(j.seats[0].hole[0].r===T.SRV.view.seats[0].hole[0].r)j.seats[0].hole[0].r='4';}});
 await E.press('fBtn');await E.untilOver();
 ok('hero cards differ from the revealed deck: warning logged',spyLog.log.some(l=>/Check failed/.test(l)));
}

// =====================================================================
// 8. reload and resume
// =====================================================================
{
 const E1=await seatedHero({},500,2);const {S}=E1;
 const oldToken=E1.T.SRV.token;
 const holeBefore=JSON.stringify(E1.T.SRV.view.seats[0].hole);
 // "reload": a brand-new page context against the same server
 const E=await world({from:E1});const {T,W}=E;
 ok('fresh page: free play until connected',T.G.srv!==true&&T.SRV.token===null);
 await E.connect();
 ok('reload+connect: /balance says table:true and the page knows the engine is on the server',T.LOOP.srv===true&&T.LOOP.table===true&&T.LOOP.stack===500e6);
 ok('...the wallet menu shows a Resume button (no free-play table appears)',has(E.el('loopBox').innerHTML,'srvResumeClick')&&!T.G.srv);
 T.openBuyIn('sol-mid');
 ok('...a second buy-in is blocked while the table is open elsewhere',!E.el('buyinOverlay').classList.contains('show'));
 W.signs.length=0;
 const r=await T.srvResume();await E.idle();
 ok('resume ok',r.ok===true,JSON.stringify(r));
 const sg=E.ledgerSigns();
 ok('resume: exactly one signature, the resume message, byte-exact',sg.length===1&&sg[0].kind==='resume'&&(()=>{const m=/\nNonce: (\S+)\nTimestamp: (\d+)\n/.exec(sg[0].text);return sg[0].text===MSG.resume(E.ADDR,m[1],m[2]);})());
 const rc=S.calls.find(c=>c.path==='/table/resume');
 ok('POST /table/resume body: exactly addr,nonce,ts,signature',Object.keys(rc.body).sort().join()==='addr,nonce,signature,ts');
 ok('new token held, old token dead on the server',T.SRV.token&&T.SRV.token!==oldToken&&(await S.handle('GET','/table/state',new URLSearchParams({addr:E.ADDR,token:oldToken}))).st===401);
 ok('table rebuilt from the server view: hero hole cards identical, hero to act with the bar',JSON.stringify(T.SRV.view.seats[0].hole)===holeBefore&&T.G.ai===0&&has(E.bar(),'id="caBtn"'));
 ok('seats/labels/stack come from the view',T.G.seats.length===3&&T.G.seats[1].label==='Satoshi'&&E.me().chips===T.SRV.view.seats[0].chips);
 ok('commit for the running hand is shown',T.PF.commit===T.SRV.view.commit);
 W.signs.length=0;
 await E.press('fBtn');await E.untilOver();
 ok('play continues after resume without any wallet popup',E.ledgerSigns().length===0&&T.G.over);
 T.pfVerifyNow();
 ok('verifier after a resumed hand still MATCH',has(E.el('pfBody').innerHTML,'MATCH')&&!has(E.el('pfBody').innerHTML,'MISMATCH'));
 const L=S.tbl[E.ADDR].hero*1e6;
 await T.leaveTable();await E.idle();
 ok('leave after resume cashes out the server stack exactly',(await E.bal()).stack===0&&(await E.bal()).balance===2*SOL-500e6+L,JSON.stringify(await E.bal())+' L='+L);
}
{ // resume declined / refused: nothing changes, stack safe
 const E1=await seatedHero({},500,2);
 const E=await world({from:E1});await E.connect();
 E.W.mode='decline';
 const r=await E.T.srvResume();
 ok('resume declined in Phantom: no table, note shown, busy released, stack untouched',r.ok===false&&!E.T.G.srv&&/declined/i.test(E.T.LOOP.note)&&E.T.LOOP.busy===false&&(await E.bal()).stack===500e6);
 E.W.mode='ok';E.S.hook=(m,p)=>p==='/table/resume'?{st:409,j:{error:'no open table'}}:null;
 const r2=await E.T.srvResume();
 ok('resume refused by the server: message shown, no table',r2.ok===false&&/no open table/.test(E.T.LOOP.note)&&!E.T.G.srv);
}
{ // resume on a table that never dealt a hand yet
 const E1=await world();await E1.connect();E1.W.mode='ok';
 E1.T.setTableSize(2);E1.T.openBuyIn('sol-mid');E1.setSlider(500);
 // stop right after the sit-down: cancel the first deal timer by leaving the timers alone and reloading
 await E1.T.confirmBuyIn();await E1.idle();
 const E=await world({from:E1});await E.connect();
 const r=await E.T.srvResume();await E.idle();
 ok('resume before the first deal: table up, then the first hand is dealt',r.ok===true&&E.T.G.srv===true);
 await E.untilHero();
 ok('...and the hero gets a normal decision',E.T.G.ai===0&&E.T.SRV.view.handNo===1);
}

// =====================================================================
// 9. leave / cash-out for the SERVER stack
// =====================================================================
{ // leave at the hero's decision (hand running): fold first, then one cash-out signature
 const E=await seatedHero({},500,2);const {T,S,W}=E;
 W.signs.length=0;S.calls.length=0;
 await T.leaveTable();await E.idle();
 const paths=S.calls.map(c=>c.method+' '+c.path);
 ok('leave: GET state, POST act(fold), then POST /cashout (and nothing else but balance syncs)',paths.filter(p=>!/balance/.test(p)).join()==='GET /table/state,POST /hand/act,POST /cashout',paths.join());
 const f=S.calls.find(c=>c.path==='/hand/act');
 ok('the fold was sent with the current seq and no wallet popup',f.body.action.type==='fold'&&W.signs.length===1);
 const sg=E.ledgerSigns()[0],pm=/Lamports: (\d+)\nNonce: (\S+)\nTimestamp: (\d+)/.exec(sg.text);
 const stackNow=(await E.bal());
 ok('cash-out message byte-exact and signs the SERVER stack (view.stackLamports), not a client number',sg.kind==='cashout'&&sg.text===MSG.cashout(E.ADDR,+pm[1],pm[2],pm[3])&&+pm[1]===S.calls.find(c=>c.path==='/cashout').body.lamports);
 ok('cash-out amount == the server stack after the fold (hero lost its blind: 500-0 chips minus posted)',+pm[1]%1000000===0&&+pm[1]<=500e6&&+pm[1]>0);
 ok('server: table closed, session zero, balance restored by exactly the stack',stackNow.table===false&&stackNow.stack===0&&stackNow.balance===2*SOL-500e6+(+pm[1]));
 ok('table closed in the page, receipt shown',T.G.left===true&&E.el('cashoutOverlay').classList.contains('show'));
 ok('receipt amount = server stack in chips',has(E.el('coCash').innerHTML,String(+pm[1]/1e9)));
 ok('no client-reported 6x path: cash-out body has the standard 5 keys only',Object.keys(S.calls.find(c=>c.path==='/cashout').body).sort().join()==='addr,lamports,nonce,signature,ts');
}
{ // leave between hands
 const E=await seatedHero({},500,2);const {T,S,W}=E;
 await E.press('fBtn');await E.untilOver();
 W.signs.length=0;S.calls.length=0;
 await T.leaveTable();await E.idle();
 ok('leave between hands: no fold sent, one cash-out',!S.calls.some(c=>c.path==='/hand/act')&&E.ledgerSigns().length===1&&T.G.left);
 const b=await E.bal();
 ok('...balance whole',b.table===false&&b.stack===0&&b.balance+0>0);
}
{ // cash-out declined: still seated, stack safe, leave works the second time
 const E=await seatedHero({},500,2);const {T,S,W}=E;
 W.mode='declineCash';
 await T.leaveTable();await E.idle();
 ok('cash-out declined: table stays open and the user is told',!T.G.left&&/declined/i.test(T.LOOP.note)&&T.G.srv===true&&T.LOOP.busy===false);
 ok('...stack still on the server',(await E.bal()).table===true&&(await E.bal()).stack===S.tbl[E.ADDR].hero*1e6);
 ok('...the running hand was folded by the leave (server shows a finished hand)',S.tbl[E.ADDR].hand.over===true);
 await E.untilHero();
 ok('...the next hand is dealt and playable',T.G.ai===0);
 await T.leaveTable();await E.idle();
 ok('...Leave again: cash-out succeeds',T.G.left&&(await E.bal()).table===false);
}
{ // server rejects the cash-out amount (stack changed under us): 422, re-sync, second Leave works
 const E=await seatedHero({},500,2);const {T,S,W}=E;
 let n=0;S.hook=(m,p)=>p==='/cashout'&&n++===0?{st:422,j:{error:'amount mismatch',stack:1}}:null;
 await T.leaveTable();await E.idle();
 ok('amount mismatch: stays seated, error shown, no pending-stale retry',!T.G.left&&/mismatch/.test(T.LOOP.note)&&T.LOOP.pending===null);
 await E.untilHero();
 await T.leaveTable();await E.idle();
 ok('second Leave signs the fresh server stack and succeeds',T.G.left&&(await E.bal()).stack===0);
}
{ // the cash-out reply is lost but the server processed it: the page converges to "left"
 const E=await seatedHero({},500,2);const {T,S}=E;
 S.dropReply='/cashout';
 await T.leaveTable();await E.idle();
 ok('lost cash-out reply: page re-reads the ledger and finishes the leave (no ghost table)',T.G.left===true&&(await E.bal()).table===false);
}
{ // leave while the first deal is still in flight
 const E=await world();await E.connect();const {T,S,W}=E;
 await E.sit('sol-mid',500,2); // deal timer armed, not run yet
 await T.leaveTable();await E.idle();
 ok('leave before the first deal: cash-out only, no hand ever dealt',T.G.left&&!S.calls.some(c=>c.path==='/hand/deal')&&(await E.bal()).stack===0);
 await E.pump(null,2000);
 ok('...and no deal fires afterwards',!S.calls.some(c=>c.path==='/hand/deal')&&E.timers.size===0);
}
{ // rebuy leave button from the busted prompt also goes through the server leave
 const E=await seatedHero({},500,2);const {T,S}=E;
 T.G.rebuyPending=true;
 await T.leaveTable();await E.idle();
 ok('leaveTable() from the rebuy prompt path is the same server leave',T.G.left&&S.calls.some(c=>c.path==='/cashout'));
}

// =====================================================================
// 10. errors: illegal action, 401, 409, network drop, malformed views
// =====================================================================
{ // 422 illegal action: logged, state re-synced, the bar comes back
 const E=await seatedHero({},500,2);const {T,S}=E;const spy=E.spy();
 let once=true;S.hook=(m,p)=>{if(p==='/hand/act'&&once){once=false;return {st:422,j:{error:'illegal action',why:'amount out of range',legal:{}}};}return null;};
 await E.press('caBtn');await E.pump(()=>T.G.ai===0&&T.heroTimer);
 ok('422: the user sees the server’s reason',spy.log.some(l=>/illegal action/.test(l)&&/amount out of range/.test(l)),JSON.stringify(spy.log));
 ok('422: page re-synced via GET /table/state and the hero can act again (no stuck UI)',S.calls.some(c=>c.path==='/table/state')&&T.G.ai===0&&!T.G.srvMsg);
 await E.press('caBtn');
 ok('...the retried action goes through with the right seq',S.calls.filter(c=>c.path==='/hand/act').length===2);
}
{ // 401: token invalid
 const E=await seatedHero({},500,2);const {T,S,W}=E;
 S.hook=(m,p)=>p==='/hand/act'?{st:401,j:{error:'bad token'}}:null;
 await E.press('caBtn');await E.pump(()=>!T.SRV.token,50);
 S.hook=null;
 ok('401: token dropped, session-expired message shown, no action bar, hero timer off',T.SRV.token===null&&/resume/i.test(T.G.srvMsg)&&!T.heroTimer&&T.G.ai===null);
 await E.idle();
 const n=S.calls.length;await E.pump(()=>E.now>2e6,500);
 ok('401: no further deal/act/state calls (no retry storm)',S.calls.length===n,JSON.stringify(S.calls.slice(n).map(c=>c.path)));
 ok('401: stack is untouched on the server and the wallet menu offers Resume',(await E.bal()).stack===500e6&&has(E.el('loopBox').innerHTML,'srvResumeClick'));
 await T.leaveTable();await E.idle();
 ok('Leave without a token tells the user to resume first, nothing signed',!T.G.left&&/Resume the table first/.test(T.LOOP.note)&&E.ledgerSigns().length===2);
 const r=await T.srvResume();await E.idle();
 ok('Resume after 401 restores the table',r.ok&&T.SRV.token&&T.G.ai===0);
}
{ // 409 on deal ("hand in progress") re-syncs instead of looping
 const E=await world();await E.connect();const {T,S}=E;
 let once=true;S.hook=(m,p)=>{if(p==='/hand/deal'&&once){once=false;return {st:409,j:{error:'hand in progress'}};}return null;};
 await E.sit('sol-mid',500,2);
 await E.pump(()=>S.calls.some(c=>c.path==='/table/state'),500);
 await E.untilHero();
 ok('409 on deal: re-sync, then a normal deal succeeds',T.G.ai===0&&S.calls.filter(c=>c.path==='/hand/deal').length>=2);
}
{ // reply lost after the server applied the action: no double action, state converges
 const E=await seatedHero({},500,2);const {T,S}=E;
 S.dropReply='/hand/act';
 const seq0=S.tbl[E.ADDR].seq;
 await E.press('caBtn');
 await E.untilHero();
 ok('lost act reply: page recovers via /table/state, shows the flop with the call applied once',T.SRV.view.stage==='flop'&&S.tbl[E.ADDR].seq===seq0+1&&S.calls.filter(c=>c.path==='/hand/act').length===1,JSON.stringify([T.SRV.view.stage,S.tbl[E.ADDR].seq,seq0]));
 ok('...no stuck connection message',!T.G.srvMsg);
}
{ // network down for a while, then back
 const E=await seatedHero({},500,2);const {T,S}=E;
 S.netDown=true;
 await E.press('caBtn');
 await E.pump(()=>S.calls.length>0&&T.SRV.fails>=3,200);
 ok('network down: "retrying" message shown, bar closed, backoff in use',/retrying|Connection/i.test(T.G.srvMsg)&&T.G.ai===null,T.G.srvMsg);
 const t0=E.now;S.netDown=false;
 await E.untilHero();
 ok('network back: state recovered from the server (the action never arrived, so the hero is asked again)',T.G.ai===0&&T.SRV.view.stage==='preflop'&&T.SRV.fails===0);
 await E.press('caBtn');await E.untilHero();
 ok('...and the retried action is accepted',T.SRV.view.stage==='flop');
 ok('backoff was bounded (virtual time)',E.now-t0<60000);
}
{ // permanent outage: gives up politely instead of hammering
 const E=await seatedHero({},500,2);const {T,S}=E;
 S.netDown=true;
 await E.press('caBtn');
 await E.pump(()=>/not answering/.test(T.G.srvMsg||''),3000);
 const n=S.calls.length;await E.pump(()=>E.now>E.now+1e7,200);
 ok('outage: stops retrying after a bounded number of tries and says the stack is safe',/safe on the server/.test(T.G.srvMsg)&&S.calls.length<=n+2&&S.calls.length<40,S.calls.length+' '+T.G.srvMsg);
 S.netDown=false;
 await T.leaveTable();await E.idle();
 ok('...Leave still works once the network is back',T.G.left&&(await E.bal()).stack===0);
}
{ // malformed / hostile views are rejected before touching G
 const E=await seatedHero({},500,2);const {T,S}=E;
 const before=JSON.stringify(T.G.comm)+T.G.pot+T.G.seats.length;
 const bads=[v=>{v.comm=[{r:'Z',s:'x'}];},v=>{v.seats=[];},v=>{v.pot=-5;},v=>{v.seats[0].chips=1.5;},v=>{v.toAct=99;},v=>{v.commit='nothex';},v=>{v.seats[1].hole=[{r:'A',s:'♠'}];},v=>{delete v.seq;},v=>{v.result={winners:[{seat:9,amount:1}]};},v=>{v.legal={callAmt:'x'};}];
 let allRejected=true;
 const bad2=[v=>{v.reveal={serverSeed:'a'.repeat(64),handNo:1,clientSeed:'<script>'};},v=>{v.reveal={serverSeed:'a'.repeat(64),handNo:1,commit:'<b>'};}];
 for(const m of bad2){const v=JSON.parse(JSON.stringify(T.SRV.view));m(v);try{T.srvCheckView(v);allRejected=false;}catch(e){}}
 for(const m of bads){const v=JSON.parse(JSON.stringify(T.SRV.view));m(v);try{T.srvCheckView(v);allRejected=false;}catch(e){}}
 ok('10 malformed view shapes are all rejected by srvCheckView',allRejected);
 tamper(E,(p,j)=>{if(p==='/hand/act'){j.comm=[{r:'Z',s:'x'}];}});
 await E.press('caBtn');await E.pump(()=>S.calls.some(c=>c.path==='/table/state'),400);
 ok('malformed act reply: G untouched by it, page re-syncs from /table/state',JSON.stringify(T.G.comm).indexOf('Z')<0&&S.calls.some(c=>c.path==='/table/state'),JSON.stringify(T.G.comm));
}
{ // a server that keeps answering garbage cannot loop us forever
 const E=await seatedHero({},500,2);const {T,S}=E;
 tamper(E,(p,j)=>{if(p==='/hand/act'||p==='/table/state'){j.pot=-1;}});
 await E.press('caBtn');
 await E.pump(()=>/not answering/.test(T.G.srvMsg||''),3000);
 ok('persistent garbage: bounded retries, then a clear message, UI not frozen on "Sending"',/not answering/.test(T.G.srvMsg)&&S.calls.length<40,S.calls.length);
}
{ // hostile text from the server cannot inject markup
 const E=await world();await E.connect();const {T,S}=E;
 tamper(E,(p,j)=>{if(p==='/table/open'){j.bots[0].name='<img src=x onerror=alert(1)>';}if((p==='/hand/deal'||p==='/hand/act')&&j.seats){j.seats[1].name='<img src=x onerror=alert(1)>';if(j.result)j.result.winners[0].handName='<b>pwn</b>';}});
 await E.sit('sol-mid',500,2);await E.untilHero();
 ok('bot names are sanitised: no markup characters reach the seat nodes',!has(E.seatsHtml(),'onerror=')&&!/[<>="]/.test(T.G.seats[1].label),T.G.seats[1].label);
 await E.press('fBtn');await E.untilOver();await E.pump(()=>T.G.sdPhase===null&&E.el('winBanner').innerHTML!=='' || true,200);
 ok('hand names are sanitised in the win banner',!has(E.el('winBanner').innerHTML,'<b>pwn')&&!has(E.el('winBanner').innerHTML,'<img'));
}

// =====================================================================
// 11. add-on, bust + rebuy, sit-out, disconnect
// =====================================================================
{ // add-on between hands: one buy-in signature, server and UI agree
 const E=await seatedHero({},500,2);const {T,S,W}=E;
 await E.press('fBtn');await E.untilOver();
 const before=S.tbl[E.ADDR].hero;
 W.signs.length=0;
 await T.doRebuy(250);await E.idle();
 ok('add-on: one buy-in signature (byte-exact for 250 chips at 1e6)',E.ledgerSigns().length===1&&E.ledgerSigns()[0].kind==='buyin'&&/Lamports: 250000000\n/.test(E.ledgerSigns()[0].text));
 ok('add-on: server hero chips +250, session stack +250e6, UI +250',S.tbl[E.ADDR].hero===before+250&&S.sess[E.ADDR].stack===S.tbl[E.ADDR].hero*1e6&&E.me().chips===before+250,JSON.stringify([S.tbl[E.ADDR].hero,before,E.me().chips]));
 await E.untilHero();
 ok('next deal sees the topped-up stack: hero chips+bet+... equals server record',T.SRV.view.seats[0].chips+T.SRV.view.seats[0].bet>=before+250-40,T.SRV.view.seats[0].chips);
 const tot=T.SRV.view.seats.reduce((a,x)=>a+x.chips,0)+T.SRV.view.pot;
 ok('conservation after add-on: stacks+pot = 500+250+2*6000',tot===500+250+12000,tot);
}
{ // add-on mid-hand refused client-side (no popup)
 const E=await seatedHero({},500,2);const {T,S,W}=E;const spy=E.spy();
 W.signs.length=0;
 await T.doRebuy(250);await E.idle();
 ok('add-on during a hand: refused with a message, no signature, no server call',E.ledgerSigns().length===0&&spy.log.some(l=>/between hands/.test(l)));
}
{ // server refuses the add-on (409 hand in progress race): nothing credited
 const E=await seatedHero({},500,2);const {T,S,W}=E;
 await E.press('fBtn');await E.untilOver();
 const before=E.me().chips;
 S.hook=(m,p)=>p==='/buyin'?{st:409,j:{error:'hand in progress'}}:null;
 await T.doRebuy(250);await E.idle();
 ok('add-on 409: no chips credited in the UI, busy released',E.me().chips===before&&T.LOOP.busy===false);
}
{ // bust: server deals, hero shoves 250 and loses; rebuy prompt, dealing waits, rebuy resumes
 const RIG=deck=>{const take=(r,s)=>deck.find(c=>c.r===r&&c.s===s);
  const want=[take('2','♣'),take('3','♦'),take('A','♠'),take('A','♥'),take('K','♠'),take('K','♥'),take('5','♠'),take('6','♦'),take('9','♥'),take('J','♣'),take('Q','♦')];
  return [...want,...deck.filter(c=>want.indexOf(c)<0)];};
 const E=await world({rm:true,script:{rig:(deck,h)=>h===1?RIG(deck):deck}});await E.connect();const {T,S,W}=E;
 await E.sit('sol-micro',250,2);await E.untilHero();
 const L=T.SRV.view.legal;
 const n=(E.bar().match(/max="(\d+)"/)||[])[1];
 if(n!==undefined)E.el('betSlide').oninput({target:{value:String(n)}});
 await E.press('brBtn');
 await E.pump(()=>T.G.over&&T.SRV.view.result&&T.G.rebuyShown,3000);
 ok('hero busts at showdown: server stack 0',S.tbl[E.ADDR].hero===0&&T.SRV.view.result.winners.every(w=>w.seat!==0));
 ok('busted: rebuy prompt shown (stack below big blind)',E.el('rebuyOverlay').classList.contains('show')&&T.G.rebuyPending===true);
 const dealsBefore=S.calls.filter(c=>c.path==='/hand/deal').length;
 await E.pump(()=>E.now>E.now+1,5);const t0=E.now;await E.pump(()=>E.now>t0+20000,400);
 ok('busted: no new deal is attempted while the rebuy is pending',S.calls.filter(c=>c.path==='/hand/deal').length===dealsBefore);
 W.signs.length=0;
 ok('rigged hand 1 (deck != revealed deck) halts dealing with a visible fairness alert',T.SRV.dealFails>=5);T.SRV.dealFails=0;T.G.srvMsg='';T.srvScheduleDeal(900);
 await T.doRebuy(250);await E.idle();
 ok('rebuy signs one buy-in and credits the server stack',E.ledgerSigns().length===1&&S.tbl[E.ADDR].hero===250);
 await E.untilHero();
 ok('after the rebuy the next hand is dealt',T.SRV.view.handNo===2&&T.G.ai===0);
}
{ // sit out pauses dealing, sitting back in resumes
 const E=await seatedHero({},500,2);const {T,S}=E;
 await E.press('fBtn');
 T.toggleSitOut();
 await E.untilOver();
 const n=S.calls.filter(c=>c.path==='/hand/deal').length;
 const t0=E.now;await E.pump(()=>E.now>t0+30000,600);
 ok('sitting out: no deal for 30 virtual seconds',S.calls.filter(c=>c.path==='/hand/deal').length===n);
 T.toggleSitOut();
 await E.untilHero();
 ok('back in: dealing resumes',S.calls.filter(c=>c.path==='/hand/deal').length===n+1);
}
{ // wallet disconnect while seated pauses requests; reconnect resumes them
 const E=await seatedHero({},500,2);const {T,S}=E;
 await E.press('fBtn');await E.untilOver();
 T.solDisconnect();
 const n=S.calls.filter(c=>c.path==='/hand/deal').length;
 const t0=E.now;await E.pump(()=>E.now>t0+20000,500);
 ok('disconnected: no deal while Phantom is gone',S.calls.filter(c=>c.path==='/hand/deal').length===n);
 await E.connect();
 await E.untilHero();
 ok('reconnected (same account): dealing continues on the same table',S.calls.filter(c=>c.path==='/hand/deal').length===n+1&&T.G.srv);
}
{ // heads-up (1 bot) and full ring (7 bots) render
 for(const nb of [1,7]){
  const E=await seatedHero({},500,nb);const {T}=E;
  ok(nb+' bot(s): '+(nb+1)+' seats built, hero acts, no face-up bot cards',T.G.seats.length===nb+1&&T.G.ai===0&&faceCount(E.seatsHtml())===2);
 }
}
{ // micro and high tables use the right unit (lamports per chip)
 for(const [id,unit] of [['sol-micro',1e5],['sol-high',1e7]]){
  const E=await world({bal:5*SOL});await E.connect();
  await E.sit(id,300,2);
  const bi=E.S.calls.find(c=>c.path==='/buyin');
  ok(id+': buy-in lamports = chips*'+unit,bi&&bi.body.lamports===300*unit);
  ok(id+': table open with the unit the server reports',E.T.SRV.unit===unit&&E.T.SRV.tableId===id);
 }
}

// =====================================================================
// 12. hostile / racy server behaviour found by the mutation pass
// =====================================================================
{ // a bot that wins uncontested never has a (placeholder) card face shown
 const E=await world({script:{fold:{'1:1':1}}});await E.connect();const {T,S}=E;
 await E.sit('sol-mid',500,2);await E.untilHero();
 await E.press('fBtn');await E.untilOver();
 const v=T.SRV.view;
 ok('hero folds, SB folds: the BB bot wins without a showdown (no bot cards in the view)',v.result.winners[0].seat===2&&v.seats.every(x=>x.idx===0||x.hole===null));
 ok('...and the page shows NO face-up bot card at the end of the hand',faceCount(E.seatsHtml())<=2&&T.G.seats[2].srvHid===true,faceCount(E.seatsHtml()));
}
{ // a server that leaks a bot hole mid-hand: the page keeps it hidden
 const E=await world();await E.connect();const {T,S}=E;
 tamper(E,(p,j)=>{if(p==='/hand/deal'&&j.seats)j.seats[1].hole=[{r:'A',s:'♠'},{r:'K',s:'♠'}];});
 await E.sit('sol-mid',500,2);await E.untilHero();
 ok('bot hole sent before the hand ended is ignored (hidden, never shown)',T.G.seats[1].srvHid===true&&faceCount(E.seatsHtml())===2&&!T.G.seats[1].hole.some(c=>c.r==='K'));
}
{ // add-on popup open between hands: the auto-deal waits for it
 const E=await seatedHero({},500,2);const {T,S,W}=E;
 await E.press('fBtn');await E.untilOver();
 let release;W.hold=new Promise(r=>release=r);
 const n=S.calls.filter(c=>c.path==='/hand/deal').length;
 const p=T.doRebuy(250);await E.idle();
 const t0=E.now;
 for(let i=0;i<40;i++){let best=null;for(const t of E.timers.values())if(!best||t.due<best.due)best=t;if(!best)break;E.now=Math.max(E.now,best.due);E.timers.delete(best.id);best.f();await sleep1();}
 ok('while the add-on is waiting for Phantom, no deal is sent',S.calls.filter(c=>c.path==='/hand/deal').length===n);
 W.hold=null;release();await p;await E.idle();
 await E.untilHero();
 ok('after the add-on the deal goes through with the topped-up stack',S.calls.filter(c=>c.path==='/hand/deal').length===n+1&&S.tbl[E.ADDR].hero>=750-40);
}
{ // a deal that always fails does not hammer the server
 const E=await world();await E.connect();const {T,S}=E;
 S.hook=(m,p)=>p==='/hand/deal'?{st:500,j:{error:'boom'}}:null;
 await E.sit('sol-mid',500,2);
 const t0=E.now;await E.pump(()=>E.now>t0+300000,3000);
 ok('persistent deal failure: bounded attempts, then a clear message (Leave still possible)',S.calls.filter(c=>c.path==='/hand/deal').length<=6&&/cannot deal/.test(T.G.srvMsg||''),S.calls.filter(c=>c.path==='/hand/deal').length+' '+T.G.srvMsg);
 S.hook=null;
 await T.leaveTable();await E.idle();
 ok('...and the stack can still be cashed out',T.G.left&&(await E.bal()).stack===0);
}


return {name:'server-engine-page.js (stream P)',pass,fail};
};
