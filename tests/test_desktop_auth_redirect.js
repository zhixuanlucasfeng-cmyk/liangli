const assert=require('node:assert/strict');
const {AccountClient}=require('../account-sync.js');
let sent;
AccountClient.configure({url:'https://example.supabase.co',anonKey:'public-anon-test-key'.repeat(4),location:{origin:'powy://app',pathname:'/index.html',protocol:'powy:'},fetch:async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({})};}});
(async()=>{
  await AccountClient.recover('person@example.com');
  assert.equal(sent.redirect_to,'https://zhixuanlucasfeng-cmyk.github.io/liangli/','Desktop recovery email must open the existing HTTPS recovery page, not an unregistered custom protocol');
  console.log('Desktop password recovery redirect passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
