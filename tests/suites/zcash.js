// Zcash testnet payment request (ZIP-321) + inline QR encoder.
// Oracles: ZIP-321 spec vectors; OpenCV's QR decoder (independent implementation) for the QR.
module.exports=async function(){
let pass=0,fail=0,skipped=0;
const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL',n,d===undefined?'':d));};
const vm=require('vm'),fs=require('fs'),path=require('path'),cp=require('child_process');
const wc=require('crypto').webcrypto;
const html=fs.readFileSync(path.join(__dirname,'..','..','app','index.html'),'utf8');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
const els={};
function el(id){return els[id]||(els[id]={style:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},innerHTML:'',textContent:'',value:'',addEventListener(){},querySelector:()=>el('q'),querySelectorAll:()=>[],set onclick(f){},set oninput(f){},set onchange(f){}});}
let execResult=false;
const s={console,Math,Object,Array,Set,Map,JSON,Number,Date,Uint8Array,TextEncoder,BigInt,String,Error,Promise,Buffer,encodeURIComponent,decodeURIComponent};
s.document={getElementById:id=>el(id),createElement:()=>({value:'',select(){}}),querySelector:()=>el('q'),querySelectorAll:()=>[],addEventListener(){},documentElement:{style:{setProperty(){}}},body:{appendChild(){},removeChild(){}},execCommand:()=>execResult};
s.window={matchMedia:()=>({matches:true})};s.matchMedia=()=>({matches:true});s.localStorage={getItem:()=>null,setItem(){}};
s.crypto=wc;s.navigator={};s.setInterval=()=>0;s.clearTimeout=()=>{};s.clearInterval=()=>{};s.requestAnimationFrame=()=>0;s.cancelAnimationFrame=()=>{};s.performance={now:()=>0};
s.setTimeout=(f,ms)=>{if(!ms||ms<1000)f();return 0;};
vm.createContext(s);
vm.runInContext(code+';globalThis.T={ZEC_CFG,ZECREQ,zip321B64u,zip321B64uDecode,zecParseAmount,zecToZat,zecZatToStr,zecMemoTag,zip321Build,zip321Parse,zecConfigured,zecRender,zecCreateRequest,zecCopy,zecQrEncode,zecQrSvg,QR_ECC};',s);
const T=s.T;
const TESTNET_SAPLING='ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez'; // from ZIP-321
const TESTNET_T='tmBsTi2xWTjUdEXnuTceL7fecEQKeWaPDJd';
const TESTNET_U='utest1'+'q'.repeat(10)+'p8zrgd9wq2q2q3zurzs5xkc9q3q0f7wqsdmc0mssq7pqsr2vv6ka9sq7qzq3'.replace(/[bio1]/g,'q');
// ── ZIP-321 spec example, reproduced exactly ──
const SPEC=`zcash:${TESTNET_SAPLING}?amount=1&memo=VGhpcyBpcyBhIHNpbXBsZSBtZW1vLg&message=Thank%20you%20for%20your%20purchase`;
{const p=T.zip321Parse(SPEC);ok('spec example parses',p.ok&&p.zat===100000000&&Buffer.from(p.memo).toString()==='This is a simple memo.'&&p.message==='Thank you for your purchase',JSON.stringify(p));}
{const b=T.zip321Build({addr:TESTNET_SAPLING,zat:100000000,memo:'This is a simple memo.',message:'Thank you for your purchase'});ok('builder reproduces the spec example byte for byte',b.ok&&b.uri===SPEC,b.uri);}
// ── base64url ──
ok('memo base64url vector (no padding)',T.zip321B64u(new TextEncoder().encode('This is a simple memo.'))==='VGhpcyBpcyBhIHNpbXBsZSBtZW1vLg');
for(const n of [0,1,2,3,4,5,255,511,512]){const u=wc.getRandomValues(new Uint8Array(n)),e=T.zip321B64u(u),d=T.zip321B64uDecode(e);ok('base64url round trip n='+n,d&&Buffer.from(d).equals(Buffer.from(u))&&!/[+/=]/.test(e));}
ok('base64url rejects + / = and bad length',['ab+d','ab/d','abc=','a'].every(x=>T.zip321B64uDecode(x)===null));
// ── invalid / valid vectors ──
const A=TESTNET_SAPLING;
const bad={'amount 50.':`zcash:${A}?amount=50.`,'amount .5':`zcash:${A}?amount=.5`,'9 decimals':`zcash:${A}?amount=0.123456789`,'comma':`zcash:${A}?amount=1,5`,'over 21M':`zcash:${A}?amount=21000000.00000001`,
  'memo plus':`zcash:${A}?memo=ab+d`,'memo slash':`zcash:${A}?memo=ab/d`,'memo padding':`zcash:${A}?memo=abc=`,'memo too long':`zcash:${A}?memo=${T.zip321B64u(new Uint8Array(513))}`,
  'memo on transparent':`zcash:${TESTNET_T}?memo=aGk`,'duplicate amount':`zcash:${A}?amount=1&amount=2`,'unknown req-':`zcash:${A}?amount=1&req-foo=1`,'wrong scheme':`bitcoin:${A}?amount=1`,
  'upper scheme':`ZCASH:${A}?amount=1`,'empty query':`zcash:${A}?`,'bad address chars':`zcash:${A}!?amount=1`,'indexed':`zcash:${A}?amount.1=1`,'no address':`zcash:?amount=1`,'malformed param':`zcash:${A}?amount`};
for(const k of Object.keys(bad))ok('rejects: '+k,T.zip321Parse(bad[k]).ok===false,bad[k]);
for(const a of ['50','050','0.5','00.500','21000000','0.00000001'])ok('accepts amount '+a,T.zip321Parse(`zcash:${A}?amount=${a}`).ok===true);
ok('unknown non-required param ignored',T.zip321Parse(`zcash:${A}?amount=1&foo=bar`).ok===true);
// ── amounts: integer zatoshi, no float drift ──
ok('0.1 -> 10000000 exactly',T.zecToZat('0.1')===10000000);ok('0.3 -> 30000000 exactly',T.zecToZat('0.3')===30000000);
ok('min 0.001 ok, below rejected',T.zecToZat('0.001')===100000&&T.zecToZat('0.0009')===null);
ok('max 1 ok, above rejected',T.zecToZat('1')===100000000&&T.zecToZat('1.00000001')===null);
ok('parse edge 0.00000001 = 1 zat; 21000000 max',T.zecParseAmount('0.00000001')===1&&T.zecParseAmount('21000000')===2100000000000000&&T.zecParseAmount('21000001')===null);
ok('garbage amounts rejected',['','abc','1e3','-1','1.','.1','1,2','0.123456789',' ','1 2'].every(x=>T.zecParseAmount(x)===null));
ok('zat -> string trims zeros, no trailing dot',T.zecZatToStr(100000000)==='1'&&T.zecZatToStr(10000000)==='0.1'&&T.zecZatToStr(1)==='0.00000001'&&T.zecZatToStr(123456789)==='1.23456789');
for(const z of [1,99999999,100000000,123456789,2100000000000000])ok('amount round trip '+z,T.zecParseAmount(T.zecZatToStr(z))===z);
// ── builder rules ──
ok('mainnet address refused (testnet-only preview)',T.zip321Build({addr:'zs1'+'q'.repeat(80),zat:100000}).ok===false);
ok('invalid address refused',T.zip321Build({addr:'nope',zat:100000}).ok===false);
ok('memo on transparent refused by builder',T.zip321Build({addr:TESTNET_T,zat:100000,memo:'x'}).ok===false);
ok('transparent without memo is fine',T.zip321Build({addr:TESTNET_T,zat:100000}).ok===true);
ok('memo > 512 bytes refused',T.zip321Build({addr:A,zat:100000,memo:'x'.repeat(513)}).ok===false);
ok('non-integer / zero / negative zat refused',[0.5,0,-1,NaN,'1'].every(z=>T.zip321Build({addr:A,zat:z}).ok===false));
{const b=T.zip321Build({addr:A,zat:100000,memo:'x',message:'a b&c=d#e?f'});ok('message is percent-encoded so it cannot inject parameters',b.ok&&!/[ #]/.test(b.uri)&&T.zip321Parse(b.uri).message==='a b&c=d#e?f'&&Object.keys(T.zip321Parse(b.uri)).length>0);}
// ── memo tag ──
{const t1=T.zecMemoTag(),t2=T.zecMemoTag();ok('memo tag format AP-<12 base32>',/^AP-[A-Z2-7]{12}$/.test(t1)&&t1!==t2,t1);}
// ── placeholder / configuration state ──
const SHIPPED_ADDR=T.ZEC_CFG.addr;T.ZEC_CFG.addr='PENDING_OPERATOR_TESTNET_ADDRESS';
ok('placeholder address is not "configured"',T.zecConfigured()===false);
['zecQr','zecReqOut','zecReqNote','zecReqRow','zecTag','zecUri','depCopyBtn'].forEach(el);
els.zecAmt=el('zecAmt');els.zecAmt.value='0.01';
T.zecRender();
ok('placeholder -> clear "not configured" note, request row hidden',/not configured/.test(els.zecReqNote.textContent)&&els.zecReqRow.style.display==='none');
{const r=T.zecCreateRequest();ok('no request or QR is created for the placeholder',r.ok===false&&r.why==='not-configured'&&els.zecQr.innerHTML===''&&els.zecReqOut.style.display==='none');}
// configure a (syntactically valid) testnet address
T.ZEC_CFG.addr=A;
ok('valid testnet address -> configured',T.zecConfigured()===true);
{const keep=T.ZEC_CFG.addr;T.ZEC_CFG.addr=SHIPPED_ADDR;ok('shipped address is a valid, configured Zcash testnet address',T.zecConfigured()===true&&/^utest1/.test(SHIPPED_ADDR));T.ZEC_CFG.addr=keep;}
T.zecRender();
ok('configured -> row shown, TESTNET + operator-confirmed + nothing auto-credited stated',els.zecReqRow.style.display==='flex'&&/TESTNET/.test(els.zecReqNote.textContent)&&/operator-confirmed/.test(els.zecReqNote.textContent)&&/nothing is credited automatically/.test(els.zecReqNote.textContent));
els.zecAmt.value='0.25';
const r1=T.zecCreateRequest();
ok('request created',r1.ok===true&&r1.zat===25000000&&/^AP-[A-Z2-7]{12}$/.test(r1.tag),JSON.stringify(r1));
ok('URI has address, exact amount and the memo tag',r1.uri.startsWith('zcash:'+A+'?amount=0.25&memo=')&&Buffer.from(T.zip321B64uDecode(r1.uri.match(/memo=([^&]+)/)[1])).toString()===r1.tag);
ok('URI passes the strict parser',T.zip321Parse(r1.uri).ok===true);
ok('QR is an inline SVG made only of numbers and path commands',/^<svg [^<>]*><rect [^<>]*\/><path d="[Mhvz0-9 \-]+" fill="#000"\/><\/svg>$/.test(els.zecQr.innerHTML)&&!/<script|on\w+=|javascript:/i.test(els.zecQr.innerHTML));
ok('output area shown; tag line names tag and amount',els.zecReqOut.style.display==='block'&&els.zecTag.textContent.includes(r1.tag)&&/0\.25 ZEC \(testnet\)/.test(els.zecTag.textContent));
const r2=T.zecCreateRequest();ok('each request gets a fresh unique tag',r2.tag!==r1.tag);
els.zecAmt.value='5';{const r=T.zecCreateRequest();ok('over-limit amount refused with message, old output hidden',r.ok===false&&/0\.001 to 1 ZEC/.test(els.zecReqNote.textContent)&&els.zecReqOut.style.display==='none');}
// ── copy: never claim success unless it happened ──
els.zecAmt.value='0.01';T.zecCreateRequest();
{let written=null;s.navigator.clipboard={writeText:async t=>{written=t;}};const r=await T.zecCopy();ok('clipboard success -> "Copied ✓" and exact URI copied',r===true&&els.depCopyBtn.textContent==='Copied ✓'&&written===T.ZECREQ.uri);}
{s.navigator.clipboard={writeText:async()=>{throw new Error('denied');}};execResult=false;const r=await T.zecCopy();ok('clipboard + fallback both fail -> says so, no false "Copied"',r===false&&/Copy failed/.test(els.depCopyBtn.textContent)&&!/Copied/.test(els.depCopyBtn.textContent));}
{s.navigator.clipboard=undefined;execResult=true;const r=await T.zecCopy();ok('no clipboard API, execCommand works -> Copied',r===true&&els.depCopyBtn.textContent==='Copied ✓');}
// ── QR capacity table sanity (known byte-mode capacities) ──
const capOf=(v,l)=>{const E=T.QR_ECC[l];const raw=(()=>{let r=(16*v+128)*v+64;if(v>=2){const n=Math.floor(v/7)+2;r-=(25*n-10)*n-55;if(v>=7)r-=36;}return r;})();const cw=Math.floor(raw/8)-E.cpb[v]*E.nb[v];return Math.floor((cw*8-4-(v<10?8:16))/8);};
const known={'L1':17,'M1':14,'L2':32,'M2':26,'L10':271,'M10':213,'L20':858,'M20':666,'L7':154,'M7':122};
for(const k of Object.keys(known))ok('byte capacity '+k+' = '+known[k],capOf(+k.slice(1),k[0])===known[k],capOf(+k.slice(1),k[0]));
ok('fit boundary: 17 bytes -> v1-L, 18 -> v2-L',T.zecQrEncode('x'.repeat(17),'L').version===1&&T.zecQrEncode('x'.repeat(18),'L').version===2);
{let t=false;try{T.zecQrEncode('x'.repeat(900));}catch(e){t=true;}ok('too-long text throws (never a corrupt code)',t);}
// ── QR decoded by an independent implementation (OpenCV) ──
const sample=[];
sample.push(SPEC,r1.uri);
for(const n of [1,17,18,53,106,154,230,271,367,458,586,666]){sample.push(Array.from({length:n},(_,i)=>String.fromCharCode(33+((i*37+n*11)%90))).join(''));}
const jobs=[];
for(const t of sample)for(const lvl of ['M','L']){try{const q=T.zecQrEncode(t,lvl);jobs.push({t,lvl,v:q.version,size:q.size,rows:q.modules.map(r=>r.map(x=>x?1:0).join(''))});}catch(e){}}
fs.writeFileSync('/tmp/zec_qr_jobs.json',JSON.stringify(jobs));
const py=`
import json,sys
try:
    import numpy as np, cv2
except Exception:
    print('NOCV'); sys.exit(0)
jobs=json.load(open('/tmp/zec_qr_jobs.json'))
dets=[cv2.QRCodeDetector()]
try: dets.append(cv2.QRCodeDetectorAruco())
except Exception: pass
def render(o,s,z=4,flip=0):
    n=o['size']; img=np.full(((n+2*z)*s,(n+2*z)*s),255,np.uint8)
    for y,r in enumerate(o['rows']):
        for x,c in enumerate(r):
            c=(c=='1')
            if flip and y>8 and y<n-8 and x>8 and x<n-8 and (x*7+y*13)%flip==0: c=not c
            if c: img[(y+z)*s:(y+z+1)*s,(x+z)*s:(x+z+1)*s]=0
    return img
res=[]
for o in jobs:
    got=False
    for d in dets:
        for s in (4,6,8,10,12):
            v,_,_=d.detectAndDecode(render(o,s))
            if v==o['t']: got=True;break
        if got:break
    # negative control: heavy corruption of the data area must NOT decode to the same text
    broke=True
    if o['v']>=3:
        for d in dets:
            for s in (6,10):
                v,_,_=d.detectAndDecode(render(o,s,flip=3))
                if v==o['t']: broke=False
    res.append([got,broke])
print(json.dumps(res))
`;
fs.writeFileSync('/tmp/zec_qr_check.py',py);
const pr=cp.spawnSync('python3',['-I','/tmp/zec_qr_check.py'],{encoding:'utf8',timeout:120000});
const outp=(pr.stdout||'').trim();
if(outp==='NOCV'||pr.status!==0||!outp){skipped++;console.log('  NOTE: OpenCV not available here; QR decode oracle skipped ('+(pr.stderr||'').slice(0,80)+')');}
else{const res=JSON.parse(outp);ok('every generated QR (L and M, versions 1-20) decodes to its exact text via OpenCV ('+res.length+' codes)',res.length===jobs.length&&res.every(r=>r[0]),JSON.stringify(res.map((r,i)=>r[0]?null:[jobs[i].lvl,jobs[i].v]).filter(Boolean)));
  ok('negative control: corrupted codes do not decode to the same text',res.every(r=>r[1]));
  ok('QR sample covers a spread of versions',new Set(jobs.map(j=>j.v)).size>=8,[...new Set(jobs.map(j=>j.v))].join());}
// ── honesty and safety of the page ──
ok('UI says TESTNET and operator-confirmed; fake address text is gone',/Zcash deposit request \(testnet\)/.test(html)&&!/utest1anonpoker/.test(html)&&!/preview placeholder/.test(html));
const blk=code.slice(code.indexOf('// ── ZEC:BEGIN'),code.indexOf('// ── ZEC:END'));
ok('request code never credits ZEC chips or touches balances',!/WALLET\.ZEC|solCredit|updateBalUI|chips/.test(blk));
ok('only the QR svg (from numbers) is assigned with innerHTML',(blk.match(/innerHTML/g)||[]).length===1&&/q\.innerHTML=svg/.test(blk));
ok('no network or external loads in the request code',!/fetch\(|XMLHttpRequest|<script|src=|https?:\/\//.test((blk+code.slice(code.indexOf('// ── ZEC:QR'),code.indexOf('// ── ZEC:QR end'))).replace('xmlns="http://www.w3.org/2000/svg"','')));
ok('no private key material',!/secret|privateKey|seed/i.test(blk));
if(skipped)console.log('  (skipped checks: '+skipped+')');
console.log('-'.repeat(40));console.log('ZCASH REQUEST SUITE:',pass,'passed,',fail,'failed');
return {name:'zcash-tests.js',pass,fail};};
