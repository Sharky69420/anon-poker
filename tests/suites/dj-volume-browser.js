// Real-browser check of the DJ volume slider: it controls the audio element, is remembered, and does not break the header.
module.exports=async function(){
let pass=0,fail=0;const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
let pw;try{pw=require('playwright');}catch(e){try{pw=require('/opt/npm-tools/node_modules/playwright');}catch(e2){}}
if(!pw){console.log('  (skipped: playwright not available)');return {name:'dj-volume-browser.js (skipped)',pass:0,fail:0};}
const PAGE=process.env.ZP_PAGE||'/tmp/reg/app/index.html';
const browser=await pw.chromium.launch({args:['--no-sandbox']});
for(const [w,h,mobile] of [[390,844,true],[360,640,true],[1280,800,false]]){
  const ctx=await browser.newContext({viewport:{width:w,height:h},hasTouch:mobile,isMobile:mobile});
  const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.route('**/*',r=>/^(file|data|blob):/.test(r.request().url())?r.continue():r.abort());
  await page.goto('file://'+PAGE);await page.waitForFunction(()=>typeof djAudio==='function');
  await page.evaluate(()=>show('s-table'));
  const tag=' @'+w;
  const geo=await page.evaluate(()=>{const b=document.getElementById('djOpenBtn').getBoundingClientRect(),s=document.getElementById('djVol').getBoundingClientRect();return {bl:b.left,bb:b.bottom,sl:s.left,st:s.top,sw:s.width,sh:s.height,vw:innerWidth,right:s.right};});
  ok('slider sits under the DJ button, same column'+tag,geo.st>=geo.bb-1&&Math.abs(geo.sl-geo.bl)<2&&geo.sw>=40&&geo.sh>=10&&geo.right<=geo.vw+0.5,JSON.stringify(geo));
  ok('DJ button still opens the panel'+tag,await page.evaluate(()=>{document.getElementById('djOpenBtn').click();return document.getElementById('djOverlay').classList.contains('show');}));
  await page.evaluate(()=>{document.getElementById('djOverlay').classList.remove('show');});
  await page.evaluate(()=>{const e=document.getElementById('djVol');e.value='35';e.dispatchEvent(new Event('input',{bubbles:true}));});
  ok('slider sets the volume of the audio element (created later too)'+tag,await page.evaluate(()=>{const a=djAudio();return Math.abs(a.volume-0.35)<1e-9&&DJ_VOL===0.35;}));
  await page.evaluate(()=>{const e=document.getElementById('djVol');e.value='0';e.dispatchEvent(new Event('input',{bubbles:true}));});
  ok('0 mutes, 100 is full'+tag,await page.evaluate(()=>{const e=document.getElementById('djVol');const z=djAudio().volume===0;e.value='100';e.dispatchEvent(new Event('input',{bubbles:true}));return z&&djAudio().volume===1;}));
  await page.evaluate(()=>{const e=document.getElementById('djVol');e.value='60';e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.reload();await page.waitForFunction(()=>typeof djAudio==='function');
  ok('volume is remembered after reload'+tag,await page.evaluate(()=>document.getElementById('djVol').value==='60'&&DJ_VOL===0.6&&djAudio().volume===0.6));
  await page.evaluate(()=>{localStorage.setItem('zp-dj-vol','garbage');});
  await page.reload();await page.waitForFunction(()=>typeof djAudio==='function');
  ok('a corrupt saved value falls back to full volume'+tag,await page.evaluate(()=>DJ_VOL===1&&djAudio().volume===1));
  ok('no page errors'+tag,errs.length===0,JSON.stringify(errs.slice(0,2)));
  await ctx.close();
}
await browser.close();
return {name:'dj-volume-browser.js (real Chromium)',pass,fail};
};
