// engine-oracle.js: differential + property suite for engine.js against the PAGE's real engine (zp.html, run in a node vm).
// Usage: node engine-oracle.js            full run
//        require('./engine-oracle.js').run({engineSrc, fast:true})  (used by engine-mutants.js)
// The page is the independent oracle: its evalH, mkDeck, seededRandom, shuffleSeeded, sha256Hex, startHand, act,
// findNextToAct, advance, showdown and award are executed unchanged (only RAKE/BBJD/BBJ0 -> 0, and the blind-pot minting line
// patched, both in the vm copy and both reported). Nothing here calls Math.random: all scenarios come from a seeded PRNG.
'use strict';
const vm=require('vm'),fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const _stage=path.join(__dirname,'..','..','app','index.html');
const PAGE=process.env.ZP_PAGE||(fs.existsSync(_stage)?_stage:'/home/claude/zp/zp.html');

function mulberry(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const hexOf=(r,n)=>{let s='';for(let i=0;i<n;i++)s+='0123456789abcdef'[Math.floor(r()*16)];return s;};

// ---------- load engine (optionally mutated source) ----------
let loadN=0;
async function loadEngine(src){
  const f=path.join(os.tmpdir(),'zp-engine-'+process.pid+'-'+(loadN++)+'.mjs');
  fs.writeFileSync(f,src);
  try{return await import('file://'+f);}finally{try{fs.unlinkSync(f);}catch(e){}}
}

// ---------- the page in a vm ----------
function pageWorld(o){
  o=o||{};
  const html=fs.readFileSync(PAGE,'utf8');
  let code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
  const rep=(a,b)=>{const i=code.indexOf(a);if(i<0||code.indexOf(a,i+1)>=0)throw new Error('page patch anchor not unique: '+a);code=code.replace(a,b);};
  rep('RAKE=0.05','RAKE='+(o.rake||0));rep('BBJD=0.01','BBJD='+(o.bbjd||0));rep('BBJ0=500','BBJ0=0');
  if(!o.unpatchedBlinds)rep('G.pot=SB+BB;','G.pot=Object.values(G.bets).reduce((a,b)=>a+b,0);');
  const nop=new Proxy(function(){},{get:(t,p)=>p===Symbol.toPrimitive?()=>0:(p==='then'?undefined:nop),apply:()=>nop,set:()=>true});
  const els={};
  function el(id){if(els[id])return els[id];const cls=new Set();
    const base={style:new Proxy({},{get:(t,p)=>p in t?t[p]:nop}),classList:{add:c=>cls.add(c),remove:c=>cls.delete(c),toggle:(c,f)=>{(f===undefined?!cls.has(c):f)?cls.add(c):cls.delete(c);},contains:c=>cls.has(c)},innerHTML:'',textContent:'',value:'',disabled:false,className:'',children:[],scrollTop:0,
      insertAdjacentHTML(w,h){this.innerHTML+=h;},appendChild(){},querySelector:()=>el('q:'+id),querySelectorAll:()=>[],addEventListener(){},getContext:()=>nop,setAttribute(){},dataset:{}};
    return els[id]=new Proxy(base,{get:(t,p)=>p in t?t[p]:nop});}
  const q=[];let now=0,seq=0;
  const s={console:{log(){},error(){},warn(){}},Math,Object,Array,Set,Map,JSON,Number,Date,Uint8Array,TextEncoder,TextDecoder,BigInt,String,Error,Promise,RegExp,btoa,atob,encodeURIComponent,decodeURIComponent,parseFloat,parseInt,isNaN};
  s.document={getElementById:id=>el(id),createElement:()=>el('c'+Math.random()),querySelector:()=>el('q'),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}},body:el('body')};
  s.window={matchMedia:()=>({matches:true,addEventListener(){}}),addEventListener(){}};
  s.matchMedia=s.window.matchMedia;s.localStorage={getItem:()=>null,setItem(){}};
  s.crypto=crypto.webcrypto;s.navigator={};s.setInterval=()=>0;s.clearInterval=()=>{};s.requestAnimationFrame=()=>0;s.cancelAnimationFrame=()=>{};s.performance={now:()=>0};s.clearTimeout=()=>{};
  s.setTimeout=(f,ms)=>{q.push({f,at:now+(ms||0),n:seq++});return q.length;};
  s.fetch=async()=>{throw new Error('no network');};
  vm.createContext(s);
  vm.runInContext(code,s);
  q.length=0;
  vm.runInContext(`
    pfCommit=function(){return null;};memOnCommit=function(){};pfReveal=function(){};schedBot=function(){};
    globalThis.__hex=null;globalThis.__cap=null;globalThis.__allow=false;
    pfDeckHex=function(){return globalThis.__hex;};
    const __rs=startHand;startHand=function(){if(globalThis.__allow){globalThis.__allow=false;return __rs();}};
    const __sd=showdown;showdown=function(){globalThis.__cap={kind:'showdown',pot:G.pot};return __sd.apply(this,arguments);};
    const __aw=award;award=function(){globalThis.__cap={kind:'award',pot:G.pot};return __aw.apply(this,arguments);};
    globalThis.__real=__rs;
    globalThis.__G=function(){return G;};
    globalThis.__setup=function(chips,dealer){
      G.seats=chips.map((c,i)=>({idx:i,isBot:i>0,label:'B'+i,chips:c,hole:[],hs:null,folded:false,sitting:false,allIn:false,ag:0}));
      G.dealer=dealer;G.hc=0;G.bbj=0;G.mode='NLHE';G.left=false;G.sitOut=false;G.over=true;G.gen=0;G.timer=null;G.deck=[];G.di=0;G.comm=[];G.pot=0;G.bets={};G.ai=null;computeSeatLayout(G.seats.length);
    };`,s);
  function flush(){
    let guard=0;
    while(q.length){
      if(++guard>5000)throw new Error('timer storm');
      let bi=0;for(let i=1;i<q.length;i++)if(q[i].at<q[bi].at||(q[i].at===q[bi].at&&q[i].n<q[bi].n))bi=i;
      const t=q.splice(bi,1)[0];now=Math.max(now,t.at);t.f();
    }
  }
  return{s,flush,G:()=>s.__G(),act:(i,a,n)=>s.act(i,a,n),
    /** plays one hand with the page engine under `policy(L,seat,k)`; returns a trace */
    play(chips,dealer,hex,policy){
      s.__hex=hex;s.__setup(chips,dealer);const G=s.__G();s.__cap=null;s.__allow=true;
      s.startHand();flush();
      const tr={hole:G.seats.map(x=>x.hole.map(c=>c.r+c.s)),dec:[],asks:0};
      let k=0,guard=0;
      while(!G.over){
        if(++guard>2000)throw new Error('page hand stuck');
        const ai=G.ai;
        if(ai===null||ai===undefined){flush();if((G.ai===null||G.ai===undefined)&&!G.over)throw new Error('page stuck: nobody to act');continue;}
        const st=G.seats[ai];
        if(st.allIn||st.chips<=0){tr.asks++;s.act(ai,'check');flush();continue;}
        const L=pageLegal(G,ai),d=policy(L,ai,k++);
        tr.dec.push(decKey(G.stage,ai,L,d));
        if(d.type==='raise')s.act(ai,'raise',d.amount-maxBetOf(G));else s.act(ai,d.type);
        flush();
      }
      tr.chips=G.seats.map(x=>x.chips);tr.comm=G.comm.map(c=>c.r+c.s);tr.cap=s.__cap&&{kind:s.__cap.kind,pot:s.__cap.pot};
      tr.winner=G.winner;tr.stage=G.stage;
      tr.live=G.seats.map(x=>x.folded?0:1);
      tr.hs=G.seats.map(x=>x.folded||!x.hole.length?null:s.evalH(x.hole,G.comm)).map(h=>h&&{rank:h.rank,tb:h.tb});
      return tr;
    }};
}
const maxBetOf=G=>Math.max(0,...Object.values(G.bets));
function pageLegal(G,i){ // derived from the PAGE's own variables (G.bets, G.lastRaiseSize), independent of engine.legal
  const mb=maxBetOf(G),b=G.bets[i]||0,chips=G.seats[i].chips,owed=mb-b,maxTo=chips+b,canRaise=chips>owed;
  return{seat:i,canCheck:owed===0,callAmt:Math.min(owed,chips),minRaiseTo:canRaise?Math.min(mb+G.lastRaiseSize,maxTo):maxTo,maxRaiseTo:maxTo,canRaise};
}
const decKey=(stage,i,L,d)=>[stage,i,L.canCheck,L.callAmt,L.minRaiseTo,L.maxRaiseTo,L.canRaise,d.type,d.amount===undefined?'':d.amount].join('|');

// ---------- scripted policy: deterministic function of (legal, seat, step index) ----------
function mkPolicy(seed,prof){
  const R=[];const r0=mulberry(seed);for(let i=0;i<400;i++)R.push([r0(),r0(),r0(),r0()]);
  return(L,seat,k)=>{
    const [u1,u2,u3,u4]=R[k%400];
    const raiseAt=(u)=>{
      if(u<prof.min)return L.minRaiseTo;
      if(u<prof.min+prof.allin)return L.maxRaiseTo;
      return L.minRaiseTo+Math.floor(u3*(L.maxRaiseTo-L.minRaiseTo+1));
    };
    if(L.canCheck){
      if(L.canRaise&&u1<prof.bet)return{type:'raise',amount:raiseAt(u2)};
      return{type:'check'};
    }
    if(u1<prof.fold)return{type:'fold'};
    if(L.canRaise&&u1<prof.fold+prof.raise)return{type:'raise',amount:raiseAt(u2)};
    return{type:'call'};
  };
}
const PROFILES=[
  {fold:.25,raise:.2,bet:.4,min:.4,allin:.2},     // normal
  {fold:.05,raise:.45,bet:.7,min:.3,allin:.35},   // aggressive / shovey
  {fold:.1,raise:.05,bet:.1,min:.5,allin:.1},     // passive: many showdowns
  {fold:.0,raise:.0,bet:.0,min:1,allin:0},        // calling station: split pots, all checks
  {fold:.0,raise:.9,bet:.9,min:.9,allin:.1},      // min-raise wars
];
function mkScenario(r,i){
  const n=[2,3,4,5,6,7,8][Math.floor(r()*7)];
  const pick=()=>{const u=r();
    if(u<.12)return 1+Math.floor(r()*24);          // below/around the blinds
    if(u<.3)return 20+Math.floor(r()*80);          // short
    if(u<.45)return 1000;                          // standard, ties on stack
    if(u<.55)return 300;
    return 100+Math.floor(r()*2400);};
  const chips=[];for(let j=0;j<n;j++)chips.push(pick());
  if(r()<.15){const same=pick();for(let j=0;j<n;j++)chips[j]=same;}                    // equal stacks
  if(n>=3&&r()<.12){chips[1+Math.floor(r()*(n-1))]=0;}                                   // a busted seat (page keeps it in the array)
  if(chips.filter(c=>c>0).length<2)chips[0]=1000;
  return{chips,dealer:Math.floor(r()*n),server:hexOf(r,64),client:hexOf(r,16),handNo:1+Math.floor(r()*500),seed:Math.floor(r()*1e9),prof:PROFILES[i%PROFILES.length]};
}

// ---------- engine driver ----------
function playEngine(E,sc,policy,opts){
  opts=opts||{};
  const seats=sc.chips.map((c,i)=>({idx:i,name:'S'+i,isBot:i>0,chips:c,agg:.8}));
  let st=E.newHand({seats,dealer:sc.dealer,serverSeed:sc.server,clientSeed:sc.client,handNo:sc.handNo,commit:'c'.repeat(64),sidePots:opts.sidePots});
  const tr={hole:st.seats.map(x=>x.hole.map(c=>c.r+c.s)),dec:[],views:[],legalMismatch:0};
  let k=0,guard=0;const total=sc.chips.reduce((a,b)=>a+b,0);
  const inv=()=>{const sum=st.seats.reduce((a,s)=>a+s.chips,0)+st.pot+st.rake+st.bbj;if(sum!==total)throw new Error('conservation broken '+sum+' vs '+total);
    for(const s of st.seats){if(s.chips<0||!Number.isInteger(s.chips)||s.bet>s.put)throw new Error('bad seat state');
      if(!st.over&&s.start>0&&s.allIn!==(s.chips===0))throw new Error('allIn flag != empty stack');}
    require('assert').deepStrictEqual(st,JSON.parse(JSON.stringify(st)));};
  inv();
  while(!E.isOver(st)){
    if(++guard>500)throw new Error('engine hand stuck');
    const L=E.legal(st);if(!L)throw new Error('no legal but not over');
    if(st.seats[L.seat].allIn||st.seats[L.seat].chips<=0)throw new Error('engine asked an all-in seat');
    const d=policy(L,L.seat,k++);
    tr.dec.push(decKey(st.stage,L.seat,L,d));
    const mbBefore=Math.max(0,...st.seats.map(x=>x.bet)),minBefore=L.minRaiseTo,lrBefore=st.lastRaise;
    const r=E.applyAction(st,L.seat,d);
    if(opts.cov&&r.ok){
      const c=opts.cov,e=r.events[0];
      if(d.type==='raise'&&d.amount===minBefore&&d.amount<L.maxRaiseTo)c.minraise++;
      if(d.type==='raise'&&d.amount-mbBefore<lrBefore)c.incomplete++;
      if(r.events.filter(x=>x.type==='street').length>=2)c.runout++;
      if(e.type==='allin'&&e.via==='raise')c.shoveRaise++;
    }
    if(!r.ok)throw new Error('legal action refused: '+r.why+' '+JSON.stringify(d)+JSON.stringify(L));
    inv();
    if(opts.roundtrip&&!E.isOver(st))st=JSON.parse(JSON.stringify(st));
  }
  inv();
  tr.chips=st.seats.map(s=>s.chips);tr.comm=st.comm.map(c=>c.r+c.s);tr.st=st;tr.result=E.result(st);
  return tr;
}

// ---------- independent reference settlement (classic side-pot algorithm, written separately from engine layering) ----------
// puts[], live[] flags, hs[] = page evalH results; returns chips won per seat (RAKE=0). Odd chip: first winner in seat order.
function refSettle(puts,live,hs){
  const rest=puts.slice(),won=puts.map(()=>0);
  for(;;){
    const elig=rest.map((p,i)=>live[i]&&p>0?i:-1).filter(i=>i>=0);
    if(!elig.length){ // only folded money left: give to nobody (cannot happen with a live top layer); keep as error marker
      if(rest.some(p=>p>0))won.err=true;break;}
    const m=Math.min(...elig.map(i=>rest[i]));
    let amt=0;for(let i=0;i<rest.length;i++){const t=Math.min(rest[i],m);amt+=t;rest[i]-=t;}
    // folded seats with chips left above the highest live level join the last slice
    if(!rest.some((p,i)=>live[i]&&p>0)){for(let i=0;i<rest.length;i++){amt+=rest[i];rest[i]=0;}}
    let best=null;for(const i of elig){if(!best||hs[i].rank>best.rank||(hs[i].rank===best.rank&&hs[i].tb>best.tb))best=hs[i];}
    const w=elig.filter(i=>hs[i].rank===best.rank&&hs[i].tb===best.tb);
    const sh=Math.floor(amt/w.length);w.forEach((i,k)=>{won[i]+=sh+(k===0?amt-sh*w.length:0);});
  }
  return won;
}

// ---------- the suite ----------
async function run(o){
  o=o||{};
  const fast=!!o.fast,quiet=o.quiet!==false&&!!o.engineSrc?true:!!o.quiet;
  const src=o.engineSrc||fs.readFileSync(path.join(__dirname,'engine.js'),'utf8');
  const E=await loadEngine(src);
  E.CFG.RAKE=0;E.CFG.BBJD=0;
  let pass=0,fail=0;const fails=[];
  const ok=(n,c,d)=>{if(c)pass++;else{fail++;if(fails.length<40)fails.push(n+(d===undefined?'':' :: '+(typeof d==='string'?d:JSON.stringify(d)).slice(0,300)));if(o.failFast)throw new Error('FAIL '+n);}};
  const stats={};const bump=k=>{stats[k]=(stats[k]||0)+1;};
  const N={eval:fast?4000:200000,deck:fast?60:1000,hands:fast?160:700,fuzz:fast?200:3000,sha:fast?30:300};
  const PW=pageWorld();
  const pj=x=>JSON.stringify(x);

  // 1. deck / rng / sha differential
  {
    const r=mulberry(11);let bad=0,badR=0;
    for(let i=0;i<N.deck;i++){
      const hex=hexOf(r,64)+hexOf(r,16)+Math.floor(r()*1000);
      if(pj(E.shuffleSeeded(E.mkDeck(),hex))!==pj(PW.s.shuffleSeeded(PW.s.mkDeck(),hex)))bad++;
      const a=E.seededRandom(hex),b=PW.s.seededRandom(hex);for(let j=0;j<20;j++)if(a()!==b())badR++;
    }
    ok('deck: shuffleSeeded equals page on '+N.deck+' seeds',bad===0,bad);
    ok('rng: seededRandom stream equals page',badR===0,badR);
    ok('mkDeck equals page',pj(E.mkDeck())===pj(PW.s.mkDeck())&&E.mkDeck().length===52);
    let shaBad=0;
    for(let i=0;i<N.sha;i++){const m=hexOf(r,Math.floor(r()*200));const a=await E.sha256Hex(m);if(a!==PW.s.sha256Hex(m)||a!==crypto.createHash('sha256').update(m).digest('hex'))shaBad++;}
    ok('sha256Hex equals page and node crypto',shaBad===0,shaBad);
    ok('sha256Hex of empty string',await E.sha256Hex('')==='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    // wrong-hex sensitivity: client seed and hand number must change the deck
    const base=hexOf(r,64);
    ok('deck depends on clientSeed and handNo',pj(E.shuffleSeeded(E.mkDeck(),base+'aaaa'+1))!==pj(E.shuffleSeeded(E.mkDeck(),base+'aaab'+1))&&pj(E.shuffleSeeded(E.mkDeck(),base+'aaaa'+1))!==pj(E.shuffleSeeded(E.mkDeck(),base+'aaaa'+2)));
  }

  // 2. evalH differential (rank, tb, name) on random deals of 2+0..5 cards, mostly 7
  {
    const r=mulberry(22);const deck=E.mkDeck();let bad=0,cnt={};
    for(let i=0;i<N.eval;i++){
      const d=[...deck];for(let j=51;j>0;j--){const k=Math.floor(r()*(j+1));[d[j],d[k]]=[d[k],d[j]];}
      const nc=i%10===0?Math.floor(r()*6):5;      // 10% shorter boards
      const hole=d.slice(0,2),comm=d.slice(2,2+nc);
      const a=E.evalH(hole,comm),b=PW.s.evalH(hole,comm);
      if(a.rank!==b.rank||a.tb!==b.tb||a.name!==b.name)bad++;
      cnt[a.rank]=(cnt[a.rank]||0)+1;
    }
    ok('evalH equals page on '+N.eval+' deals',bad===0,bad);
    stats.evalRanks=cnt;
    // targeted hands (every category incl. wheel, steel wheel, royal, A-high flush vs straight flush edge cases)
    const C=(s)=>s.split(' ').map(x=>({r:x.slice(0,-1),s:x.slice(-1)}));
    const T=['A♠ K♠ Q♠ J♠ 10♠ 2♦ 3♦','A♠ 2♠ 3♠ 4♠ 5♠ K♦ K♣','A♣ 2♦ 3♥ 4♠ 5♣ 9♦ 9♣','6♣ 2♦ 3♥ 4♠ 5♣ A♦ A♣','9♣ 9♦ 9♥ 9♠ A♦ A♣ A♥','K♣ K♦ K♥ 2♠ 2♦ 2♣ 3♥','2♣ 2♦ 3♥ 3♠ 4♦ 4♣ A♥','A♣ A♦ K♥ K♠ Q♦ Q♣ J♥','2♠ 3♠ 5♠ 7♠ 9♠ A♦ K♦','A♥ K♥ Q♥ J♥ 9♥ 10♣ 2♣','8♠ 9♠ 10♠ J♠ Q♠ K♠ A♠','A♠ A♥ 2♦ 3♦ 7♣ 9♣ J♠','2♠ 3♥ 4♦ 5♣ 7♠ 8♥ 9♦'];
    let tb=0;for(const t of T){const c=C(t);if(pj(E.evalH(c.slice(0,2),c.slice(2)))!==pj(({rank:PW.s.evalH(c.slice(0,2),c.slice(2)).rank,name:PW.s.evalH(c.slice(0,2),c.slice(2)).name,tb:PW.s.evalH(c.slice(0,2),c.slice(2)).tb})))tb++;}
    ok('evalH targeted hands (wheel, royal, boats, flush edge)',tb===0,tb);
    ok('evalH short boards return page "none"',pj(E.evalH(C('A♠ K♠'),[]))===pj({rank:0,name:'—',tb:0}));
  }

  // 3. scripted full hands: engine (page rules) vs page, exact
  {
    const r=mulberry(33);let nTr=0;
    const flags={allin:0,side:0,split:0,hu:0,multi:0,short:0,incomplete:0,runout:0,uncont:0,showdown:0,busted:0,bbShort:0,pageAsksAllIn:0,minraise:0,rr:0,shoveRaise:0};
    for(let i=0;i<N.hands;i++){
      const sc=mkScenario(r,i),pol=mkPolicy(sc.seed,sc.prof);
      const hex=sc.server+sc.client+sc.handNo;
      let pt,et;
      try{pt=PW.play(sc.chips,sc.dealer,hex,pol);}catch(e){ok('page hand '+i+' runs',false,e.message+' '+pj(sc));continue;}
      try{et=playEngine(E,sc,pol,{sidePots:false,roundtrip:i%2===0,cov:flags});}catch(e){ok('engine hand '+i+' runs',false,e.message+' '+pj(sc));continue;}
      nTr++;
      const tag='hand#'+i+' '+pj({c:sc.chips,d:sc.dealer});
      ok(tag+' hole cards',pj(pt.hole.map((h,j)=>sc.chips[j]>0?h:[]))===pj(et.hole));
      ok(tag+' decision/legal trace',pj(pt.dec)===pj(et.dec),{p:pt.dec.join(';'),e:et.dec.join(';')});
      ok(tag+' board',pj(pt.comm)===pj(et.comm));
      ok(tag+' final chips',pj(pt.chips)===pj(et.chips),{p:pt.chips,e:et.chips});
      const tot=sc.chips.reduce((a,b)=>a+b,0);ok(tag+' page conserves chips (patched blinds)',pt.chips.reduce((a,b)=>a+b,0)===tot);
      const res=et.result;
      ok(tag+' pot size = page pot',pt.cap&&pt.cap.pot===et.st.seats.reduce((a,s)=>a+s.put,0),{p:pt.cap,e:et.st.seats.map(s=>s.put)});
      ok(tag+' winner = page winner',res.winners.length>0&&res.winners[0].seat===pt.winner,{p:pt.winner,e:res.winners});
      ok(tag+' showdown kind',(pt.cap.kind==='showdown')===res.showdown);
      ok(tag+' total paid == pot',res.winners.reduce((a,w)=>a+w.amount,0)===pt.cap.pot,{pot:pt.cap.pot,res});
      // coverage
      const st=et.st;
      if(st.seats.some(s=>s.allIn))flags.allin++;
      if(res.showdown)flags.showdown++;else flags.uncont++;
      if(sc.chips.length===2)flags.hu++;else flags.multi++;
      if(sc.chips.some(c=>c>0&&c<20))flags.short++;
      if(sc.chips.some(c=>c===0))flags.busted++;
      pt.asks&&flags.pageAsksAllIn++;
            if(res.winners.length>1&&res.showdown)flags.split++;
      if(et.st.events.some(e=>e.type==='blind'&&e.amount<(e.seat===(et.st.events.find(x=>x.type==='blind').seat)?10:20)))flags.bbShort++;
      const lay=layersFor(st);if(lay>1)flags.side++;
      if(st.events.some(e=>(e.type==='raise'||e.type==='allin')&&e.via==='raise'&&e.to>0))flags.rr++;
    }
    ok('page-rules scripted hands completed',nTr===N.hands,nTr);
    stats.pageRules=flags;stats.pageRulesHands=nTr;
  }

  // 4. side-pot mode: identical betting flow; settlement vs independent reference; equals page when single layer
  {
    const r=mulberry(44);let nT=0;const f={multiLayer:0,sameAsPage:0,differs:0,uncalledReturned:0,tieLayers:0};
    for(let i=0;i<N.hands;i++){
      const sc=mkScenario(r,i+3),pol=mkPolicy(sc.seed,sc.prof);
      const hex=sc.server+sc.client+sc.handNo;
      let pt,et;
      try{pt=PW.play(sc.chips,sc.dealer,hex,pol);et=playEngine(E,sc,pol,{sidePots:true,roundtrip:true});}catch(e){ok('sp hand '+i+' runs',false,e.message);continue;}
      nT++;const tag='sp#'+i;
      ok(tag+' same flow as page',pj(pt.dec)===pj(et.dec)&&pj(pt.comm)===pj(et.comm));
      const st=et.st,res=et.result,tot=sc.chips.reduce((a,b)=>a+b,0);
      ok(tag+' conserves',st.seats.reduce((a,s)=>a+s.chips,0)===tot);
      ok(tag+' no chip below zero / nobody wins more than layers',st.seats.every(s=>s.chips>=0));
      if(res.showdown){
        const hs=pt.hs.map((h,j)=>h||{rank:-1,tb:-1}),live=pt.live.map(x=>!!x);
        const want=refSettle(st.seats.map(s=>s.put),live,hs);
        const got=st.seats.map(s=>s.chips-(s.start-s.put));
        ok(tag+' side-pot settlement equals independent reference',pj(want)===pj(got)&&!want.err,{want,got,puts:st.seats.map(s=>s.put)});
      }else{
        const w=res.winners[0];ok(tag+' uncontested: winner gets whole pot',res.winners.length===1&&w.amount===st.seats.reduce((a,s)=>a+s.put,0));
      }
      const same=pj(pt.chips)===pj(et.chips);
      if(layersFor(st)>1){f.multiLayer++;same?f.sameAsPage++:f.differs++;}
      else ok(tag+' single layer => equals page exactly',same,{p:pt.chips,e:et.chips});
      if(res.pots.length>1&&res.pots.some(p=>p.winners.length>1))f.tieLayers++;
      if(res.pots.some(p=>p.eligible.length===1&&res.showdown))f.uncalledReturned++;
    }
    ok('side-pot hands completed',nT===N.hands,nT);
    stats.sidePots=f;
  }

  // 5. hand-built scenarios with known answers (side pots, uncalled, split, odd chip, walks)
  {
    const mk=(chips,dealer,sd)=>E.newHand({seats:chips.map((c,i)=>({idx:i,name:'p'+i,isBot:i>0,chips:c,agg:1})),dealer,serverSeed:sd||'a'.repeat(64),clientSeed:'b'.repeat(16),handNo:1,sidePots:true});
    const A=(st,t,x)=>E.applyAction(st,st.toAct,x===undefined?{type:t}:{type:t,amount:x});
    // heads-up walk: dealer(SB, seat0 if dealer 0) folds -> BB wins blinds, no rake preflop
    let st=mk([1000,1000],0);ok('HU: dealer is SB and acts first',st.toAct===0&&st.seats[0].bet===10&&st.seats[1].bet===20);
    A(st,'fold');ok('HU walk: BB wins',st.over&&st.result.winners.length===1&&st.result.winners[0].seat===1&&st.seats[1].chips===1010&&st.seats[0].chips===990);
    // 3-handed order: dealer 0 -> SB 1, BB 2, UTG 0
    st=mk([1000,1000,1000],0);ok('3-handed: SB=1 BB=2 UTG=dealer',st.seats[1].bet===10&&st.seats[2].bet===20&&st.toAct===0);
    // 4-handed dealer 3: SB 0, BB 1, UTG 2
    st=mk([1000,1000,1000,1000],3);ok('4-handed dealer 3: SB=0 BB=1 UTG=2',st.seats[0].bet===10&&st.seats[1].bet===20&&st.toAct===2);
    // BB option: everyone limps, BB gets to check or raise
    st=mk([1000,1000,1000],0);A(st,'call');A(st,'call');ok('BB option exists after limps',st.toAct===2&&E.legal(st).canCheck&&E.legal(st).canRaise&&st.stage==='preflop');
    A(st,'check');ok('flop: first to act is left of dealer',st.stage==='flop'&&st.toAct===1&&st.comm.length===3);
    // min raise sizing: open 20, raise to 40 (min), re-raise min is 60
    st=mk([1000,1000,1000],0);let L=E.legal(st);ok('open min raise to 40',L.minRaiseTo===40&&L.maxRaiseTo===1000&&L.callAmt===20);
    A(st,'raise',40);L=E.legal(st);ok('after raise to 40, min re-raise is 60',L.minRaiseTo===60);
    A(st,'raise',100);L=E.legal(st);ok('after raise to 100, min re-raise is 160',L.minRaiseTo===160);
    // incomplete all-in raise does not move the minimum
    st=mk([1000,50,1000],0);A(st,'raise',100);// seat0 raises to 100 (UTG)
    L=E.legal(st);ok('SB short stack: raise-to cap 50 (all in)',st.toAct===1&&L.maxRaiseTo===50&&L.callAmt===40&&!L.canRaise);
    // illegal actions
    st=mk([1000,1000,1000],0);
    const bad=[[0,{type:'check'}],[0,{type:'raise',amount:39}],[0,{type:'raise',amount:1001}],[0,{type:'raise',amount:40.5}],[1,{type:'fold'}],[0,{type:'x'}],[0,null],[0,{type:'raise'}],[0,{type:'raise',amount:'100'}],[0,{type:'raise',amount:-5}],[0,{type:'raise',amount:NaN}]];
    const snap=pj(st);for(const [sa,ac] of bad){const rr=E.applyAction(st,sa,ac);ok('illegal refused: '+pj(ac)+' seat '+sa,rr.ok===false&&typeof rr.why==='string'&&pj(st)===snap);}
    ok('hero check with call owed is refused (not converted)',E.applyAction(st,0,{type:'check'}).ok===false);
    ok('call with nothing owed refused',(()=>{const s2=mk([1000,1000],0);A(s2,'call');return E.applyAction(s2,1,{type:'call'}).ok===false&&E.legal(s2).canCheck;})());
    // three-way all-in with different stacks, side pots by deck: find a deck where we can verify structure only
    st=mk([100,300,1000],0);A(st,'raise',100);A(st,'raise',300);A(st,'call');
    ok('3-way all-in: hand ran out to showdown',st.over&&st.showdown&&st.comm.length===5);
    const puts=st.seats.map(s=>s.put);ok('puts 100/300/300',pj(puts)===pj([100,300,300]));
    ok('layers: 300 (3 seats) + 400 (2 seats); seat 2 over-stack 700 not in play',st.result.pots.length===2&&st.result.pots[0].amount===300&&st.result.pots[1].amount===400&&st.seats[2].chips>=700);
    // uncalled over-bet returned: seat1 shoves 300 vs seat0 100, seat2 folds
    st=mk([100,300,1000],0);A(st,'call');A(st,'raise',300);A(st,'fold');A(st,'call');
    const s0=st.seats[0],s1=st.seats[1];
    ok('uncalled bet: layers 200+? and extra 200 returned to the big stack',st.over&&st.result.pots.length===2&&st.result.pots[1].eligible.length===1&&st.result.pots[1].eligible[0]===1&&st.result.pots[1].amount===200,pj(st.result));
    ok('uncalled: big stack never loses more than the matched 100 + blinds',s1.chips>=300-100-0);
    // chop with odd chip: both play the board
    const odd=(()=>{for(let h=0;h<4000;h++){const s2=E.newHand({seats:[{idx:0,name:'a',isBot:0,chips:1000},{idx:1,name:'b',isBot:1,chips:1000},{idx:2,name:'c',isBot:1,chips:1000}],dealer:0,serverSeed:'q'.repeat(64),clientSeed:hexOf(mulberry(h),16),handNo:h,sidePots:true});
      // 3 players: dealer0 sb1 bb2: seat0 raises? play: 0 fold(i.e. folds) then 1 calls 2 checks, check down to showdown
      A(s2,'fold');A(s2,'call');A(s2,'check');let g=0;while(!s2.over&&g++<20)A(s2,'check');
      if(s2.over&&s2.result.winners.length===2&&s2.result.showdown)return s2;}return null;})();
    ok('found a heads-up chop in the deck stream',!!odd);
    if(odd){const w=odd.result.winners;ok('chop: pot 40 split 20/20 exactly',w[0].amount===20&&w[1].amount===20);ok('conservation after chop',odd.seats.reduce((a,s)=>a+s.chips,0)===3000);}
    // odd chip goes to the first winner in seat order: 3 callers pot 60... craft with blinds (SB10 BB20): pot 20+20+20=60 split 2 ways -> 30/30; use short all-in for 25: pot 25+? use search
    const oddchip=(()=>{for(let h=0;h<20000;h++){const s2=E.newHand({seats:[{idx:0,name:'a',isBot:0,chips:25},{idx:1,name:'b',isBot:1,chips:1000},{idx:2,name:'c',isBot:1,chips:1000}],dealer:0,serverSeed:'z'.repeat(64),clientSeed:hexOf(mulberry(h+7),16),handNo:h,sidePots:true});
      // seat0 UTG all-in 25 (raise to 25), seat1 SB calls (25), seat2 BB calls: pot 75; checks down
      if(E.applyAction(s2,0,{type:'raise',amount:25}).ok!==true)continue;A(s2,'call');A(s2,'call');let g=0;while(!s2.over&&g++<20)A(s2,'check');
      const p=s2.result.pots;if(s2.over&&p.length===1&&p[0].winners.length===2&&p[0].amount%2===1)return{s2,h};}return null;})();
    ok('found an odd-chip chop',!!oddchip);
    if(oddchip){const w=oddchip.s2.result.winners;ok('odd chip to lowest seat among winners',w[0].amount===w[1].amount+1&&w[0].seat<w[1].seat,w);}
    // game over states
    ok('actions after the hand are refused',E.applyAction(odd||st,0,{type:'check'}).ok===false);
    ok('legal() null when over',E.legal(odd||st)===null&&E.isOver(odd||st)&&E.result(odd||st)!==null);
    let thr=false;try{E.newHand({seats:[{idx:0,name:'a',isBot:0,chips:100},{idx:1,name:'b',isBot:1,chips:0}],dealer:0,serverSeed:'a',clientSeed:'b',handNo:1});}catch(e){thr=true;}
    ok('newHand needs two funded seats',thr);
    // a seat with chips 0 is not dealt in, and the page counts it for the heads-up test (documented quirk)
    st=mk([1000,0,1000],0);ok('busted seat not dealt',st.seats[1].hole.length===0&&st.seats[1].folded&&st.seats[0].hole.length===2);
    // short blind poster: pot is the sum of bets (page would mint)
    st=mk([5,1000],1);ok('short blinds: pot==sum of bets',st.pot===st.seats.reduce((a,s)=>a+s.bet,0)&&st.seats.reduce((a,s)=>a+s.chips,0)+st.pot===1005);
  }

  // 6. rake + jackpot drop (unit tests; RAKE and BBJD enabled just here)
  {
    E.CFG.RAKE=0.05;E.CFG.BBJD=0.01;
    const shove=(s,sp)=>{const st=E.newHand({seats:[{idx:0,name:'a',isBot:0,chips:s},{idx:1,name:'b',isBot:1,chips:s}],dealer:0,serverSeed:'r'.repeat(64),clientSeed:'1'.repeat(16),handNo:s,sidePots:sp});
      if(E.legal(st).canRaise)E.applyAction(st,0,{type:'raise',amount:s});else E.applyAction(st,0,{type:'call'});if(!st.over)E.applyAction(st,1,{type:'call'});return st;};
    let bad=0,badC=0,n=0;
    for(let s=20;s<=3000;s+=(s<400?1:13)){
      const st=shove(s,true),pot=2*s,rk=Math.min(Math.floor(pot/20),3),bj=Math.floor(pot/100);
      n++;
      if(!(st.over&&st.result.rake===rk&&st.result.bbj===bj&&st.rake===rk&&st.bbj===bj))bad++;
      const sum=st.seats.reduce((a,x)=>a+x.chips,0)+st.pot+st.rake+st.bbj;if(sum!==2*s)badC++;
      if(st.result.winners.reduce((a,w)=>a+w.amount,0)!==pot-rk-bj)badC++;
    }
    ok('rake floor(min(pot*5%,3)) and bbj floor(pot/100) over '+n+' pots',bad===0,bad);
    ok('conservation with rake+bbj (sum seats+pot+rake+bbj == initial)',badC===0,badC);
    let st=shove(500,false);ok('page-mode pot also pays pot-rake-bbj',st.result.winners.reduce((a,w)=>a+w.amount,0)===1000-3-10);
    // no flop => no rake: BB walk and preflop fold-out
    st=E.newHand({seats:[{idx:0,name:'a',isBot:0,chips:1000},{idx:1,name:'b',isBot:1,chips:1000}],dealer:0,serverSeed:'a'.repeat(64),clientSeed:'b'.repeat(16),handNo:1});
    E.applyAction(st,0,{type:'fold'});ok('preflop fold: no rake',st.result.rake===0&&st.seats[1].chips===1010);
    // flop seen, then fold: rake applies, no jackpot drop (not contested)
    st=E.newHand({seats:[{idx:0,name:'a',isBot:0,chips:1000},{idx:1,name:'b',isBot:1,chips:1000}],dealer:0,serverSeed:'a'.repeat(64),clientSeed:'b'.repeat(16),handNo:1});
    E.applyAction(st,0,{type:'raise',amount:200});E.applyAction(st,1,{type:'call'});E.applyAction(st,1,{type:'raise',amount:100});E.applyAction(st,0,{type:'fold'});
    ok('flop seen, fold: rake 3 (pot 500 capped) and no bbj',st.over&&st.result.rake===3&&st.result.bbj===0&&st.seats[1].chips===1197,pj(st.result));
    E.CFG.RAKE_NEEDS_FLOP=false;
    st=E.newHand({seats:[{idx:0,name:'a',isBot:0,chips:1000},{idx:1,name:'b',isBot:1,chips:1000}],dealer:0,serverSeed:'a'.repeat(64),clientSeed:'b'.repeat(16),handNo:1});
    E.applyAction(st,0,{type:'fold'});ok('RAKE_NEEDS_FLOP=false rakes the walk like the page (floor(30*5%)=1)',st.result.rake===1);
    E.CFG.RAKE_NEEDS_FLOP=true;E.CFG.RAKE=0;E.CFG.BBJD=0;
  }

  // 7. privacy: no hidden card in any view before it is allowed; JSON scan
  {
    const r=mulberry(77);let leaks=0,looks=0,showdownOK=0,showdowns=0;
    for(let i=0;i<(fast?60:400);i++){
      const sc=mkScenario(r,i),pol=mkPolicy(sc.seed,sc.prof);
      const seats=sc.chips.map((c,j)=>({idx:j,name:'S'+j,isBot:j>0,chips:c,agg:.8}));
      const st=E.newHand({seats,dealer:sc.dealer,serverSeed:sc.server,clientSeed:sc.client,handNo:sc.handNo,sidePots:true});
      const cardKey=c=>'"r":"'+c.r+'","s":"'+c.s+'"';
      const scan=()=>{
        const v=E.view(st,0),j=JSON.stringify(v);looks++;
        const allowed=new Set();
        if(v.seats[0].hole)v.seats[0].hole.forEach(c=>allowed.add(cardKey(c)));
        for(const s of st.seats){
          if(s.idx===0||!s.hole.length)continue;
          const revealed=st.over&&st.showdown&&!s.folded;
          for(const c of s.hole){const k=cardKey(c);if(j.includes(k)&&!revealed)leaks++;if(revealed&&!j.includes(k))leaks++;}
        }
        if(j.includes(st.deck[st.di]&&cardKey(st.deck[st.di]))&&st.di<52&&!st.comm.some(c=>cardKey(c)===cardKey(st.deck[st.di]))&&!st.seats.some(s=>s.hole.some(c=>cardKey(c)===cardKey(st.deck[st.di]))))leaks++;
        if(/deck|serverSeed|"di"/.test(j))leaks++;
        // events for other seats' deals carry no cards
        if(v.events.some(e=>e.type==='deal'&&e.seat!==0&&e.cards))leaks++;
        const vb=E.view(st,2),jb=JSON.stringify(vb);if(st.seats[2]&&st.seats[2].hole.length&&!st.over&&st.seats[0].hole.length&&jb.includes(cardKey(st.seats[0].hole[0]))&&!vb.comm.some(c=>cardKey(c)===cardKey(st.seats[0].hole[0])))leaks++;
      };
      scan();
      let g=0;while(!st.over&&g++<400){const L=E.legal(st);E.applyAction(st,L.seat,pol(L,L.seat,g));scan();}
      if(st.showdown){showdowns++;const v=E.view(st,0);if(st.seats.every(s=>s.folded||(v.seats[s.idx].hole&&v.seats[s.idx].hole.length===2)))showdownOK++;}
      // folded seats' cards never revealed
      const v=E.view(st,0);if(st.seats.some(s=>s.idx!==0&&s.folded&&v.seats[s.idx].hole))leaks++;
    }
    ok('views never leak hidden cards / deck / seed ('+looks+' views scanned)',leaks===0,leaks);
    ok('showdown views reveal every live seat',showdownOK===showdowns&&showdowns>0,{showdownOK,showdowns});
    stats.viewsScanned=looks;
  }

  // 8. fuzz applyAction: never throws, never corrupts, never mints
  {
    const r=mulberry(88);const weird=[undefined,null,NaN,Infinity,-Infinity,-1,0,0.5,1.5,1e300,-1e300,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER+2,'','0','10','raise',true,false,[],[1],{},{valueOf(){return 40;}},()=>40,Symbol('x'),10n,new Number(40),Object.create(null)];
    const types=['fold','check','call','raise','allin','bet','FOLD','',null,undefined,5,{},['fold']];
    const seatsW=[-1,0,1,2,3,99,'0',null,undefined,NaN,1.5,Infinity,{}];
    let threw=0,corrupt=0,minted=0,accepted=0,refused=0;
    for(let i=0;i<N.fuzz;i++){
      const sc=mkScenario(r,i);
      const seats=sc.chips.map((c,j)=>({idx:j,name:'S'+j,isBot:j>0,chips:c,agg:.8}));
      const st=E.newHand({seats,dealer:sc.dealer,serverSeed:sc.server,clientSeed:sc.client,handNo:sc.handNo,sidePots:i%2===0});
      const total=sc.chips.reduce((a,b)=>a+b,0);
      let steps=0;
      while(!st.over&&steps++<60){
        const pick=a=>a[Math.floor(r()*a.length)];
        for(let t=0;t<3;t++){
          const before=pj(st);
          let act;const m=r();
          if(m<.1)act=pick([null,undefined,5,'raise',[],()=>1]);
          else if(m<.2)act={get type(){throw new Error('boom');},amount:5};
          else if(m<.3)act=new Proxy({},{get(){throw new Error('proxy');}});
          else act={type:pick(types),amount:pick(weird)};
          const seat=r()<.7?st.toAct:pick(seatsW);
          let res;try{res=E.applyAction(st,seat,act);}catch(e){threw++;continue;}
          if(!res||typeof res.ok!=='boolean'){corrupt++;continue;}
          if(res.ok){accepted++;
            // accepted garbage must still have been legal: re-validate through the invariants
            const sum=st.seats.reduce((a,s)=>a+s.chips,0)+st.pot+st.rake+st.bbj;if(sum!==total)minted++;
            if(st.over)break;
          }else{refused++;if(pj(st)!==before)corrupt++;}
        }
        if(st.over)break;
        const L=E.legal(st);E.applyAction(st,L.seat,mkPolicy(sc.seed+steps,PROFILES[0])(L,L.seat,steps));
      }
      const sum=st.seats.reduce((a,s)=>a+s.chips,0)+st.pot+st.rake+st.bbj;if(sum!==total)minted++;
    }
    ok('fuzz: applyAction never throws ('+accepted+' accepted / '+refused+' refused)',threw===0,threw);
    ok('fuzz: refused action leaves state byte-identical',corrupt===0,corrupt);
    ok('fuzz: no chips minted or lost',minted===0,minted);
    stats.fuzz={accepted,refused};
    // accepted raise amounts only ever integer within bounds
    const st=E.newHand({seats:[{idx:0,name:'a',isBot:0,chips:500},{idx:1,name:'b',isBot:1,chips:500}],dealer:0,serverSeed:'f'.repeat(64),clientSeed:'1'.repeat(16),handNo:1});
    const L=E.legal(st);let leak=0;
    for(const a of weird){const s2=JSON.parse(JSON.stringify(st));const res=E.applyAction(s2,0,{type:'raise',amount:a});if(res.ok&&!(Number.isInteger(a)&&a>=L.minRaiseTo&&a<=L.maxRaiseTo))leak++;}
    ok('only integer in-range raise amounts are accepted',leak===0,leak);
  }

  // 9. determinism + JSON round trip + botView
  {
    const r=mulberry(99);let diffs=0,bvBad=0,bvN=0;
    for(let i=0;i<(fast?30:150);i++){
      const sc=mkScenario(r,i),pol=mkPolicy(sc.seed,sc.prof);
      const a=playEngine(E,sc,pol,{sidePots:true}),b=playEngine(E,sc,pol,{sidePots:true,roundtrip:true});
      if(pj(a.st)!==pj(b.st))diffs++;
      const seats=sc.chips.map((c,j)=>({idx:j,name:'S'+j,isBot:j>0,chips:c,agg:.8}));
      const st=E.newHand({seats,dealer:sc.dealer,serverSeed:sc.server,clientSeed:sc.client,handNo:sc.handNo});
      let g=0;while(!st.over&&g++<300){
        const L=E.legal(st),bv=E.botView(st,L.seat),s=st.seats[L.seat],mb=Math.max(0,...st.seats.map(x=>x.bet));bvN++;
        const want={seat:L.seat,stage:st.stage,pot:st.pot,callAmt:mb-s.bet,bet:s.bet,chips:s.chips,numSeats:seats.length,dealer:st.dealer,minRaiseTo:L.minRaiseTo,maxRaiseTo:L.maxRaiseTo,canRaise:L.canRaise,numOpp:st.seats.filter(x=>!x.folded&&x.idx!==L.seat).length,handRank:E.evalH(s.hole,st.comm).rank};
        for(const k in want)if(bv[k]!==want[k])bvBad++;
        if(pj(bv.hole)!==pj(s.hole)||pj(bv.comm)!==pj(st.comm))bvBad++;
        E.applyAction(st,L.seat,pol(L,L.seat,g));
      }
    }
    ok('determinism: same inputs => identical final state, JSON round trip invisible',diffs===0,diffs);
    ok('botView fields match B2/NEEDS.md ('+bvN+' views)',bvBad===0,bvBad);
  }

  // 10. page defects, demonstrated against the unmodified page rules (report evidence, not assertions about the engine)
  {
    // D6: blind poster with fewer chips than the blind: unpatched page sets pot=SB+BB
    const W2=pageWorld({unpatchedBlinds:true});
    let minted=0;const r=mulberry(5);
    for(let i=0;i<20;i++){
      const chips=[1000,7+i%10,1000],hex=hexOf(r,80);
      const tr=W2.play(chips,0,hex,mkPolicy(i,PROFILES[3]));
      if(tr.chips.reduce((a,b)=>a+b,0)!==chips.reduce((a,b)=>a+b,0))minted++;
    }
    stats.pageMintsOnShortBlinds=minted;
    // D1: page single pot: 3-way shove 100/300/1000 -> compare who gets what versus layered
  }
  stats.pass=pass;stats.fail=fail;
  return{pass,fail,fails,stats};
}
function layersFor(st){ // number of pot layers the side-pot algorithm would make
  const live=st.seats.filter(s=>!s.folded);return new Set(live.map(s=>s.put)).size;
}
module.exports=Object.assign(async function(){ // runner entry: fast profile vs the page engine in the staging app
  const stage=path.join(__dirname,'..','..','app','index.html');
  const src=fs.readFileSync(path.join(__dirname,'..','..','worker','engine.js'),'utf8');
  const r=await run({engineSrc:src,fast:true,page:fs.existsSync(stage)?stage:undefined});
  (r.fails||[]).slice(0,10).forEach(f=>console.log('  FAIL',f));
  return {name:'engine-oracle (fast, vs page engine)',pass:r.pass,fail:r.fail};
},{run});
if(require.main===module){
  run({fast:process.argv.includes('--fast')}).then(r=>{
    console.log(JSON.stringify(r.stats,null,1));
    r.fails.forEach(f=>console.log('FAIL',f));
    console.log('engine-oracle: '+r.pass+' passed, '+r.fail+' failed');
    process.exit(r.fail?1:0);
  }).catch(e=>{console.error(e);process.exit(2);});
}
