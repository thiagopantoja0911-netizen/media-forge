'use strict';
const { API_BASE } = require('./core.cjs');
const VALID_TOKEN=/^[A-Za-z0-9._~+/=-]{32,256}$/;
function validWorkerToken(token) {
  return typeof token === 'string' && VALID_TOKEN.test(token);
}
async function verifyWorkerToken(token, fetchImpl=globalThis.fetch, timeoutMs=14000) {
  if (!validWorkerToken(token)) return {ok:false,error:'Token inválido. Use somente o token Worker gerado no painel MediaForge (mínimo 32 caracteres).'};
  const abort=new AbortController();
  const timer=setTimeout(()=>abort.abort(),timeoutMs);
  try {
    const response=await fetchImpl(API_BASE+'/v1/worker/auth-check',{
      method:'POST',
      headers:{authorization:'Bearer '+token,'content-type':'application/json',accept:'application/json'},
      body:'{}',redirect:'error',signal:abort.signal
    });
    const contentType=response.headers?.get('content-type')||'';
    if (!contentType.toLowerCase().includes('application/json')) {
      return {ok:false,error:'Servidor devolveu HTTP '+response.status+' sem JSON. Verifique o proxy ou a proteção da Hostinger.'};
    }
    if (response.status===401) return {ok:false,error:'Token Worker rejeitado (401). Gere um novo token no painel MediaForge.'};
    if (response.status===403) return {ok:false,error:'A conexão foi bloqueada (403). Verifique a proteção da Hostinger.'};
    if (!response.ok) return {ok:false,error:'Falha na validação do token: HTTP '+response.status+'.'};
    const data=await response.json();
    return data?.ok===true && data?.authenticated===true
      ? {ok:true}
      : {ok:false,error:'O servidor não confirmou a autenticação do Worker.'};
  } catch(error) {
    const detail=error?.name==='AbortError'?'tempo de conexão excedido':'falha de conexão HTTPS';
    return {ok:false,error:'Não foi possível validar o token: '+detail+'. A credencial anterior não foi alterada.'};
  } finally {clearTimeout(timer);}
}
module.exports={validWorkerToken,verifyWorkerToken};
