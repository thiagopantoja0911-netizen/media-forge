'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validWorkerToken,verifyWorkerToken}=require('../src/worker-pairing.cjs');
const goodToken='a'.repeat(43);
test('rejeita credenciais curtas e caracteres perigosos sem enviar requisição',async()=>{
  assert.equal(validWorkerToken('foo'),false);
  assert.equal(validWorkerToken('a'.repeat(35)+'\n'),false);
  const r=await verifyWorkerToken('a'.repeat(35)+'\n',()=>{throw Error('Não deveria acessar a rede');});
  assert.equal(r.ok,false);
});
test('valida credencial Worker com endpoint HTTPS fixo e confirmação JSON',async()=>{
  let called=false;
  const r=await verifyWorkerToken(goodToken,async (url,options)=>{
    called=true;
    assert.equal(url,'https://unificmedia.salevo.site/v1/worker/auth-check');
    assert.equal(options.method,'POST');
    assert.equal(options.redirect,'error');
    assert.equal(options.headers.authorization,'Bearer '+goodToken);
    return {status:200,ok:true,headers:{get:()=> 'application/json'},json:async()=>({ok:true,authenticated:true})};
  });
  assert.equal(called,true);assert.equal(r.ok,true);
});
test('token Worker inválido 401 não pode ser salvo',async()=>{
  const r=await verifyWorkerToken(goodToken,async()=>({status:401,ok:false,headers:{get:()=> 'application/json'}}));
  assert.equal(r.ok,false);assert.match(r.error,/401/);
});
test('HTML 403 da Hostinger não deve autorizar token',async()=>{
  const r=await verifyWorkerToken(goodToken,async()=>({status:403,ok:false,headers:{get:()=> 'text/html'}}));
  assert.equal(r.ok,false);assert.match(r.error,/403/);
});
test('resposta JSON sem confirmação de autenticação é rejeitada',async()=>{
  const r=await verifyWorkerToken(goodToken,async()=>({status:200,ok:true,headers:{get:()=> 'application/json'},json:async()=>({ok:true,authenticated:false})}));
  assert.equal(r.ok,false);
});
