module.exports=async function(){let pass=0,fail=0;const ok=(n,c)=>{c?pass++:(fail++,console.log('  FAIL',n));};
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','..','app','index.html'),'utf8');
ok('integration harness loads the staged page', html.includes('Your Wallet Address'));
return {name:'_selftest.js (stream harness)',pass,fail};};
