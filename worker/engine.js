// engine.js: pure NLHE hand engine for the server-run tables (contract v2). ESM, no I/O, no Date, no Math.random,
// no DOM. All randomness comes from the seeded rng derived from serverSeed+clientSeed+handNo (identical to the page).
// The page (zp.html) is the rules spec; deviations are listed in build/handback/E2/API.md ("Rules / deviations").
// State is plain JSON (safe to store in KV and to JSON.parse back). Hidden data (deck, hole cards) lives in the state
// and NEVER in view().

export const CFG={SB:10,BB:20,RAKE:0.05,RAKECAP:3,BBJD:0.01,
  RAKE_NEEDS_FLOP:true,   // no flop, no rake (contract). The page rakes every pot; see API.md deviation D2.
  SIDEPOTS:true};         // true = proper side pots + uncalled-bet return. false = page behaviour (one pot). D1.

const SUITS=['♠','♥','♦','♣'],RANKS=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RV=Object.fromEntries(RANKS.map((r,i)=>[r,i+2]));
const NAMES=['High Card','One Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Straight Flush','Royal Flush'];

export function mkDeck(){const d=[];for(const s of SUITS)for(const r of RANKS)d.push({r,s});return d;}

// Same generator as the page (xmur3 hash -> xorshift128).
export function seededRandom(hex){
  const s=[0,0,0,0];
  let h=1779033703^hex.length;
  for(let i=0;i<hex.length;i++){h=Math.imul(h^hex.charCodeAt(i),3432918353);h=(h<<13)|(h>>>19);}
  for(let i=0;i<4;i++){
    h=Math.imul(h^(h>>>16),2246822507);
    h=Math.imul(h^(h>>>13),3266489909);
    h^=h>>>16;
    s[i]=(h>>>0)||0x9e3779b9;
  }
  return function(){
    let t=s[3];const q=s[0];
    s[3]=s[2];s[2]=s[1];s[1]=q;
    t^=t<<11;t^=t>>>8;
    s[0]=(t^q^(q>>>19))>>>0;
    return s[0]/4294967296;
  };
}
export function shuffleSeeded(a,hex){
  const rnd=seededRandom(hex),b=[...a];
  for(let i=b.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[b[i],b[j]]=[b[j],b[i]];}
  return b;
}
export async function sha256Hex(str){
  const d=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
  return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

// ---- hand evaluation (same rank/tb numbers as the page's evalH for 2 hole cards) ----
function sc5(cs){
  const v=cs.map(c=>RV[c.r]).sort((a,b)=>b-a);
  const fl=cs.every(c=>c.s===cs[0].s);
  const rc={};for(const x of v)rc[x]=(rc[x]||0)+1;
  const ct=Object.values(rc).sort((a,b)=>b-a);
  const u=[...new Set(v)];                       // v is sorted desc, so u is too
  let st=u.length===5&&u[0]-u[4]===4,wheel=false;
  if(!st&&u[0]===14&&[2,3,4,5].every(x=>u.includes(x))){st=true;wheel=true;}
  let seq;
  if(st)seq=[wheel?5:u[0],0,0,0,0];
  else{seq=[...u].sort((a,b)=>(rc[b]-rc[a])||(b-a));while(seq.length<5)seq.push(0);}
  const tb=seq.reduce((a,x,i)=>a+x*Math.pow(100,4-i),0);
  let rank;
  if(fl&&st&&!wheel&&u[0]===14)rank=9;
  else if(fl&&st)rank=8;
  else if(ct[0]===4)rank=7;
  else if(ct[0]===3&&ct[1]===2)rank=6;
  else if(fl)rank=5;
  else if(st)rank=4;
  else if(ct[0]===3)rank=3;
  else if(ct[0]===2&&ct[1]===2)rank=2;
  else if(ct[0]===2)rank=1;
  else rank=0;
  return{rank,tb};
}
export function evalH(hole,comm){
  const all=[...hole,...comm],n=all.length;
  if(n<5)return{rank:0,name:'—',tb:0};
  let best=null;
  for(let a=0;a<n-4;a++)for(let b=a+1;b<n-3;b++)for(let c=b+1;c<n-2;c++)for(let d=c+1;d<n-1;d++)for(let e=d+1;e<n;e++){
    const s=sc5([all[a],all[b],all[c],all[d],all[e]]);
    if(!best||s.rank>best.rank||(s.rank===best.rank&&s.tb>best.tb))best=s;
  }
  return{rank:best.rank,name:NAMES[best.rank],tb:best.tb};
}

// ---- helpers ----
const maxBet=st=>Math.max(0,...st.seats.map(s=>s.bet));
const liveSeats=st=>st.seats.filter(s=>!s.folded);
const canAct=s=>!s.folded&&!s.allIn&&s.chips>0;
const ev=(st,e)=>{st.events.push(e);return e;};

// next seat clockwise from `from` that is not folded (chips>0 or all-in): the page's nextSeat (only used at deal time)
function nextSeat(st,from,steps){
  const n=st.seats.length;let idx=from;
  for(let c=0;c<steps;c++){
    idx=(idx+1)%n;
    while(st.seats[idx].folded||(st.seats[idx].chips<=0&&!st.seats[idx].allIn)){idx=(idx+1)%n;if(idx===from)break;}
  }
  return idx;
}
// the page's findNextToAct
function findNext(st,from){
  const n=st.seats.length,mb=maxBet(st);
  for(let i=1;i<=n;i++){
    const s=st.seats[(from+i)%n];
    if(!canAct(s))continue;
    if(!s.acted||mb-s.bet>0)return s.idx;
  }
  return null;
}
function postBlind(st,idx,amount){
  const s=st.seats[idx],a=Math.min(amount,s.chips);
  s.chips-=a;s.bet=a;s.put=a;if(!s.chips)s.allIn=true;
  ev(st,{seat:idx,type:'blind',amount:a});
}

export function newHand({seats,dealer,serverSeed,clientSeed,handNo,commit=null,sidePots}){
  const n=seats.length;
  if(!Array.isArray(seats)||n<2||n>9)throw new RangeError('2..9 seats');
  seats.forEach((s,i)=>{
    if(s.idx!==i)throw new RangeError('seats[i].idx must equal i');
    if(!Number.isSafeInteger(s.chips)||s.chips<0)throw new RangeError('chips must be a non-negative integer');
  });
  if(seats.filter(s=>s.chips>0).length<2)throw new RangeError('need 2 seats with chips');
  if(!Number.isSafeInteger(dealer)||dealer<0)throw new RangeError('bad dealer');
  dealer%=n;
  const st={v:1,handNo,dealer,stage:'preflop',over:false,showdown:false,commit,clientSeed,
    sidePots:sidePots===undefined?CFG.SIDEPOTS:!!sidePots,
    seats:seats.map((s,i)=>({idx:i,name:s.name,isBot:!!s.isBot,agg:s.agg===undefined?0:s.agg,chips:s.chips,start:s.chips,
      bet:0,put:0,folded:s.chips<=0,allIn:false,acted:false,hole:[]})),
    deck:shuffleSeeded(mkDeck(),serverSeed+clientSeed+handNo),di:0,comm:[],pot:0,lastRaise:CFG.BB,
    toAct:null,actN:0,events:[],result:null,rake:0,bbj:0,total:seats.reduce((a,s)=>a+s.chips,0)};
  for(const s of st.seats)if(!s.folded){s.hole=st.deck.slice(st.di,st.di+2);st.di+=2;ev(st,{seat:s.idx,type:'deal',cards:s.hole});}
  // Blind seats exactly as the page: it counts every seat (busted ones included) for the heads-up test.
  const sb=n===2?dealer:nextSeat(st,dealer,1),bb=n===2?nextSeat(st,dealer,1):nextSeat(st,dealer,2);
  const first=n===2?sb:nextSeat(st,bb,1);
  postBlind(st,sb,CFG.SB);postBlind(st,bb,CFG.BB);
  st.pot=st.seats.reduce((a,s)=>a+s.put,0);
  settle(st,(first+n-1)%n);
  return st;
}

// After any action (or the deal): decide who acts next, close streets, run out, finish the hand.
function settle(st,from){
  let runout=false;                              // true once fewer than 2 seats can still bet: no more questions asked
  for(;;){
    if(liveSeats(st).length===1){finish(st,false);return;}
    if(!runout){const nxt=findNext(st,from);if(nxt!==null){st.toAct=nxt;return;}}
    // street over: sweep bets, reveal the next street
    for(const s of st.seats){s.bet=0;if(!s.folded&&!s.allIn)s.acted=false;}
    st.lastRaise=CFG.BB;
    st.stage={preflop:'flop',flop:'turn',turn:'river',river:'showdown'}[st.stage];
    if(st.stage==='showdown'){finish(st,true);return;}
    const k=st.stage==='flop'?3:1,cards=st.deck.slice(st.di,st.di+k);st.di+=k;st.comm.push(...cards);
    ev(st,{type:'street',stage:st.stage,cards});
    runout=st.seats.filter(canAct).length<2;
    from=st.dealer;                              // post-flop the first able seat after the dealer acts first
  }
}

// Pot layers. Page mode: one pot for all live seats. Side-pot mode: classic layers by all-in level; chips put in by
// folded seats count toward the layers; anything above the highest live level stays in the top layer.
function layersOf(st){
  const live=liveSeats(st);
  if(!st.sidePots)return[{amount:st.pot,elig:live.map(s=>s.idx)}];
  const lv=[...new Set(live.map(s=>s.put))].sort((a,b)=>a-b),out=[];
  let prev=0;
  lv.forEach((L,i)=>{
    const top=i===lv.length-1;
    let amount=0;
    for(const s of st.seats)amount+=Math.max(0,(top?s.put:Math.min(s.put,L))-prev);
    if(amount>0)out.push({amount,elig:live.filter(s=>s.put>=L).map(s=>s.idx)});
    prev=L;
  });
  return out;
}

function finish(st,contested){
  const pot=st.pot,live=liveSeats(st);
  const fl=Math.floor;
  const rake=(CFG.RAKE_NEEDS_FLOP&&!st.comm.length)?0:fl(Math.min(pot*CFG.RAKE,CFG.RAKECAP)+1e-9);
  const bbj=contested?fl(pot*CFG.BBJD+1e-9):0;
  const layers=layersOf(st);
  let take=Math.min(pot,rake+bbj);               // rake and jackpot drop come off the lowest layers first
  const rakeT=Math.min(rake,take),bbjT=take-rakeT;
  for(const L of layers){const d=Math.min(L.amount,take);L.amount-=d;take-=d;}
  const rank={};
  if(contested)for(const s of live){const h=evalH(s.hole,st.comm);rank[s.idx]=h;ev(st,{seat:s.idx,type:'showdown',cards:s.hole,handName:h.name});}
  const won={};
  const pots=layers.map(L=>{
    let w=L.elig;
    if(contested){
      const best=L.elig.reduce((b,i)=>b===null||rank[i].rank>rank[b].rank||(rank[i].rank===rank[b].rank&&rank[i].tb>rank[b].tb)?i:b,null);
      w=L.elig.filter(i=>rank[i].rank===rank[best].rank&&rank[i].tb===rank[best].tb);
    }
    const share=fl(L.amount/w.length),rem=L.amount-share*w.length;
    w.forEach((i,k)=>{won[i]=(won[i]||0)+share+(k===0?rem:0);});    // odd chips to the first winner in seat order (page)
    return{amount:L.amount,eligible:L.elig,winners:w};
  });
  const winners=Object.keys(won).map(Number).sort((a,b)=>a-b).filter(i=>won[i]>0).map(i=>({seat:i,amount:won[i],handName:contested?rank[i].name:null}));
  for(const w of winners){st.seats[w.seat].chips+=w.amount;ev(st,{seat:w.seat,type:'win',amount:w.amount,handName:w.handName});}
  st.rake+=rakeT;st.bbj+=bbjT;
  for(const s of st.seats)s.bet=0;
  st.pot=0;st.toAct=null;st.over=true;st.showdown=contested;
  st.result={winners,pots,rake:rakeT,bbj:bbjT,showdown:contested};
}

export function isOver(st){return st.over;}
export function result(st){return st.result;}

export function legal(st){
  if(st.over||st.toAct===null)return null;
  const s=st.seats[st.toAct],mb=maxBet(st),owed=mb-s.bet,maxRaiseTo=s.chips+s.bet,canRaise=s.chips>owed;
  return{seat:s.idx,canCheck:owed===0,callAmt:Math.min(owed,s.chips),
    minRaiseTo:canRaise?Math.min(mb+st.lastRaise,maxRaiseTo):maxRaiseTo,maxRaiseTo,canRaise};
}

// action: {type:'fold'|'check'|'call'|'raise', amount?}. 'raise' amount = TOTAL street bet ("raise to"), integer in
// [minRaiseTo,maxRaiseTo], or exactly maxRaiseTo (all-in, may be below the minimum). Mutates st in place, only after
// every check has passed. Never throws on bad input.
export function applyAction(st,seat,action){
  try{
    if(!st||st.over||st.toAct===null)return{ok:false,why:'hand over'};
    if(seat!==st.toAct)return{ok:false,why:'not your turn'};
    if(!action||typeof action!=='object')return{ok:false,why:'bad action'};
    const L=legal(st),s=st.seats[seat],type=action.type;
    let to;
    if(type==='check'){if(!L.canCheck)return{ok:false,why:'cannot check, call owed'};}
    else if(type==='call'){if(L.canCheck)return{ok:false,why:'nothing to call'};}
    else if(type==='fold'){}
    else if(type==='raise'){
      to=action.amount;
      if(!L.canRaise)return{ok:false,why:'cannot raise'};
      if(typeof to!=='number'||!Number.isSafeInteger(to))return{ok:false,why:'amount must be an integer'};
      if(to>L.maxRaiseTo)return{ok:false,why:'amount exceeds stack'};
      if(to<L.minRaiseTo&&to!==L.maxRaiseTo)return{ok:false,why:'below minimum raise'};
    }else return{ok:false,why:'unknown action type'};
    const from=st.events.length,mb=maxBet(st);
    st.actN++;
    if(type==='fold'){s.folded=true;s.acted=true;ev(st,{seat,type:'fold'});}
    else if(type==='check'){s.acted=true;ev(st,{seat,type:'check'});}
    else{
      const put=type==='call'?L.callAmt:to-s.bet;
      s.chips-=put;s.put+=put;s.bet+=put;s.acted=true;st.pot+=put;
      if(!s.chips)s.allIn=true;
      // A full raise sets the new minimum; a short all-in raise does not. (The page also clears every other seat's `acted`
      // flag on a full raise, but that is a no-op: after any raise each other live seat owes chips, so findNext asks it anyway.)
      if(type==='raise'&&s.bet-mb>=st.lastRaise)st.lastRaise=s.bet-mb;
      ev(st,{seat,type:s.allIn?'allin':type,via:type,amount:put,to:s.bet,open:type==='raise'&&mb===0});
    }
    settle(st,seat);
    return{ok:true,events:st.events.slice(from)};
  }catch(e){return{ok:false,why:'engine error'};}
}

// Public view for `forSeat` (default hero 0). events: only those from index `fromEvent` on (evN = total count).
// Hole cards: forSeat's own, plus every live seat at a contested showdown once the hand is over. Nothing else.
export function view(st,forSeat=0,fromEvent=0){
  const show=i=>i===forSeat||(st.over&&st.showdown&&!st.seats[i].folded);
  return{handNo:st.handNo,commit:st.commit,stage:st.stage,over:st.over,dealer:st.dealer,
    seats:st.seats.map(s=>({idx:s.idx,name:s.name,isBot:s.isBot,chips:s.chips,bet:s.bet,folded:s.folded,allIn:s.allIn,
      hole:show(s.idx)&&s.hole.length?s.hole.map(c=>({r:c.r,s:c.s})):null})),
    comm:st.comm.map(c=>({r:c.r,s:c.s})),pot:st.pot,toAct:st.toAct,
    legal:st.toAct===forSeat?legal(st):null,
    events:st.events.slice(fromEvent).map(e=>e.type==='deal'&&e.seat!==forSeat?{seat:e.seat,type:'deal'}:e),
    evN:st.events.length,result:st.result};
}

// Minimal facts for bots.decide (B2/NEEDS.md). Reads only what the seat itself may know.
export function botView(st,seat){
  const s=st.seats[seat],L=legal(st)||{minRaiseTo:0,maxRaiseTo:0,canRaise:false,canCheck:true},mb=maxBet(st);
  return{seat,hole:s.hole.map(c=>({r:c.r,s:c.s})),comm:st.comm.map(c=>({r:c.r,s:c.s})),stage:st.stage,
    handRank:evalH(s.hole,st.comm).rank,pot:st.pot,callAmt:Math.max(0,mb-s.bet),bet:s.bet,chips:s.chips,
    numOpp:st.seats.filter(o=>!o.folded&&o.idx!==seat).length,numSeats:st.seats.length,dealer:st.dealer,
    minRaiseTo:L.minRaiseTo,maxRaiseTo:L.maxRaiseTo,canRaise:L.canRaise,canCheck:L.canCheck,agg:s.agg};
}
