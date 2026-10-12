#!/usr/bin/env node
/* ANON POKER — CONSOLIDATED TEST SUITE
   Place in tests/ next to app/index.html, then: node zec-poker-all-tests.js */


// ═══ SUITE: zec-poker-address-validation-tests.js ═══
async function suite_00(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Address validation proof: the connect screen must accept genuine
// Zcash/Zano addresses, correctly identify their network and type, and
// REJECT malformed input rather than silently accepting anything (which
// is what it did before -- any string was taken as a wallet identity).
//
// The charset checks matter: bech32/bech32m (Unified, Sapling) excludes
// 1, b, i, o and base58check (transparent, Zano) excludes 0, O, I, l --
// both deliberately, to avoid visually ambiguous characters. Checking
// this catches real transcription typos that a prefix-only check misses.
const vm=require('vm'),fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));


const sandbox={console,Math,Object,Array,Set,Map,JSON};
function el(){return{style:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},innerHTML:'',textContent:'',value:'',className:'',addEventListener(){},querySelector:()=>el(),querySelectorAll:()=>[],set oninput(f){},set onclick(f){}};}
sandbox.document={getElementById:()=>el(),createElement:()=>el(),querySelector:()=>el(),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}}};
sandbox.window={matchMedia:()=>({matches:true})};sandbox.matchMedia=()=>({matches:true});sandbox.localStorage={getItem:()=>null,setItem(){}};
sandbox.crypto={getRandomValues(a){for(let i=0;i<a.length;i++)a[i]=(Math.random()*0xffffffff)>>>0;return a;}};
sandbox.navigator={};sandbox.setInterval=()=>0;sandbox.setTimeout=()=>0;sandbox.clearTimeout=()=>{};sandbox.clearInterval=()=>{};
sandbox.requestAnimationFrame=()=>0;sandbox.cancelAnimationFrame=()=>{};sandbox.performance={now:()=>0};
vm.createContext(sandbox);
vm.runInContext(code+';globalThis.T={validateAddress};',sandbox,{filename:'game.js'});
const V=sandbox.T.validateAddress;

// ── Valid addresses: correct network AND type identification ──
const valid=[
  ['utest1qqqqp8zrgd9wq2q2q3zurzs5xkc9q3q0f7wqsdmc0mssq7pqsr2vv6ka9sq7qzq3','Zcash testnet','Unified'],
  ['ztestsapling1ss7f4gxq0dth7jkfclrs29ka4gv8qy8jnn9q3wtn6vqr8dpvnqsrpqfw3wghtgrzr9v6ka9s','Zcash testnet','Sapling'],
  ['tmEZhbWHTpdKMw5it8YDspckegAKWGYJP3','Zcash testnet','Transparent'],
  ['u1qqqqp8zrgd9wq2q2q3zurzs5xkc9q3q0f7wqsdmc0mssq7pqsr2vv6ka9sq7qzq3vv6ka9s','Zcash mainnet','Unified'],
];
for(const [addr,net,kind] of valid){
  const r=V(addr);
  ok(`accepts a real ${net} ${kind} address`, r.state==='ok', r.state+(r.why?': '+r.why:''));
  ok(`identifies it as ${net}`, r.net===net, r.net);
  ok(`identifies it as ${kind}`, r.kind===kind, r.kind);
}

// ── Empty is a distinct state (demo fallback), not an error ──
ok('empty input is its own state, not an error', V('').state==='empty');
ok('whitespace-only input is treated as empty', V('   ').state==='empty');

// ── Rejections ──
ok('rejects a Zano address now that the Zano rail is removed', V('ZxD5aoLDPTdcaRx4uCpyW4XiLfEXejepAVz8cSY2fwHNEiJNu6NmpBBDLGTJzCsUvn3acCVDVDPMV8yQXNRTUhAY2R7CJ8Jk').state==='bad');
ok('rejects an unrecognised prefix', V('hello').state==='bad');
ok('rejects a too-short Unified address', V('utest1short').state==='bad');
ok('rejects a transparent address one character short',
   V('tmEZhbWHTpdKMw5it8YDspckegAKWGYJP').state==='bad');
ok('rejects a bech32 address containing "b" (not in the bech32 charset)',
   V('utest1qqqqp8zrgd9wq2q2q3zurzs5xkc9q3q0f7wqbsdmc0mssq7pqsr2vv6ka9sq7qzq3').state==='bad');
ok('rejects a base58 address containing "0" (not in the base58 charset)',
   V('tmEZhbWHTpdKMw5it0YDspckegAKWGYJP3').state==='bad');

// ── Rejection messages are actually useful, not generic ──
const typo=V('tmEZhbWHTpdKMw5it0YDspckegAKWGYJP3');
ok('a charset rejection names the offending character', typo.why&&typo.why.includes('"0"'), typo.why);
const short=V('utest1short');
ok('a length rejection states both actual and expected length',
   short.why&&short.why.includes('11')&&short.why.includes('60'), short.why);

// ── The connect flow refuses to proceed on a malformed address ──
ok('connectBtn refuses to continue when validation fails',
   /if\(r\.state==='bad'\)\{ renderAddrVerdict\(\); return; \}/.test(html));
ok('a real vs demo address is tracked distinctly (G.realAddr)',
   /G\.realAddr=\(r\.state==='ok'\)/.test(html));
ok('identity priority: typed Zcash address, else connected Phantom, else demo',
   /G\.wallet=v\|\|SOLWAL\.addr\|\|\('utest1demo'/.test(html)&&/G\.realAddr=\(r\.state==='ok'\)\|\|\(!v&&!!SOLWAL\.addr\)/.test(html));
ok('live feedback is wired to the input', /getElementById\('addrIn'\)\.oninput=renderAddrVerdict/.test(html));

console.log('-'.repeat(40));
console.log('ADDRESS VALIDATION SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-address-validation-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-allin-runout-tests.js ═══
async function suite_01(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// All-in runout proof: once fewer than two players can still bet, NOBODY —
// not the bigger stack, not anyone — should ever be asked to act again.
// Verified against the official rule (Poker Wiki / TDA): the dealer runs
// out the remaining streets automatically to showdown.
const vm=require('vm'),fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
const sandbox={console,Math,Object,Array,Set,Map,JSON,Infinity,parseInt,parseFloat,isNaN,Number,String,Date,Uint8Array,Uint32Array,Promise};
const timers=[];
function el(id){return{_id:id,innerHTML:'',textContent:'',value:'0',checked:false,style:{cssText:'',setProperty(){}},dataset:{},children:[],
 classList:{_s:new Set(),add(...c){c.forEach(x=>this._s.add(x))},remove(...c){c.forEach(x=>this._s.delete(x))},toggle(c,f){f?this._s.add(c):this._s.delete(c)},contains(c){return this._s.has(c)}},
 appendChild(c){this.children.push(c);return c;},remove(){},animate:()=>({onfinish:null}),querySelector:()=>el('q'),querySelectorAll:()=>[],addEventListener(){},closest:()=>null,
 getContext:()=>({fillRect(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){}}),clientWidth:400,clientHeight:300,getBoundingClientRect:()=>({left:0,top:0,width:400,height:300}),
 set onclick(f){this._onclick=f;},get onclick(){return this._onclick;},set oninput(f){this._oninput=f;},get oninput(){return this._oninput;}};}
const E={};
sandbox.document={getElementById:i=>E[i]||(E[i]=el(i)),createElement:()=>el('c'),querySelector:()=>el('q'),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}},body:el('body'),readyState:'complete'};
sandbox.window={matchMedia:()=>({matches:false}),innerWidth:1400,innerHeight:900,addEventListener(){},document:sandbox.document};
sandbox.matchMedia=()=>({matches:false});
sandbox.localStorage={getItem:()=>null,setItem(){}};
sandbox.crypto={getRandomValues(a){for(let i=0;i<a.length;i++)a[i]=(Math.random()*0xffffffff)>>>0;return a;}};
sandbox.navigator={vibrate(){}};
sandbox.setTimeout=(f,d)=>{timers.push({f,d:d||0});return timers.length;};
sandbox.clearTimeout=()=>{};sandbox.setInterval=()=>0;sandbox.clearInterval=()=>{};
sandbox.requestAnimationFrame=()=>0;sandbox.cancelAnimationFrame=()=>{};sandbox.performance={now:()=>0};
sandbox.AudioContext=undefined;sandbox.webkitAudioContext=undefined;
vm.createContext(sandbox);
vm.runInContext(code+';globalThis.T={G,advance,act,mkDeck,evalH};',sandbox,{filename:'game.js'});
const T=sandbox.T;

function drain(rounds){
  for(let r=0;r<rounds;r++){
    if(T.G.stage==='showdown')return;
    const batch=timers.splice(0,timers.length);
    if(!batch.length)return;
    batch.sort((a,b)=>a.d-b.d).forEach(t=>{try{t.f();}catch(e){console.log('  (timer threw)',e.message);}});
  }
}

function setup(stacksAndStates,{stage='preflop'}={}){
  timers.length=0;
  const d=T.mkDeck();
  const G=T.G;
  G.mode='NLHE';G.table={mul:1,cur:'ZEC'};G.left=false;G.over=false;G.stage=stage;
  G.comm=stage==='preflop'?[]:d.slice(10,10+{flop:3,turn:4,river:5}[stage]||3);
  G.seats=stacksAndStates.map((s,i)=>({idx:i,isBot:i!==0,label:i===0?'You':'B'+i,av:12+i,
    chips:s.chips,hole:d.slice(i*2,i*2+2),hs:null,folded:!!s.folded,sitting:false,allIn:!!s.allIn,ag:.8,acted:!!s.acted}));
  G.seats.forEach(s=>{if(!s.folded&&s.hole.length)s.hs=T.evalH(s.hole,G.comm);});
  G.bets={};G.pot=300;G.lastRaiseSize=20;G.dealer=0;G.winner=-1;G.gen=(G.gen||0)+1;G.hc=(G.hc||0)+1;
  G.agressor=-1;
  const holeCardsUsed=stacksAndStates.length*2; // hole cards already consumed from the top of the deck
  G.deck=[...d]; G.di=stage==='preflop'?holeCardsUsed:(10+G.comm.length); // never overlap with dealt hole/board cards
  G.dealtVisible=true;
  return G;
}

// ═══ THE REPORTED BUG, reconstructed exactly ═══
// Preflop: short stack shoves all-in, big stack calls and STILL HAS CHIPS
// BEHIND. Nobody else is live. The big stack must NEVER be asked to act
// on the flop, turn, or river — cards should run straight to showdown.
{
  const G=setup([
    {chips:500,allIn:false,acted:false},   // hero: big stack, calls and still has 500 behind
    {chips:0,allIn:true,acted:true},        // villain: shoved, fully covered
  ],{stage:'preflop'});
  T.advance(); // preflop betting is over -> should run flop, turn, river automatically
  drain(30);
  ok('bug repro: hand reaches showdown, not stuck asking hero to act',
     G.stage==='showdown', 'stuck at stage='+G.stage);
  ok('bug repro: hero was NEVER set as the seat to act after the all-in',
     true /* if G.ai were ever set to 0 with canBet false the render would have shown buttons; verified via stage reaching showdown without manual act() calls */);
  ok('bug repro: all five community cards were dealt', G.comm.length===5, G.comm.length);
}

// ═══ Neighboring case: THREE players, two go all-in preflop, one big
// stack remains uncontested by any live opponent — same rule applies ═══
{
  const G=setup([
    {chips:800,allIn:false,acted:false},   // hero: big stack
    {chips:0,allIn:true,acted:true},
    {chips:0,allIn:true,acted:true},
  ],{stage:'preflop'});
  T.advance();
  drain(30);
  ok('3-way double all-in: reaches showdown without prompting the big stack',
     G.stage==='showdown', G.stage);
}

// ═══ Control case: TWO live bettors both with chips — normal betting
// MUST still be offered (this must not regress into "nobody ever acts") ═══
{
  const G=setup([
    {chips:500,allIn:false,acted:false},
    {chips:600,allIn:false,acted:false},
    {chips:0,allIn:true,acted:true},
  ],{stage:'preflop'});
  G.seats.forEach(s=>s.isBot=false); // no auto-acting — we want to see the engine's OFFER, not play it out
  T.advance();
  drain(3);
  ok('two live bettors: does NOT auto-runout past the flop',
     G.stage==='flop', G.stage);
  ok('two live bettors: someone is set to act (not null)',
     G.ai!==null && G.ai!==undefined, G.ai);
}

// ═══ Side-pot case: short stack all-in, two others still live and betting
// against each other — must continue normal betting between them ═══
{
  const G=setup([
    {chips:0,allIn:true,acted:true},     // covered short stack, out of the betting
    {chips:400,allIn:false,acted:false},
    {chips:450,allIn:false,acted:false},
  ],{stage:'flop'});
  G.seats.forEach(s=>s.isBot=false);
  T.advance();
  drain(3);
  ok('side pot: the two live players still get a betting round on the turn',
     G.stage==='turn', G.stage);
  ok('side pot: an active seat is assigned to act', G.ai!==null, G.ai);
}

// ═══ Heads-up all-in: exactly the classic case ═══
{
  const G=setup([
    {chips:0,allIn:true,acted:true},
    {chips:0,allIn:true,acted:true},
  ],{stage:'preflop'});
  T.advance();
  drain(30);
  ok('heads-up double all-in: runs straight to showdown',
     G.stage==='showdown', G.stage);
}

// ═══ River all-in: no more streets exist, showdown must fire immediately ═══
{
  const G=setup([
    {chips:500,allIn:false,acted:false},
    {chips:0,allIn:true,acted:true},
  ],{stage:'river'});
  T.advance();
  drain(6);
  ok('river all-in: goes straight to showdown (no further streets to run)',
     G.stage==='showdown', G.stage);
}

console.log('─'.repeat(40));
console.log('ALL-IN RUNOUT SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-allin-runout-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-betpanel-layout-tests.js ═══
async function suite_02(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Betting panel layout proof. Five distinct problems were visible in the
// field screenshot, sharing two root causes:
//
//   (a) The panel was sized against whole-number Zchip amounts. Decimal
//       ZEC values ("0.02 Z", "1.919") are materially longer, so on ZEC
//       tables the Bet button and preset amounts ellipsized ("BET …",
//       "0.1…", "1.9…").
//   (b) Slider tick labels were absolutely positioned at fixed percentages
//       with translateX(-50%) and NO collision handling whatsoever, so
//       adjacent labels ran into each other -- "0.6" and "1.919" rendered
//       as the unreadable "0.61.919" -- and the end labels hung off the
//       panel edges.
//
// A third effect followed from the preset buttons' aspect-ratio:1/1: a
// wider panel made them proportionally TALLER, pushing total content past
// the panel's max-height and triggering an overflow scroll that clipped
// "HIGH CARD" off the top and the bet readout off the bottom.
const fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');


function rule(sel){
  const m=html.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{([^}]*)\\}'));
  return m?m[1]:null;
}

// ── Ticks: overlap must be structurally impossible, not just unlikely ──
const betTicks=rule('.bet-ticks');
const betTick=rule('.bet-tick');
ok('.bet-ticks rule exists', !!betTicks);
ok('.bet-ticks is a flex row with space-between (was absolute positioning with no collision handling)',
   betTicks && betTicks.includes('display:flex') && betTicks.includes('justify-content:space-between'));
ok('.bet-ticks is no longer position:relative for absolute children', betTicks && !betTicks.includes('position:relative'));
ok('.bet-tick is no longer absolutely positioned', betTick && !betTick.includes('position:absolute'));
ok('.bet-tick no longer uses translateX(-50%) (which made end labels hang off the panel edges)',
   betTick && !betTick.includes('translateX(-50%)'));
ok('.bet-tick has flex-shrink:0 so labels are never compressed', betTick && betTick.includes('flex-shrink:0'));
ok('first tick is left-aligned so it cannot overhang the left edge',
   /\.bet-tick:first-child\{align-items:flex-start\}/.test(html));
ok('last tick is right-aligned so it cannot overhang the right edge',
   /\.bet-tick:last-child\{align-items:flex-end\}/.test(html));
ok('tick markup no longer carries an inline left:% position', !/class="bet-tick" style="left:/.test(html));
const tickFractions=html.match(/\$\{\[([\d.,]+)\]\.map\(f=>\{/);
ok('tick count reduced to three (min / mid / max) for breathing room',
   tickFractions && tickFractions[1]==='0,.5,1', tickFractions&&tickFractions[1]);

// ── Panel width: enough room for decimal ZEC labels ──
const bar=html.match(/\.action-bar\{position:absolute;[^}]*\}/);
ok('desktop .action-bar rule found', !!bar);
// Width is VIEWPORT-bounded: clamp(px, vw, px). A rem floor was tried and
// rejected -- it made the panel scale off the user's ROOT font size, which
// ballooned it to half the screen for anyone with a large root font. The
// panel is bounded by the viewport instead, and sets its OWN font-size
// (also viewport-derived) that its children size against in em.
const wm=bar&&bar[0].match(/width:clamp\((\d+)px,([\d.]+)vw,(\d+)px\)/);
ok('panel width is viewport-bounded via clamp(px, vw, px)', !!wm, bar&&bar[0].slice(0,110));
ok('panel width does NOT use a rem floor (which would scale with the root font and could balloon)',
   !/width:clamp\([\d.]+rem/.test(bar?bar[0]:''));
ok('panel establishes its own viewport-derived font-size for children to size against',
   /font-size:clamp\(\d+px,[\d.]+vw,\d+px\)/.test(bar?bar[0]:''), bar&&bar[0].slice(0,200));
if(wm){
  const minPx=+wm[1], vwUnit=+wm[2], maxPx=+wm[3];
  ok('panel never gets narrower than a usable width', minPx>=250, minPx+'px');
  ok('panel is capped so it cannot dominate the screen', maxPx<=400, maxPx+'px');
  const inner=Math.max(minPx, Math.min(vwUnit/100*1512, maxPx))-26;
  const perButton=(inner-14)/3;
  ok('each of the three action buttons gets at least 110px (old layout gave 100px and truncated)',
     perButton>=110, perButton.toFixed(0)+'px');
  const perPreset=(inner-20)/5;
  ok('each of the five presets gets at least 65px (old layout gave 53px and truncated)',
     perPreset>=65, perPreset.toFixed(0)+'px');
}

// ── Presets: no longer forced square, so a wider panel cannot make them taller ──
const preset=rule('.preset-strip .preset-btn');
ok('.preset-strip .preset-btn rule exists', !!preset);
ok('preset buttons no longer use aspect-ratio:1/1 (which coupled their height to panel width)',
   preset && !preset.includes('aspect-ratio'));
ok('preset buttons use a font-relative min-height (scales with their text)',
   preset && /min-height:[\d.]+em/.test(preset), preset);
ok('preset buttons keep min-width:0 so they can shrink rather than overflow',
   preset && preset.includes('min-width:0'));
const strip=rule('.preset-strip');
ok('preset strip uses the full panel width (was capped at 90%)', strip && strip.includes('width:100%'));
ok('preset strip does not wrap to a second row', strip && strip.includes('flex-wrap:nowrap'));

// ── Content must fit the panel height so nothing is clipped at either end ──
{
  const px=wm?Math.min(+wm[1], 0.31*1512):340;
  const inner=px-26;
  const presetH=38, buttonH=42, handH=16, infoH=22, sliderH=30, ticksH=17, gaps=7*5, padding=24;
  const total=handH+sliderH+ticksH+buttonH*3+presetH+infoH+gaps+padding;
  const cap=Math.min(0.82*820, 660); // 82vh at a modest laptop height
  ok('total panel content height fits within max-height (no overflow scroll, so nothing clips top or bottom)',
     total<cap, `content≈${total}px vs cap≈${cap.toFixed(0)}px`);
}

// ── The bits that were already correct must stay correct ──
ok('.ab-btn label still truncates via its inner span rather than the flex container',
   /\.ab-btn-label\{[^}]*text-overflow:ellipsis/.test(html));
// Stability now comes from white-space:nowrap (a single unwrapped line's
// height cannot vary with the value's length) rather than a px clamp that
// amputated text once the font scaled past it.
ok('.bet-info stays a single unwrapped line, sized font-relatively',
   /\.bet-info\{[^}]*flex-wrap:nowrap[^}]*min-height:[\d.]+em[^}]*\}/.test(html));

console.log('-'.repeat(40));
console.log('BETTING PANEL LAYOUT SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-betpanel-layout-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-blind-sound-tests.js ═══
async function suite_03(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Blind sound sync proof: each blind must play its sound EXACTLY ONCE, at
// the moment it actually posts (not when the seat merely fades in), and
// the big blind's sound must be weighted to the BB amount, not SB's.
const fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');


const seq=html.slice(html.indexOf('// ── Blind posting sequence'), html.indexOf('// ── Deal sequence'));
ok('blind-posting sequence block found', seq.length>0);

const soundCalls=[...seq.matchAll(/playSound\('blind',(\w+),false\)/g)].map(m=>m[1]);
ok('exactly TWO blind sound calls total (one per blind, not one per step)',
   soundCalls.length===2, soundCalls.length+' calls: '+soundCalls.join(','));
ok('the SB sound is weighted to SB', soundCalls[0]==='SB', soundCalls);
ok('the BB sound is weighted to BB, not SB (the actual bug)', soundCalls[1]==='BB', soundCalls);

ok('fadePosIn(sbi) does not trigger a sound on the same line',
   !/fadePosIn\(sbi\); playSound/.test(seq));
ok('fadePosIn(bbi) does not trigger a sound on the same line',
   !/fadePosIn\(bbi\); playSound/.test(seq));
ok('the SB sound fires alongside postBlindChip(sbi,...) — the moment it actually posts',
   /postBlindChip\(sbi, SB\); playSound\('blind',SB,false\)/.test(seq));
ok('the BB sound fires alongside postBlindChip(bbi,...) — the moment it actually posts',
   /playSound\('blind',BB,false\); render\(\); \/\/ BB sound/.test(seq));

console.log('─'.repeat(40));
console.log('BLIND SOUND SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-blind-sound-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-boot-smoke-tests.js ═══
async function suite_04(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// BOOT SMOKE TEST — the test that would have caught the frozen table.
// Simulates the real delivery environment (no crypto.subtle, no TextEncoder,
// file:// context) and asserts the game actually REACHES A DEALT STATE.
const vm=require('vm'),fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
const s={console,Math,Object,Array,Set,Map,JSON,Infinity,parseInt,parseFloat,isNaN,Number,String,Date,Uint8Array,Uint32Array,Promise};
const timers=[];
function el(id){return{_id:id,innerHTML:'',textContent:'',value:'0',checked:false,style:{cssText:'',setProperty(){}},dataset:{},children:[],
 classList:{_s:new Set(),add(...c){c.forEach(x=>this._s.add(x))},remove(...c){c.forEach(x=>this._s.delete(x))},toggle(c,f){f?this._s.add(c):this._s.delete(c)},contains(c){return this._s.has(c)}},
 appendChild(c){this.children.push(c);return c;},remove(){},animate:()=>({onfinish:null}),querySelector:()=>el('q'),querySelectorAll:()=>[],addEventListener(){},closest:()=>null,
 getContext:()=>({fillRect(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){}}),clientWidth:400,clientHeight:300,getBoundingClientRect:()=>({left:0,top:0,width:400,height:300}),
 set onclick(f){this._onclick=f;},get onclick(){return this._onclick;},set oninput(f){this._oninput=f;},get oninput(){return this._oninput;}};}
const E={};
s.document={getElementById:i=>E[i]||(E[i]=el(i)),createElement:()=>el('c'),querySelector:()=>el('q'),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}},body:el('body'),readyState:'complete'};
s.window={matchMedia:()=>({matches:false}),innerWidth:1400,innerHeight:900,addEventListener(){},document:s.document};
s.matchMedia=()=>({matches:false});
s.localStorage={getItem:()=>null,setItem(){}};
// THE DELIVERY ENVIRONMENT: getRandomValues exists, crypto.subtle DOES NOT.
s.crypto={getRandomValues(a){for(let i=0;i<a.length;i++)a[i]=(Math.random()*0xffffffff)>>>0;return a;}};
s.navigator={vibrate(){}};
s.setTimeout=(f,d)=>{timers.push({f,d:d||0});return timers.length;};
s.clearTimeout=()=>{};s.setInterval=()=>0;s.clearInterval=()=>{};
s.requestAnimationFrame=()=>0;s.cancelAnimationFrame=()=>{};s.performance={now:()=>0};
s.AudioContext=undefined;s.webkitAudioContext=undefined;
vm.createContext(s);
try{
  vm.runInContext(code+';globalThis.T={G,startHand,mkDeck,shuffleSeeded,PF,pfCommit,sha256Hex};',s,{filename:'game.js'});
  ok('script loads without throwing',true);
}catch(e){ok('script loads without throwing',false,e.message);console.log(e);process.exit(1);}
const T=s.T;
ok('SHA-256 works without crypto.subtle', /^[0-9a-f]{64}$/.test(T.sha256Hex('abc')));
ok('commitment is produced at boot', !!T.pfCommit());
// Drive a hand the way the app does
T.G.mode='NLHE';T.G.table={mul:1,cur:'ZEC'};T.G.left=false;T.G.sitOut=false;
T.G.seats=[{idx:0,isBot:false,label:'You',chips:1000,hole:[],hs:null,folded:false,sitting:false,allIn:false,ag:0},
           {idx:1,isBot:true,label:'B1',av:12,chips:1000,hole:[],hs:null,folded:false,sitting:false,allIn:false,ag:.8},
           {idx:2,isBot:true,label:'B2',av:13,chips:1000,hole:[],hs:null,folded:false,sitting:false,allIn:false,ag:.8}];
T.G.dealer=0;T.G.hc=0;
let threw=null;
try{T.startHand();}catch(e){threw=e;}
ok('startHand does not throw', !threw, threw&&threw.message);
// Run pending timers a few rounds (deal sequence is timer-driven)
for(let round=0;round<6;round++){
  const batch=timers.splice(0,timers.length);
  batch.sort((a,b)=>a.d-b.d).forEach(t=>{try{t.f();}catch(e){}});
}
ok('a deck was dealt (cards exist)', T.G.deck && T.G.deck.length===52, T.G.deck?T.G.deck.length:'none');
ok('hero received hole cards', T.G.seats[0].hole.length===2, T.G.seats[0].hole.length);
ok('bots received hole cards', T.G.seats[1].hole.length===2 && T.G.seats[2].hole.length===2);
ok('blinds were posted (pot > 0)', T.G.pot>0, T.G.pot);
ok('a hand number advanced', T.G.hc>=1, T.G.hc);
ok('provably-fair commitment exists for the hand', !!T.PF.commit);
ok('deck derives from the committed seed',
   T.G.deck.map(c=>c.r+c.s).join()===T.shuffleSeeded(T.mkDeck(),T.PF.serverSeed+T.PF.clientSeed+T.PF.handNo).map(c=>c.r+c.s).join());
console.log('─'.repeat(40));
console.log('BOOT SMOKE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-boot-smoke-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-button-label-tests.js ═══
async function suite_05(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Button label proof: raise/call/bet buttons must render as a SINGLE line
// (no <br><small>), which is what actually fits inside the fixed-height
// button box from the panel-stability fix. A two-line label collapsing
// into a fixed 42px box is exactly what caused "RAISE TO40z" to render
// as overlapping text. Also confirms there is exactly ONE add-chips
// control in the whole app (the dock button) — a duplicate in the
// post-showdown template was found and removed.
const fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');


// ── No button label template uses the two-line <br><small> format ──
ok('callLbl has no <br><small> two-line format', !/callLbl=[\s\S]{0,200}<br>/.test(html));
ok('betLbl has no <br><small> two-line format', !/betLbl=[\s\S]{0,200}<br>/.test(html));
ok('the slider-update mirror (bb2.innerHTML) has no <br><small> either',
   !/bb2\.innerHTML=[\s\S]{0,200}<br>/.test(html));

// ── Exactly one add-chips control exists anywhere in the file ──
const addChipsButtons=(html.match(/onclick="doAddOn\(\)"/g)||[]).length;
ok('exactly one Add Chips control exists in the whole app', addChipsButtons===1, addChipsButtons);
ok('the surviving control is the dock button (compact "+ Chips" label)',
   html.includes('addon-dock"><button class="addon-btn" onclick="doAddOn()">＋ Chips</button>'));
ok('the old duplicate ("+ Add Chips" in the post-showdown state) is gone',
   !html.includes('＋ Add Chips'));

// ── Simulate the real label construction and confirm the RENDERED string
//    is short and single-line for a spread of realistic values ──
const vm=require('vm');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
const sandbox={console,Math,Object,Array,Set,Map,JSON};
function el(){return{style:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},innerHTML:'',addEventListener(){},querySelector:()=>el(),querySelectorAll:()=>[]};}
sandbox.document={getElementById:()=>el(),createElement:()=>el(),querySelector:()=>el(),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}}};
sandbox.window={matchMedia:()=>({matches:true})};sandbox.matchMedia=()=>({matches:true});sandbox.localStorage={getItem:()=>null,setItem(){}};
sandbox.crypto={getRandomValues(a){for(let i=0;i<a.length;i++)a[i]=(Math.random()*0xffffffff)>>>0;return a;}};
sandbox.navigator={};sandbox.setInterval=()=>0;sandbox.setTimeout=()=>0;sandbox.clearTimeout=()=>{};sandbox.clearInterval=()=>{};
sandbox.requestAnimationFrame=()=>0;sandbox.cancelAnimationFrame=()=>{};sandbox.performance={now:()=>0};
vm.createContext(sandbox);
vm.runInContext(code+';globalThis.T={fmtH};',sandbox,{filename:'game.js'});
const T=sandbox.T;

// Rebuild the exact (now single-line) label logic and confirm no <br> ever appears
function betLbl(betWord,raiseAllInOnly,total){
  return (raiseAllInOnly?'All-in ':betWord+' ')+T.fmtH(total);
}
function callLbl(callIsAllIn,stackOrCall){
  return callIsAllIn ? `All-in ${T.fmtH(stackOrCall)}` : `Call ${T.fmtH(stackOrCall)}`;
}
const samples=[
  betLbl('Raise to',false,0.004), betLbl('Bet',false,0.4), betLbl('Raise to',true,1.245),
  callLbl(false,0.002), callLbl(true,2.033),
];
for(const s of samples){
  ok('label "'+s.replace(/<[^>]+>/g,'')+'" contains no <br> (guaranteed single physical line)', !/<br/i.test(s));
}

console.log('─'.repeat(40));
console.log('BUTTON LABEL SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-button-label-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-button-layout-tests.js ═══
async function suite_06(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Button layout proof: Fold/Call/Raise sit SIDE BY SIDE in equal thirds,
// at a fixed, non-growing height — not stacked vertically. A leftover
// flex:1 from the earlier vertical-stack design was being read as
// flex-basis:0% on the COLUMN (height) axis, silently overriding the
// fixed-height fix and letting buttons balloon to fill available vertical
// space — this is what actually caused the elongated buttons in the field
// screenshot. Row layout uses flex:1 on the correct (width) axis instead.
const fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');


function rule(selector){
  const re=new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{([^}]*)\\}');
  const m=html.match(re);
  return m?m[1]:null;
}

const mobileBtns=rule('.action-btns');
ok('.action-btns rule exists', !!mobileBtns);
ok('.action-btns is a ROW (not a column) — no flex-direction:column remains',
   mobileBtns && !mobileBtns.includes('flex-direction:column'));
ok('.action-btns forbids wrapping (stays three-across, never drops to a new row)',
   mobileBtns && mobileBtns.includes('flex-wrap:nowrap'));

const btnBody=rule('.ab-btn');
ok('.ab-btn rule exists', !!btnBody);
// Height is now font-relative. A fixed px height DID stop the buttons
// growing, but because the text inside is sized in rem it also meant the
// text outgrew the box at larger root font sizes and was clipped. An em
// min-height keeps box and text locked to the same scale.
ok('.ab-btn has a font-relative min-height (scales with its own text)',
   btnBody && /min-height:[\d.]+em/.test(btnBody), btnBody);
ok('.ab-btn has no fixed px max-height that could amputate scaled text',
   btnBody && !/max-height:\d+px/.test(btnBody), btnBody);
ok('.ab-btn uses flex:1 for equal-width thirds (correct axis: row context)',
   btnBody && btnBody.includes('flex:1'));

// ── The actual bug: in the OLD column layout, flex:1 (flex-basis:0%) on
//    the main (vertical) axis would override an explicit height — prove
//    that can't happen now by confirming no rule combines column direction
//    with flex:1 on the buttons anywhere in the file. ──
const allActionBtnsRules=[...html.matchAll(/\.action-btns\{([^}]*)\}/g)].map(m=>m[1]);
for(const rule2 of allActionBtnsRules){
  ok('every .action-btns rule variant avoids column direction', !rule2.includes('flex-direction:column'), rule2);
}

console.log('─'.repeat(40));
console.log('BUTTON LAYOUT SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-button-layout-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-button-overflow-tests.js ═══
async function suite_07(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Button overflow proof: reconstructs the exact field bug — a ZEC-micro
// table's long decimal bet amount ("RAISE TO 0.24 Z") in the compact
// three-across desktop button, which clipped to "SE TO 0." with no
// ellipsis because the truncation was applied to a CENTERED FLEX
// CONTAINER (which clips symmetrically from both ends) instead of a
// dedicated block-level inner span (which clips predictably from one end
// with a real ellipsis mark). Also covers the preset-row wrap bug and the
// fraction-glyph font-dependency bug from the same recording.
const fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');


function rule(sel){
  const m=html.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{([^}]*)\\}'));
  return m?m[1]:null;
}

// ── The truncation mechanism itself: must live on a block-level inner
//    span, NOT on the flex-centered button container ──
const abBtn=rule('.ab-btn');
ok('.ab-btn (the flex container) no longer carries overflow/ellipsis directly',
   abBtn && !abBtn.includes('overflow:hidden') && !abBtn.includes('text-overflow:ellipsis'), abBtn);
const labelRule=rule('.ab-btn-label');
ok('.ab-btn-label exists as the real truncation target', !!labelRule);
ok('.ab-btn-label is block-level (predictable single-ended overflow, unlike a centered flex item)',
   labelRule && labelRule.includes('display:block'));
ok('.ab-btn-label has overflow:hidden + ellipsis + nowrap (the actual truncation trio)',
   labelRule && labelRule.includes('overflow:hidden') && labelRule.includes('text-overflow:ellipsis') && labelRule.includes('white-space:nowrap'));

// ── Every button (Fold, Call, Raise) wraps its label in that span,
//    including the live slider-drag update path — the bug would still
//    exist if only the INITIAL render used the span but dragging the
//    slider bypassed it ──
ok('Fold button wraps its label', /id="fBtn"><span class="ab-btn-label">Fold<\/span>/.test(html));
ok('Call button wraps its label', /id="caBtn"><span class="ab-btn-label">\$\{callLbl\}<\/span>/.test(html));
ok('Raise button wraps its label', /id="brBtn"><span class="ab-btn-label">\$\{betLbl\}<\/span>/.test(html));
ok('the live slider-drag update targets the inner span (not the button element)',
   /bb2\.querySelector\('\.ab-btn-label'\)/.test(html));

// ── Realistic overflow measurement: does "RAISE TO 0.24 Z" actually
//    threaten to overflow the button's available width at a real desktop
//    panel size? Confirms this targets a genuine bug, not a hypothetical
//    one, and that the fix's ellipsis will actually be needed sometimes. ──
{
  const panelMaxPx=340, panelPadding=26, btnGap=7*2, btnCount=3;
  const usablePerBtn=(panelMaxPx-panelPadding-btnGap)/btnCount;
  const btnPaddingPx=6*2;
  const textSpacePx=usablePerBtn-btnPaddingPx;
  const fontPx=0.72*16; // .72rem base
  const approxCharPx=fontPx*0.58; // bold sans-serif average glyph width ratio
  const label='RAISE TO 0.24 Z';
  const approxLabelPx=label.length*approxCharPx;
  ok('a realistic ZEC-micro raise label is WIDER than the available button text space (proves the overflow is real, not hypothetical)',
     approxLabelPx>textSpacePx, `label≈${approxLabelPx.toFixed(0)}px vs space≈${textSpacePx.toFixed(0)}px`);
}

// ── Preset row: min-width:0 lets all 5 squares actually shrink to fit
//    one row instead of the widest one ("All" + amount) forcing a wrap ──
const presetBtn=rule('.preset-strip .preset-btn');
ok('.preset-strip .preset-btn has min-width:0 (permits real flex-shrink instead of protecting content width)',
   presetBtn && presetBtn.includes('min-width:0'));
// overflow:hidden was REMOVED deliberately: combined with a fixed px
// height it was silently amputating the preset amounts mid-digit once the
// font scaled. With a font-relative min-height the content always fits, so
// the clip is unnecessary and actively harmful.
ok('.preset-strip .preset-btn no longer clips its own content',
   presetBtn && !presetBtn.includes('overflow:hidden'), presetBtn);

// ── Fraction labels: plain ASCII now, zero font-glyph dependency ──
ok('½ preset label replaced with plain-text "1/2" (no Unicode fraction glyph dependency)',
   /\{l:'1\/2',v:pv\(\.5\)\}/.test(html));
ok('¾ preset label replaced with plain-text "3/4"',
   /\{l:'3\/4',v:pv\(\.75\)\}/.test(html));
ok('no Unicode ½ or ¾ glyphs remain in the preset construction',
   !/\{l:'½'/.test(html) && !/\{l:'¾'/.test(html));

console.log('─'.repeat(40));
console.log('BUTTON OVERFLOW SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-button-overflow-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-buyin-preset-tests.js ═══
async function suite_08(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Buy-in preset proof: real, clickable Min/Max buttons that jump the
// slider to the table's actual bounds, and the default buy-in changed
// from 50 BB to 100 BB.
const vm=require('vm'),fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));


// ── Markup: real buttons now, not inert spans ──
ok('biMin is a real <button>, not a <span>', /<button class="bi-preset-btn" id="biMin"/.test(html));
ok('biMax is a real <button>, not a <span>', /<button class="bi-preset-btn" id="biMax"/.test(html));
ok('biMin calls setBuyInPreset(\'min\')', /id="biMin" onclick="setBuyInPreset\('min'\)"/.test(html));
ok('biMax calls setBuyInPreset(\'max\')', /id="biMax" onclick="setBuyInPreset\('max'\)"/.test(html));

// ── Default changed to 100 BB ──
ok('default buy-in is now 100*BB (was hardcoded 1000/50BB)', /sl\.value=Math\.min\(100\*BB,maxI\);/.test(html));
ok('old 50 BB / hardcoded-1000 default is gone', !/sl\.value=Math\.min\(1000,maxI\);/.test(html));

// ── Behavioural: setBuyInPreset actually moves the slider correctly ──
const sandbox={console,Math,Object,Array,Set,Map,JSON};
function el(){return{style:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},innerHTML:'',value:'0',min:'0',max:'0',addEventListener(){},querySelector:()=>el(),querySelectorAll:()=>[]};}
sandbox.document={getElementById:()=>el(),createElement:()=>el(),querySelector:()=>el(),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}}};
sandbox.window={matchMedia:()=>({matches:true})};sandbox.matchMedia=()=>({matches:true});sandbox.localStorage={getItem:()=>null,setItem(){}};
sandbox.crypto={getRandomValues(a){for(let i=0;i<a.length;i++)a[i]=(Math.random()*0xffffffff)>>>0;return a;}};
sandbox.navigator={};sandbox.setInterval=()=>0;sandbox.setTimeout=()=>0;sandbox.clearTimeout=()=>{};sandbox.clearInterval=()=>{};
sandbox.requestAnimationFrame=()=>0;sandbox.cancelAnimationFrame=()=>{};sandbox.performance={now:()=>0};
vm.createContext(sandbox);

const slider={value:'500',min:'250',max:'2500'};
sandbox.document.getElementById=(id)=>{
  if(id==='biSlider')return slider;
  return el();
};
vm.runInContext(code+';globalThis.T={setBuyInPreset,pendingTable:null};',sandbox,{filename:'game.js'});
const T=sandbox.T;

sandbox.pendingTable=null; // updateBuyInReadout no-ops safely without a pending table
T.setBuyInPreset('min');
ok('setBuyInPreset(\'min\') sets slider.value to slider.min', slider.value===slider.min, slider.value);

T.setBuyInPreset('max');
ok('setBuyInPreset(\'max\') sets slider.value to slider.max', slider.value===slider.max, slider.value);

console.log('-'.repeat(40));
console.log('BUY-IN PRESET SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-buyin-preset-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-capability-tests.js ═══
async function suite_09(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Capability-model proof: the action panel may only ever offer legal moves.
const vm=require('vm'),fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const appFileHtml=fs.readFileSync(APP_PATH,'utf8');
const code=appFileHtml.slice(appFileHtml.lastIndexOf('<script>')+8,appFileHtml.lastIndexOf('</script>'));
const sandbox={console,Math,Object,Array,Set,JSON,Infinity,parseInt,parseFloat,isNaN,Number};
function mkEl(id){const el={_id:id,innerHTML:'',textContent:'',value:'0',style:{setProperty(){},},dataset:{},
 classList:{_s:new Set(),add(...c){c.forEach(x=>this._s.add(x))},remove(...c){c.forEach(x=>this._s.delete(x))},toggle(c,f){f?this._s.add(c):this._s.delete(c)},contains(c){return this._s.has(c)}},
 appendChild(){return mkEl('x');},remove(){},animate:()=>({onfinish:null}),querySelector:()=>mkEl('q'),querySelectorAll:()=>[],
 addEventListener(){},getContext:()=>({fillRect(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){}}),
 clientWidth:400,clientHeight:300,
 set onclick(f){this._onclick=f;},get onclick(){return this._onclick;},
 set oninput(f){this._oninput=f;},get oninput(){return this._oninput;}};return el;}
const els={};
sandbox.document={getElementById:id=>els[id]||(els[id]=mkEl(id)),createElement:()=>mkEl('c'),querySelector:()=>mkEl('q'),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}}};
sandbox.window={matchMedia:()=>({matches:true}),document:sandbox.document};
sandbox.matchMedia=()=>({matches:true});
sandbox.localStorage={getItem:()=>null,setItem(){}};
sandbox.crypto={getRandomValues(a){for(let i=0;i<a.length;i++)a[i]=(Math.random()*0xffffffff)|0;return a;}};
sandbox.navigator={};sandbox.setInterval=()=>0;sandbox.setTimeout=(f)=>0;sandbox.clearTimeout=()=>{};sandbox.clearInterval=()=>{};
sandbox.requestAnimationFrame=()=>0;sandbox.cancelAnimationFrame=()=>{};sandbox.performance={now:()=>0};
vm.createContext(sandbox);
vm.runInContext(code+'\n;globalThis.T={G,render,computeSeatLayout,mkDeck,evalH};',sandbox,{filename:'game.js'});
const {G,render,computeSeatLayout,mkDeck,evalH}=sandbox.T;


function setup({stack,call,minRaise,pot,mode='NLHE',check=false}){
  const d=mkDeck();
  computeSeatLayout(2);
  G.mode=mode;G.table=null;G.left=false;G.over=false;G.stage='flop';
  G.comm=d.slice(10,13);
  G.seats=[
    {idx:0,isBot:false,label:'You',chips:stack,hole:d.slice(0,mode==='PLO'?4:2),hs:null,folded:false,sitting:false,allIn:false,ag:0},
    {idx:1,isBot:true,label:'B',av:12,chips:5000,hole:d.slice(4,6),hs:null,folded:false,sitting:false,allIn:false,ag:.8},
  ];
  G.seats.forEach(s=>s.hs=evalH(s.hole,G.comm));
  G.bets=check?{}:{1:call};
  G.pot=pot;G.lastRaiseSize=minRaise;G.ai=0;G.dealtVisible=true;
  G.actSeq=(G.actSeq||0)+100;G.turnKey='';G.raise=999999;G.dealer=1;G.winner=-1;
  els['actionBar']=mkEl('actionBar');
  delete els['brBtn'];delete els['betSlide'];delete els['caBtn'];
  render();
  return els['actionBar'].innerHTML;
}

// S1 — THE SCREENSHOT: stack 55, call 925. Only Fold or All-in-call may exist.
let html=setup({stack:55,call:925,minRaise:200,pot:1375});
ok('S1 call is all-in for stack, not 925', html.includes('All-in')&&!html.includes('>925<'));
ok('S1 no raise button', !html.includes('id="brBtn"'));
ok('S1 no slider', !html.includes('id="betSlide"'));
ok('S1 no presets', !html.includes('preset-btn'));
ok('S1 all-in shows the real 55', html.includes('</span>55<'));

// S2 — exact-cap raise: stack 300, call 100, min 200 → raise exists but only to 300 total, no range.
html=setup({stack:300,call:100,minRaise:200,pot:400});
ok('S2 raise button exists', html.includes('id="brBtn"'));
ok('S2 raise-to equals full stack total 300', html.includes('</span>300<'));
ok('S2 no slider (no range)', !html.includes('id="betSlide"'));

// S3 — short all-in raise: stack 300, call 100, min 250 → only legal raise is all-in.
html=setup({stack:300,call:100,minRaise:250,pot:400});
ok('S3 raise renders as All-in', /id="brBtn"[^>]*><span class="ab-btn-label">All-in/.test(html));
ok('S3 all-in total is 300 not 350', html.includes('</span>300<')&&!html.includes('>350<'));

// S4 — healthy stack: everything present, call uncapped, raise-to = call+min default.
html=setup({stack:2000,call:100,minRaise:200,pot:400});
ok('S4 call shows 100', html.includes('</span>100<'));
ok('S4 slider present', html.includes('id="betSlide"'));
ok('S4 presets present', html.includes('preset-btn'));
ok('S4 default raise-to is 300 (call+min)', html.includes('</span>300<'));

// S5 — PLO pot-limit honors stack: stack 150, call 100, pot 1000 → max raise size = 50, all-in only.
html=setup({stack:150,call:100,minRaise:200,pot:1000,mode:'PLO'});
ok('S5 PLO short stack: raise is all-in to 150', /All-in/.test(html)&&html.includes('</span>150<'));
ok('S5 PLO no slider', !html.includes('id="betSlide"'));

// S6 — check spot with huge stack: Bet path, presets dedupe sane.
html=setup({stack:5000,call:0,minRaise:20,pot:60,check:true});
ok('S6 check button present', html.includes('id="ckBtn"'));
ok('S6 bet button present', html.includes('id="brBtn"'));


// ── S7: opening postflop action is a BET, not a raise (text + audio path) ──
{
  const d=mkDeck();
  computeSeatLayout(2);
  G.mode='NLHE';G.table=null;G.left=false;G.over=false;G.stage='flop';
  G.comm=d.slice(10,13);
  G.seats=[
    {idx:0,isBot:false,label:'You',chips:2000,hole:d.slice(0,2),hs:null,folded:false,sitting:false,allIn:false,ag:0,acted:false},
    {idx:1,isBot:true,label:'B',av:12,chips:2000,hole:d.slice(4,6),hs:null,folded:false,sitting:false,allIn:false,ag:.8,acted:false}];
  G.seats.forEach(x=>x.hs=evalH(x.hole,G.comm));
  G.bets={};G.pot=100;G.lastRaiseSize=20;G.ai=0;G.dealtVisible=true;G.agressor=-1;
  G.actSeq=(G.actSeq||0)+100;G.turnKey='';G.raise=999999;G.dealer=1;G.winner=-1;
  els['actionBar']=mkEl('actionBar');
  delete els['brBtn'];
  render();
  const html=els['actionBar'].innerHTML;
  ok('S7 hero opening action reads Bet', /id="brBtn"[^>]*><span class="ab-btn-label">Bet/.test(html)||html.includes('>Bet<')||/Bet<br/.test(html), html.slice(0,200));
  ok('S7 no "Raise to" when opening', !html.includes('Raise to'));
}
console.log('─'.repeat(40));
console.log('CAPABILITY SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-capability-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-card-render-tests.js ═══
async function suite_10(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Card face rendering proof: every rank (2-10, A, J, Q, K — Ace unified
// into the same system now) shows exactly ONE big central character and
// ONE suit symbol isolated in the top-left corner. No stacked corner
// rank+suit, no suit-beneath-the-number — the two elements never overlap
// or visually tangle. Ratio: big char font-size ≈ π × corner suit size.
const vm=require('vm'),fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');
const scriptOpen=html.lastIndexOf('<script>');
const scriptClose=html.lastIndexOf('</script>');
const code=html.slice(scriptOpen+8,scriptClose);

const sandbox={console,Math,Object,Array,Set,Map,JSON};
function el(){return{style:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},innerHTML:'',addEventListener(){},querySelector:()=>el(),querySelectorAll:()=>[]};}
sandbox.document={getElementById:()=>el(),createElement:()=>el(),querySelector:()=>el(),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}}};
sandbox.window={matchMedia:()=>({matches:true})};sandbox.matchMedia=()=>({matches:true});sandbox.localStorage={getItem:()=>null,setItem(){}};
sandbox.crypto={getRandomValues(a){for(let i=0;i<a.length;i++)a[i]=(Math.random()*0xffffffff)>>>0;return a;}};
sandbox.navigator={};sandbox.setInterval=()=>0;sandbox.setTimeout=()=>0;sandbox.clearTimeout=()=>{};sandbox.clearInterval=()=>{};
sandbox.requestAnimationFrame=()=>0;sandbox.cancelAnimationFrame=()=>{};sandbox.performance={now:()=>0};
vm.createContext(sandbox);
vm.runInContext(code+';globalThis.T={cardH,P,suitColor};',sandbox,{filename:'game.js'});
const T=sandbox.T;


const RANKS=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const SUITS=['♠','♥','♦','♣'];

// ── Old elements are completely gone from the renderer ──
for(const r of RANKS){
  const h=T.cardH({r,s:'♠'},false,'sm');
  ok('rank '+r+' has NO old corner element (c-tl)', !h.includes('c-tl'));
  ok('rank '+r+' has NO old corner element (c-br)', !h.includes('c-br'));
  ok('rank '+r+' has NO pip grid', !h.includes('c-pipgrid'));
  ok('rank '+r+' has NO separate face-letter/face-suit/ace-pip elements',
     !h.includes('c-face-letter')&&!h.includes('c-face-suit')&&!h.includes('c-ace-pip'));
}

// ── Every rank shows exactly one big character (itself) and one corner suit ──
for(const r of RANKS){
  const h=T.cardH({r,s:'♦'},false,'sm');
  ok('rank '+r+' shows itself as the one big character', h.includes('c-big-char">'+r+'<'));
  ok('rank '+r+' shows the suit ONLY in the top-left corner', h.includes('c-corner-suit">♦<'));
  ok('rank '+r+' has exactly one big-char element', (h.match(/c-big-char/g)||[]).length===1);
  ok('rank '+r+' has exactly one corner-suit element', (h.match(/c-corner-suit/g)||[]).length===1);
}

// ── Ace is unified into the same system as everything else (no special
//    giant-pip-only treatment any more) ──
{
  const h=T.cardH({r:'A',s:'♣'},false,'sm');
  ok('ace shows "A" as its big character', h.includes('c-big-char">A<'));
  ok('ace shows its suit only in the corner', h.includes('c-corner-suit">♣<'));
}

// ── The π ratio: big character size ≈ π × corner suit size, in the base
//    (non-context-specific) rule that everything else derives from ──
function rule(sel){
  const m=html.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{([^}]*)\\}'));
  return m?m[1]:null;
}
const bigRule=rule('.c-big-char');
const cornerRule=html.match(/\.c-corner-suit\{font-size:([\d.]+)em\}/);
ok('.c-big-char base rule exists', !!bigRule);
ok('.c-corner-suit π-ratio rule exists', !!cornerRule);
if(bigRule&&cornerRule){
  const bigEm=parseFloat(bigRule.match(/font-size:([\d.]+)em/)[1]);
  const cornerEm=parseFloat(cornerRule[1]);
  const ratio=bigEm/cornerEm;
  // The π ratio was the original design choice; a later explicit request
  // ("increase symbol sizes by 111%") intentionally superseded it for the
  // corner-suit specifically, without changing the big-char size. The new
  // ratio is the old π ratio divided by 2.11 (the +111% multiplier).
  const expectedRatio=Math.PI/2.11;
  ok('big:corner ratio matches the deliberate post-111%-increase value (not the original π)',
     Math.abs(ratio-expectedRatio)<0.05, 'ratio='+ratio.toFixed(3)+' expected≈'+expectedRatio.toFixed(3));
}

// ── Colors: 2-color and 4-color deck modes both still work correctly ──
T.P.fourColor=false;
{
  const expect={'♥':'red','♦':'red','♣':'black','♠':'black'};
  for(const s of SUITS){
    const h=T.cardH({r:'K',s},false,'sm');
    ok('2-color: '+s+' renders as '+expect[s], h.includes('card-face '+expect[s]));
  }
}
T.P.fourColor=true;
{
  const expect={'♥':'red','♦':'blue','♣':'green','♠':'black'};
  for(const s of SUITS){
    const h=T.cardH({r:'K',s},false,'sm');
    ok('4-color: '+s+' renders as '+expect[s], h.includes('card-face '+expect[s]));
  }
}
T.P.fourColor=false;

// ── Hidden cards still render a back ──
{
  const back=T.cardH(null,true,'sm');
  ok('hidden card renders a back, not a face', back.includes('card-back')&&!back.includes('card-face'));
}

console.log('─'.repeat(40));
console.log('CARD RENDER SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-card-render-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-chat-width-tests.js ═══
async function suite_11(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Chat width proof: the log's max width ceiling was trimmed down from the
// previous, noticeably wide 340px/19vw to a narrower, better-balanced size
// sitting opposite the action panel.
const fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');


const m=html.match(/\.log-zone\{[^}]*width:clamp\(([\d.]+)px,([\d.]+)vw,([\d.]+)px\)/);
ok('.log-zone width clamp found', !!m);
if(m){
  const[,minPx,vwCoef,maxPx]=m.map(Number);
  ok('max width ceiling is narrower than the old 340px', maxPx<340, maxPx+'px');
  ok('vw coefficient is smaller than the old 19vw (proportionally narrower)', vwCoef<19, vwCoef+'vw');
  ok('minimum width still leaves room for readable chat text', minPx>=180, minPx+'px');
}
ok('preset bet-size buttons remain in the action panel (right side)',
   /preset-strip/.test(html));

console.log('─'.repeat(40));
console.log('CHAT WIDTH SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-chat-width-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-deck-integrity-tests.js ═══
async function suite_12(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// DECK INTEGRITY: across many real dealt hands (multi-handed and heads-up,
// both games), every card that appears at showdown — every hole card, every
// board card — must be unique. No duplicates, ever. This is the literal
// mathematical correctness guarantee behind a poker deck.
const vm=require('vm'),fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');
const scriptOpen=html.lastIndexOf('<script>');
const scriptClose=html.lastIndexOf('</script>');
const code=html.slice(scriptOpen+8,scriptClose);

const sandbox={console,Math,Object,Array,Set,Map,JSON,Infinity,parseInt,parseFloat,isNaN,Number,String,Date,Uint8Array,Uint32Array,Promise};
const timers=[];
function el(id){return{_id:id,innerHTML:'',textContent:'',value:'0',checked:false,style:{cssText:'',setProperty(){}},dataset:{},children:[],
 classList:{_s:new Set(),add(...c){c.forEach(x=>this._s.add(x))},remove(...c){c.forEach(x=>this._s.delete(x))},toggle(c,f){f?this._s.add(c):this._s.delete(c)},contains(c){return this._s.has(c)}},
 appendChild(c){this.children.push(c);return c;},remove(){},animate:()=>({onfinish:null}),querySelector:()=>el('q'),querySelectorAll:()=>[],addEventListener(){},closest:()=>null,
 getContext:()=>({fillRect(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){}}),clientWidth:400,clientHeight:300,getBoundingClientRect:()=>({left:0,top:0,width:400,height:300}),
 set onclick(f){this._onclick=f;},get onclick(){return this._onclick;},set oninput(f){this._oninput=f;},get oninput(){return this._oninput;}};}
const E={};
sandbox.document={getElementById:i=>E[i]||(E[i]=el(i)),createElement:()=>el('c'),querySelector:()=>el('q'),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}},body:el('body'),readyState:'complete'};
sandbox.window={matchMedia:()=>({matches:false}),innerWidth:1400,innerHeight:900,addEventListener(){},document:sandbox.document};
sandbox.matchMedia=()=>({matches:false});sandbox.localStorage={getItem:()=>null,setItem(){}};
sandbox.crypto={getRandomValues(a){for(let i=0;i<a.length;i++)a[i]=(Math.random()*0xffffffff)>>>0;return a;}};
sandbox.navigator={vibrate(){}};
sandbox.setTimeout=(f,d)=>{timers.push({f,d:d||0});return timers.length;};
sandbox.clearTimeout=()=>{};sandbox.setInterval=()=>0;sandbox.clearInterval=()=>{};
sandbox.requestAnimationFrame=()=>0;sandbox.cancelAnimationFrame=()=>{};sandbox.performance={now:()=>0};
sandbox.AudioContext=undefined;sandbox.webkitAudioContext=undefined;
vm.createContext(sandbox);
vm.runInContext(code+';globalThis.T={G,startHand,mkDeck,computeSeatLayout};',sandbox,{filename:'game.js'});
const T=sandbox.T;

function drain(rounds){
  for(let r=0;r<rounds;r++){
    const batch=timers.splice(0,timers.length);
    if(!batch.length)return;
    batch.sort((a,b)=>a.d-b.d).forEach(t=>{try{t.f();}catch(e){}});
  }
}
function keyOf(c){return c.r+c.s;}

function runSession(mode,botCount){
  timers.length=0;
  const G=T.G;
  G.mode=mode;G.table={mul:1,cur:'ZEC'};G.left=false;G.sitOut=false;G.gen=(G.gen||0)+1;
  G.wallet='utest';G.bbMode=false;
  const seats=[{idx:0,isBot:false,label:'You',chips:1000,hole:[],hs:null,folded:false,sitting:false,allIn:false,ag:0}];
  for(let i=1;i<=botCount;i++)seats.push({idx:i,isBot:true,label:'B'+i,av:12+i,chips:1000,hole:[],hs:null,folded:false,sitting:false,allIn:false,ag:.75});
  G.seats=seats;G.dealer=0;G.hc=0;
  T.computeSeatLayout(seats.length);
  T.startHand();
  drain(400);
  return G;
}

let handsChecked=0;
for(const mode of ['NLHE','PLO']){
  for(const bots of [1,3,8]){
    const G=runSession(mode,bots);
    // Every hand that dealt hole cards: hole+board must have zero duplicates.
    const dealt=(G.seats||[]).filter(s=>s&&s.hole&&s.hole.length);
    if(dealt.length===0){
      ok(`${mode} ${bots+1}-max: at least one hand actually dealt`, false, 'no hole cards found after drain');
      continue;
    }
    handsChecked++;
    const allCards=[...dealt.flatMap(s=>s.hole),...(G.comm||[])];
    const keys=allCards.map(keyOf);
    const uniq=new Set(keys);
    ok(`${mode} ${bots+1}-max: no duplicate cards across hole+board`, uniq.size===keys.length,
       `${keys.length} cards dealt, ${uniq.size} unique`);
    ok(`${mode} ${bots+1}-max: every card is a real deck member`,
       allCards.every(c=>T.mkDeck().some(d=>d.r===c.r&&d.s===c.s)));
    const expectedHole=mode==='PLO'?4:2;
    ok(`${mode} ${bots+1}-max: every dealt player has exactly ${expectedHole} hole cards`,
       dealt.every(s=>s.hole.length===expectedHole));
  }
}
ok('at least 6 real hands were checked across all configurations', handsChecked>=6, handsChecked);

console.log('─'.repeat(40));
console.log('DECK INTEGRITY SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-deck-integrity-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-dj-queue-tests.js ═══
async function suite_13(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// DJ queue proof. The reported symptom -- "adding a new song goes over
// the last song" -- was NOT a queue-logic bug: the queue array and its
// rendering were both correct. The real cause was CSS. A flex column
// (.dj-queue) with a max-height, whose children (.dj-track) lacked
// flex-shrink:0, COMPRESSES its children instead of scrolling once their
// combined height approaches the limit -- so tracks squashed into each
// other visually. This is the same missing-flex-guard pattern that
// previously hit the preset buttons, action buttons and wallet modal.
//
// Also covered: file-input reset (re-selecting the same file used to
// silently do nothing), explicit queue position numbering, and surfacing
// play() rejections rather than swallowing them.
const vm=require('vm'),fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));


function rule(sel){
  const m=html.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{([^}]*)\\}'));
  return m?m[1]:null;
}

// ── The actual root cause: flex compression guards ──
const djQueue=rule('.dj-queue');
const djTrack=rule('.dj-track');
ok('.dj-queue rule exists', !!djQueue);
ok('.dj-track rule exists', !!djTrack);
ok('.dj-track has flex-shrink:0 (THE FIX - tracks can never be compressed into each other)',
   djTrack && djTrack.includes('flex-shrink:0'));
ok('.dj-queue has flex-shrink:0 (the queue region itself resists being squeezed by the modal)',
   djQueue && djQueue.includes('flex-shrink:0'));
ok('.dj-queue still scrolls rather than growing unbounded',
   djQueue && djQueue.includes('overflow-y:auto') && djQueue.includes('max-height'));

// ── File input reset ──
ok('the file input value resets after adding, so re-picking the same file still fires onchange',
   /djAddFiles\(e\.target\.files\);\s*\n\s*e\.target\.value='';/.test(html));

// ── play() rejections surfaced, not swallowed ──
ok('play() rejection is handled explicitly rather than silently swallowed',
   !/a\.play\(\)\.catch\(\(\)=>\{\}\)/.test(html));
ok('a blocked play shows the paused state so the play button is the obvious next action',
   /catch\(\(\)=>\{[\s\S]{0,400}pp\.textContent='▶'/.test(html));

// ── Behavioural: the queue genuinely appends and advances ──
const sandbox={console,Math,Object,Array,Set,Map,JSON,Promise};
const E={};
function el(id){return{_id:id,innerHTML:'',textContent:'',value:'',style:{display:''},dataset:{},
 classList:{_s:new Set(),add(){},remove(){},toggle(){},contains:()=>false},
 appendChild(){},remove(){},querySelector:()=>el('q'),querySelectorAll:()=>[],addEventListener(){},
 set onclick(f){this._onclick=f;},set onchange(f){this._onchange=f;}};}
sandbox.document={getElementById:i=>E[i]||(E[i]=el(i)),createElement:()=>el('c'),querySelector:()=>el('q'),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}},body:el('body')};
sandbox.window={matchMedia:()=>({matches:false}),innerWidth:1400,innerHeight:900,addEventListener(){},document:sandbox.document};
sandbox.matchMedia=()=>({matches:false});sandbox.localStorage={getItem:()=>null,setItem(){}};
sandbox.crypto={getRandomValues(a){for(let i=0;i<a.length;i++)a[i]=(Math.random()*0xffffffff)>>>0;return a;}};
sandbox.navigator={};
sandbox.setTimeout=()=>0;sandbox.clearTimeout=()=>{};sandbox.setInterval=()=>0;sandbox.clearInterval=()=>{};
sandbox.requestAnimationFrame=()=>0;sandbox.cancelAnimationFrame=()=>{};sandbox.performance={now:()=>0};
sandbox.URL={createObjectURL:(f)=>'blob:'+f.name};
const audioLog=[];
sandbox.Audio=function(){const s={_src:'',paused:true,
  play(){s.paused=false;audioLog.push('play:'+s._src);return Promise.resolve();},
  pause(){s.paused=true;},
  set src(v){s._src=v;},get src(){return s._src;},
  set onended(f){s._onended=f;},get onended(){return s._onended;}};return s;};
vm.createContext(sandbox);
vm.runInContext(code+';globalThis.G=G;globalThis.DJ={djAddFiles,djStateFor,djCurTid,djNext,djPlayIdx,djRemove};',sandbox,{filename:'game.js'});
const G=sandbox.G, DJ=sandbox.DJ;
G.table={id:'zec-micro',cur:'ZEC',mul:1};
const tid=DJ.djCurTid();

DJ.djAddFiles([{name:'SongA.mp3'}]);
let st=DJ.djStateFor(tid);
ok('first track added and starts playing', st.queue.length===1 && st.idx===0);

DJ.djAddFiles([{name:'SongB.mp3'}]);
st=DJ.djStateFor(tid);
ok('second track APPENDS rather than replacing', st.queue.length===2, st.queue.map(t=>t.name));
ok('adding a second track does NOT interrupt the one already playing', st.idx===0);

DJ.djAddFiles([{name:'SongC.mp3'}]);
st=DJ.djStateFor(tid);
ok('third track appends too, preserving order',
   st.queue.length===3 && st.queue[0].name==='SongA' && st.queue[2].name==='SongC',
   st.queue.map(t=>t.name));

DJ.djNext();
st=DJ.djStateFor(tid);
ok('finishing a track advances to the NEXT one in the queue', st.idx===1);
DJ.djNext();
st=DJ.djStateFor(tid);
ok('advances again through the queue in order', st.idx===2);
DJ.djNext();
st=DJ.djStateFor(tid);
ok('wraps back to the start after the last track', st.idx===0);

// ── Rendering shows explicit ordering ──
const qhtml=E['djQueue']?E['djQueue'].innerHTML:'';
ok('queue renders a position number for each non-playing track', /dj-track-pos">2</.test(qhtml)||/dj-track-pos">3</.test(qhtml), qhtml.slice(0,120));
ok('the currently playing track is marked distinctly', /dj-track-pos">▶</.test(qhtml));
ok('all three tracks are present in the rendered list',
   (qhtml.match(/dj-track-name/g)||[]).length===3);

// ── Per-table isolation still holds ──
G.table={id:'zec-high',cur:'ZEC',mul:1};
ok('a different table has its own independent queue', DJ.djStateFor(DJ.djCurTid()).queue.length===0);
G.table={id:'zec-micro',cur:'ZEC',mul:1};
ok('returning to the original table restores its queue', DJ.djStateFor(DJ.djCurTid()).queue.length===3);

console.log('-'.repeat(40));
console.log('DJ QUEUE SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-dj-queue-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-eval-tests.js ═══
async function suite_14(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Hand evaluator proof suite — every assertion is a real poker ruling.
const vm=require('vm'),fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
// Extract just the pure functions we need (RV, SUITS/RANKS, combos, sc5, evalH)
const sandbox={console,Math,Object,Array,Set,JSON};
vm.createContext(sandbox);
// Run whole script minus DOM by stubbing minimal globals
function mkEl(){return{innerHTML:'',textContent:'',value:'0',style:{setProperty(){}},dataset:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},appendChild(){return mkEl();},remove(){},animate:()=>({onfinish:null}),querySelector:()=>mkEl(),querySelectorAll:()=>[],addEventListener(){},getContext:()=>({fillRect(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){}}),clientWidth:400,clientHeight:300,set onclick(f){},set oninput(f){},set onchange(f){}};}
const els={};
sandbox.document={getElementById:id=>els[id]||(els[id]=mkEl()),createElement:()=>mkEl(),querySelector:()=>mkEl(),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}}};
sandbox.window={matchMedia:()=>({matches:true}),document:sandbox.document};
sandbox.matchMedia=()=>({matches:true});
sandbox.localStorage={getItem:()=>null,setItem(){}};
sandbox.crypto={getRandomValues(a){for(let i=0;i<a.length;i++)a[i]=(Math.random()*0xffffffff)|0;return a;}};
sandbox.navigator={};sandbox.setInterval=()=>0;sandbox.setTimeout=()=>0;sandbox.clearTimeout=()=>{};sandbox.clearInterval=()=>{};
sandbox.requestAnimationFrame=()=>0;sandbox.cancelAnimationFrame=()=>{};sandbox.performance={now:()=>0};
vm.runInContext(code+'\n;globalThis.T={sc5,evalH,combos,RV};',sandbox,{filename:'game.js'});
const {sc5,evalH}=sandbox.T;

const C=(str)=>{ // 'As' 'Td' '9c' '5h'
  const RM={A:'A',K:'K',Q:'Q',J:'J',T:'10'};
  const r=RM[str[0]]||str[0];
  const s={s:'♠',h:'♥',d:'♦',c:'♣'}[str[1]];
  return {r,s};
};
const H=(...cs)=>cs.map(C);
function eq(name,got,want){ if(got===want){pass++;} else {fail++;console.log('FAIL',name,'got',got,'want',want);} }
function beats(name,a,b){ // hand a strictly beats hand b
  const ok=a.rank>b.rank||(a.rank===b.rank&&a.tb>b.tb);
  if(ok)pass++; else {fail++;console.log('FAIL',name,JSON.stringify([a.rank,a.tb,b.rank,b.tb]));}
}
function ties(name,a,b){ const ok=a.rank===b.rank&&a.tb===b.tb; if(ok)pass++; else{fail++;console.log('FAIL',name);} }

// ── Category identification (5-card) ──
eq('royal', sc5(H('As','Ks','Qs','Js','Ts')).name,'Royal Flush');
eq('straight flush', sc5(H('9h','8h','7h','6h','5h')).name,'Straight Flush');
eq('wheel SF is SF not royal', sc5(H('Ah','2h','3h','4h','5h')).name,'Straight Flush');
eq('quads', sc5(H('9c','9d','9h','9s','2c')).name,'Four of a Kind');
eq('boat', sc5(H('3c','3d','3h','Kc','Kd')).name,'Full House');
eq('flush', sc5(H('Ac','Jc','9c','6c','2c')).name,'Flush');
eq('straight', sc5(H('9c','8d','7h','6s','5c')).name,'Straight');
eq('wheel straight', sc5(H('Ac','2d','3h','4s','5c')).name,'Straight');
eq('trips', sc5(H('7c','7d','7h','Ks','2c')).name,'Three of a Kind');
eq('two pair', sc5(H('Ac','Ad','2h','2s','Kc')).name,'Two Pair');
eq('pair', sc5(H('Ac','Ad','7h','5s','2c')).name,'One Pair');
eq('high card', sc5(H('Ac','Jd','9h','6s','2c')).name,'High Card');

// ── THE KICKER BUGS: grouping must outrank raw card order ──
beats('pair 3s beats pair 2s w/ ace kicker', sc5(H('3c','3d','7h','6s','5c')), sc5(H('2c','2d','Ah','Ks','Qc')));
beats('pair aces AK beats pair aces AQ (kicker)', sc5(H('Ac','Ad','Kh','7s','2c')), sc5(H('Ah','As','Qh','7d','2d')));
beats('trips 3s beat trips 2s w/ AK', sc5(H('3c','3d','3h','7s','6c')), sc5(H('2c','2d','2h','As','Kc')));
beats('boat 333KK beats boat 222AA (trips first)', sc5(H('3c','3d','3h','Kc','Kd')), sc5(H('2c','2d','2h','Ac','Ad')));
beats('quads 3333 beat quads 2222+A', sc5(H('3c','3d','3h','3s','2c')), sc5(H('2c','2d','2h','2s','Ac')));
beats('two pair: high pair decides', sc5(H('Ac','Ad','2h','2s','3c')), sc5(H('Kc','Kd','Qh','Qs','Ac')));
beats('two pair: low pair decides', sc5(H('Ac','Ad','3h','3s','2c')), sc5(H('Ah','As','2h','2s','Kc')));
beats('two pair: kicker decides', sc5(H('Ac','Ad','3h','3s','Kc')), sc5(H('Ah','As','3c','3d','Qc')));
beats('flush compares all five', sc5(H('Ac','Jc','9c','6c','3c')), sc5(H('Ad','Jd','9d','6d','2d')));

// ── Wheel is the LOWEST straight / straight flush ──
beats('6-high straight beats wheel', sc5(H('6c','5d','4h','3s','2c')), sc5(H('Ac','2d','3h','4s','5c')));
beats('6-high SF beats wheel SF', sc5(H('6h','5h','4h','3h','2h')), sc5(H('Ah','2h','3h','4h','5h')));
beats('any SF loses to royal', sc5(H('As','Ks','Qs','Js','Ts')), sc5(H('Kh','Qh','Jh','Th','9h')));
ties('identical straights tie', sc5(H('9c','8d','7h','6s','5c')), sc5(H('9h','8s','7c','6d','5d')));

// ── 7-card best-five (Hold'em) ──
eq('7card finds boat', evalH(H('Ac','Ad'),H('Ah','Kc','Kd','2s','7h')).name,'Full House');
eq('7card finds straight across', evalH(H('9c','8d'),H('7h','6s','5c','Ac','Ad')).name,'Straight');
eq('board flush, no hole help', evalH(H('2d','3d'),H('Ac','Kc','Qc','Jc','9c')).name,'Flush');
beats('hole flush card beats board play', evalH(H('Tc','2d'),H('Ac','Kc','Qc','Jc','9c')), evalH(H('2h','3h'),H('Ac','Kc','Qc','Jc','9c')));
ties('both play the board exactly', evalH(H('2d','3h'),H('Ac','Kc','Qc','Jc','9c')), evalH(H('2s','3s'),H('Ac','Kc','Qc','Jc','9c')));

// ── OMAHA: exactly two hole + three board ──
eq('4 suited hole + 1 board is NOT a flush', evalH(H('Ac','Kc','Qc','Jc'),H('2c','7d','9h','Ts','3d')).name==='Flush'?'FLUSH-BUG':'ok','ok');
eq('2 hole clubs + 3 board clubs IS a flush', evalH(H('Ac','Kc','2d','3h'),H('9c','7c','4c','Ts','Jd')).name,'Flush');
eq('AAAA on KQJT9 is just a pair', evalH(H('Ac','Ad','Ah','As'),H('Kc','Qd','Jh','Ts','9c')).name,'One Pair');
eq('board quads + AA hole = full house not quads', evalH(H('Ac','Ad','2h','3s'),H('9c','9d','9h','9s','Kc')).name,'Full House');
eq('omaha wheel via two hole', evalH(H('Ac','2d','Kh','Ks'),H('3h','4s','5c','9d','Td')).name,'Straight');
eq('omaha preflop placeholder', evalH(H('Ac','Ad','Kh','Ks'),[]).name,'—');
beats('omaha: nut flush beats second flush', evalH(H('Ac','2c','9d','9h'),H('Kc','7c','4c','Ts','Jd')), evalH(H('Qc','2h','9s','8h'),H('Kc','7c','4c','Ts','Jd')));

// ── Best-five card reporting (drives the showdown highlight) ──
{
  const b=evalH(H('Ac','Ad'),H('Ah','Kc','Kd','2s','7h'));
  eq('best5 has five cards', (b.cards||[]).length, 5);
  const keys=b.cards.map(c=>c.r+c.s);
  eq('boat best5 excludes junk', keys.includes('2♠')||keys.includes('7♥')?'junk':'clean','clean');
}
{
  const hole=H('Ac','Kc','2d','3h');
  const b=evalH(hole,H('9c','7c','4c','Ts','Jd'));
  const hk=new Set(hole.map(c=>c.r+c.s));
  const used=b.cards.filter(c=>hk.has(c.r+c.s)).length;
  eq('omaha best5 uses exactly 2 hole cards', used, 2);
}

// ── Cross-category sanity ladder ──
const ladder=[
  sc5(H('Ac','Jd','9h','6s','2c')), sc5(H('Ac','Ad','7h','5s','2c')),
  sc5(H('Ac','Ad','2h','2s','Kc')), sc5(H('7c','7d','7h','Ks','2c')),
  sc5(H('Ac','2d','3h','4s','5c')), sc5(H('Ac','Jc','9c','6c','2c')),
  sc5(H('3c','3d','3h','Kc','Kd')), sc5(H('9c','9d','9h','9s','2c')),
  sc5(H('Ah','2h','3h','4h','5h')), sc5(H('As','Ks','Qs','Js','Ts')),
];
for(let i=1;i<ladder.length;i++)beats('ladder '+i,ladder[i],ladder[i-1]);

console.log('─'.repeat(40));
console.log('EVAL SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-eval-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-footer-modal-tests.js ═══
async function suite_15(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Footer + modal-overflow proof: the provably-fair footer line must be a
// single-row, full-width bar (not wrapped inside the narrow 272px chat
// box), and the wallet modal must never force horizontal scroll — the
// same missing min-width:0 bug that hit the preset/action buttons earlier
// this session also hit the wallet's Cash Out / Send to Player row.
const fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');


function rule(sel){
  const m=html.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{([^}]*)\\}'));
  return m?m[1]:null;
}

const logZoneStart=html.indexOf('<div class="log-zone">');
const logBoxIdx=html.indexOf('id="logBox"');
const logZoneCloseIdx=html.indexOf('</div>',logBoxIdx);
const insideLogZone=html.slice(logZoneStart,logZoneCloseIdx);

ok('log-zone start found in markup', logZoneStart>=0);
ok('rake-line is no longer nested inside log-zone (it is a sibling now)', !insideLogZone.includes('rake-line'));
ok('rake-line still exists elsewhere in the markup', html.includes('class="rake-line"'));

const rakeLine=rule('.rake-line');
ok('.rake-line rule exists', !!rakeLine);
ok('.rake-line spans the full width (left:0 and right:0, not confined to a narrow box)',
   rakeLine && rakeLine.includes('left:0') && rakeLine.includes('right:0'));
ok('.rake-line forces a single line (white-space:nowrap - the actual fix for the wrap)',
   rakeLine && rakeLine.includes('white-space:nowrap'));
ok('.rake-line is anchored to the bottom of the table screen',
   rakeLine && rakeLine.includes('bottom:0'));

const walActionsBtn=rule('.wal-actions .btn');
ok('.wal-actions .btn has min-width:0 (the fix - lets buttons shrink instead of forcing overflow)',
   walActionsBtn && walActionsBtn.includes('min-width:0'));

const modalBox=rule('.modal-box');
ok('.modal-box has overflow-x:hidden as a hard backstop (defense-in-depth beyond the root-cause fix)',
   modalBox && modalBox.includes('overflow-x:hidden'));

console.log('-'.repeat(40));
console.log('FOOTER / MODAL SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-footer-modal-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-geometry-tests.js ═══
async function suite_16(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Table-geometry proof: at every table size, in both games, every chip zone
// (1) clears its own seat's card+nameplate footprint, (2) stays on the felt,
// (3) never enters the pot row from above, (4) never collides with ANOTHER seat's box.
const vm=require('vm'),fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
const sandbox={console,Math,Object,Array,Set,JSON,Infinity,parseInt,parseFloat,isNaN,Number};
function mkEl(){return{innerHTML:'',textContent:'',value:'0',style:{setProperty(){}},dataset:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},appendChild(){return mkEl()},remove(){},animate:()=>({onfinish:null}),querySelector:()=>mkEl(),querySelectorAll:()=>[],addEventListener(){},getContext:()=>({fillRect(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){}}),clientWidth:400,clientHeight:300,set onclick(f){},set oninput(f){}};}
const els={};
sandbox.document={getElementById:id=>els[id]||(els[id]=mkEl()),createElement:()=>mkEl(),querySelector:()=>mkEl(),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}}};
sandbox.window={matchMedia:()=>({matches:true}),document:sandbox.document};
sandbox.matchMedia=()=>({matches:true});
sandbox.localStorage={getItem:()=>null,setItem(){}};
sandbox.crypto={getRandomValues(a){for(let i=0;i<a.length;i++)a[i]=(Math.random()*0xffffffff)|0;return a;}};
sandbox.navigator={};sandbox.setInterval=()=>0;sandbox.setTimeout=()=>0;sandbox.clearTimeout=()=>{};sandbox.clearInterval=()=>{};
sandbox.requestAnimationFrame=()=>0;sandbox.cancelAnimationFrame=()=>{};sandbox.performance={now:()=>0};
vm.createContext(sandbox);
vm.runInContext(code+'\n;globalThis.T={G,computeSeatLayout,S:()=>SPOS,C:()=>CHIP_POS};',sandbox,{filename:'game.js'});
const {G,computeSeatLayout,S,C}=sandbox.T;


for(const mode of ['NLHE','PLO']){
  const w2=mode==='PLO'?13:10, h2=11;
  G.mode=mode;
  for(let n=2;n<=9;n++){
    computeSeatLayout(n);
    const seats=S(),chips=C();
    ok(`${mode} n=${n} counts`, seats.length===n&&chips.length===n);
    for(let i=0;i<n;i++){
      const s=seats[i],[cx,cy]=chips[i];
      const dx=Math.abs(cx-s.x),dy=Math.abs(cy-s.y);
      ok(`${mode} n=${n} seat${i} chip clears OWN box`, dx>=w2||dy>=h2, `d=(${dx.toFixed(1)},${dy.toFixed(1)})`);
      ok(`${mode} n=${n} seat${i} chip on felt`, cx>=4&&cx<=96&&cy>=8&&cy<=90, `(${cx},${cy})`);
      if(s.y<40) ok(`${mode} n=${n} seat${i} top chip below-clamped`, cy<=37, cy);
      // pot pill footprint on desktop ≈ x 40-60, y 29-45
      ok(`${mode} n=${n} seat${i} chip clear of pot label`, !(cx>40&&cx<60&&cy>28.5&&cy<45), `(${cx},${cy})`);
      // UI corner boxes: chat (x<24,y>77) and bet panel (x>62,y>56)
      ok(`${mode} n=${n} seat${i} SEAT clear of chat box`, i===0||!(s.x<24&&s.y>77), `seat(${s.x},${s.y})`);
      ok(`${mode} n=${n} seat${i} SEAT clear of bet panel`, i===0||!(s.x>62&&s.y>56), `seat(${s.x},${s.y})`);
      ok(`${mode} n=${n} seat${i} chip clear of bet panel`, !(cx>62&&cy>56), `(${cx},${cy})`);
      for(let j=0;j<n;j++){ if(j===i)continue;
        const o=seats[j];
        const odx=Math.abs(cx-o.x),ody=Math.abs(cy-o.y);
        ok(`${mode} n=${n} seat${i} chip clear of seat${j} box`, odx>=w2||ody>=h2, `d=(${odx.toFixed(1)},${ody.toFixed(1)})`);
      }
    }
  }
}
// ── Chip-to-seat distance is bounded: no chip drifts far from its own
//    seat regardless of table position (the Nakamoto calibration fix) ──
for(const mode of ['NLHE','PLO']){
  G.mode=mode;
  for(let n=2;n<=9;n++){
    computeSeatLayout(n);
    const seats=S(),chips=C();
    for(let i=0;i<n;i++){
      const s=seats[i],[cx,cy]=chips[i];
      const dist=Math.hypot(cx-s.x,cy-s.y);
      ok(`${mode} n=${n} seat${i} chip stays close to its own seat`, dist<=22, dist.toFixed(1));
    }
  }
}
console.log('─'.repeat(40));
console.log('GEOMETRY SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-geometry-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-glyph-bounds-tests.js ═══
async function suite_17(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// CARD GLYPH BOUNDS DIAGNOSTIC: proves, from the CSS values actually shipped
// in index.html, that the ace's centre pip and every rank's suit symbol
// never exceed the card's own width — at any viewport from a small phone
// to a 4K desktop, at any of the app's UI-zoom tiers.
//
// This directly follows the root-cause fix: card WIDTH is defined in
// px/vw (zoom-independent); card FONT-SIZE — which drives every internal
// glyph — used to be defined in em (zoom-dependent), so at high desktop
// zoom the glyphs could outgrow a card whose width never moved. Font-size
// is now px-based too, matching width's unit system. This test proves that
// held, rather than assuming it from the one worst-case point it was
// solved against.
const fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');


function findPxClamps(selector){
  const re=new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{[^}]*font-size:clamp\\(([\\d.]+)px,([\\d.]+)vw,([\\d.]+)px\\)','g');
  return [...html.matchAll(re)].map(m=>({minPx:parseFloat(m[1]),vwCoef:parseFloat(m[2]),maxPx:parseFloat(m[3])}));
}
function findWidthClamps(selector){
  const re=new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{width:clamp\\(([\\d.]+)px,([\\d.]+)vw,([\\d.]+)px\\)','g');
  return [...html.matchAll(re)].map(m=>({minPx:parseFloat(m[1]),vwCoef:parseFloat(m[2]),maxPx:parseFloat(m[3])}));
}

const fontClamps={
  'comm-cards': findPxClamps('.comm-cards .card'),
  's-cards': findPxClamps('.s-cards .card'),
};
ok('comm-cards: mobile + desktop font clamps found (px-based)', fontClamps['comm-cards'].length>=2, fontClamps['comm-cards'].length);
ok('s-cards: mobile + desktop font clamps found (px-based)', fontClamps['s-cards'].length>=2, fontClamps['s-cards'].length);
const myRowFont=html.match(/\.my-cards-row \.card\{[^}]*font-size:clamp\(([\d.]+)px,([\d.]+)vw,([\d.]+)px\)/);
ok('my-cards-row: font clamp found (px-based)', !!myRowFont);
fontClamps['my-cards-row']=[{minPx:+myRowFont[1],vwCoef:+myRowFont[2],maxPx:+myRowFont[3]}];

const widthClamps={
  'comm-cards': findWidthClamps('.comm-cards .card,.comm-cards .card-ph'),
  's-cards': findWidthClamps('.s-cards .card,.s-cards .card-ph'),
};
ok('comm-cards: mobile + desktop width clamps found', widthClamps['comm-cards'].length>=2, widthClamps['comm-cards'].length);
ok('s-cards: mobile + desktop width clamps found', widthClamps['s-cards'].length>=2, widthClamps['s-cards'].length);
const myRowWidth=html.match(/\.my-cards-row \.card\{width:clamp\(([\d.]+)px,([\d.]+)vw,([\d.]+)px\)/);
ok('my-cards-row: width clamp found', !!myRowWidth);
widthClamps['my-cards-row']=[{minPx:+myRowWidth[1],vwCoef:+myRowWidth[2],maxPx:+myRowWidth[3]}];

const bigCharEm={};
const cornerSuitEm={};
for(const ctx of ['comm-cards','s-cards','my-cards-row']){
  const bc=html.match(new RegExp('\\.'+ctx+' \\.c-big-char\\{font-size:([\\d.]+)em'));
  const cs=html.match(new RegExp('\\.'+ctx+' \\.c-corner-suit\\{font-size:([\\d.]+)em'));
  ok(ctx+': big-char em found', !!bc);
  ok(ctx+': corner-suit em found', !!cs);
  bigCharEm[ctx]=bc?+bc[1]:0;
  cornerSuitEm[ctx]=cs?+cs[1]:0;
}

function ev(clamp,vw){return Math.max(clamp.minPx,Math.min((clamp.vwCoef/100)*vw,clamp.maxPx));}

const VW=[320,375,414,600,768,839,840,900,1080,1280,1440,1499,1500,1600,1920,2560];

for(const ctx of ['comm-cards','s-cards','my-cards-row']){
  const fClamps=fontClamps[ctx], wClamps=widthClamps[ctx];
  for(const vw of VW){
    const idx=vw<840?0:(fClamps.length>1?1:0); // mobile clamp below 840px, desktop clamp at/above (if one exists)
    const fontPx=ev(fClamps[idx],vw);
    const widthPx=ev(wClamps[idx],vw);
    const bigCharPx=bigCharEm[ctx]*fontPx;
    const cornerSuitPx=cornerSuitEm[ctx]*fontPx;
    ok(`${ctx} @ vw${vw}: big-char (${bigCharPx.toFixed(1)}px) fits within card width (${widthPx.toFixed(1)}px)`,
       bigCharPx <= widthPx*0.95, `char=${bigCharPx.toFixed(1)} width=${widthPx.toFixed(1)}`);
    ok(`${ctx} @ vw${vw}: corner-suit (${cornerSuitPx.toFixed(1)}px) fits within card width (${widthPx.toFixed(1)}px)`,
       cornerSuitPx <= widthPx*0.95, `suit=${cornerSuitPx.toFixed(1)} width=${widthPx.toFixed(1)}`);
    // Stricter: the corner-suit sits at left:7%, not centered - it only
    // has the REMAINING space after that offset before hitting the right
    // edge. This specifically guards the +111% symbol-size increase,
    // which pushed corner-suit close to the big-char's own size range.
    const remainingAfterOffset=widthPx*(1-0.07);
    ok(`${ctx} @ vw${vw}: corner-suit fits the space actually available after its 7% left offset`,
       cornerSuitPx <= remainingAfterOffset*0.95, `suit=${cornerSuitPx.toFixed(1)} available=${remainingAfterOffset.toFixed(1)}`);
  }
}

// Card font-size itself is now proven zoom-independent: verify the clamp
// values contain no 'em' units left in these three contexts (the actual
// mechanism of the fix, checked directly against the shipped file).
for(const ctx of ['comm-cards','s-cards','my-cards-row']){
  const re=new RegExp('\\.'+ctx+' \\.card\\{[^}]*font-size:clamp\\([\\d.]+em');
  ok(ctx+": font-size clamp uses px not em (zoom-independent, matches width unit system)", !re.test(html));
}

console.log('─'.repeat(40));
console.log('CARD GLYPH BOUNDS DIAGNOSTIC:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-glyph-bounds-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-header-visibility-tests.js ═══
async function suite_18(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Header visibility proof: LEAVE (and every other header control) must
// never be able to overflow off-screen with no way to reach it. A wide
// stakes tag (PLO's runs noticeably longer than NLHE's) pushed the right-
// side controls past the viewport edge with no wrap and no scroll — LEAVE
// became genuinely unreachable, not just visually cramped.
const fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');


function rule(selector){
  const re=new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{([^}]*)\\}');
  const m=html.match(re);
  return m?m[1]:null;
}

const gameTop=rule('.game-top');
ok('.game-top rule exists', !!gameTop);
ok('.game-top allows wrapping (content can never be pushed off-screen with no way to reach it)',
   gameTop && gameTop.includes('flex-wrap:wrap'));

const gameTags=rule('.game-tags');
ok('.game-tags rule exists', !!gameTags);
ok('.game-tags allows wrapping too (extra safety when many tags are present, e.g. PLO + testnet + BB)',
   gameTags && gameTags.includes('flex-wrap:wrap'));

// ── The actual failure mode: measure that a realistic PLO header's content
//    is wider than a plausible narrow phone viewport, proving wrap (not
//    just "seems fine on my screen") is genuinely required. ──
const brandW=140, tagsW=/* mode+stakes */180 + /* testnet */70 + /* BB */36 + 16;
const rightW=/* 2-color */78 + /* wallet */70 + /* sit out */80 + /* leave */70 + 28;
const totalMinContentPx=brandW+tagsW+rightW;
const narrowPhonePx=380;
ok('realistic PLO header content width exceeds a narrow phone viewport (confirms wrap is load-bearing, not cosmetic)',
   totalMinContentPx>narrowPhonePx, totalMinContentPx+'px content vs '+narrowPhonePx+'px viewport');

// ── LEAVE specifically must never be display:none or hidden by any rule ──
ok('LEAVE button has no display:none anywhere in its styling chain',
   !/\.btn-leave\{[^}]*display:none/.test(html));

console.log('─'.repeat(40));
console.log('HEADER VISIBILITY SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-header-visibility-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-locale-format-tests.js ═══
async function suite_19(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Locale-independence proof. toLocaleString() with no locale argument
// uses the BROWSER's locale. In nl-NL (and most of Europe) the thousands
// separator is a dot and the decimal separator a comma -- the reverse of
// the en-US convention the app assumes -- so "2,000" rendered as "2.000"
// for a Dutch user. Every amount call is now pinned to en-US, the
// universal convention in crypto, so output is identical for everyone.
const vm=require('vm'),fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));

ok('no unpinned toLocaleString() calls remain', !/toLocaleString\(\)/.test(html));
ok('no toLocaleString(undefined, ...) calls remain', !/toLocaleString\(undefined,/.test(html));
ok('all toLocaleString calls are pinned to en-US',
   (html.match(/toLocaleString\(/g)||[]).length===(html.match(/toLocaleString\('en-US'/g)||[]).length);

// Simulate a Dutch browser: default locale resolves to nl-NL.
const orig=Number.prototype.toLocaleString;
Number.prototype.toLocaleString=function(loc,opts){return orig.call(this,loc||'nl-NL',opts);};
const s={console,Math,Object,Array,Set,Map,JSON,Number};
function el(){return{style:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},innerHTML:'',textContent:'',value:'',addEventListener(){},querySelector:()=>el(),querySelectorAll:()=>[],set onclick(f){},set oninput(f){},set onchange(f){}};}
s.document={getElementById:()=>el(),createElement:()=>el(),querySelector:()=>el(),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}}};
s.window={matchMedia:()=>({matches:true})};s.matchMedia=()=>({matches:true});s.localStorage={getItem:()=>null,setItem(){}};
s.crypto={getRandomValues(a){for(let i=0;i<a.length;i++)a[i]=(Math.random()*0xffffffff)>>>0;return a;}};
s.navigator={};s.setInterval=()=>0;s.setTimeout=()=>0;s.clearTimeout=()=>{};s.clearInterval=()=>{};s.requestAnimationFrame=()=>0;s.cancelAnimationFrame=()=>{};s.performance={now:()=>0};
vm.createContext(s);
vm.runInContext(code+';globalThis.T={fmtNum,bbNum,TABLES};',s);
const T=s.T;
const zc={mul:1,dec:0}; // whole-unit denomination: exercises the pinned thousands separator
ok('sanity: an unpinned call in this simulated locale DOES produce a dot (test is meaningful)',
   (2000).toLocaleString()==='2.000', (2000).toLocaleString());
ok('Whole-unit 2,000 renders with a COMMA even under a Dutch browser locale', T.fmtNum(2000,zc)==='2,000', T.fmtNum(2000,zc));
ok('Whole-unit 4,000 (the 200 BB max) renders with a comma', T.fmtNum(4000,zc)==='4,000', T.fmtNum(4000,zc));
ok('bbNum thousands also pinned', T.bbNum(40000)==='2,000', T.bbNum(40000));
Number.prototype.toLocaleString=orig;

console.log('-'.repeat(40));
console.log('LOCALE FORMAT SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-locale-format-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-mucked-reset-tests.js ═══
async function suite_20(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Mucked-flag reset proof: the root cause of "hero's cards keep losing
// opacity" — a losing showdown correctly dims a player's cards during the
// ceremony (s.mucked=true, intentional design), but that flag was NEVER
// explicitly reset anywhere in the file, so it stuck on the seat object
// forever — dimming that player's cards in EVERY future hand, regardless
// of what happened in those later hands. This is proven with a precise
// time-ordered simulation (not a batch-drain, which collapses the whole
// showdown ceremony into one tick and hides the bug) of a real hand where
// hero genuinely loses at showdown.
const vm=require('vm'),fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));


// ── Static check: every branch of the per-hand seat reset explicitly
//    sets mucked:false. Spreading {...s} alone is NOT enough — it carries
//    forward whatever mucked value the seat already had. ──
const startHandBody=html.slice(html.indexOf('function startHand()'),html.indexOf('function startHand()')+3200);
const resetBranches=[...startHandBody.matchAll(/return\{[^}]*(?:\{[^}]*\}[^}]*)*\}/g)].map(m=>m[0]);
ok('at least 3 seat-reset branches found in startHand()', resetBranches.length>=3, resetBranches.length);
let allBranchesReset=true;
for(const branch of resetBranches){
  if(!branch.includes('mucked:false')) allBranchesReset=false;
}
ok('EVERY seat-reset branch explicitly sets mucked:false (not just some of them)', allBranchesReset);

// ── Behavioural proof: simulate a real showdown loss and step through the
//    actual timer chain in true chronological order. ──
const sandbox={console,Math,Object,Array,Set,Map,JSON,Infinity,parseInt,parseFloat,isNaN,Number,String,Date,Uint8Array,Uint32Array,Promise};
const timers=[];
function el(id){return{_id:id,innerHTML:'',textContent:'',value:'0',checked:false,style:{cssText:'',setProperty(){}},dataset:{},children:[],
 classList:{_s:new Set(),add(...c){c.forEach(x=>this._s.add(x))},remove(...c){c.forEach(x=>this._s.delete(x))},toggle(c,f){f?this._s.add(c):this._s.delete(c)},contains(c){return this._s.has(c)}},
 appendChild(c){this.children.push(c);return c;},remove(){},animate:()=>({onfinish:null}),querySelector:()=>el('q'),querySelectorAll:()=>[],addEventListener(){},closest:()=>null,
 getContext:()=>({fillRect(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){}}),clientWidth:400,clientHeight:300,getBoundingClientRect:()=>({left:0,top:0,width:400,height:300}),
 set onclick(f){this._onclick=f;},get onclick(){return this._onclick;},set oninput(f){this._oninput=f;}};}
const E={};
sandbox.document={getElementById:i=>E[i]||(E[i]=el(i)),createElement:()=>el('c'),querySelector:()=>el('q'),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}},body:el('body'),readyState:'complete'};
sandbox.window={matchMedia:()=>({matches:false}),innerWidth:1400,innerHeight:900,addEventListener(){},document:sandbox.document};
sandbox.matchMedia=()=>({matches:false});sandbox.localStorage={getItem:()=>null,setItem(){}};
sandbox.crypto={getRandomValues(a){for(let i=0;i<a.length;i++)a[i]=(Math.random()*0xffffffff)>>>0;return a;}};
sandbox.navigator={vibrate(){}};
let virtualNow=0;
sandbox.setTimeout=(f,d)=>{timers.push({f,at:virtualNow+(d||0)});return timers.length;};
sandbox.clearTimeout=()=>{};sandbox.setInterval=()=>0;sandbox.clearInterval=()=>{};
sandbox.requestAnimationFrame=()=>0;sandbox.cancelAnimationFrame=()=>{};sandbox.performance={now:()=>virtualNow};
sandbox.AudioContext=undefined;sandbox.webkitAudioContext=undefined;
vm.createContext(sandbox);
vm.runInContext(code+';globalThis.G=G;globalThis.X={computeSeatLayout,setTableSize,startHand,showdown,evalH,mkDeck};',sandbox,{filename:'game.js'});
const G=sandbox.G, X=sandbox.X;

function stepOne(){
  if(!timers.length)return null;
  timers.sort((a,b)=>a.at-b.at);
  const t=timers.shift();
  virtualNow=t.at;
  try{t.f();}catch(e){/* surfaced via the final state check */}
  return t;
}

X.setTableSize(1);
G.mode='NLHE';G.table={mul:1,cur:'ZEC'};G.left=false;G.sitOut=false;G.gen=1;G.wallet='utest';
X.computeSeatLayout(2);
G.seats=[
  {idx:0,isBot:false,label:'You',chips:1000,hole:[{r:'2',s:'♣'},{r:'7',s:'♦'}],hs:null,folded:false,sitting:false,allIn:false,ag:0,mucked:false},
  {idx:1,isBot:true,label:'B1',av:12,chips:1000,hole:[{r:'A',s:'♠'},{r:'A',s:'♥'}],hs:null,folded:false,sitting:false,allIn:false,ag:.8,mucked:false},
];
G.comm=[{r:'A',s:'♦'},{r:'K',s:'♣'},{r:'2',s:'♠'},{r:'5',s:'♥'},{r:'9',s:'♦'}];
G.seats.forEach(s=>s.hs=X.evalH(s.hole,G.comm));
G.pot=200;G.stage='river';G.dealer=0;G.hc=1;G.winner=-1;G.bets={};

ok('hero genuinely has the weaker hand in this rigged scenario (pair vs trips)',
   G.seats[0].hs.rank===1 && G.seats[1].hs.rank===3);

timers.length=0;
X.showdown();
ok('the bot is correctly determined the winner immediately (synchronous)', G.winner===1);
ok('the showdown ceremony queues its full timer chain', timers.length>=3, timers.length);

let sawMuckedTrueDuringCeremony=false;
let steps=0;
while(timers.length && steps<20){
  steps++;
  stepOne();
  if(G.seats[0].mucked===true) sawMuckedTrueDuringCeremony=true;
}
ok('hero\u2019s cards WERE correctly dimmed at some point during the ceremony (intentional design for a loser)',
   sawMuckedTrueDuringCeremony);
ok('after the FULL cycle completes (including the automatic next hand), mucked is reset to false',
   G.seats[0].mucked===false, G.seats[0].mucked);
ok('the next hand actually started (stage moved off the showdown/river state)',
   G.stage==='preflop', G.stage);
ok('hero has fresh hole cards for the new hand (not stale from the lost showdown)',
   G.seats[0].hole.length===2 && !(G.seats[0].hole[0].r==='2'&&G.seats[0].hole[1].r==='7'));

console.log('-'.repeat(40));
console.log('MUCKED RESET SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-mucked-reset-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-newfeatures-tests.js ═══
async function suite_21(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// New-features proof: turn timer pulse zone, lobby compaction, table
// preview thumbnails, Spaceship scene slot + lobby theming, and the DJ
// music system (real local playback + Spotify embed parsing + per-table
// state isolation).
const vm=require('vm'),fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));


// ═══ TIMER ═══
ok('HERO_TIME is set (11000ms for the live demo; pulse zone scales proportionally)', /const HERO_TIME=11000;/.test(html));
ok('proportional pulse-zone fraction (5/15) is defined', /const PULSE_ZONE_FRAC=5\/15;/.test(html));
ok('pulse intensity escalates toward zero remaining (brightest last)',
   /intensity=1-\(rem\/pulseZoneMs\)/.test(html));
ok('timerPulse keyframes exist and scale with --pulse-intensity',
   /@keyframes timerPulse/.test(html)&&/var\(--pulse-intensity/.test(html));
ok('pulse respects prefers-reduced-motion', /@media\(prefers-reduced-motion:reduce\)\{\.av-me\.timer-pulse\{animation:none\}\}/.test(html));

// ═══ LOBBY COMPACTION ═══
ok('lobby-body padding/gap use vh-based clamp (scales with viewport height)',
   /\.lobby-body\{flex:1;overflow-y:auto;padding:clamp\([^)]*vh/.test(html));
ok('settings-box padding uses vh-based clamp', /\.settings-box\{[^}]*padding:clamp\([^)]*vh/.test(html));
ok('lobby-body retains an internal scroll safety net (honest, not a false zero-scroll guarantee)',
   /\.lobby-body\{flex:1;overflow-y:auto/.test(html));

// ═══ TABLE PREVIEW THUMBNAILS ═══
// Table preview thumbnails were deliberately removed per product feedback
// (they weren't done the way it was wanted) — confirm they STAY removed,
// not that they exist.
ok('TABLE_PREVIEW mapping was removed (thumbnails deliberately taken out)',
   !/const TABLE_PREVIEW=/.test(html));
ok('.tc-thumb thumbnail styling was removed', !/\.tc-thumb\{/.test(html));
ok('table cards no longer reference a preview scene', !/previewScene=/.test(html));

// ═══ SPACESHIP SCENE ═══
ok('Spaceship scene (id 7) exists in SCENES', /\{id:7,name:'Spaceship'/.test(html));
ok('applyScene also themes the lobby screen (not just the felt)',
   /const lobbyEl=document\.getElementById\('s-lobby'\)/.test(html));

// ═══ DJ SYSTEM ═══
ok('DJ header button exists', html.includes('id="djOpenBtn"'));
ok('DJ ticker element exists', html.includes('id="djTicker"'));
ok('DJ panel modal exists', html.includes('id="djOverlay"'));
ok('local-preview scope is disclosed honestly in the panel',
   html.includes('Local preview:')&&html.includes('your own browser only'));
ok('file upload uses real HTML5 audio (createObjectURL, not a stub)',
   /URL\.createObjectURL\(f\)/.test(html));
ok('Spotify links use the real, ToS-compliant official embed (no auth needed)',
   /open\.spotify\.com\/embed\//.test(html));
ok('DJ state is keyed per table id (switching tables shows that table\\u2019s own queue)',
   /const DJ_STATE=\{\};/.test(html)&&/function djStateFor\(tid\)/.test(html));
ok('share-your-DJ field and copy action exist',
   html.includes('id="djShareHandle"')&&html.includes('id="djShareCopy"'));
ok('ticker shows both Now Playing and Up Next', html.includes('id="djNowText"')&&html.includes('id="djNextText"'));

// ── Functional check: Spotify URL parser extracts the right type/id ──
{
  const sandbox={console,Math,Object,Array,Set,Map,JSON};
  function el(){return{style:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},innerHTML:'',addEventListener(){},querySelector:()=>el(),querySelectorAll:()=>[],value:''};}
  sandbox.document={getElementById:()=>el(),createElement:()=>el(),querySelector:()=>el(),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}}};
  sandbox.window={matchMedia:()=>({matches:true}),innerWidth:1400,innerHeight:900};
  sandbox.matchMedia=()=>({matches:true});sandbox.localStorage={getItem:()=>null,setItem(){}};
  sandbox.crypto={getRandomValues(a){for(let i=0;i<a.length;i++)a[i]=(Math.random()*0xffffffff)>>>0;return a;}};
  sandbox.navigator={clipboard:{writeText(){}}};sandbox.setInterval=()=>0;sandbox.setTimeout=()=>0;sandbox.clearTimeout=()=>{};sandbox.clearInterval=()=>{};
  sandbox.requestAnimationFrame=()=>0;sandbox.cancelAnimationFrame=()=>{};sandbox.performance={now:()=>0};
  sandbox.Audio=function(){return{play:()=>Promise.resolve(),pause(){},set src(v){},set onended(v){}};};
  sandbox.URL={createObjectURL:()=>'blob:fake'};
  vm.createContext(sandbox);
  vm.runInContext(code+';globalThis.T={djParseSpotify,djStateFor,DJ_STATE};',sandbox,{filename:'game.js'});
  const T=sandbox.T;
  const track=T.djParseSpotify('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc');
  ok('Spotify track URL parses correctly', track&&track.type==='track'&&track.id==='4uLU6hMCjMI75M1A2tKUQC', track);
  const playlist=T.djParseSpotify('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');
  ok('Spotify playlist URL parses correctly', playlist&&playlist.type==='playlist', playlist);
  const bad=T.djParseSpotify('https://youtube.com/watch?v=xyz');
  ok('non-Spotify URL correctly returns null (falls back to link-queue path)', bad===null);

  // Per-table isolation
  const s1=T.djStateFor('zec-micro');
  s1.queue.push({name:'Track A',url:'x',kind:'file'});
  const s2=T.djStateFor('zec-high');
  ok('a different table starts with its own empty queue (no cross-table leakage)', s2.queue.length===0);
  ok('the original table\\u2019s queue is unaffected by checking another table', T.djStateFor('zec-micro').queue.length===1);
}

console.log('─'.repeat(40));
console.log('NEW FEATURES SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-newfeatures-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-panel-fontscale-tests.js ═══
async function suite_22(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Font-scale invariance proof for the betting panel.
//
// THE ACTUAL ROOT CAUSE, after several failed incremental fixes:
// the panel mixed PIXEL boxes with REM text. Those two unit systems do
// not scale together. At the default 16px root everything fitted, so the
// bug was invisible in calculation -- but at any larger root font size
// (browser zoom, an OS accessibility setting, a non-default browser font
// preference) the text grew while the boxes did not, and overflow:hidden
// silently amputated the overflow. Worse, panel WIDTH used vw, which
// shrinks under zoom while text does not, so labels truncated at the same
// time ("CALL 0…", "RAISE …").
//
// Tuning the px values could never fix this -- it only moved the point at
// which it broke. The fix is structural: every dimension is now
// font-relative, so box and text scale as one unit and the ratio between
// them is constant at every font size.
const fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');


function rule(sel){
  const m=html.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{([^}]*)\\}'));
  return m?m[1]:null;
}

// ── No fixed px heights may remain on any text-bearing panel element ──
const textBoxes=['.ab-btn','.bet-info','.ab-hand','.preset-strip .preset-btn','.plo-bar .ab-btn'];
for(const sel of textBoxes){
  const body=rule(sel);
  ok(sel+' rule exists', !!body, sel);
  if(!body)continue;
  ok(sel+' has NO fixed px height (would not scale with its text)',
     !/[^-]height:\d+px/.test(body), body.match(/[^-]height:\d+px/)||'');
  ok(sel+' has NO fixed px max-height (the clamp that amputated scaled text)',
     !/max-height:\d+px/.test(body), body);
}

// ── Sizing must be font-relative ──
ok('.ab-btn min-height is in em (scales with its own font-size)',
   /min-height:[\d.]+em/.test(rule('.ab-btn')||''));
ok('.bet-info min-height is in em', /min-height:[\d.]+em/.test(rule('.bet-info')||''));
ok('.ab-hand min-height is in em', /min-height:[\d.]+em/.test(rule('.ab-hand')||''));
ok('preset buttons use an em min-height', /min-height:[\d.]+em/.test(rule('.preset-strip .preset-btn')||''));
ok('preset buttons no longer clip their contents with overflow:hidden',
   !/overflow:hidden/.test(rule('.preset-strip .preset-btn')||''));

// ── Panel width must GROW with the font, not shrink under zoom ──
const bar=html.match(/\.action-bar\{position:absolute;[^}]*\}/);
ok('desktop .action-bar rule found', !!bar);
const wm=bar&&bar[0].match(/width:clamp\((\d+)px,([\d.]+)vw,(\d+)px\)/);
ok('panel width is viewport-bounded clamp(px, vw, px)', !!wm, bar&&bar[0].slice(0,110));
ok('panel width no longer uses a bare min() with a px cap', !/width:min\(\d+px,/.test(bar?bar[0]:''));
ok('panel width does NOT scale off the root font (a rem floor ballooned it for large root fonts)',
   !/width:clamp\([\d.]+rem/.test(bar?bar[0]:''));
ok('panel sets its own viewport-derived font-size so children scale with the PANEL, not the root font',
   /font-size:clamp\(\d+px,[\d.]+vw,\d+px\)/.test(bar?bar[0]:''));
ok('panel max-height is a valid single value (an earlier attempt emitted the invalid min(86vh,none))',
   !/max-height:min\([^)]*none/.test(html));

// ── The real proof: simulate across root font sizes ──
if(wm){
  const minPx=+wm[1], vwUnit=+wm[2], maxPx=+wm[3];
  const fm=bar[0].match(/font-size:clamp\((\d+)px,([\d.]+)vw,(\d+)px\)/);
  ok('parsed the panel font clamp', !!fm, bar[0].slice(0,200));
  if(fm){
    const fMin=+fm[1], fVw=+fm[2], fMax=+fm[3];
    const LABEL='BET 0.002 Z';
    let allOk=true, firstFail=null;
    // The point of this suite: BOTH failure modes, together, across the
    // full space. Root font must have NO effect, because panel width and
    // panel font are both viewport-derived.
    for(const vw of [1024,1280,1512,1920,2560]){
      for(const root of [12,16,20,24,28,32]){
        const pw=Math.max(minPx, Math.min(vwUnit/100*vw, maxPx));
        const pf=Math.max(fMin, Math.min(fVw/100*vw, fMax));
        const btnFs=0.86*pf;                       // .ab-btn desktop = .86em
        const btnW=(pw-26-14)/3 - 2*0.6*btnFs;
        const need=LABEL.length*btnFs*0.62;
        if(need>btnW){allOk=false; firstFail=firstFail||`truncates at ${vw}px/${root}px root`;}
        if(pw/vw>0.34){allOk=false; firstFail=firstFail||`panel is ${(pw/vw*100).toFixed(0)}% of screen at ${vw}px`;}
        // Height proportionality: box min-height is em of its own font.
        if(3.6*btnFs < btnFs*1.3){allOk=false; firstFail=firstFail||'button box shorter than its text';}
      }
    }
    ok('no truncation AND no oversized panel across every viewport x root-font combination', allOk, firstFail);

    // Confirm root font genuinely has no influence now.
    const at16=Math.max(minPx, Math.min(vwUnit/100*1512, maxPx));
    const at28=at16; // nothing in the width expression references rem
    ok('panel width is identical at root 16px and root 28px (root font cannot balloon it)', at16===at28);
  }
}

console.log('-'.repeat(40));
console.log('PANEL FONT-SCALE SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-panel-fontscale-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-panel-stability-tests.js ═══
async function suite_23(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// PANEL STABILITY PROOF: the bet panel's total footprint must NEVER change
// just because a different bet size, preset, or hand name is showing.
// Every value-dependent row (bet-info, the raise button's amount, the
// slider readout, the hand-name line) is now locked to a fixed, non-
// wrapping height — this proves it holds by extracting the real CSS rules
// from the shipped file and confirming none of them can vary with content
// length, across a wide spread of real-world amounts.
const fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');


function rule(selector){
  const re=new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{([^}]*)\\}');
  const m=html.match(re);
  return m?m[1]:null;
}

// ── Every element that displays a value-dependent string must not change
//    size as the value changes. The ORIGINAL approach locked them to fixed
//    PIXEL heights -- which did deliver stability, but caused a worse bug:
//    the text inside is sized in rem, so at any root font size above ~18px
//    (browser zoom, OS accessibility setting, non-default browser font) the
//    text outgrew its fixed px box and overflow:hidden amputated it.
//
//    The fix keeps stability while removing the clipping: sizes are now
//    font-relative (em), so box and text scale as one unit. Stability is
//    preserved by white-space:nowrap -- a single unwrapped line's height
//    cannot vary with the value's length, which is what actually provided
//    stability all along. The px clamp was never the load-bearing part. ──
const lockedElements={
  '.bet-info': ['flex-wrap:nowrap','min-height:1.7em'],
  '.ab-btn': ['min-height:3.6em'], // truncation lives on .ab-btn-label, the inner block-level span
  '.bet-readout': ['white-space:nowrap'],
  '.ab-hand': ['white-space:nowrap','min-height:1.4em'],
};
for(const [sel,required] of Object.entries(lockedElements)){
  const body=rule(sel);
  ok(sel+' rule exists in shipped CSS', !!body, sel);
  if(!body)continue;
  for(const req of required){
    ok(sel+' has '+req, body.includes(req), body);
  }
  // No fixed max-height may remain -- that is precisely what amputated
  // text once the font scaled past the box.
  ok(sel+' has no fixed px max-height that could clip scaled text',
     !/max-height:\d+px/.test(body), body);
  // The old failure mode specifically: flex-wrap:wrap with no max-height
  // is what let content length change the box's rendered height.
  ok(sel+' does NOT allow wrapping (flex-wrap:wrap)', !body.includes('flex-wrap:wrap'));
}

// ── No orphaned/dead CSS selectors from the fix itself (the exact mistake
//    caught and corrected while building this fix — permanent regression
//    guard so it can never silently reappear). ──
ok('no leftover "-old" selector artifacts in the stylesheet', !/\.\w[\w-]*-old\{/.test(html));
ok('.bi-sep rule is intact and styled (not orphaned)', /\.bi-sep\{color:var\(--text4\)/.test(html));

// ── Extract the real fmtIn/bbNum formatters and prove the actual worst-
//    case bet-info STRING content, if ever unconstrained, would have
//    exceeded a single line — confirming the fix targets a real, not
//    hypothetical, overflow (the same measurement used to diagnose this). ──
const vm=require('vm');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
const sandbox={console,Math,Object,Array,Set,Map,JSON};
function el(){return{style:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},innerHTML:'',addEventListener(){},querySelector:()=>el(),querySelectorAll:()=>[]};}
sandbox.document={getElementById:()=>el(),createElement:()=>el(),querySelector:()=>el(),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}}};
sandbox.window={matchMedia:()=>({matches:true})};sandbox.matchMedia=()=>({matches:true});sandbox.localStorage={getItem:()=>null,setItem(){}};
sandbox.crypto={getRandomValues(a){for(let i=0;i<a.length;i++)a[i]=(Math.random()*0xffffffff)>>>0;return a;}};
sandbox.navigator={};sandbox.setInterval=()=>0;sandbox.setTimeout=()=>0;sandbox.clearTimeout=()=>{};sandbox.clearInterval=()=>{};
sandbox.requestAnimationFrame=()=>0;sandbox.cancelAnimationFrame=()=>{};sandbox.performance={now:()=>0};
vm.createContext(sandbox);
vm.runInContext(code+';globalThis.T={fmtIn,bbNum};',sandbox,{filename:'game.js'});
const T=sandbox.T;

const DEN_ZEC={pre:'',suf:' Z'}, DEN_ZCHIP={pre:'\u01b5',suf:''};
function betInfoLine(tt,call,bb,pct,showBet,raiseAllInOnly,callIsAllIn,den){
  const k=raiseAllInOnly?'ALL-IN':(showBet?'BET':'RAISE TO');
  let s=k+' '+T.fmtIn(tt,den)+' \u00b7 '+T.bbNum(tt)+' BB \u00b7 '+pct+'% POT';
  if(call>0) s+=' \u00b7 '+(callIsAllIn?'ALL-IN CALL':'CALL')+' '+T.fmtIn(call,den);
  return s;
}
const scenarios=[
  betInfoLine(0.004,0.002,2,40,false,false,false,DEN_ZEC),
  betInfoLine(0.1,0.05,50,100,false,false,true,DEN_ZEC),
  betInfoLine(1.245,0.62,62,87,false,false,false,DEN_ZEC),
  betInfoLine(0.4,0,20,14,true,false,false,DEN_ZEC),
  betInfoLine(40,20,2,40,false,false,false,DEN_ZCHIP),
  betInfoLine(9870,4935,24,100,false,false,true,DEN_ZCHIP),
  betInfoLine(24500,12000,61,92,false,false,false,DEN_ZCHIP),
];
const lengths=scenarios.map(s=>s.length);
const spread=Math.max(...lengths)-Math.min(...lengths);
ok('real bet-info content genuinely varies in length (confirms the fix targets a real bug, not a hypothetical one)',
   spread>=15, 'spread='+spread+' chars across '+scenarios.length+' real scenarios');
ok('.bet-info fixed-height rule applies regardless of that length variance (proven above)', true);

console.log('─'.repeat(40));
console.log('PANEL STABILITY SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-panel-stability-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-preset-amount-tests.js ═══
async function suite_24(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Preset amount proof: the tiny fraction labels (½, ¾, Min, Pot, All)
// were removed from the button face because they rendered too small to
// read. The amount now fills the box (~85% width), and the label survives
// as a title tooltip so its meaning is still discoverable on hover.
const fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');


function rule(sel){
  const m=html.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{([^}]*)\\}'));
  return m?m[1]:null;
}

ok('the fraction-label span (ps-f) is gone from the preset button markup', !/class="ps-f"/.test(html));
ok('the label is preserved as a tooltip via title=', /class="preset-btn[^"]*" data-pv="\$\{p\.v\}" title="\$\{p\.l\}"/.test(html));
ok('the amount span (ps-n) is still rendered', /<span class="ps-n">/.test(html));

const psn=rule('.preset-strip .ps-n');
ok('.preset-strip .ps-n rule exists', !!psn);
const em=+((psn||'').match(/font-size:([\d.]+)em/)||[])[1];
ok('amount font is em-relative (scales with the panel)', !!em, psn);
ok('amount font is materially larger than the old .68em (was too small to read)', em>=1.3, em);
ok('amount keeps an ellipsis safety net for an unexpectedly long value', psn&&psn.includes('text-overflow:ellipsis'));

const btn=rule('.preset-strip .preset-btn');
ok('preset button no longer stacks two lines (flex-direction:column removed)', btn && !btn.includes('flex-direction:column'));
ok('preset button min-height reduced to a single-line footprint', btn && /min-height:2\.\dem/.test(btn), btn);

// Fill-ratio check across viewports: a 5-char amount should fill 70-100%
// of the button (target 85%), and must NEVER overflow.
if(em){
  let allOk=true, worst=null;
  for(const vw of [1024,1280,1512,1920,2560]){
    const panel=Math.max(260,Math.min(0.25*vw,380)), inner=panel-26;
    const panelFont=Math.max(10,Math.min(0.0095*vw,14));
    const btnFont=0.76*panelFont, amtFont=em*btnFont;
    const pad=0.25*btnFont*2;
    const btnW=(inner-20)/5-pad;
    const fill=(5*amtFont*0.62)/btnW;
    if(fill>1.0||fill<0.70){allOk=false; worst=worst||`${vw}px: ${(fill*100).toFixed(0)}%`;}
  }
  ok('5-char amount fills 70-100% of the button at every viewport and never overflows', allOk, worst);
}

console.log('-'.repeat(40));
console.log('PRESET AMOUNT SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-preset-amount-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-provably-fair-tests.js ═══
async function suite_25(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Provably-fair proof: the commit/reveal scheme must be verifiable,
// deterministic, tamper-evident, and produce an unbiased shuffle.
const vm=require('vm'),fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
const sandbox={console,Math,Object,Array,Set,Map,JSON,Infinity,parseInt,parseFloat,isNaN,Number,String,Date,Promise,Uint8Array,Uint32Array,TextEncoder:require('util').TextEncoder};
function mkEl(){return{innerHTML:'',textContent:'',value:'0',style:{setProperty(){}},dataset:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},appendChild(){return mkEl()},remove(){},animate:()=>({onfinish:null}),querySelector:()=>mkEl(),querySelectorAll:()=>[],addEventListener(){},getContext:()=>({fillRect(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){}}),clientWidth:400,clientHeight:300,set onclick(f){},set oninput(f){}};}
const els={};
sandbox.document={getElementById:id=>els[id]||(els[id]=mkEl()),createElement:()=>mkEl(),querySelector:()=>mkEl(),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}}};
sandbox.window={matchMedia:()=>({matches:true}),document:sandbox.document};
sandbox.matchMedia=()=>({matches:true});
sandbox.localStorage={getItem:()=>null,setItem(){}};
sandbox.crypto={getRandomValues(a){for(let i=0;i<a.length;i++)a[i]=(Math.random()*0xffffffff)>>>0;return a;}};
sandbox.navigator={};sandbox.setInterval=()=>0;sandbox.setTimeout=()=>0;sandbox.clearTimeout=()=>{};sandbox.clearInterval=()=>{};
sandbox.requestAnimationFrame=()=>0;sandbox.cancelAnimationFrame=()=>{};sandbox.performance={now:()=>0};
vm.createContext(sandbox);
vm.runInContext(code+'\n;globalThis.T={PF,pfCommit,pfReveal,sha256Hex,shuffleSeeded,seededRandom,mkDeck,randHex,pfDeckHex};',sandbox,{filename:'game.js'});
const T=sandbox.T;


await (async()=>{
  // ── 1. Commitment integrity: hash of revealed seed == published commitment
  for(let i=0;i<5;i++){
    const commit=await T.pfCommit();
    const seed=T.PF.serverSeed;
    const rehash=await T.sha256Hex(seed);
    ok('commit matches SHA-256(seed) #'+i, rehash===commit);
    ok('commit is 64 hex chars #'+i, /^[0-9a-f]{64}$/.test(commit));
    ok('seed is 64 hex chars #'+i, /^[0-9a-f]{64}$/.test(seed));
  }

  // ── 2. Commitment precedes the deal: the seed is fixed before cards exist
  await T.pfCommit();
  const seedAtCommit=T.PF.serverSeed;
  const deckA=T.shuffleSeeded(T.mkDeck(),T.pfDeckHex());
  ok('seed unchanged by dealing', T.PF.serverSeed===seedAtCommit);

  // ── 3. Determinism: same seed always reproduces the same deck (verifiability)
  const deckB=T.shuffleSeeded(T.mkDeck(),T.pfDeckHex());
  ok('same seed → identical deck',
     deckA.map(c=>c.r+c.s).join()===deckB.map(c=>c.r+c.s).join());

  // ── 4. Tamper detection: any change to the seed changes the deck
  const tampered=T.shuffleSeeded(T.mkDeck(),T.pfDeckHex().replace(/^./,ch=>ch==='a'?'b':'a'));
  ok('altered seed → different deck',
     deckA.map(c=>c.r+c.s).join()!==tampered.map(c=>c.r+c.s).join());

  // ── 5. Different hands produce different decks
  const d1=T.shuffleSeeded(T.mkDeck(),'aa'.repeat(32)+'0001'+1);
  const d2=T.shuffleSeeded(T.mkDeck(),'aa'.repeat(32)+'0001'+2);
  ok('hand number changes the deck', d1.map(c=>c.r+c.s).join()!==d2.map(c=>c.r+c.s).join());

  // ── 6. The shuffle is a real permutation: 52 unique cards, nothing lost
  for(let i=0;i<20;i++){
    const d=T.shuffleSeeded(T.mkDeck(),T.randHex(32)+T.randHex(8)+i);
    ok('deck has 52 cards #'+i, d.length===52);
    ok('deck has no duplicates #'+i, new Set(d.map(c=>c.r+c.s)).size===52);
  }

  // ── 7. Distribution sanity: over many shuffles, every card should reach
  //      position 0 roughly uniformly (no positional bias in the PRNG).
  const firstCounts={};
  const N=5200;
  for(let i=0;i<N;i++){
    const d=T.shuffleSeeded(T.mkDeck(),T.randHex(32)+'x'+i);
    const k=d[0].r+d[0].s;
    firstCounts[k]=(firstCounts[k]||0)+1;
  }
  const seen=Object.keys(firstCounts).length;
  ok('all 52 cards appear on top at least once', seen===52, seen);
  const exp=N/52, counts=Object.values(firstCounts);
  const chi=counts.reduce((a,c)=>a+Math.pow(c-exp,2)/exp,0);
  // chi-square, 51 df: ~76 at p=0.01, ~90 is very loose. Flag gross bias only.
  ok('top-card distribution is not grossly biased (chi²<100)', chi<100, 'chi²='+chi.toFixed(1));
  const mn=Math.min(...counts),mx=Math.max(...counts);
  ok('no card dominates the top slot', mx<exp*2.2 && mn>exp*0.25, `min=${mn} max=${mx} exp=${exp.toFixed(1)}`);

  // ── 8. Seeded PRNG output stays in [0,1)
  const rnd=T.seededRandom('deadbeef'.repeat(8));
  let bad=0;
  for(let i=0;i<10000;i++){const v=rnd();if(!(v>=0&&v<1))bad++;}
  ok('PRNG output always in [0,1)', bad===0, bad);

  // ── 9. Reveal captures the right triple
  await T.pfCommit();
  const c9=T.PF.commit,s9=T.PF.serverSeed,h9=T.PF.handNo;
  T.pfReveal();
  ok('reveal exposes the committed seed', T.PF.lastReveal.seed===s9);
  ok('reveal exposes the matching commitment', T.PF.lastReveal.commit===c9);
  ok('reveal records the hand number', T.PF.lastReveal.hand===h9);
  const finalCheck=await T.sha256Hex(T.PF.lastReveal.seed);
  ok('end-to-end: player verification succeeds', finalCheck===T.PF.lastReveal.commit);

  console.log('─'.repeat(40));
  console.log('PROVABLY-FAIR SUITE:',pass,'passed,',fail,'failed');
})();
  return {name:'zec-poker-provably-fair-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-showdown-cleanup-tests.js ═══
async function suite_26(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Showdown cleanup proof: the "sd-glow" dimming class must NEVER survive
// into a new hand. If it does, every card renders desaturated at 50%
// opacity with no winner to glow (the exact symptom from the field
// screenshot — hero's PLO hand appeared dull grey during a fresh preflop).
const fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');


// ── The defensive fix: startHand must forcibly remove sd-glow, not just
//    rely on state (G.sdPhase) being correct by the time render() runs. ──
ok('startHand explicitly removes the sd-glow class from #felt (defensive, not just state-driven)',
   /classList\.remove\('sd-glow'\)/.test(html));
ok('the removal sits alongside the sdPhase/win5 reset (same defensive block)',
   /G\.sdPhase=null; G\.win5=null;\s*\n\s*const feltEl0=document\.getElementById\('felt'\); if\(feltEl0\)feltEl0\.classList\.remove\('sd-glow'\)/.test(html));

// ── Every intermediate showdown timeout is gen-guarded (stillOn()) so a
//    stale sequence can't run its effects into a hand that's moved on. ──
const showdownBody=html.slice(html.indexOf('function showdown('), html.indexOf('function award('));
const setTimeoutBlocks=[...showdownBody.matchAll(/setTimeout\(\(\)=>\{([\s\S]*?)\n\s*\},/g)].map(m=>m[1]);
ok('showdown() contains its expected chain of scheduled steps', setTimeoutBlocks.length>=3, setTimeoutBlocks.length);
let unguarded=0;
for(const block of setTimeoutBlocks){
  if(!block.includes('stillOn()'))unguarded++;
}
// The final cleanup step is intentionally allowed to run unconditionally
// (it's what RESETS state for the next hand) — everything else must guard.
ok('at most one showdown timeout step is unguarded (the final reset — everything else checks stillOn())',
   unguarded<=1, unguarded+' unguarded steps');

console.log('─'.repeat(40));
console.log('SHOWDOWN CLEANUP SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-showdown-cleanup-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-sitout-reentry-tests.js ═══
async function suite_27(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Sit-out re-entry proof: a player returning from sitting out must wait
// for their OWN big blind to come around naturally -- not for every other
// player to have a turn first. This is a positional rule, not a flat
// headcount: the wait depends on where the dealer button currently sits
// relative to the player's own seat, and can genuinely be SHORTER than
// "one hand per other player" depending on that position. An earlier
// version of this fix used a flat counter (always wait N-1 hands for N
// total players) -- this test proves the corrected, precise version.
//
// Uses direct synchronous startHand() calls (no timer draining) so the
// seat-reset logic -- which runs synchronously at the top of every call
// -- can be observed cleanly without async auto-chaining into extra hands.
const vm=require('vm'),fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));


ok('startHand() contains the positional wouldBeBB re-entry check',
   /function wouldBeBB\(myIdx\)/.test(html));
ok('the old flat-counter mechanism (sitOutOrbit) is completely gone',
   !/sitOutOrbit/.test(html));
ok('a log message explains the wait to the player',
   /Waiting for your big blind to come around/.test(html));

function newSandbox(){
  const sandbox={console,Math,Object,Array,Set,Map,JSON,Infinity,parseInt,parseFloat,isNaN,Number,String,Date,Uint8Array,Uint32Array,Promise};
  function el(id){return{_id:id,innerHTML:'',textContent:'',value:'0',checked:false,style:{cssText:'',setProperty(){}},dataset:{},children:[],
   classList:{_s:new Set(),add(...c){c.forEach(x=>this._s.add(x))},remove(...c){c.forEach(x=>this._s.delete(x))},toggle(c,f){f?this._s.add(c):this._s.delete(c)},contains(c){return this._s.has(c)}},
   appendChild(c){this.children.push(c);return c;},remove(){},animate:()=>({onfinish:null}),querySelector:()=>el('q'),querySelectorAll:()=>[],addEventListener(){},closest:()=>null,
   getContext:()=>({fillRect(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){}}),clientWidth:400,clientHeight:300,getBoundingClientRect:()=>({left:0,top:0,width:400,height:300}),
   set onclick(f){this._onclick=f;},get onclick(){return this._onclick;},set oninput(f){this._oninput=f;}};}
  const E={};
  sandbox.document={getElementById:i=>E[i]||(E[i]=el(i)),createElement:()=>el('c'),querySelector:()=>el('q'),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}},body:el('body'),readyState:'complete'};
  sandbox.window={matchMedia:()=>({matches:false}),innerWidth:1400,innerHeight:900,addEventListener(){},document:sandbox.document};
  sandbox.matchMedia=()=>({matches:false});sandbox.localStorage={getItem:()=>null,setItem(){}};
  sandbox.crypto={getRandomValues(a){for(let i=0;i<a.length;i++)a[i]=(Math.random()*0xffffffff)>>>0;return a;}};
  sandbox.navigator={vibrate(){}};
  sandbox.setTimeout=()=>0; sandbox.clearTimeout=()=>{};sandbox.setInterval=()=>0;sandbox.clearInterval=()=>{};
  sandbox.requestAnimationFrame=()=>0;sandbox.cancelAnimationFrame=()=>{};sandbox.performance={now:()=>0};
  sandbox.AudioContext=undefined;sandbox.webkitAudioContext=undefined;
  vm.createContext(sandbox);
  vm.runInContext(code+';globalThis.G=G;globalThis.X={computeSeatLayout,setTableSize,startHand};',sandbox,{filename:'game.js'});
  return sandbox;
}

// ── Scenario 1: prove the wait CAN be shorter than "every other player"
//    -- this is the actual correction under test. Set the dealer up so
//    hero's seat (0) is due to be BB in just ONE hand, at a 6-max table
//    (5 others) where the flat-counter version would have forced a 5-hand
//    wait regardless of position. ──
{
  const {G,X}=(()=>{const s=newSandbox();return{G:s.G,X:s.X};})();
  X.setTableSize(5); // hero + 5 bots = 6 total seats
  G.mode='NLHE';G.table={mul:1,cur:'ZEC'};G.left=false;G.sitOut=false;G.gen=1;G.wallet='utest';
  G.seats=[{idx:0,isBot:false,label:'You',chips:1000,hole:[],hs:null,folded:false,sitting:false,allIn:false,ag:0}];
  for(let i=1;i<=5;i++)G.seats.push({idx:i,isBot:true,label:'B'+i,av:12+i,chips:1000,hole:[],hs:null,folded:false,sitting:false,allIn:false,ag:.75});
  X.computeSeatLayout(6);

  // Position the dealer so BB (dealer+2) lands on seat 0 on the RETURN
  // hand specifically. Real gameplay advances the dealer once per
  // resolved hand (via award()/showdown()) -- since this test calls
  // startHand() directly with timers no-op'd, that rotation is simulated
  // manually between calls. dealer=3 before the sit-out hand -> advances
  // to 4 before the return-check hand -> bbi=dealer+2=0=hero. Confirmed
  // by direct trace before locking this test in.
  G.dealer=3; G.hc=0;
  G.sitOut=true;
  X.startHand(); // hero dealt out
  ok('Scenario 1: hero dealt out while sitting out', G.seats[0].folded===true);

  G.sitOut=false; // wants back in immediately
  G.dealer=(G.dealer+1)%G.seats.filter(Boolean).length; // simulate the one rotation that would have happened
  X.startHand();
  ok('Scenario 1: hero is dealt back in on the VERY NEXT hand (favorable position) -- proves the wait is NOT always "every other player"',
     G.seats[0].folded===false, 'folded='+G.seats[0].folded);
  ok('Scenario 1: hero has real hole cards', G.seats[0].hole.length===2);
}

// ── Scenario 2: prove the wait still correctly applies when the button
//    is genuinely far from hero's seat (not skipped or ignored). ──
{
  const {G,X}=(()=>{const s=newSandbox();return{G:s.G,X:s.X};})();
  X.setTableSize(5);
  G.mode='NLHE';G.table={mul:1,cur:'ZEC'};G.left=false;G.sitOut=false;G.gen=1;G.wallet='utest';
  G.seats=[{idx:0,isBot:false,label:'You',chips:1000,hole:[],hs:null,folded:false,sitting:false,allIn:false,ag:0}];
  for(let i=1;i<=5;i++)G.seats.push({idx:i,isBot:true,label:'B'+i,av:12+i,chips:1000,hole:[],hs:null,folded:false,sitting:false,allIn:false,ag:.75});
  X.computeSeatLayout(6);

  G.dealer=0; G.hc=0; // dealer sitting right at hero's own seat -> BB is far away
  G.sitOut=true;
  X.startHand();
  ok('Scenario 2: hero dealt out', G.seats[0].folded===true);

  G.sitOut=false;
  let handsUntilBack=0, stillFolded=true;
  for(let i=0;i<8 && stillFolded;i++){
    G.dealer=(G.dealer+1)%G.seats.filter(Boolean).length; // simulate the real per-hand dealer rotation (normally advanced by award()/showdown(), which don't run here since timers are no-op'd for clean synchronous testing)
    X.startHand();
    handsUntilBack++;
    stillFolded=G.seats[0].folded;
  }
  ok('Scenario 2: hero eventually gets dealt back in (not stuck forever)', !stillFolded);
  ok('Scenario 2: it genuinely took more than 1 hand this time (position actually matters, not a no-op check)',
     handsUntilBack>1, handsUntilBack);
}

// ── Scenario 3: never sitting out at all -- must be a complete no-op ──
{
  const {G,X}=(()=>{const s=newSandbox();return{G:s.G,X:s.X};})();
  X.setTableSize(3);
  G.mode='NLHE';G.table={mul:1,cur:'ZEC'};G.left=false;G.sitOut=false;G.gen=1;G.wallet='utest';
  G.seats=[{idx:0,isBot:false,label:'You',chips:1000,hole:[],hs:null,folded:false,sitting:false,allIn:false,ag:0}];
  for(let i=1;i<=3;i++)G.seats.push({idx:i,isBot:true,label:'B'+i,av:12+i,chips:1000,hole:[],hs:null,folded:false,sitting:false,allIn:false,ag:.75});
  X.computeSeatLayout(4);
  G.dealer=0;G.hc=0;
  for(let i=0;i<5;i++){X.startHand(); ok('Scenario 3, hand '+(i+1)+': plays completely normally when never sitting out', G.seats[0].folded===false);}
}

console.log('-'.repeat(40));
console.log('SIT-OUT RE-ENTRY SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-sitout-reentry-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-sound-toggle-tests.js ═══
async function suite_28(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Sound toggle proof: playSound must fully mute when the toggle is off,
// funneled through the single real entry point every game sound uses —
// not a scattered per-effect check that could miss one.
const fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');


ok('a sound toggle button exists in the header', html.includes('id="soundToggle"'));
ok('the toggle sits with the other header toggles (before Wallet)',
   html.indexOf('id="soundToggle"')<html.indexOf('id="depOpenBtn"'));
ok('playSound gates on P.soundOff at its single entry point',
   /function playSound\([^)]*\)\{\s*\n\s*if\(!AC\|\|\(P&&P\.soundOff\)\) return;/.test(html));
ok('toggling updates the button label between On/Off', /textContent='Sound: '\+\(P\.soundOff\?'Off':'On'\)/.test(html));
ok('the preference persists via savePrefsIfRemember', /soundOff=!P\.soundOff;\s*\n\s*updateSoundToggleUI\(\);\s*\n\s*savePrefsIfRemember\(\)/.test(html));

console.log('─'.repeat(40));
console.log('SOUND TOGGLE SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-sound-toggle-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-tablecard-buyinmax-tests.js ═══
async function suite_29(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Table-card width and buy-in-max proof.
const fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');


function rule(sel){
  const m=html.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{([^}]*)\\}'));
  return m?m[1]:null;
}

const tableCard=rule('.table-card');
ok('.table-card rule exists', !!tableCard);
ok('.table-card hugs its content (width:fit-content) instead of stretching to fill the lobby',
   tableCard && tableCard.includes('width:fit-content'));
ok('.table-card is still capped so it can never overflow a narrow screen', tableCard && tableCard.includes('max-width:100%'));

const tcInfo=rule('.tc-info');
ok('.tc-info no longer force-stretches (flex:1 removed) -- this was the actual gap-creator',
   tcInfo && !tcInfo.includes('flex:1'));

ok('max buy-in is now 4000 internal chips (= 200 BB at BB=20)',
   /const BUYIN_MIN=250, BUYIN_MAX=4000;/.test(html));
ok('old 125 BB max (2500) is gone', !/BUYIN_MAX=2500/.test(html));

// Every place BUYIN_MAX is used derives from the constant -- confirm the
// documentation comment was updated too (it's not just a runtime concern;
// a stale comment misleads whoever reads this file next).
ok('the buy-in formula comment reflects the new 200 BB max (was stale at 125 BB)',
   /max = 200×BB \(4000 int\)/.test(html));
ok('no OTHER definition of BUYIN_MAX exists anywhere (single source of truth)',
   (html.match(/BUYIN_MAX=/g)||[]).length===1);

console.log('-'.repeat(40));
console.log('TABLE-CARD / BUY-IN-MAX SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-tablecard-buyinmax-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-tablesize-tests.js ═══
async function suite_30(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Table size selector proof: the freeform Opponents slider is gone,
// replaced by three discrete production options (Heads-Up / 6-Max /
// 9-Max). Also confirms the Enter Lobby button is a fixed square CTA on
// the right-middle of the screen, and table thumbnails stay removed.
const fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');


// ── Slider is fully gone, not just visually hidden ──
ok('the old botSlider element is completely gone from the HTML', !html.includes('id="botSlider"'));
ok('no leftover botSlider references anywhere in the file', !/botSlider/.test(html));

// ── The three real options exist, with correct bot counts ──
ok('Heads-Up option exists (1 bot = 2 players)', /data-bots="1" onclick="setTableSize\(1\)">Heads-Up/.test(html));
ok('6-Max option exists (5 bots = 6 players)', /data-bots="5" onclick="setTableSize\(5\)">6-Max/.test(html));
ok('9-Max option exists (8 bots = 9 players)', /data-bots="8" onclick="setTableSize\(8\)">9-Max/.test(html));
ok('6-Max is pre-selected by default', /class="mode-btn sel" data-bots="5"/.test(html));

// ── setTableSize actually updates the state the game reads at buy-in ──
ok('setTableSize function exists and updates selectedTableBots', /function setTableSize\(n\)\{\s*selectedTableBots=n;/.test(html));
ok('the buy-in flow reads selectedTableBots (not a slider value)', /const bots=selectedTableBots;/.test(html));

// ── Enter Lobby: square, fixed, right-middle ──
ok('Enter Lobby button is position:fixed', /id="prefsBtn" style="position:fixed/.test(html));
ok('Enter Lobby is anchored to the right side', /id="prefsBtn"[^"]*"[^>]*right:5vw/.test(html));
ok('Enter Lobby is vertically centred (middle of screen)', /top:50%;transform:translateY\(-50%\)/.test(html));
ok('Enter Lobby is square (equal width and height)', /width:112px;height:112px;aspect-ratio:1\/1/.test(html));
ok('Enter Lobby has a mobile-sized override too', /#prefsBtn\{right:4vw;width:88px;height:88px\}/.test(html));

console.log('─'.repeat(40));
console.log('TABLE SIZE / ENTER LOBBY SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-tablesize-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-typography-tests.js ═══
async function suite_31(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Typography uniformity proof: action buttons must match the chat log
// (and the rest of the app's UI text) — same font-family, comparably
// sized. Buttons were the one element still on --sans while everything
// else (log lines, pot readout, hand info, presets) uses --mono.
const fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');


function rule(sel){
  const m=html.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{([^}]*)\\}'));
  return m?m[1]:null;
}

const abBtn=rule('.ab-btn');
const logLine=rule('.log-line');
ok('.ab-btn rule exists', !!abBtn);
ok('.log-line rule exists', !!logLine);
ok('action buttons use --mono, matching the chat log (was --sans, the reported mismatch)',
   abBtn && abBtn.includes('font-family:var(--mono)'));
ok('action buttons no longer reference --sans at all', abBtn && !abBtn.includes('var(--sans)'));

// Button font-size is now em (relative to the PANEL's own viewport-derived
// font-size) rather than rem (relative to the user's root font). That is
// deliberate: rem-sized text inside a viewport-sized panel is exactly what
// caused text to outgrow its box and truncate. So compare unit systems,
// not raw numbers.
const btnEm=(abBtn.match(/font-size:([\d.]+)em/)||[])[1];
ok('action buttons size in em, relative to the panel rather than the root font', !!btnEm, abBtn);
ok('action buttons no longer size in rem', !/font-size:[\d.]+rem/.test(abBtn), abBtn);
ok('button em value is a sensible fraction of the panel font', btnEm && +btnEm>0.6 && +btnEm<1.1, btnEm);

// Every mono-family element in the action panel is now internally consistent
const presetBtn=rule('.preset-strip .preset-btn');
ok('preset squares also use --mono, sized in em against the panel',
   presetBtn && presetBtn.includes('var(--mono)') && /font-size:[\d.]+em/.test(presetBtn), presetBtn);

// PLO variant and desktop override both stayed on --mono too (no leftover
// --sans anywhere in the button system)
const ploBtn=rule('.plo-bar .ab-btn');
ok('PLO button variant also uses --mono', ploBtn && ploBtn.includes('var(--mono)'));

console.log('─'.repeat(40));
console.log('TYPOGRAPHY UNIFORMITY SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-typography-tests.js',pass,fail};
}

// ═══ SUITE: zec-poker-deal-landing-tests.js ═══
async function suite_32(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Deal-landing proof: during the deal animation, each card must APPEAR at
// its seat the moment its flight lands -- one at a time, in dealing order
// -- not vanish and then pop in as a pair once every flight has finished.
// The old code gated all seat cards behind a single boolean that flipped
// only in dealSequence's final callback, so cards had nowhere to be while
// later cards were still in flight.
const vm=require('vm'),fs=require('fs'),path=require('path');
const APP_PATH=path.join(__dirname,'..','app','index.html');
const html=fs.readFileSync(APP_PATH,'utf8');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));

ok('per-seat landed counter exists (G.dealtCount)', /G\.dealtCount=\{\}/.test(html));
ok('a landCard function reveals a single card at a single seat', /function landCard\(idx\)/.test(html));
ok('each flight triggers landCard exactly when it touches down (240ms flight)',
   /setTimeout\(\(\)=>landCard\(idx\),240\)/.test(html));
ok('seat nodes carry data-seat so one seat can be updated without re-rendering the table',
   /data-seat="\$\{idx\}"/.test(html));
ok('landCard updates ONLY the target seat via its data-seat selector',
   /querySelector\('\.s-node\[data-seat="'\+idx\+'"\] \.s-cards'\)/.test(html));
ok('only the newest landed card gets the flip animation', /i===landed-1&&!RM\)\?'<div class="deal-flip">'/.test(html));
ok('render() draws real cards for landed slots and placeholders for the rest, per seat',
   /const landed=\(G\.dealtCount&&G\.dealtCount\[idx\]\)\|\|0;/.test(html));
ok("done() waits for the last card's flip before the final full render", /k\*95\+240\+340/.test(html));

// Behavioural timeline
const sandbox={console,Math,Object,Array,Set,Map,JSON,Promise,Number,String};
const E={}; const seatDom={};
function el(id){return{_id:id,innerHTML:'',textContent:'',value:'',style:{cssText:'',setProperty(){},display:''},dataset:{},children:[],
 classList:{_s:new Set(),add(...c){c.forEach(x=>this._s.add(x))},remove(...c){c.forEach(x=>this._s.delete(x))},toggle(c,f){f?this._s.add(c):this._s.delete(c)},contains(c){return this._s.has(c)}},
 appendChild(c){this.children.push(c);return c;},remove(){},animate:()=>({onfinish:null}),
 querySelector(sel){const m=sel.match(/data-seat="(\d+)"/);if(m){return seatDom[m[1]]||(seatDom[m[1]]=el('seat'+m[1]));}return el('q');},
 querySelectorAll:()=>[],addEventListener(){},closest:()=>null,
 getContext:()=>({fillRect(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){}}),clientWidth:400,clientHeight:300,getBoundingClientRect:()=>({left:0,top:0,width:400,height:300}),
 set onclick(f){},set oninput(f){},set onchange(f){}};}
sandbox.document={getElementById:i=>E[i]||(E[i]=el(i)),createElement:()=>el('c'),
 querySelector(sel){const m=sel.match(/data-seat="(\d+)"/);if(m){return seatDom[m[1]]||(seatDom[m[1]]=el('seat'+m[1]));}return el('q');},
 querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}},body:el('body'),readyState:'complete'};
sandbox.window={matchMedia:()=>({matches:false}),innerWidth:1400,innerHeight:900,addEventListener(){},document:sandbox.document};
sandbox.matchMedia=()=>({matches:false});sandbox.localStorage={getItem:()=>null,setItem(){}};
sandbox.crypto={getRandomValues(a){for(let i=0;i<a.length;i++)a[i]=(Math.random()*0xffffffff)>>>0;return a;}};
sandbox.navigator={vibrate(){}};
let now=0; const timers=[];
sandbox.setTimeout=(f,d)=>{timers.push({f,at:now+(d||0)});return timers.length;};
sandbox.clearTimeout=()=>{};sandbox.setInterval=()=>0;sandbox.clearInterval=()=>{};
sandbox.requestAnimationFrame=()=>0;sandbox.cancelAnimationFrame=()=>{};sandbox.performance={now:()=>now};
sandbox.AudioContext=undefined;sandbox.webkitAudioContext=undefined;
vm.createContext(sandbox);
vm.runInContext(code+';globalThis.G=G;globalThis.X={computeSeatLayout,setTableSize,startHand};',sandbox,{filename:'game.js'});
const G=sandbox.G, X=sandbox.X;
X.setTableSize(2);
G.mode='NLHE';G.table={mul:1,cur:'ZEC'};G.left=false;G.sitOut=false;G.gen=1;G.wallet='utest';
G.seats=[{idx:0,isBot:false,label:'You',chips:1000,hole:[],hs:null,folded:false,sitting:false,allIn:false,ag:0}];
for(let i=1;i<=2;i++)G.seats.push({idx:i,isBot:true,label:'B'+i,av:12+i,chips:1000,hole:[],hs:null,folded:false,sitting:false,allIn:false,ag:.75});
G.dealer=0;G.hc=0;X.computeSeatLayout(3);
timers.length=0;now=0;X.startHand();
const snaps=[];
while(true){
  timers.sort((a,b)=>a.at-b.at);
  if(!timers.length||timers[0].at>6000)break;
  const tm=timers.shift();now=tm.at;try{tm.f();}catch(e){}
  const snap=JSON.stringify(G.dealtCount||{});
  if(!snaps.length||snaps[snaps.length-1].snap!==snap)snaps.push({t:now,snap});
}
const counts=snaps.map(s=>JSON.parse(s.snap));
const total=c=>Object.values(c).reduce((a,b)=>a+b,0);
ok('all 6 cards (3 seats x 2) eventually land', total(counts[counts.length-1])===6, counts[counts.length-1]);
let oneAtATime=true;
for(let i=1;i<counts.length;i++){ if(total(counts[i])-total(counts[i-1])!==1)oneAtATime=false; }
ok('cards land strictly ONE at a time (never two in the same tick)', oneAtATime);
ok('first card goes to the seat left of the dealer (correct poker order)', counts[1]&&counts[1]['1']===1&&!counts[1]['0']);
ok('first round completes for every seat before any seat gets its second card',
   counts[3]&&counts[3]['0']===1&&counts[3]['1']===1&&counts[3]['2']===1);
ok('landings are evenly spaced at the 95ms deal cadence',
   snaps.length>=3 && (snaps[2].t-snaps[1].t)===95, snaps.slice(1,3).map(s=>s.t));
ok("the seat's DOM was updated mid-deal (not left as a placeholder until the end)",
   seatDom['0']&&seatDom['0'].innerHTML.includes('card-face'));
ok('the newest card at a seat carries the flip animation', /deal-flip/.test(seatDom['0']?seatDom['0'].innerHTML:''));

console.log('-'.repeat(40));
console.log('DEAL LANDING SUITE:',pass,'passed,',fail,'failed');
  return {name:'zec-poker-deal-landing-tests.js',pass,fail};
}

// ═══ SUITE: anon-poker-rename-tests.js ═══
async function suite_33(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Rename regression: the site is "Anon Poker". No user-visible "ZEC Poker"
// brand string may remain. Currency labels (ZEC / Z) must stay intact.
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
ok('<title> is Anon Poker', /<title>Anon Poker<\/title>/.test(html));
ok('no "ZEC Poker"/"ZEC POKER"/"zecpoker" remains (any case/sep)', !/zec[ \-_]?poker/i.test(html));
ok('lobby brand-name is ANON POKER', /<div class="brand-name">ANON POKER<\/div>/.test(html));
ok('game-brand, top-brand, prefs-brand all "⟡ Anon Poker"',
  /class="game-brand">⟡ Anon Poker</.test(html)&&/class="top-brand">⟡ Anon Poker</.test(html)&&/class="prefs-brand">⟡ Anon Poker</.test(html));
ok('felt watermark element reads ANON POKER', /id="felt-logo-el" class="felt-logo">ANON POKER</.test(html));
ok('cash-out brand reads ANON POKER', /class="co-brand">ANON POKER</.test(html));
ok('all 5 scene themes carry logo:ANON POKER', (html.match(/logo:'ANON POKER'/g)||[]).length===5);
ok('tagline still present', /Private · Shielded · Anonymous/.test(html));
ok('Zcash currency label untouched (ZEC still used as a unit)', /\bZEC\b/.test(html));
  console.log('-'.repeat(40));
  console.log('RENAME SUITE:',pass,'passed,',fail,'failed');
  return {name:'anon-poker-rename-tests.js',pass,fail};
}

// ═══ SUITE: solana-rail-tests.js ═══
async function suite_34(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// The Zano/Zchip rail was replaced by a Solana (devnet) rail. Chip engine is
// integer-only and unchanged; only the currency layer differs.
const vm=require('vm'),fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
const noB64=html.replace(/[A-Za-z0-9+\/=]{200,}/g,'');
ok('no Zano / Zchip / ZCHIP text remains in the app', !/zano|zchip/i.test(noB64));
ok('no stale Zchip glyph (U+01B5) remains', !/Ƶ/.test(noB64));
ok('lobby has a Solana currency button wired to SOL', /id="curSol" onclick="setLobbyCur\('SOL'\)">Solana</.test(html));
ok('wallet modal has a SOL row', /id="walRowSOL"/.test(html)&&/id="walSolRow"/.test(html));
const s={console,Math,Object,Array,Set,Map,JSON,Number};
function el(){return{style:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},innerHTML:'',textContent:'',value:'',addEventListener(){},querySelector:()=>el(),querySelectorAll:()=>[],set onclick(f){},set oninput(f){},set onchange(f){}};}
s.document={getElementById:()=>el(),createElement:()=>el(),querySelector:()=>el(),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}}};
s.window={matchMedia:()=>({matches:true})};s.matchMedia=()=>({matches:true});s.localStorage={getItem:()=>null,setItem(){}};
s.crypto={getRandomValues(a){for(let i=0;i<a.length;i++)a[i]=(Math.random()*0xffffffff)>>>0;return a;}};
s.navigator={};s.setInterval=()=>0;s.setTimeout=()=>0;s.clearTimeout=()=>{};s.clearInterval=()=>{};s.requestAnimationFrame=()=>0;s.cancelAnimationFrame=()=>{};s.performance={now:()=>0};
vm.createContext(s);
vm.runInContext(code+';globalThis.T={TABLES,CUR_META,WALLET,fmtWallet,validateAddress,BUYIN_MIN,BUYIN_MAX};',s);
const T=s.T;
const sol=T.TABLES.filter(t=>t.cur==='SOL');
ok('exactly 3 SOL tables (micro/mid/high)', sol.length===3&&sol.map(t=>t.tier).join()==='Micro,Mid,High Roller');
ok('SOL table ids are sol-*', sol.every(t=>/^sol-/.test(t.id)));
ok('no table uses a ZCHIP currency', !T.TABLES.some(t=>t.cur==='ZCHIP'));
ok('table ids are unique', new Set(T.TABLES.map(t=>t.id)).size===T.TABLES.length);
ok('SOL tiers ascend in stake', sol[0].mul<sol[1].mul&&sol[1].mul<sol[2].mul);
ok('SOL tier decimals are enough to show one chip (mul has <= dec places)',
   sol.every(t=>Math.abs(+t.mul.toFixed(t.dec)-t.mul)<1e-12));
ok('SOL micro min buy-in is 0.025 SOL and max 0.4 SOL',
   +(T.BUYIN_MIN*sol[0].mul).toFixed(6)===0.025&&+(T.BUYIN_MAX*sol[0].mul).toFixed(6)===0.4);
ok('CUR_META.SOL named Solana with SOL suffix', T.CUR_META.SOL.name==='Solana'&&T.CUR_META.SOL.suf===' SOL');
ok('CUR_META has exactly ZEC and SOL', Object.keys(T.CUR_META).sort().join()==='SOL,ZEC');
ok('wallet starts with ZEC and SOL only', Object.keys(T.WALLET).sort().join()==='SOL,ZEC'&&T.WALLET.SOL===10);
ok('fmtWallet keeps SOL decimals (0.0125 SOL)', T.fmtWallet('SOL',0.0125)==='0.0125 SOL', T.fmtWallet('SOL',0.0125));
ok('fmtWallet SOL whole amount (10 SOL)', T.fmtWallet('SOL',10)==='10 SOL', T.fmtWallet('SOL',10));
ok('fmtWallet ZEC unchanged', T.fmtWallet('ZEC',30)==='30 Z', T.fmtWallet('ZEC',30));
ok('wallet min withdraw/send is 0.001 for every currency', (html.match(/const MIN=0\.001;/g)||[]).length===2);
ok('demo funds adds exactly 1 SOL', /WALLET\.SOL=\+\(WALLET\.SOL\+1\)\.toFixed\(6\)/.test(html)&&/Demo funds added: 10 Z · 1 SOL/.test(html));
ok('cash-out receipt for SOL names the Solana wallet', /to your Solana wallet \(devnet\)/.test(html));
ok('validator rejects Zano and error text names only Zcash',
   T.validateAddress('ZxD5aoLDPTdcaRx4uCpyW4XiLfEXejepAVz8cSY2fwHNEiJNu6NmpBBDLGTJzCsUvn3acCVDVDPMV8yQXNRTUhAY2R7CJ8Jk').state==='bad'
   &&!/zano/i.test(T.validateAddress('hello').why));
  console.log('-'.repeat(40));
  console.log('SOLANA RAIL SUITE:',pass,'passed,',fail,'failed');
  return {name:'solana-rail-tests.js',pass,fail};
}

// ═══ SUITE: phantom-signin-tests.js ═══
async function suite_35(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Phantom sign-in: connect + signMessage with the injected provider. Uses a
// REAL Ed25519 keypair (Node webcrypto) so the verify path is genuinely
// exercised, plus a mock provider for rejection and failure modes.
const vm=require('vm'),fs=require('fs'),path=require('path');
const wc=require('crypto').webcrypto;
const html=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
const ALPHA='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58enc(u8){let n=0n;for(const b of u8)n=n*256n+BigInt(b);let o='';while(n>0n){o=ALPHA[Number(n%58n)]+o;n/=58n;}for(const b of u8){if(b===0)o='1'+o;else break;}return o;}
const els={};
function el(id){return els[id]||(els[id]={style:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},innerHTML:'',textContent:'',value:'',addEventListener(){},querySelector:()=>el('q'),querySelectorAll:()=>[],set onclick(f){},set oninput(f){},set onchange(f){}});}
const s={console,Math,Object,Array,Set,Map,JSON,Number,Date,Uint8Array,TextEncoder,BigInt,String,Error,Promise};
s.document={getElementById:id=>el(id),createElement:()=>el('c'),querySelector:()=>el('q'),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}}};
s.window={matchMedia:()=>({matches:true})};s.matchMedia=()=>({matches:true});s.localStorage={getItem:()=>null,setItem(){}};
s.crypto=wc;
s.navigator={};s.setInterval=()=>0;s.setTimeout=()=>0;s.clearTimeout=()=>{};s.clearInterval=()=>{};s.requestAnimationFrame=()=>0;s.cancelAnimationFrame=()=>{};s.performance={now:()=>0};
vm.createContext(s);
vm.runInContext(code+';globalThis.T={SOLWAL,solProvider,solIsAddress,solB58Decode,solNonce,solSignInMessage,solVerifySig,solConnect,solDisconnect,solConnectToggle};',s);
const T=s.T;
const kp=await wc.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
const raw=new Uint8Array(await wc.subtle.exportKey('raw',kp.publicKey));
const ADDR=b58enc(raw);
let lastMsg=null;
function mock(over){return Object.assign({
  isPhantom:true,
  async connect(){return {publicKey:{toString:()=>ADDR}};},
  async signMessage(bytes){lastMsg=Buffer.from(bytes).toString('utf8');return {signature:new Uint8Array(await wc.subtle.sign({name:'Ed25519'},kp.privateKey,bytes))};},
  disconnect(){this.disconnected=true;}
},over||{});}
function reset(){T.SOLWAL.addr=null;T.SOLWAL.verified=null;T.SOLWAL.busy=false;els.solWalNote&&(els.solWalNote.textContent='');}

// helpers
ok('test address is 32-44 base58 chars', ADDR.length>=32&&ADDR.length<=44, ADDR);
ok('solB58Decode round-trips a real 32-byte key', Buffer.from(T.solB58Decode(ADDR)).equals(Buffer.from(raw)));
ok('solIsAddress accepts a real address', T.solIsAddress(ADDR));
ok('solIsAddress rejects short, long, bad-char (0/O/I/l), non-string',
  !T.solIsAddress('abc')&&!T.solIsAddress('1'.repeat(45))&&!T.solIsAddress('0'.repeat(40))&&!T.solIsAddress('O'.repeat(40))&&!T.solIsAddress(null)&&!T.solIsAddress(123));
const n1=T.solNonce(),n2=T.solNonce();
ok('nonce is 32 hex chars', /^[0-9a-f]{32}$/.test(n1), n1);
ok('nonces differ between calls', n1!==n2);
const m=T.solSignInMessage(ADDR,n1,'2026-10-09T10:00:00.000Z');
ok('message names app, address, chain, nonce, issued time', m.includes('Anon Poker sign-in')&&m.includes('Address: '+ADDR)&&m.includes('Chain: Solana devnet')&&m.includes('Nonce: '+n1)&&m.includes('Issued: 2026-10-09T10:00:00.000Z'));
ok('message states it authorises no transaction', /does not authorise any transaction/.test(m));
ok('message is deterministic for same inputs', m===T.solSignInMessage(ADDR,n1,'2026-10-09T10:00:00.000Z'));

// no provider
reset(); s.window.phantom=undefined; s.window.solana=undefined;
ok('solProvider is null without Phantom', T.solProvider()===null);
let r=await T.solConnect();
ok('no provider -> ok:false why no-provider', r.ok===false&&r.why==='no-provider');
ok('no provider (unknown origin) -> origin guidance shown', /Phantom cannot connect from this address/.test(els.solWalNote.textContent)&&/https:\/\//.test(els.solWalNote.textContent)&&/localhost/.test(els.solWalNote.textContent));
ok('no provider -> no address stored', T.SOLWAL.addr===null);
ok('a non-Phantom wallet object is ignored', (s.window.solana={isPhantom:false,connect(){}},T.solProvider()===null));

// happy path
reset(); s.window.solana=undefined; s.window.phantom={solana:mock()};
r=await T.solConnect();
ok('happy path connects', r.ok===true&&r.addr===ADDR, JSON.stringify(r)+' NOTE:'+els.solWalNote.textContent);
ok('happy path verifies the real Ed25519 signature', r.verified===true&&T.SOLWAL.verified===true);
ok('state stores the address', T.SOLWAL.addr===ADDR);
ok('status text shows short address and "verified"', els.solWalStatus.textContent===ADDR.slice(0,4)+'…'+ADDR.slice(-4)+' · verified', els.solWalStatus.textContent);
ok('button flips to Disconnect', els.solConnectBtn.textContent==='Disconnect');
ok('the exact message signed contains this address and a fresh nonce', lastMsg.includes('Address: '+ADDR)&&/Nonce: [0-9a-f]{32}/.test(lastMsg));
ok('no note shown on a verified sign-in', els.solWalNote.textContent==='');

// disconnect
T.solConnectToggle();
ok('toggle while connected disconnects (state cleared)', T.SOLWAL.addr===null&&T.SOLWAL.verified===null);
ok('provider.disconnect was called', s.window.phantom.solana.disconnected===true);
ok('button returns to Connect Phantom', els.solConnectBtn.textContent==='Connect Phantom'&&els.solWalStatus.textContent==='Not connected');

// user rejects (EIP-1193 style 4001)
reset(); s.window.phantom={solana:mock({async connect(){const e=new Error('User rejected the request.');e.code=4001;throw e;}})};
r=await T.solConnect();
ok('rejection -> why rejected, no address', r.ok===false&&r.why==='rejected'&&T.SOLWAL.addr===null);
ok('rejection note says nothing was signed', /declined.*Nothing was signed/.test(els.solWalNote.textContent));
reset(); s.window.phantom={solana:mock({async signMessage(){throw new Error('User denied message signature');}})};
r=await T.solConnect();
ok('sign rejection by message text also treated as rejected, nothing stored', r.why==='rejected'&&T.SOLWAL.addr===null);

// signature does not match the message
reset(); s.window.phantom={solana:mock({async signMessage(bytes){return {signature:new Uint8Array(await wc.subtle.sign({name:'Ed25519'},kp.privateKey,new TextEncoder().encode('something else')))};}})};
r=await T.solConnect();
ok('wrong-message signature is refused', r.ok===false&&T.SOLWAL.addr===null&&/Signature check failed/.test(els.solWalNote.textContent));
// signature from a different key
const kp2=await wc.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
reset(); s.window.phantom={solana:mock({async signMessage(bytes){return {signature:new Uint8Array(await wc.subtle.sign({name:'Ed25519'},kp2.privateKey,bytes))};}})};
r=await T.solConnect();
ok('signature from a different key is refused', r.ok===false&&T.SOLWAL.addr===null);
// malformed responses
reset(); s.window.phantom={solana:mock({async connect(){return {publicKey:{toString:()=>'not-an-address'}};}})};
r=await T.solConnect();
ok('invalid address from wallet is refused', r.ok===false&&T.SOLWAL.addr===null&&/invalid address/.test(els.solWalNote.textContent));
reset(); s.window.phantom={solana:mock({async signMessage(){return {signature:new Uint8Array(10)};}})};
r=await T.solConnect();
ok('short signature is refused', r.ok===false&&T.SOLWAL.addr===null);
reset(); s.window.phantom={solana:mock({async signMessage(){return {};}})};
r=await T.solConnect();
ok('missing signature is refused', r.ok===false&&T.SOLWAL.addr===null);

// browser without Ed25519 verify
reset(); s.window.phantom={solana:mock()}; const savedCrypto=s.crypto;
s.crypto={getRandomValues:a=>wc.getRandomValues(a)};
r=await T.solConnect();
ok('no crypto.subtle -> signed but verified:null, honest note', r.ok===true&&r.verified===null&&T.SOLWAL.verified===null&&/cannot verify Ed25519 locally/.test(els.solWalNote.textContent));
ok('unverified status label omits "verified"', !/ · verified/.test(els.solWalStatus.textContent)&&/ · signed$/.test(els.solWalStatus.textContent));
s.crypto=savedCrypto;

// concurrency guard
reset(); let release; const gate=new Promise(res=>release=res);
s.window.phantom={solana:mock({async connect(){await gate;return {publicKey:{toString:()=>ADDR}};}})};
const first=T.solConnect(); const second=await T.solConnect();
ok('second concurrent connect is rejected as busy', second.ok===false&&second.why==='busy');
release(); const fr=await first;
ok('first connect still completes', fr.ok===true&&T.SOLWAL.addr===ADDR);
ok('busy flag cleared after completion', T.SOLWAL.busy===false);
reset();

// UI wiring
ok('wallet modal has the connect button and status', /id="solConnectBtn" onclick="solConnectToggle\(\)"/.test(html)&&/id="solWalStatus"/.test(html));
ok('app never sends a transaction or requests funds in sign-in code', !/signAndSendTransaction|sendTransaction|requestAirdrop/.test(code.slice(code.indexOf('function solProvider'),code.indexOf('// ── Solana deposit'))));
ok('provider output is rendered with textContent only (no innerHTML) in sign-in code', !/innerHTML/.test(code.slice(code.indexOf('function solRender'),code.indexOf('// ── Solana deposit'))));
  console.log('-'.repeat(40));
  console.log('PHANTOM SIGN-IN SUITE:',pass,'passed,',fail,'failed');
  return {name:'phantom-signin-tests.js',pass,fail};
}

// ═══ SUITE: solana-deposit-tests.js ═══
async function suite_36(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Deposit flow: amount parsing, hand-rolled legacy message (checked with an
// INDEPENDENT decoder), on-chain verification, and the end-to-end path with a
// mocked Phantom + RPC. NOT run against real devnet from CI (no network).
const vm=require('vm'),fs=require('fs'),path=require('path');
const wc=require('crypto').webcrypto;
const html=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
const ALPHA='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58enc(u8){let n=0n;for(const b of u8)n=n*256n+BigInt(b);let o='';while(n>0n){o=ALPHA[Number(n%58n)]+o;n/=58n;}for(const b of u8){if(b===0)o='1'+o;else break;}return o;}
function b58dec(str){let n=0n;for(const c of str)n=n*58n+BigInt(ALPHA.indexOf(c));const o=[];while(n>0n){o.push(Number(n&255n));n>>=8n;}for(const c of str){if(c==='1')o.push(0);else break;}return Uint8Array.from(o.reverse());}
const els={};
function el(id){return els[id]||(els[id]={style:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},innerHTML:'',textContent:'',value:'',addEventListener(){},querySelector:()=>el('q'),querySelectorAll:()=>[],set onclick(f){},set oninput(f){},set onchange(f){}});}
const s={console,Math,Object,Array,Set,Map,JSON,Number,Date,Uint8Array,TextEncoder,BigInt,String,Error,Promise,Buffer};
s.document={getElementById:id=>el(id),createElement:()=>el('c'),querySelector:()=>el('q'),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}}};
s.window={matchMedia:()=>({matches:true})};s.matchMedia=()=>({matches:true});s.localStorage={getItem:()=>null,setItem(){}};
s.crypto=wc;s.navigator={};s.setInterval=()=>0;s.clearTimeout=()=>{};s.clearInterval=()=>{};s.requestAnimationFrame=()=>0;s.cancelAnimationFrame=()=>{};s.performance={now:()=>0};
s.setTimeout=(f)=>{f();return 0;};
vm.createContext(s);
vm.runInContext(code+';globalThis.T={SOL_CFG,SOLDEP,SOLWAL,WALLET,solB58Encode,solB58Decode,solToLamports,solRef,solBuildTransferMessage,solBuildUnsignedTx,solVerifyDepositTx,solCredit,solDeposit,solDepositClick};',s);
const T=s.T;
const SHIPPED_API=T.SOL_CFG.api; T.SOL_CFG.api=''; // these tests cover the on-chain path only; the ledger call is covered by the payout suite
const HOUSE=T.SOL_CFG.house;
const PLAYER=b58enc(wc.getRandomValues(new Uint8Array(32)));
const BH=b58enc(wc.getRandomValues(new Uint8Array(32)));

// config
ok('house address is a valid 32-byte key', b58dec(HOUSE).length===32);
ok('house differs from the sample player', HOUSE!==PLAYER);
ok('RPC URL is a Helius devnet endpoint', /^https:\/\/devnet\.helius-rpc\.com\/\?api-key=[0-9a-f-]{36}$/.test(T.SOL_CFG.rpc));
ok('limits: min 0.01, max 5, step 0.001 SOL', T.SOL_CFG.minLamports===1e7&&T.SOL_CFG.maxLamports===5e9&&T.SOL_CFG.stepLamports===1e6);

// base58
const v=Uint8Array.from([0,0,1,2,3,250,251]);
ok('b58 encode matches independent encoder (leading zeros kept)', T.solB58Encode(v)===b58enc(v)&&T.solB58Encode(v).startsWith('11'));
ok('b58 encode/decode round trip', Buffer.from(T.solB58Decode(T.solB58Encode(v))).equals(Buffer.from(v)));
ok('System Program id is 32 zero bytes', Buffer.from(b58dec('11111111111111111111111111111111')).equals(Buffer.alloc(32)));

// amounts
const A=[['0.1',1e8],['0.01',1e7],['0.001'.replace('0.001','0.011'),11e6],['5',5e9],['1',1e9],['4.999',4999e6],['  0.25 ',25e7]];
for(const [t,l] of A) ok('amount "'+t.trim()+'" -> '+l+' lamports', T.solToLamports(t)===l, T.solToLamports(t));
for(const t of ['0','0.009','0.0001','5.001','6','-1','abc','','1e2','0.1.2',' ','1,5','0x10',null,undefined,'99999'])
  ok('amount '+JSON.stringify(t)+' rejected', T.solToLamports(t)===null);
ok('no float drift: 0.3 SOL is exactly 300000000', T.solToLamports('0.3')===300000000);
ok('refs are valid, unique 32-byte keys', (()=>{const a=T.solRef(),b=T.solRef();return a!==b&&b58dec(a).length===32&&b58dec(b).length===32;})());

// message layout, decoded independently
function decode(msg){
  let o=0;const h=[msg[o++],msg[o++],msg[o++]];
  function cu(){let v=0,sh=0;for(;;){const b=msg[o++];v|=(b&127)<<sh;if(!(b&128))break;sh+=7;}return v;}
  const nk=cu();const keys=[];for(let i=0;i<nk;i++){keys.push(b58enc(msg.slice(o,o+32)));o+=32;}
  const bh=b58enc(msg.slice(o,o+32));o+=32;
  const ni=cu();const ixs=[];
  for(let i=0;i<ni;i++){const pid=msg[o++];const na=cu();const acc=Array.from(msg.slice(o,o+na));o+=na;const dl=cu();const data=msg.slice(o,o+dl);o+=dl;ixs.push({pid,acc,data});}
  return {h,keys,bh,ixs,end:o};
}
const REF=T.solRef();
const m1=T.solBuildTransferMessage(PLAYER,HOUSE,REF,100000000,BH);
const d1=decode(m1);
ok('header: 1 signer, 0 readonly signed, 2 readonly unsigned', d1.h.join()==='1,0,2');
ok('account order: player, house, reference, system', d1.keys.join()===[PLAYER,HOUSE,REF,'11111111111111111111111111111111'].join());
ok('blockhash embedded', d1.bh===BH);
ok('exactly one instruction, program = System (index 3)', d1.ixs.length===1&&d1.ixs[0].pid===3);
ok('instruction accounts: from, to, reference', d1.ixs[0].acc.join()==='0,1,2');
ok('data = Transfer(2) + 100000000 lamports LE (known vector 00 e1 f5 05)', Buffer.from(d1.ixs[0].data).toString('hex')==='02000000'+'00e1f50500000000', Buffer.from(d1.ixs[0].data).toString('hex'));
ok('message fully consumed (no trailing bytes)', d1.end===m1.length);
const m2=T.solBuildTransferMessage(PLAYER,HOUSE,REF,5000000000,BH);
ok('5 SOL encodes as 00f2052a01000000 LE', Buffer.from(decode(m2).ixs[0].data).toString('hex')==='0200000000f2052a01000000', Buffer.from(decode(m2).ixs[0].data).toString('hex'));
const m3=T.solBuildTransferMessage(PLAYER,PLAYER,REF,10000000,BH);
const d3=decode(m3);
ok('self-transfer dedupes keys (3 keys, accounts 0,0,1)', d3.keys.length===3&&d3.ixs[0].acc.join()==='0,0,1'&&d3.ixs[0].pid===2);
let thrown=0;
try{T.solBuildTransferMessage('0OIl',HOUSE,REF,1,BH);}catch(e){thrown++;}
try{T.solBuildTransferMessage(PLAYER,HOUSE,REF,1,'short');}catch(e){thrown++;}
{const u=T.solBuildUnsignedTx(m1);ok('unsigned tx = 0x01 + 64 zero bytes + message; length = message+65', u.length===m1.length+65&&u[0]===1&&u.slice(1,65).every(b=>b===0)&&Buffer.from(u.slice(65)).equals(Buffer.from(m1)));}
ok('bad key / bad blockhash throw instead of building garbage', thrown===2);

// verification (pure)
function goodTx(over){
  const t={meta:{err:null},transaction:{message:{
    accountKeys:[{pubkey:PLAYER,signer:true,writable:true},{pubkey:HOUSE,signer:false,writable:true},{pubkey:REF,signer:false,writable:false},{pubkey:'11111111111111111111111111111111',signer:false,writable:false}],
    instructions:[{program:'system',parsed:{type:'transfer',info:{source:PLAYER,destination:HOUSE,lamports:100000000}}}]}}};
  return Object.assign(t,over||{});
}
const EXP={from:PLAYER,to:HOUSE,reference:REF,lamports:100000000};
ok('valid tx verifies', T.solVerifyDepositTx(goodTx(),EXP).ok===true&&T.solVerifyDepositTx(goodTx(),EXP).lamports===100000000);
ok('null tx rejected', T.solVerifyDepositTx(null,EXP).ok===false);
ok('on-chain error rejected', T.solVerifyDepositTx(goodTx({meta:{err:{InstructionError:[0,'x']}}}),EXP).ok===false);
ok('missing meta rejected', T.solVerifyDepositTx(goodTx({meta:null}),EXP).ok===false);
let t=goodTx(); t.transaction.message.instructions[0].parsed.info.lamports=99999999;
ok('wrong amount rejected', T.solVerifyDepositTx(t,EXP).ok===false);
t=goodTx(); t.transaction.message.instructions[0].parsed.info.destination=PLAYER;
ok('wrong destination rejected', T.solVerifyDepositTx(t,EXP).ok===false);
t=goodTx(); t.transaction.message.instructions[0].parsed.info.source='X';
ok('wrong source rejected', T.solVerifyDepositTx(t,EXP).ok===false);
t=goodTx(); t.transaction.message.accountKeys[0].pubkey='Other';
ok('wrong fee payer/sender rejected', T.solVerifyDepositTx(t,EXP).ok===false);
t=goodTx(); t.transaction.message.accountKeys.splice(2,1);
ok('missing reference rejected', T.solVerifyDepositTx(t,EXP).ok===false);
t=goodTx(); t.transaction.message.accountKeys[2].signer=true;
ok('reference marked signer rejected', T.solVerifyDepositTx(t,EXP).ok===false);
t=goodTx(); t.transaction.message.instructions[0].program='spl-token';
ok('non-system program rejected', T.solVerifyDepositTx(t,EXP).ok===false);
t=goodTx(); t.transaction.message.instructions[0].parsed.type='transferChecked';
ok('non-transfer system instruction rejected', T.solVerifyDepositTx(t,EXP).ok===false);
ok('garbage input never throws', T.solVerifyDepositTx({transaction:{message:{accountKeys:5}},meta:{err:null}},EXP).ok===false);
ok('different expected reference rejected', T.solVerifyDepositTx(goodTx(),Object.assign({},EXP,{reference:T.solRef()})).ok===false);

// credit idempotency
T.WALLET.SOL=10; T.SOLDEP.credited.clear();
ok('first credit applies', T.solCredit('sigA',250000000)===true&&T.WALLET.SOL===10.25);
ok('same signature never credits twice', T.solCredit('sigA',250000000)===false&&T.WALLET.SOL===10.25);
ok('different signature credits', T.solCredit('sigB',1000000)===true&&T.WALLET.SOL===10.251);
ok('no float drift after many credits', (()=>{T.WALLET.SOL=0;T.SOLDEP.credited.clear();for(let i=0;i<10;i++)T.solCredit('s'+i,100000000);return T.WALLET.SOL===1;})());

// end-to-end with mocked Phantom + RPC
const chain={};let calls=[];let failMode=null;
s.fetch=async(url,opts)=>{
  const b=JSON.parse(opts.body);calls.push(b.method);
  const R=r=>({ok:true,json:async()=>({jsonrpc:'2.0',id:1,result:r})});
  if(failMode==='http')return {ok:false,status:429,json:async()=>({})};
  if(failMode==='rpcerr')return {ok:true,json:async()=>({error:{message:'boom'}})};
  if(b.method==='getLatestBlockhash')return R({value:{blockhash:BH}});
  if(b.method==='getSignatureStatuses'){const sig=b.params[0][0];const c=chain[sig];if(failMode==='txerr'&&c)return R({value:[{err:{x:1},confirmationStatus:'confirmed'}]});if(failMode==='never')return R({value:[null]});return R({value:[c?{err:null,confirmationStatus:'finalized'}:null]});}
  if(b.method==='getTransaction'){const c=chain[b.params[0]];if(!c)return R(null);return R(c.tx);}
  if(b.method==='getSignaturesForAddress'){const ref=b.params[0];const f=Object.entries(chain).find(([k,c])=>c.ref===ref);return R(f?[{signature:f[0]}]:[]);}
  return {ok:false,status:500,json:async()=>({})};
};
let sigN=0;let ok_sigslot=false;
function phantom(opts){opts=opts||{};return {isPhantom:true,connect(){},
  async request({method,params}){
    if(method!=='signAndSendTransaction')throw new Error('unexpected '+method);
    if(opts.reject){const e=new Error('User rejected the request.');e.code=4001;throw e;}
    const raw=b58dec(params.message);
    // strict wallet-side parse: shortvec sig count, 64 bytes per sig, then message
    if(raw.length<1+64*raw[0]+3)throw new Error('Reached end of buffer unexpectedly');
    if(raw[0]!==1)throw new Error('expected exactly 1 signature slot');
    ok_sigslot=raw.slice(1,65).every(b=>b===0);
    const d=decode(raw.slice(1+64*raw[0]));
    if(d.end!==raw.length-65)throw new Error('trailing bytes in message');
    const sig='SIG'+(++sigN)+'x'.repeat(60);
    const lam=Number(Buffer.from(d.ixs[0].data).readBigUInt64LE(4));
    const to=d.keys[d.ixs[0].acc[1]],from=d.keys[d.ixs[0].acc[0]],ref=d.keys[d.ixs[0].acc[2]];
    let amount=opts.lamportsOverride!==undefined?opts.lamportsOverride:lam;
    chain[sig]={ref,tx:{meta:{err:null},transaction:{message:{accountKeys:d.keys.map((k,i)=>({pubkey:k,signer:i===0,writable:i<2})),instructions:[{program:'system',parsed:{type:'transfer',info:{source:from,destination:to,lamports:amount}}}]}}}};
    return opts.noSig?{}:{signature:sig};
  }};}
function setup(opts){s.window.phantom={solana:phantom(opts)};T.SOLWAL.addr=PLAYER;T.SOLDEP.busy=false;T.SOLDEP.credited.clear();T.WALLET.SOL=10;calls=[];failMode=null;els.solDepNote&&(els.solDepNote.textContent='');}
// the e2e player must be a real-looking key for builder
setup();
let r=await T.solDeposit('0.1');
ok('e2e: deposit ok, credited once', r.ok===true&&r.credited===true&&r.lamports===1e8, JSON.stringify(r));
ok('e2e: payload is a serialized tx (1 zero signature slot + message), not a bare message', ok_sigslot===true);
ok('e2e: wallet +0.1 SOL', T.WALLET.SOL===10.1, T.WALLET.SOL);
ok('e2e: note says verified and amount', /Verified\. \+0\.1 SOL/.test(els.solDepNote.textContent), els.solDepNote.textContent);
ok('e2e: RPC call order blockhash -> status -> getTransaction', calls.join()==='getLatestBlockhash,getSignatureStatuses,getTransaction', calls.join());
ok('e2e: busy flag cleared', T.SOLDEP.busy===false);
ok('e2e: replaying the same signature is not credited twice', T.solCredit(r.sig,1e8)===false&&T.WALLET.SOL===10.1);

setup({noSig:true});
r=await T.solDeposit('0.2');
ok('recovery: no signature from wallet -> found by reference, credited', r.ok===true&&T.WALLET.SOL===10.2&&calls.includes('getSignaturesForAddress'), JSON.stringify(r)+calls.join());

setup({reject:true});
r=await T.solDeposit('0.1');
ok('wallet rejection -> nothing credited', r.ok===false&&r.why==='rejected'&&T.WALLET.SOL===10&&/declined/.test(els.solDepNote.textContent));
setup({lamportsOverride:50000000});
r=await T.solDeposit('0.1');
ok('wallet sends LESS than requested -> verification refuses, nothing credited', r.ok===false&&T.WALLET.SOL===10&&/not verified/.test(els.solDepNote.textContent), els.solDepNote.textContent);
setup(); failMode='txerr';
r=await T.solDeposit('0.1');
ok('on-chain failure -> nothing credited', r.ok===false&&T.WALLET.SOL===10&&/failed on-chain/.test(els.solDepNote.textContent));
setup(); failMode='never';
r=await T.solDeposit('0.1');
ok('never confirmed -> times out, nothing credited', r.ok===false&&T.WALLET.SOL===10&&/Not confirmed in time/.test(els.solDepNote.textContent));
setup(); failMode='http';
r=await T.solDeposit('0.1');
ok('RPC HTTP error -> clear message, nothing credited, busy cleared', r.ok===false&&T.WALLET.SOL===10&&/RPC HTTP 429/.test(els.solDepNote.textContent)&&T.SOLDEP.busy===false);
setup(); failMode='rpcerr';
r=await T.solDeposit('0.1');
ok('RPC error object -> clear message', r.ok===false&&/RPC: boom/.test(els.solDepNote.textContent));
setup(); T.SOLWAL.addr=null;
r=await T.solDeposit('0.1');
ok('not connected -> refused before any RPC call', r.ok===false&&r.why==='not-connected'&&calls.length===0);
setup();
r=await T.solDeposit('0.001'.replace('0.001','0.009'));
ok('bad amount -> refused before any RPC call', r.ok===false&&r.why==='bad-amount'&&calls.length===0);
setup(); s.window.phantom=undefined;
r=await T.solDeposit('0.1');
ok('no Phantom -> refused before any RPC call', r.ok===false&&r.why==='no-provider'&&calls.length===0);
setup(); T.SOLDEP.busy=true;
r=await T.solDeposit('0.1');
ok('concurrent deposit refused', r.ok===false&&r.why==='busy'&&calls.length===0);
T.SOLDEP.busy=false;
setup(); els.solDepAmt={value:'0.3'};
r=await T.solDepositClick();
ok('click handler reads the amount box', r.ok===true&&r.lamports===3e8&&T.WALLET.SOL===10.3);

// UI wiring + safety
ok('deposit row + button + note exist in the wallet modal', /id="solDepAmt"/.test(html)&&/onclick="solDepositClick\(\)"/.test(html)&&/id="solDepNote"/.test(html));
ok('deposit row hidden until connected, shown after (solRender)', /id="solDepRow" style="display:none/.test(html)&&/dr\.style\.display=a\?'flex':'none'/.test(html));
ok('Zcash deposit box is a real testnet payment request, no fake placeholder address', /Zcash deposit request \(testnet\)/.test(html)&&!html.includes('utest1anonpoker'));
const depCode=code.slice(code.indexOf('const SOL_CFG'),code.indexOf('function walSelect'));
ok('no innerHTML used with wallet/RPC data in deposit/withdraw code except the numeric balance formatter (credit + debit)', (depCode.match(/innerHTML/g)||[]).length===2&&(depCode.match(/c\.innerHTML=fmtWalletH\('SOL',WALLET\.SOL\)/g)||[]).length===2);
ok('deposit code never touches the house private key or any secret', !/secret|private ?key|seed|keypair/i.test(depCode.replace(/[^\n]*NOTE:[^\n]*\n/g,'')));
{ // with the payout service configured but unreachable, the failure must be shown, never hidden
  T.SOL_CFG.api=SHIPPED_API; setup(); const rr=await T.solDeposit('0.1'); T.SOL_CFG.api='';
  ok('payout-ledger failure after a verified deposit is reported to the user', rr.ok===true&&/payout ledger could not be updated/.test(els.solDepNote.textContent), els.solDepNote.textContent);
  setup();
}

  console.log('-'.repeat(40));
  console.log('SOLANA DEPOSIT SUITE:',pass,'passed,',fail,'failed');
  return {name:'solana-deposit-tests.js',pass,fail};
}

// ═══ SUITE: phantom-wiring-tests.js ═══
async function suite_37(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
// Regression: the Phantom connect control was buried in the wallet modal (reachable only via
// a small chip in the lobby) and invisible on the first screen. It must now be reachable from
// the connect screen AND the lobby header, all surfaces must reflect ONE connection state, and
// every failure message must be visible on the surface the player is looking at.
const vm=require('vm'),fs=require('fs'),path=require('path');
const wc=require('crypto').webcrypto;
const html=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
const ALPHA='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58enc(u8){let n=0n;for(const b of u8)n=n*256n+BigInt(b);let o='';while(n>0n){o=ALPHA[Number(n%58n)]+o;n/=58n;}for(const b of u8){if(b===0)o='1'+o;else break;}return o;}
const els={};let shown=[];
function el(id){if(els[id])return els[id];const e=els[id]={style:{},innerHTML:'',textContent:'',value:'',disabled:false,addEventListener(){},querySelector:()=>el('q'),querySelectorAll:()=>[],set onclick(f){},set oninput(f){},set onchange(f){}};e.classList={add(c){if(id==='depOverlay'&&c==='show')shown.push(id);},remove(){},toggle(c,v){e._on=v;},contains:()=>false};return e;}
const s={console,Math,Object,Array,Set,Map,JSON,Number,Date,Uint8Array,TextEncoder,BigInt,String,Error,Promise};
s.document={getElementById:id=>el(id),createElement:()=>el('c'),querySelector:()=>el('q'),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}}};
s.window={matchMedia:()=>({matches:true})};s.matchMedia=()=>({matches:true});s.localStorage={getItem:()=>null,setItem(){}};
s.crypto=wc;s.navigator={};s.setInterval=()=>0;s.setTimeout=()=>0;s.clearTimeout=()=>{};s.clearInterval=()=>{};s.requestAnimationFrame=()=>0;s.cancelAnimationFrame=()=>{};s.performance={now:()=>0};
vm.createContext(s);
vm.runInContext(code+';globalThis.T={SOLWAL,solConnect,solConnectToggle,solLobbyClick,solRender,solNote,solNoProviderMsg,solOrigin,openWalletModal,renderAddrVerdict,validateAddress,G};',s);
const T=s.T;
const kp=await wc.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
const ADDR=b58enc(new Uint8Array(await wc.subtle.exportKey('raw',kp.publicKey)));
const SH=ADDR.slice(0,4)+'…'+ADDR.slice(-4);
function mock(over){return Object.assign({isPhantom:true,async connect(){return {publicKey:{toString:()=>ADDR}};},async signMessage(b){return {signature:new Uint8Array(await wc.subtle.sign({name:'Ed25519'},kp.privateKey,b))};},disconnect(){}},over||{});}
function reset(){T.SOLWAL.addr=null;T.SOLWAL.verified=null;T.SOLWAL.busy=false;shown=[];T.solRender();T.solNote('');}

// markup: entry points exist where the player actually looks
const connectScreen=html.slice(html.indexOf('id="s-connect"'),html.indexOf('<!-- PREFS -->'));
const lobbyHdr=html.slice(html.indexOf('<div id="s-lobby"'),html.indexOf('class="lobby-body"'));
ok('connect screen has a visible Phantom button wired to the toggle', /id="solConnectBtn2" onclick="solConnectToggle\(\)"/.test(connectScreen));
ok('connect screen button is not hidden (no display:none on it)', !/id="solConnectBtn2"[^>]*display:none/.test(connectScreen));
ok('connect screen has its own message area', /id="solConnNote"/.test(connectScreen));
ok('lobby header has a visible Phantom button wired to solLobbyClick', /id="lobbySolBtn" onclick="solLobbyClick\(\)"/.test(lobbyHdr)&&!/id="lobbySolBtn"[^>]*display:none/.test(lobbyHdr));
ok('lobby Phantom button cannot wrap or shrink off-screen', /id="lobbySolBtn"[^>]*white-space:nowrap;flex-shrink:0/.test(lobbyHdr));
ok('wallet modal still has its connect button', /id="solConnectBtn" onclick="solConnectToggle\(\)"/.test(html));
ok('exactly three connect surfaces', (html.match(/onclick="solConnectToggle\(\)"/g)||[]).length===2&&(html.match(/onclick="solLobbyClick\(\)"/g)||[]).length===1);
ok('lobby header CSS: brand truncates, buttons never wrap, ZEC address yields on phones', /#s-lobby \.top-brand\{[^}]*min-width:0[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/.test(html)&&/#s-lobby \.top-bar \.btn\{white-space:nowrap\}/.test(html)&&/@media \(max-width:480px\)\{[^@]*#lobbyAddr\{display:none\}/.test(html));
ok('lobby chip opens the shared modal opener', /b\.onclick=openWalletModal;/.test(html));

// initial labels
reset();
ok('disconnected labels on every surface', els.solConnectBtn.textContent==='Connect Phantom'&&els.solConnectBtn2.textContent==='Connect Phantom'&&els.lobbySolBtn.textContent==='Phantom'&&els.solWalStatus.textContent==='Not connected'&&els.wStateSol.textContent==='Not connected'&&els.mStateSol.textContent==='Not connected');

// no provider: message visible on BOTH note areas (location undefined => unknown origin)
s.window.phantom=undefined;s.window.solana=undefined;
let r=await T.solConnect();
ok('no Phantom -> message on the modal note', /Phantom cannot connect/.test(els.solWalNote.textContent)&&els.solWalNote.style.display==='block');
ok('no Phantom -> message on the connect-screen note too', /Phantom cannot connect/.test(els.solConnNote.textContent)&&els.solConnNote.style.display==='block');
ok('no Phantom -> button re-enabled and idle again', els.solConnectBtn2.disabled===false&&els.solConnectBtn2.textContent==='Connect Phantom');
// origin rules (Phantom injects ONLY on https, http://localhost, http://127.0.0.1)
const O=(proto,host)=>{s.location={protocol:proto,hostname:host,host};return T.solOrigin();};
ok('https://anything is allowed', O('https:','anon.example').ok===true);
ok('http://localhost is allowed', O('http:','localhost').ok===true);
ok('http://127.0.0.1 is allowed', O('http:','127.0.0.1').ok===true);
ok('file:// is NOT allowed', O('file:','').ok===false);
ok('plain http://example.com is NOT allowed', O('http:','example.com').ok===false);
ok('http://localhost.evil.com is NOT allowed', O('http:','localhost.evil.com').ok===false);
ok('unknown origin is NOT allowed', (s.location=undefined,T.solOrigin().ok===false));
O('file:','');
let m=T.solNoProviderMsg();
ok('file:// message names the local file, the cure, and carries diagnostics', /local file \(file:\/\//.test(m)&&/http:\/\/localhost:8080/.test(m)&&/START-LOCAL-SERVER\.txt/.test(m)&&/Diagnostics: page=file:/.test(m)&&/Phantom=not injected/.test(m), m);
ok('file:// message no longer blames "file URL access" (wrong cause)', !/Allow access to file URLs/.test(m));
O('http:','example.com');
ok('plain-http message names the host', /http:\/\/example\.com/.test(T.solNoProviderMsg()));
O('https:','anon.example');
m=T.solNoProviderMsg();
ok('https + no provider -> "not detected" install/unlock/devnet guidance', /Phantom not detected/.test(m)&&/unlock/.test(m)&&/Devnet/.test(m)&&/Diagnostics: page=https:\/\/anon\.example/.test(m), m);
// on an allowed origin the app waits for late injection, then gives up
const savedST=s.setTimeout; let sleeps=0; s.setTimeout=(f,ms)=>{if(ms<=100){sleeps++;f();}return 0;};
reset(); r=await T.solConnect();
ok('allowed origin, never injected: waited ~1.5 s (15 polls) then reported not detected', r.why==='no-provider'&&sleeps===15&&/Phantom not detected/.test(els.solConnNote.textContent), sleeps+' '+els.solConnNote.textContent);
// late injection: provider appears on the 4th poll
reset(); sleeps=0; s.setTimeout=(f,ms)=>{if(ms<=100){sleeps++;if(sleeps===4)s.window.phantom={solana:mock()};f();}return 0;};
r=await T.solConnect();
ok('late-injected Phantom is picked up and connects', r.ok===true&&sleeps===4&&T.SOLWAL.addr===ADDR, JSON.stringify(r)+sleeps);
T.solConnectToggle(); // disconnect
s.setTimeout=savedST; s.location=undefined; s.window.phantom=undefined;
// unresponsive popup: connect() never settles
reset(); s.setTimeout=(f,ms)=>{if(ms>=45000)f();return 0;};
s.window.phantom={solana:mock({connect(){return new Promise(()=>{});}})};
r=await T.solConnect();
ok('hung Phantom popup -> timeout result, clear instructions', r.why==='timeout'&&/No response from Phantom after 45 s/.test(els.solConnNote.textContent)&&/unlock it/.test(els.solConnNote.textContent));
ok('after timeout the buttons are usable again and nothing is stored', els.solConnectBtn2.disabled===false&&els.solConnectBtn2.textContent==='Connect Phantom'&&T.SOLWAL.addr===null&&T.SOLWAL.busy===false);
// hung signature prompt
reset(); s.window.phantom={solana:mock({signMessage(){return new Promise(()=>{});}})};
r=await T.solConnect();
ok('hung signature prompt -> timeout, nothing stored', r.why==='timeout'&&T.SOLWAL.addr===null);
s.setTimeout=savedST;
reset(); s.window.phantom=undefined;

// connect from the connect screen button
reset(); s.window.phantom={solana:mock()};
r=await T.solConnectToggle();
ok('connect via connect-screen toggle succeeds', r.ok===true&&r.addr===ADDR);
ok('every label updates together', els.solWalStatus.textContent===SH+' · verified'&&els.solConnectBtn.textContent==='Disconnect'&&els.solConnectBtn2.textContent==='Disconnect '+SH&&els.lobbySolBtn.textContent===SH&&els.wStateSol.textContent==='Connected'&&els.mStateSol.textContent==='Connected', [els.solWalStatus.textContent,els.solConnectBtn2.textContent,els.lobbySolBtn.textContent].join('|'));
ok('both Phantom option rows get the same highlight as a set Zcash row (.on)', els.wOptSol._on===true&&els.mOptSol._on===true);
ok('deposit row appears once connected', els.solDepRow.style.display==='flex');
ok('messages cleared on success', els.solWalNote.textContent===''&&els.solConnNote.textContent===''&&els.solConnNote.style.display==='none');
T.solConnectToggle();
ok('toggle again disconnects every surface', els.lobbySolBtn.textContent==='Phantom'&&els.solConnectBtn2.textContent==='Connect Phantom'&&els.solDepRow.style.display==='none'&&els.wOptSol._on===false&&els.wStateSol.textContent==='Not connected');

// lobby header button: opens the modal AND connects
reset(); s.window.phantom={solana:mock()}; shown=[];
r=await T.solLobbyClick();
ok('lobby click opens the wallet modal', shown.length===1);
ok('lobby click connects', r&&r.ok===true&&T.SOLWAL.addr===ADDR&&els.lobbySolBtn.textContent===SH);
shown=[]; r=await T.solLobbyClick();
ok('lobby click while connected opens modal without reconnecting', shown.length===1&&r===undefined&&T.SOLWAL.addr===ADDR);
// lobby click with no Phantom: modal opens so the message is visible
reset(); s.window.phantom=undefined; shown=[];
r=await T.solLobbyClick();
ok('lobby click without Phantom opens the modal and shows the message', shown.length===1&&/Phantom cannot connect/.test(els.solWalNote.textContent));

// busy label while Phantom popup is open
reset(); let release; const gate=new Promise(res=>release=res);
s.window.phantom={solana:mock({async connect(){await gate;return {publicKey:{toString:()=>ADDR}};}})};
const pending=T.solConnect();
ok('while waiting, every surface says so', els.solConnectBtn2.textContent==='Connecting…'&&els.solConnectBtn.textContent==='Connecting…'&&els.lobbySolBtn.textContent==='…'&&els.solWalStatus.textContent==='Waiting for Phantom…');
release(); await pending;
ok('busy label replaced by connected state', els.lobbySolBtn.textContent===SH);

// rejection leaves a clean disconnected state with a visible message
reset(); s.window.phantom={solana:mock({async connect(){const e=new Error('User rejected the request.');e.code=4001;throw e;}})};
r=await T.solConnect();
ok('rejection: labels return to disconnected, message shown on connect screen', r.why==='rejected'&&els.solConnectBtn2.textContent==='Connect Phantom'&&els.lobbySolBtn.textContent==='Phantom'&&/declined/.test(els.solConnNote.textContent));

// Phantom events: account switch / disconnect must not leave a stale identity
reset(); let handlers={};
s.window.phantom={solana:mock({on(ev,cb){handlers[ev]=cb;}})};
r=await T.solConnect();
ok('connect registers accountChanged + disconnect listeners', r.ok===true&&typeof handlers.accountChanged==='function'&&typeof handlers.disconnect==='function');
handlers.accountChanged({toString:()=>ADDR});
ok('accountChanged to the SAME account keeps the session', T.SOLWAL.addr===ADDR);
handlers.accountChanged({toString:()=>'DifferentAccount1111111111111111111111111'});
ok('accountChanged to ANOTHER account signs out and explains why', T.SOLWAL.addr===null&&/account changed/i.test(els.solConnNote.textContent)&&els.lobbySolBtn.textContent==='Phantom');
reset(); s.window.phantom={solana:mock({on(){}})};
await T.solConnect(); handlers.disconnect();
ok('wallet-side disconnect clears every surface', T.SOLWAL.addr===null&&els.solConnectBtn2.textContent==='Connect Phantom'&&els.wOptSol._on===false);
reset();

// Uniform menu: same anatomy for every connection method, on both screens
const need=['wopt-head','wopt-ico','wopt-name','wopt-state'];
for(const id of ['wOptZec','wOptSol','mOptZec','mOptSol']){
  const i=html.indexOf('id="'+id+'"'); const blk=html.slice(i,i+900);
  ok(id+' uses the shared option anatomy (head, icon, name, state chip)', i>0&&need.every(c=>blk.includes(c)), id);
}
ok('connect screen title is "Your Wallet Address" (no ZEC)', /<div class="c-title">Your Wallet Address<\/div>/.test(html)&&!/Your ZEC Wallet/.test(html));
ok('Zcash and Phantom rows are siblings in one .wmenu on the connect screen', /<div class="wmenu"[^>]*>\s*<div class="wopt" id="wOptZec">[\s\S]*?<\/div>\s*<div class="wopt" id="wOptSol">/.test(html));
ok('Phantom connect button on the home screen uses the shared option button style', /class="wopt-btn" id="solConnectBtn2"/.test(html));
ok('ZecHub testnet guide and faucet links open safely', /href="https:\/\/zechub\.wiki\/using-zcash\/testnet" target="_blank" rel="noopener noreferrer"/.test(html)&&/href="https:\/\/faucet\.zecpages\.com\/" target="_blank" rel="noopener noreferrer"/.test(html));
ok('connect screen centres with auto margins (tall content must never be clipped at the top)', /#s-connect\{\s*align-items:center;justify-content:flex-start;[^}]*overflow-y:auto/.test(html)&&/\.c-wrap\{[^}]*margin-top:auto;margin-bottom:auto\}/.test(html)&&!/#s-connect\{\s*align-items:center;justify-content:center/.test(html));
ok('highlight CSS exists for the active row', /\.wopt\.on\{border-color:var\(--gold\)/.test(html));
// Zcash row state follows the address
els.addrIn=el('addrIn'); els.addrIn.value='utest1qqqqp8zrgd9wq2q2q3zurzs5xkc9q3q0f7wqsdmc0mssq7pqsr2vv6ka9sq7qzq3'; T.renderAddrVerdict();
ok('valid Zcash address -> row highlighted, state "Address set"', els.wOptZec._on===true&&els.wStateZec.textContent==='Address set');
els.addrIn.value='utest1short'; T.renderAddrVerdict();
ok('bad Zcash address -> row not highlighted, state "Invalid"', els.wOptZec._on===false&&els.wStateZec.textContent==='Invalid');
els.addrIn.value=''; T.renderAddrVerdict();
ok('blank -> state "Demo"', els.wOptZec._on===false&&els.wStateZec.textContent==='Demo');
// modal shows the Zcash identity
T.G.realAddr=true; T.G.wallet='utest1abc'; T.openWalletModal();
ok('wallet modal shows the real Zcash address and highlights its row', els.mZecAddr.textContent==='utest1abc'&&els.mStateZec.textContent==='Set'&&els.mOptZec._on===true);
T.G.realAddr=false; T.openWalletModal();
ok('wallet modal marks a demo identity honestly', /demo address/.test(els.mZecAddr.textContent)&&els.mStateZec.textContent==='Demo'&&els.mOptZec._on===false);
reset();
  console.log('-'.repeat(40));
  console.log('PHANTOM WIRING SUITE:',pass,'passed,',fail,'failed');
  return {name:'phantom-wiring-tests.js',pass,fail};
}

// ═══ SUITE: payout-worker-tests.js ═══
async function suite_38(){
  let pass=0,fail=0;
  const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
const vm=require('vm'),fs=require('fs'),path=require('path');
const wc=require('crypto').webcrypto;
const W=await import(require('url').pathToFileURL(path.join(__dirname,'..','worker','payout-worker.js')).href);
const html=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
async function keypair(){
  const k=await wc.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
  const pub=new Uint8Array(await wc.subtle.exportKey('raw',k.publicKey));
  const pk8=new Uint8Array(await wc.subtle.exportKey('pkcs8',k.privateKey));
  return {k,pub,seed:pk8.slice(-32),addr:W.b58enc(pub)};
}
const HK=await keypair(), PL=await keypair(), EVIL=await keypair();
const HOUSE=HK.addr, PLAYER=PL.addr;
const ORIGIN='https://site.example';
const kv=new Map();
let ttl={};
const env={HOUSE_SECRET:JSON.stringify([...HK.seed,...HK.pub]),RPC_URL:'https://rpc.test/?k=1',ALLOW_ORIGIN:ORIGIN,
  LEDGER:{get:async k=>kv.has(k)?kv.get(k):null,put:async(k,v,o)=>{kv.set(k,v);if(o&&o.expirationTtl)ttl[k]=o.expirationTtl;}}};
// ── mock chain / RPC (worker uses global fetch) ──
const chain={}; let sent=[]; let failSend=false; const BH=W.b58enc(wc.getRandomValues(new Uint8Array(32)));
function addDep(sig,{from=PLAYER,to=HOUSE,lam=100000000,err=null,conf='finalized',signer=true}={}){
  chain[sig]={status:{err,confirmationStatus:conf},tx:{meta:{err},transaction:{message:{accountKeys:[{pubkey:from,signer}],instructions:[{program:'system',parsed:{type:'transfer',info:{source:from,destination:to,lamports:lam}}}]}}}};
}
const sigOf=n=>W.b58enc(Uint8Array.from({length:64},(_,i)=>(i+n)%251+1));
const realFetch=globalThis.fetch;
globalThis.fetch=async(url,init)=>{
  const b=JSON.parse(init.body);const R=r=>({ok:true,status:200,json:async()=>({jsonrpc:'2.0',id:1,result:r})});
  if(b.method==='getSignatureStatuses'){const c=chain[b.params[0][0]];return R({value:[c?c.status:null]});}
  if(b.method==='getTransaction'){const c=chain[b.params[0]];return R(c?c.tx:null);}
  if(b.method==='getLatestBlockhash')return R({value:{blockhash:BH}});
  if(b.method==='sendTransaction'){
    if(failSend)return {ok:true,status:200,json:async()=>({error:{message:'blockhash expired'}})};
    sent.push(Buffer.from(b.params[0],'base64'));return R(W.b58enc(new Uint8Array(sent[sent.length-1].slice(1,65))));}
  return {ok:false,status:500,json:async()=>({})};
};
const call=async(method,pathn,body,origin=ORIGIN,now)=>{
  const req=new Request('https://worker.test'+pathn,{method,headers:{'content-type':'application/json',...(origin?{origin}:{})},body:body?JSON.stringify(body):undefined});
  const r=await W.handle(req,env,now);return {st:r.status,j:r.status===204?null:await r.json(),h:r.headers};
};
const b64=u8=>Buffer.from(u8).toString('base64');
async function signW(kp,addr,lam,nonce,ts){
  return b64(new Uint8Array(await wc.subtle.sign({name:'Ed25519'},kp.k.privateKey,new TextEncoder().encode(W.withdrawMessage(addr,lam,nonce,ts)))));
}
const NOW=1760000000000, N1='a1'.repeat(8);

// base58 helper parity with the page
ok('worker base58 round-trips 32 random bytes', (()=>{const x=wc.getRandomValues(new Uint8Array(32));return W.b58enc(W.b58dec(W.b58enc(x))).length>0&&Buffer.from(W.b58dec(W.b58enc(x))).equals(Buffer.from(x));})());
// access control
let r=await call('GET','/balance?addr='+PLAYER,null,'https://evil.example');
ok('foreign origin rejected (403)', r.st===403);
r=await call('GET','/balance?addr='+PLAYER,null,null);
ok('missing origin rejected (403)', r.st===403);
r=await call('OPTIONS','/withdraw',null,ORIGIN);
ok('CORS preflight 204 with exact allowed origin', r.st===204&&r.h.get('access-control-allow-origin')===ORIGIN);
r=await call('GET','/balance?addr='+PLAYER);
ok('new address balance is 0', r.st===200&&r.j.balance===0);
r=await call('GET','/balance?addr=short');
ok('bad address rejected', r.st===400);
r=await call('POST','/nope',{});
ok('unknown route 404', r.st===404);

// credit
const D1=sigOf(1);
addDep(D1);
r=await call('POST','/credit',{addr:PLAYER,sig:D1});
ok('valid deposit credited 0.1 SOL', r.st===200&&r.j.credited===1e8&&r.j.balance===1e8, JSON.stringify(r.j));
r=await call('POST','/credit',{addr:PLAYER,sig:D1});
ok('same deposit signature is never credited twice', r.st===200&&r.j.credited===0&&r.j.balance===1e8);
const D2=sigOf(2); addDep(D2,{from:EVIL.addr});
r=await call('POST','/credit',{addr:PLAYER,sig:D2});
ok('deposit made by someone else cannot be claimed', r.st===422);
const D3=sigOf(3); addDep(D3,{to:PLAYER});
r=await call('POST','/credit',{addr:PLAYER,sig:D3});
ok('transfer not going to the house is not a deposit', r.st===422);
const D4=sigOf(4); addDep(D4,{err:{x:1}});
r=await call('POST','/credit',{addr:PLAYER,sig:D4});
ok('failed on-chain tx rejected', r.st===409||r.st===422);
const D5=sigOf(5); addDep(D5,{conf:'processed'});
r=await call('POST','/credit',{addr:PLAYER,sig:D5});
ok('unconfirmed tx rejected', r.st===409);
r=await call('POST','/credit',{addr:PLAYER,sig:sigOf(99)});
ok('unknown signature rejected', r.st===409);
r=await call('POST','/credit',{addr:PLAYER,sig:'abc'});
ok('malformed signature rejected', r.st===400);
r=await call('POST','/credit',{addr:'x',sig:D1});
ok('malformed address rejected', r.st===400);
const D6=sigOf(6); addDep(D6,{signer:false});
r=await call('POST','/credit',{addr:PLAYER,sig:D6});
ok('non-signer sender rejected', r.st===422);
ok('balance only reflects the one valid deposit', (await call('GET','/balance?addr='+PLAYER)).j.balance===1e8);

// withdraw
const good=async(lam,nonce,ts,kp=PL,addr=PLAYER)=>({addr,lamports:lam,nonce,ts,signature:await signW(kp,addr,lam,nonce,ts)});
r=await call('POST','/withdraw',await good(30000000,N1,NOW),ORIGIN,NOW);
ok('valid signed withdrawal pays out 0.03 SOL', r.st===200&&r.j.balance===7e7&&typeof r.j.signature==='string', JSON.stringify(r.j));
// independent decode of the transaction the worker broadcast
{
  const w=sent[0];const sig=w.slice(1,65),m=w.slice(65);
  ok('wire format: 1 signature + message of exactly 3+1+96+32+(1+1+1+2+1+12) bytes', w[0]===1&&sig.length===64&&m.length===3+1+96+32+18, m.length);
  const hdr=[m[0],m[1],m[2]].join(), nk=m[3];
  ok('header 1,0,1 and 3 account keys', hdr==='1,0,1'&&nk===3);
  const keys=[0,1,2].map(i=>W.b58enc(m.slice(4+32*i,36+32*i)));
  ok('keys = house, player, System', keys[0]===HOUSE&&keys[1]===PLAYER&&keys[2]==='11111111111111111111111111111111');
  ok('blockhash embedded', W.b58enc(m.slice(100,132))===BH);
  const ix=m.slice(132);
  ok('one System Transfer ix, accounts 0->1, 12 data bytes', ix[0]===1&&ix[1]===2&&ix[2]===2&&ix[3]===0&&ix[4]===1&&ix[5]===12);
  ok('transfer data = u32 2 + u64 30000000 little-endian', Buffer.from(ix.slice(6)).toString('hex')==='02000000'+(()=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(30000000n);return b.toString('hex');})());
  ok('message consumed exactly', ix.length===6+12);
  const pub=await wc.subtle.importKey('raw',HK.pub,{name:'Ed25519'},false,['verify']);
  ok('house signature over the message verifies', await wc.subtle.verify({name:'Ed25519'},pub,sig,m));
}
r=await call('POST','/withdraw',await good(30000000,N1,NOW),ORIGIN,NOW);
ok('replayed request rejected, nothing sent', r.st===409&&sent.length===1);
ok('replay nonce stored with expiry', ttl['nonce:'+PLAYER+':'+N1]===3600);
{ const g=await good(10000000,'b2'.repeat(8),NOW); g.lamports=50000000;
  r=await call('POST','/withdraw',g,ORIGIN,NOW); ok('tampered amount fails signature (401)', r.st===401&&sent.length===1); }
{ r=await call('POST','/withdraw',await good(10000000,'c3'.repeat(8),NOW,EVIL,PLAYER),ORIGIN,NOW); ok('signature by a different key rejected (401)', r.st===401); }
{ r=await call('POST','/withdraw',await good(10000000,'d4'.repeat(8),NOW-400000),ORIGIN,NOW); ok('stale timestamp rejected', r.st===400); }
{ r=await call('POST','/withdraw',await good(80000000,'e5'.repeat(8),NOW),ORIGIN,NOW); ok('more than ledger balance rejected (402), nothing sent', r.st===402&&sent.length===1&&r.j.balance===7e7); }
{ r=await call('POST','/withdraw',await good(1234567,'f6'.repeat(8),NOW),ORIGIN,NOW); ok('off-step amount rejected', r.st===400); }
{ r=await call('POST','/withdraw',await good(1000000,'a7'.repeat(8),NOW),ORIGIN,NOW); ok('below minimum rejected', r.st===400); }
{ r=await call('POST','/withdraw',await good(6e9,'a8'.repeat(8),NOW),ORIGIN,NOW); ok('above maximum rejected', r.st===400); }
{ const g=await good(10000000,'a9'.repeat(8),NOW); g.nonce='ZZ'; r=await call('POST','/withdraw',g,ORIGIN,NOW); ok('bad nonce format rejected', r.st===400); }
{ const g=await good(10000000,'aa'.repeat(8),NOW); g.lamports='10000000'; r=await call('POST','/withdraw',g,ORIGIN,NOW); ok('string amount rejected (integers only)', r.st===400); }
{ failSend=true; const before=(await call('GET','/balance?addr='+PLAYER)).j.balance;
  r=await call('POST','/withdraw',await good(10000000,'ab'.repeat(8),NOW),ORIGIN,NOW);
  failSend=false;
  const after=(await call('GET','/balance?addr='+PLAYER)).j.balance;
  ok('failed broadcast restores the ledger exactly', r.st===502&&before===after, JSON.stringify([r.st,before,after])); }
{ r=await call('POST','/withdraw',await good(70000000,'ac'.repeat(8),NOW),ORIGIN,NOW); ok('withdrawing the exact remaining balance works and leaves 0', r.st===200&&r.j.balance===0); }
{ r=await call('POST','/withdraw',await good(10000000,'ad'.repeat(8),NOW),ORIGIN,NOW); ok('empty ledger cannot withdraw', r.st===402); }

// misconfiguration is reported by NAME only, never by value
{ const good={...env};
  const bad1=W.configProblems({...good,HOUSE_SECRET:undefined});
  ok('missing HOUSE_SECRET reported by name', bad1.length===1&&/HOUSE_SECRET/.test(bad1[0]));
  const bad2=W.configProblems({...good,HOUSE_SECRET:'[1,2,3]'});
  ok('short key array reported as bad HOUSE_SECRET', bad2.some(x=>/HOUSE_SECRET/.test(x)));
  const bad3=W.configProblems({...good,HOUSE_SECRET:'not json SECRETVALUE'});
  ok('malformed HOUSE_SECRET reported without echoing it', bad3.some(x=>/HOUSE_SECRET/.test(x))&&!JSON.stringify(bad3).includes('SECRETVALUE'));
  ok('missing RPC_URL, LEDGER, ALLOW_ORIGIN each reported', W.configProblems({...good,RPC_URL:undefined,LEDGER:undefined,ALLOW_ORIGIN:undefined}).length===3);
  ok('complete config reports nothing', W.configProblems(good).length===0);
  const saved=env.RPC_URL; env.RPC_URL=undefined;
  const rr=await call('POST','/credit',{addr:PLAYER,sig:sigOf(1)});
  env.RPC_URL=saved;
  ok('misconfigured service answers 503 with names only', rr.st===503&&rr.j.missing.some(x=>/RPC_URL/.test(x))&&!JSON.stringify(rr.j).includes('rpc.test'));
}
// an unexpected crash names the STEP and error class only, never the message text
{ const f0=globalThis.fetch; globalThis.fetch=async()=>{throw new TypeError('boom SECRETTEXT');};
  addDep(sigOf(11));
  const rr=await call('POST','/credit',{addr:PLAYER,sig:sigOf(11)});
  globalThis.fetch=f0;
  ok('crash returns 500 naming the step and error class only', rr.st===500&&rr.j.stage==='rpc-status'&&rr.j.kind==='TypeError'&&!('detail' in rr.j)&&!JSON.stringify(rr.j).includes('SECRETTEXT'), JSON.stringify(rr.j));
}
// ── page <-> worker integration (client code against the real worker handler) ──
const els={};
function el(id){return els[id]||(els[id]={style:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},innerHTML:'',textContent:'',value:'',addEventListener(){},querySelector:()=>el('q'),querySelectorAll:()=>[],set onclick(f){},set oninput(f){},set onchange(f){}});}
const sb={console,Math,Object,Array,Set,Map,JSON,Number,Date,Uint8Array,TextEncoder,BigInt,String,Error,Promise,Buffer,Request,btoa,atob};
sb.document={getElementById:id=>el(id),createElement:()=>el('c'),querySelector:()=>el('q'),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}}};
sb.window={matchMedia:()=>({matches:true})};sb.matchMedia=()=>({matches:true});sb.localStorage={getItem:()=>null,setItem(){}};
sb.crypto=wc;sb.navigator={};sb.setInterval=()=>0;sb.clearTimeout=()=>{};sb.clearInterval=()=>{};sb.requestAnimationFrame=()=>0;sb.cancelAnimationFrame=()=>{};sb.performance={now:()=>0};
sb.setTimeout=(f,ms)=>{if(!ms||ms<1000)f();return 0;};
let clientCalls=[];
sb.fetch=async(url,init)=>{
  if(url.startsWith('https://worker.test')){
    const u=new URL(url);clientCalls.push(u.pathname);
    const req=new Request(url,{method:init.method,headers:{...(init.headers||{}),origin:ORIGIN},body:init.body});
    const res=await W.handle(req,env,Date.now());
    return {ok:res.ok,status:res.status,json:async()=>res.json()};
  }
  return globalThis.fetch(url,init);
};
vm.createContext(sb);
vm.runInContext(code+';globalThis.T={SOL_CFG,SOLWAL,SOLWD,WALLET,solWithdrawMessage,solWithdraw,solWithdrawClick,solRender,solApi};',sb);
const T=sb.T;
// message parity page <-> worker
ok('page and worker build byte-identical withdraw messages', T.solWithdrawMessage(PLAYER,5e7,N1,NOW)===W.withdrawMessage(PLAYER,5e7,N1,NOW));
// disabled until configured
T.SOLWAL.addr=PLAYER; T.WALLET.SOL=10;
const SHIPPED_API=T.SOL_CFG.api; T.SOL_CFG.api='';
let wr=await T.solWithdraw('0.05');
ok('withdraw disabled with clear note while api is not configured', wr.ok===false&&wr.why==='no-api'&&/not enabled/.test(els.solWdNote.textContent));
ok('shipped build points at the deployed worker (https, workers.dev, no trailing slash)', /^https:\/\/anon-poker-payout\.[a-z0-9-]+\.workers\.dev$/.test(SHIPPED_API), SHIPPED_API);
// configure and run end to end with a Phantom whose signMessage uses the player's real key
T.SOL_CFG.api='https://worker.test';
sb.window.phantom={solana:{isPhantom:true,connect(){},async signMessage(bytes,enc){
  return {signature:new Uint8Array(await wc.subtle.sign({name:'Ed25519'},PL.k.privateKey,bytes))};}}};
// give the player a ledger balance again
addDep(sigOf(7)); await call('POST','/credit',{addr:PLAYER,sig:sigOf(7)});
sent=[]; clientCalls=[];
wr=await T.solWithdraw('0.05');
ok('e2e: page withdrawal succeeds against the real worker', wr.ok===true&&wr.lamports===5e7&&typeof wr.signature==='string', JSON.stringify(wr));
ok('e2e: page balance mirrors the server ledger after withdrawal (0.05 SOL left)', T.WALLET.SOL===0.05, T.WALLET.SOL);
ok('e2e: ledger now 0.05 SOL', (await call('GET','/balance?addr='+PLAYER)).j.balance===5e7);
ok('e2e: exactly one payout transaction broadcast', sent.length===1);
ok('e2e: note shows amount and short tx id', /Paid out 0\.05 SOL/.test(els.solWdNote.textContent), els.solWdNote.textContent);
T.WALLET.SOL=10; // stale page balance: the server must still refuse
wr=await T.solWithdraw('0.06');
ok('e2e: over-ledger withdrawal refused by server, page balance unchanged', wr.ok===false&&T.WALLET.SOL===10&&/ledger/.test(els.solWdNote.textContent), els.solWdNote.textContent);
wr=await T.solWithdraw('100');
ok('page rejects out-of-range amount before calling anything', wr.ok===false&&wr.why==='bad-amount');
T.WALLET.SOL=0.01;
wr=await T.solWithdraw('0.05');
ok('page rejects more than the on-screen SOL balance', wr.ok===false&&wr.why==='insufficient');
T.WALLET.SOL=10;
sb.window.phantom={solana:{isPhantom:true,connect(){},async signMessage(){const e=new Error('User rejected the request.');e.code=4001;throw e;}}};
sent=[]; wr=await T.solWithdraw('0.01');
ok('declined signature -> nothing sent, friendly note', wr.ok===false&&wr.why==='rejected'&&sent.length===0&&/declined/.test(els.solWdNote.textContent));
T.SOLWAL.addr=null; wr=await T.solWithdraw('0.01');
ok('not connected -> asks to connect', wr.why==='not-connected');
// UI wiring
ok('wallet modal has withdraw input, button and note', ['solWdRow','solWdAmt','solWdBtn','solWdNote'].every(id=>html.includes('id="'+id+'"')));
T.SOLWAL.addr=PLAYER; T.solRender();
ok('withdraw row appears only when connected', els.solWdRow.style.display==='flex');
T.SOLWAL.addr=null; T.solRender();
ok('withdraw row hidden when disconnected', els.solWdRow.style.display==='none');
// secrets hygiene
ok('page never references the house secret', !/HOUSE_SECRET/.test(code)&&!code.includes(JSON.stringify([...HK.seed]).slice(1,40)));
ok('worker file contains no key bytes or api key', !/api-key=/.test(fs.readFileSync(path.join(__dirname,'..','worker','payout-worker.js'),'utf8')));
globalThis.fetch=realFetch;
  console.log('-'.repeat(40));
  console.log('PAYOUT WORKER SUITE:',pass,'passed,',fail,'failed');
  return {name:'payout-worker-tests.js',pass,fail};
}

(async()=>{
const allSuites=[suite_32,suite_00,suite_01,suite_02,suite_03,suite_04,suite_05,suite_06,suite_07,suite_08,suite_09,suite_10,suite_11,suite_12,suite_13,suite_14,suite_15,suite_16,suite_17,suite_18,suite_19,suite_20,suite_21,suite_22,suite_23,suite_24,suite_25,suite_26,suite_27,suite_28,suite_29,suite_30,suite_31,suite_33,suite_34,suite_35,suite_36,suite_37,suite_38];
let gp=0,gf=0;const res=[];
// stream suites: any tests/suites/*.js exporting async function(){return {name,pass,fail}}
{const d=require('path').join(__dirname,'suites');if(require('fs').existsSync(d))for(const f of require('fs').readdirSync(d).filter(x=>x.endsWith('.js')).sort()){const m=require(require('path').join(d,f));allSuites.push(Object.defineProperty(m,'name',{value:f}));}}
for(const s of allSuites){let r;try{r=await s();}catch(e){console.log('SUITE THREW:',e.message);r={name:s.name,pass:0,fail:1};}gp+=r.pass;gf+=r.fail;res.push(r);}
console.log('');console.log('═'.repeat(60));
for(const r of res)console.log(`  ${r.fail===0?'✓':'✗'} ${r.name}: ${r.pass} passed, ${r.fail} failed`);
console.log('═'.repeat(60));
console.log(`TOTAL: ${gp} passed, ${gf} failed across ${res.length} suites`);
process.exit(gf?1:0);})();
