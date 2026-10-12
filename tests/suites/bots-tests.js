// bots-tests.js - B2. Run: node bots-tests.js   (env: BOTS=path to bots.js (default ./bots.js), PAGE=path to zp.html,
// N=situations (default 30000), MUT=0 to skip the mutation phase).
// Also usable as module: module.exports=async function(){...} returns {pass,fail}.
// Cross-check: the PAGE's own botAct/handEquity/... (sliced out of zp.html, run in a node vm with
// Math.random replaced by the same seeded stream the port receives) vs the port.
const fs=require('fs'),path=require('path'),vm=require('vm'),cp=require('child_process'),url=require('url');
const BOTS=process.env.BOTS?path.resolve(process.env.BOTS):(fs.existsSync(path.join(__dirname,'..','..','worker','bots.js'))?path.join(__dirname,'..','..','worker','bots.js'):path.join(__dirname,'bots.js'));
const PAGE=process.env.PAGE||(fs.existsSync(path.join(__dirname,'..','..','app','index.html'))?path.join(__dirname,'..','..','app','index.html'):path.join(__dirname,'..','..','..','zp.html'));

function loadPage(){
  const L=fs.readFileSync(PAGE,'utf8').split('\n');
  const find=re=>L.findIndex(l=>re.test(l));
  const slice=(a,b)=>L.slice(a,b).join('\n');
  const parts=[
    L[find(/^const SUITS=/)],L[find(/^const RV=/)],L[find(/^const SB=10/)],
    slice(find(/^const POS_NAMES_9/),find(/^let G=\{/)),
    slice(find(/^function seededRandom/),find(/^function shuffleSeeded/)),
    slice(find(/^function mkDeck/),find(/^\/\/ ─── Card HTML/)),
  ];
  const ctx=vm.createContext({console});
  vm.runInContext(parts.join('\n')+'\nthis.__x={setRand:f=>{Math.random=f;},botAct,evalH,mkDeck,seededRandom,getPositions,SUITS,RANKS};',ctx);
  return {ctx,x:ctx.__x};
}

module.exports=async function(opts){
  opts=opts||{};
  const N=+(opts.N||process.env.N||30000);
  let pass=0,fail=0;const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
  const mod=await import(url.pathToFileURL(BOTS).href+(opts.bust?'?'+opts.bust:''));
  const {ctx,x}=loadPage();
  const BB=20;

  // deterministic situation generator (xorshift, independent of both implementations)
  let gs=123456789;const g=()=>{gs^=gs<<13;gs>>>=0;gs^=gs>>>17;gs^=gs<<5;gs>>>=0;return gs/4294967296;};
  const gi=(a,b)=>a+Math.floor(g()*(b-a+1));
  const pick=a=>a[Math.floor(g()*a.length)];

  function situation(){
    const stage=pick(['preflop','preflop','flop','turn','river']);
    const nc={preflop:0,flop:3,turn:4,river:5}[stage];
    const d=x.mkDeck();for(let i=d.length-1;i>0;i--){const j=gi(0,i);[d[i],d[j]]=[d[j],d[i]];}
    let hole=[d[0],d[1]],comm=d.slice(2,2+nc);
    if(nc&&g()<.2){ // monotone / two-tone / paired boards for texture coverage
      const su=pick(x.SUITS),same=d.filter(c=>c.s===su);
      comm=same.slice(0,nc);hole=d.filter(c=>!comm.includes(c)).slice(0,2);
    }
    const forceRank=(nc&&g()<.35)?gi(0,9):null; // exercises every handRank branch regardless of cards
    const numSeats=gi(2,8),dealer=gi(0,numSeats-1),seat=gi(0,numSeats-1);
    const numOpp=gi(1,numSeats-1);
    const folded=new Array(numSeats).fill(true);folded[seat]=false;
    const others=[...Array(numSeats).keys()].filter(i=>i!==seat);
    for(let i=others.length-1;i>0;i--){const j=gi(0,i);[others[i],others[j]]=[others[j],others[i]];}
    others.slice(0,numOpp).forEach(i=>folded[i]=false);
    const depth=pick([0.5,2,8,25,60,100,200]);
    const chips=Math.max(1,Math.round(depth*BB*g()));
    let maxB,bet;
    if(stage==='preflop'){
      maxB=pick([BB,BB,BB,2*BB,3*BB,5*BB,gi(2,30)*BB]);
      bet=pick([0,10,BB,maxB,maxB,Math.min(maxB,gi(0,maxB))]);
      if(g()<.2)bet=maxB;
    }else{
      maxB=g()<.45?0:gi(1,40)*BB;
      bet=g()<.5?0:(maxB&&g()<.5?gi(0,maxB):0);
    }
    if(bet>maxB)bet=maxB;
    const call=maxB-bet;
    const pot=Math.max(maxB+bet,gi(1,60)*BB)+(stage==='preflop'?0:gi(0,30)*BB);
    const lastRaise=Math.max(BB,maxB?gi(1,Math.max(1,maxB/BB))*BB:BB);
    return {forceRank,stage,hole,comm,numSeats,dealer,seat,folded,chips,maxB,bet,call,pot,lastRaise,agg:.75+g()*.25,numOpp};
  }
  function pageDecision(S,seedHex){
    const rng=x.seededRandom(seedHex);
    x.setRand(rng);
    const seats=S.folded.map((f,i)=>({idx:i,folded:f,chips:i===S.seat?S.chips:500,hole:i===S.seat?S.hole:[],agg:S.agg}));
    const s=seats[S.seat];s.hs=S.forceRank!==null?{rank:S.forceRank,tb:0}:x.evalH(S.hole,S.comm);
    const bets={};if(S.bet||S.maxB)bets[S.seat]=S.bet;
    // some other seat holds maxB
    const o=seats.findIndex(q=>q.idx!==S.seat&&!q.folded);
    if(S.maxB>S.bet&&o>=0)bets[o]=S.maxB;
    const Gref={seats,comm:S.comm,stage:S.stage,bets,pot:S.pot,posMap:x.getPositions(S.numSeats,S.dealer)};
    const d=x.botAct(s,S.call,S.pot,Gref);
    return {d,next:rng()};
  }
  function viewOf(S){
    const handRank=S.forceRank!==null?S.forceRank:x.evalH(S.hole,S.comm).rank|0;
    const maxRaiseTo=S.bet+S.chips;
    return {seat:S.seat,hole:S.hole,comm:S.comm,stage:S.stage,handRank,pot:S.pot,callAmt:S.call,bet:S.bet,chips:S.chips,
      numOpp:S.numOpp,numSeats:S.numSeats,dealer:S.dealer,minRaiseTo:S.maxB+S.lastRaise,maxRaiseTo,canRaise:S.chips>S.call,agg:S.agg};
  }
  // independent re-statement of what the page's act() does with {a,n} -> engine action (reads act(): zp.html)
  function pageAct(S,d){
    if(d.a==='fold')return S.call>0?{type:'fold'}:{type:'check'};
    if(d.a==='check'||d.a==='call')return S.call>0?{type:'call'}:{type:'check'};
    const raiseSize=Math.max(d.n||BB,S.lastRaise);
    const total=Math.min(S.bet+S.call+raiseSize,S.chips+S.bet);
    if(total<=S.maxB)return S.call>0?{type:'call'}:{type:'check'};
    return {type:'raise',amount:total};
  }

  const stats={};let rawEq=0,rngEq=0,actEq=0,illegal=0,rawBad=0;
  const mismatches=[];
  for(let i=0;i<N;i++){
    const S=situation();
    const seedHex='B2seed'+i;
    const pg=pageDecision(S,seedHex);
    const rng2=x.seededRandom(seedHex);
    const v=viewOf(S);
    const mineRaw=mod.rawDecide(v,rng2);
    const nextMine=rng2();
    const sameRaw=pg.d.a===mineRaw.a&&(pg.d.n||0)===(mineRaw.n||0);
    if(sameRaw)rawEq++;else if(mismatches.length<5)mismatches.push({S:{...S,hole:S.hole.map(c=>c.r+c.s),comm:S.comm.map(c=>c.r+c.s)},page:pg.d,mine:mineRaw});
    if(pg.next===nextMine)rngEq++;
    // full decide() with fresh identically seeded rng
    const dec=mod.decide(v,x.seededRandom(seedHex));
    const want=pageAct(S,pg.d);
    if(dec.type===want.type&&(dec.amount||0)===(want.amount||0))actEq++;
    // legality
    let bad=false;
    if(dec.type==='check'&&S.call!==0)bad=true;
    if(dec.type==='fold'&&S.call===0)bad=true;
    if(dec.type==='call'&&(S.call<=0||false))bad=true;
    if(dec.type==='raise'){
      if(!Number.isInteger(dec.amount)||dec.amount>v.maxRaiseTo||dec.amount<=S.maxB||!v.canRaise)bad=true;
      if(dec.amount<v.minRaiseTo&&dec.amount!==v.maxRaiseTo)bad=true; // below min only as short all-in
    }
    if(!['fold','check','call','raise'].includes(dec.type))bad=true;
    if(bad){illegal++;if(illegal<4)console.log('  illegal',JSON.stringify(dec),JSON.stringify(v).slice(0,300));}
    const k=S.stage+':'+dec.type;stats[k]=(stats[k]||0)+1;
  }
  // legality-only: engine says canRaise=false (e.g. no-reopen) on otherwise identical situations
  let nrBad=0,nrRaise=0;
  for(let i=0;i<8000;i++){
    const S=situation(),v={...viewOf(S),canRaise:false};
    const dec=mod.decide(v,x.seededRandom('nr'+i));
    if(dec.type==='raise')nrRaise++;
    if(dec.type==='check'&&S.call!==0||dec.type==='fold'&&S.call===0||dec.type==='call'&&S.call<=0)nrBad++;
  }
  ok('canRaise=false: never raises, never illegal',nrRaise===0&&nrBad===0,nrRaise+'/'+nrBad);
  ok('raw decision == page botAct ('+rawEq+'/'+N+')',rawEq===N,JSON.stringify(mismatches).slice(0,900));
  ok('rng draw count identical to page ('+rngEq+'/'+N+')',rngEq===N);
  ok('engine action == page act() semantics ('+actEq+'/'+N+')',actEq===N);
  ok('never illegal ('+illegal+')',illegal===0);
  ok('coverage: every action type seen postflop and preflop',['preflop:fold','preflop:call','preflop:raise','preflop:check','flop:raise','flop:fold','turn:call','river:check'].every(k=>stats[k]>0),JSON.stringify(stats));

  // determinism + purity
  {
    const S=situation(),v=viewOf(S),snap=JSON.stringify(v);
    const a=mod.decide(v,x.seededRandom('d1')),b=mod.decide(v,x.seededRandom('d1'));
    ok('deterministic for same rng',JSON.stringify(a)===JSON.stringify(b));
    ok('does not mutate botView',JSON.stringify(v)===snap);
  }
  const src=fs.readFileSync(BOTS,'utf8').replace(/\/\/.*$/gm,'');
  ok('no Math.random / Date / import / fetch',!/Math\.random|Date\b|\bimport\b|fetch\(|crypto/.test(src));

  // known-hand spot checks (rng forced low/high)
  {
    const lo=()=>0.01,hi=()=>0.99;
    const H=(a,b)=>[{r:a[0],s:a[1]},{r:b[0],s:b[1]}];
    const base={seat:3,stage:'preflop',comm:[],handRank:0,pot:30,callAmt:20,bet:0,chips:1000,numOpp:5,numSeats:6,dealer:0,minRaiseTo:40,maxRaiseTo:1000,canRaise:true};
    const aa=mod.decide({...base,hole:H(['A','♠'],['A','♥'])},hi);
    ok('AA facing open re-raises',aa.type==='raise'&&aa.amount>=40);
    const t=mod.decide({...base,hole:H(['7','♠'],['2','♥'])},lo);
    ok('72o UTG facing open folds',t.type==='fold');
    const bbOpt=mod.decide({...base,hole:H(['7','♠'],['2','♥']),callAmt:0,bet:20},lo);
    ok('72o BB option checks (never folds free)',bbOpt.type==='check');
    const sh=mod.decide({...base,hole:H(['A','♠'],['A','♥']),chips:30,maxRaiseTo:30,callAmt:20,canRaise:true},hi);
    ok('short stack AA: legal all-in raise or call',(sh.type==='raise'&&sh.amount===30)||sh.type==='call');
    const nr=mod.decide({...base,hole:H(['A','♠'],['A','♥']),chips:15,maxRaiseTo:15,canRaise:false},hi);
    ok('canRaise=false never raises',nr.type==='call');
    const nuts={...base,stage:'flop',comm:[{r:'A',s:'♠'},{r:'K',s:'♠'},{r:'Q',s:'♠'}],hole:H(['J','♠'],['10','♠']),handRank:9,callAmt:0,bet:0,pot:100,minRaiseTo:20};
    const nb=mod.decide(nuts,lo);
    ok('flop made nuts, nothing owed: slow-play check or bet',nb.type==='check'||nb.type==='raise');
  }

  // personality / position spread sanity (page botAct has no agg term; the spread comes from position)
  {
    const rate=(dealerRel)=>{ // fraction of 5-handed unopened-pot (BB option excluded) hands that voluntarily raise by position
      let raises=0,tot=0;
      for(let i=0;i<3000;i++){
        const d=x.mkDeck();for(let k=d.length-1;k>0;k--){const j=gi(0,k);[d[k],d[j]]=[d[j],d[k]];}
        const seat=(0+dealerRel)%6; // dealer=0 in 6-max: BTN=0 ... table POS_6
        const v={seat,hole:[d[0],d[1]],comm:[],stage:'preflop',handRank:0,pot:30,callAmt:0,bet:0,chips:2000,numOpp:5,numSeats:6,dealer:0,minRaiseTo:40,maxRaiseTo:2000,canRaise:true};
        const r=mod.decide(v,x.seededRandom('sp'+dealerRel+i));tot++;if(r.type==='raise')raises++;
      }
      return raises/tot;
    };
    const btn=rate(0),utg=rate(3);
    ok('position spread: BTN opens wider than UTG ('+btn.toFixed(2)+' vs '+utg.toFixed(2)+')',btn>utg+0.15);
    ok('BTN open rate (page behaviour ~62%, thresholds 4/8)',btn>.4&&btn<.8,btn);
    ok('UTG open rate (page behaviour ~2%, premium only)',utg>0&&utg<.12,utg);
  }
  {
    const t=stats,tot=k=>Object.keys(t).filter(q=>q.startsWith(k)).reduce((a,q)=>a+t[q],0);
    const f=tot('preflop:fold')/tot('preflop:');
    ok('preflop fold share sane 20-85% under facing-bet mix ('+f.toFixed(2)+')',f>.2&&f<.85);
  }
  return {pass,fail,stats};
};

if(require.main===module){
  (async()=>{
    const t0=Date.now();
    const r=await module.exports({});
    console.log('bots-tests: pass',r.pass,'fail',r.fail,'('+(Date.now()-t0)+'ms)');
    let mutFail=0;
    if(r.fail===0&&process.env.MUT!=='0'){
      // ---- mutation checks: each mutant of bots.js must make the cross-check FAIL ----
      const src=fs.readFileSync(BOTS,'utf8');
      const M=[
        ['chen ace score','score = a === 14 ? 10 :','score = a === 14 ? 9 :'],
        ['chen suited bonus','if (suited) score += 2;','if (suited) score += 1;'],
        ['chen gap2','else if (gap === 2) score -= 2;','else if (gap === 2) score -= 1;'],
        ['open threshold','12 - posQ * 8','12 - posQ * 7'],
        ['premium sizing','(3 + Math.floor(r() * 1.5))','(3 + Math.floor(r() * 2.5))'],
        ['limp cond','chen >= openThreshold - 3 && posQ > 0.6','chen >= openThreshold - 2 && posQ > 0.6'],
        ['3bet bluff freq','r() < 0.25;','r() < 0.35;'],
        ['call freq','r() < 0.9','r() < 0.8'],
        ['equity base 1pair','0.52,','0.50,'],
        ['equity certainty','numCards >= 5 ? 1.0','numCards >= 6 ? 1.0'],
        ['pot odds','call / (call + pot)','call / (call + pot + 1)'],
        ['fold gate','equity < 0.18 && r() < 0.85','equity < 0.18 && r() < 0.8'],
        ['slowplay','seatSPR > 4 && r() < 0.25','seatSPR > 4 && r() < 0.3'],
        ['nuts raise freq','r() < 0.65','r() < 0.6'],
        ['bet size half','half: 0.50','half: 0.45'],
        ['wet board twotone','suited.size === 2 ? .15 : 0','suited.size === 2 ? 0 : 0'],
        ['bluff cond','posQ > 0.6 && r() < 0.35','posQ > 0.6 && r() < 0.30'],
        ['position table BTN','BTN: 1,','BTN: .95,'],
        ['raise->increment conversion','const minInc = Math.max(1, v.minRaiseTo - maxB);','const minInc = Math.max(1, v.minRaiseTo - maxB) + 1;'],
        ['allin clamp','if (to > v.maxRaiseTo) to = v.maxRaiseTo;',''],
        ['canRaise guard','if (!v.canRaise ||','if ('],
        ['numOpp','Math.max(1, v.numOpp)','Math.max(2, v.numOpp)'],
      ];
      fs.mkdirSync(path.join(__dirname,'.mut'),{recursive:true});
      let killed=0;
      for(const [name,a,b] of M){
        if(!src.includes(a)){console.log('  MUTANT PATTERN MISSING',name);mutFail++;continue;}
        const mp=path.join(__dirname,'.mut','m.mjs');
        fs.writeFileSync(mp,src.replace(a,b));
        const o=cp.spawnSync(process.execPath,[__filename],{env:{...process.env,BOTS:mp,MUT:'0',N:'60000'},encoding:'utf8'});
        const dead=o.status!==0;
        if(dead)killed++;else{mutFail++;console.log('  SURVIVED',name);}
      }
      fs.rmSync(path.join(__dirname,'.mut'),{recursive:true,force:true});
      console.log('mutation: killed',killed,'/',M.length);
    }
    process.exit(r.fail||mutFail?1:0);
  })();
}
