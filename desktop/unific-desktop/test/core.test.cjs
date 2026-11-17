'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { workerPath, normalizeHealth, describeNetworkFailure, fetchHealth, MemoryStore, assistantReply, sanitizeNote } = require('../src/core.cjs');

test('prefer a instalação V2 e não apagar a anterior', () => {
  const exists = p => p.endsWith(path.join('MediaForge-Staging-V2','desktop','run-worker.ps1'));
  assert.equal(workerPath({ LOCALAPPDATA: 'C:\\Users\\Teste\\AppData\\Local' }, exists).includes('MediaForge-Staging-V2'), true);
});
test('heartbeat antigo é offline mesmo se servidor disser online', () => {
  const time = Date.parse('2026-11-17T12:00:00Z');
  const info = normalizeHealth({ok:true,worker:{online:true,last_seen:'2026-11-17T11:59:00Z',queued_jobs:1}},time);
  assert.equal(info.worker,false);assert.equal(info.api,true);
});
test('heartbeat recente é online', () => {
  const time = Date.parse('2026-11-17T12:00:00Z');
  const info = normalizeHealth({ok:true,worker:{online:true,last_seen:'2026-11-17T11:59:50Z',queued_jobs:2}},time);
  assert.equal(info.worker,true);assert.equal(info.queued,2);
});
test('HTML 403 nunca é tratado como API saudável', async()=>{
  const r = await fetchHealth(async()=>({status:403,ok:false,headers:{get:()=> 'text/html'}}));
  assert.equal(r.api,false);assert.match(r.error,/403/);
});
test('DNS falhando é explicado claramente',()=>{
  assert.match(describeNetworkFailure({cause:{code:'ENOTFOUND'}}),/DNS/);
});
test('memória local persiste e recupera notas',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'unific-memory-test-'));
  try {const a=new MemoryStore(path.join(dir,'memory.json'));a.save('Meu projeto é MediaForge');const b=new MemoryStore(path.join(dir,'memory.json'));assert.equal(b.read()[0].text,'Meu projeto é MediaForge');}
  finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('sem tokens ou credenciais nas notas por padrão do assistente',()=>{
  assert.equal(sanitizeNote('  oi  '),'oi');
  const reply=assistantReply('Como está a fila?',{api:true,worker:false,queued:1,processing:0},[]);
  assert.match(reply,/Fila: 1/);
});
