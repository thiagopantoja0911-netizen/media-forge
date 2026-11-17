'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {MemoryStore,classifyTopics,emptyBrain,sanitizeNote,normalizeText}=require('../src/core.cjs');
const root=path.resolve(__dirname,'..');
const current=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

test('updates retain the same app identity; no manual uninstall is needed',()=>{
 assert.match(current.version,/^0\.1\.[1-9]\d*$/);assert.equal(current.productName,'Unific Desktop');
 assert.equal(current.build.appId,'site.salevo.unificdesktop');
 assert.equal(current.build.nsis.perMachine,false);assert.equal(current.build.nsis.oneClick,true);
 assert.equal(current.build.nsis.deleteAppDataOnUninstall,false);
});
test('categories classify interconnected marketing and contact topics',()=>{
 const topics=classifyTopics('Nas abordagens, minha campanha de marketing comunica a clientes por WhatsApp');
 assert.ok(topics.includes('marketing'));
 assert.ok(topics.includes('comunicacao')||topics.includes('abordagens'));
});
test('brain records links, settings, memory and persists after restart',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'unific-brain-'));
 try {
  const file=path.join(dir,'neural.json');const a=new MemoryStore(file);
  const entry=a.save('Quero abordar clientes por WhatsApp nas campanhas de marketing');
  assert.ok(entry.topics.length>1);
  const b=new MemoryStore(file);assert.equal(b.graph().total,1);
  assert.ok(b.graph().nodes.some(n=>n.count>0));
  assert.ok(b.graph().links.some(e=>e.strength>1));
  b.configure({autoLearn:false});assert.equal(b.autoLearn('Quero que o projeto aprenda meu marketing'),null);
  b.configure({autoLearn:true});
  b.autoLearn('Quero sempre abordar empresas com mensagem profissional pelo WhatsApp');
  assert.equal(b.graph().total,2);
  b.remove(entry.id);assert.equal(b.graph().total,1);
  b.clear();assert.equal(b.graph().total,0);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('reads V1 records without modifying or deleting original file',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'unific-v1-migration-'));
 try{
  const old=path.join(dir,'assistant-memory.json'),next=path.join(dir,'neural-memory.json');
  const original=JSON.stringify({version:1,notes:[{text:'Marketing e abordagens por WhatsApp',createdAt:'2026-11-01T12:00:00Z'}]});
  fs.writeFileSync(old,original);
  const graph=new MemoryStore(next,old);assert.equal(graph.graph().total,1);
  graph.save('Aprender criativos e automações');
  assert.equal(new MemoryStore(next,old).graph().total,2);
  assert.equal(fs.readFileSync(old,'utf8'),original);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('never saves access tokens or passwords in knowledge network',()=>{
 assert.throws(()=>sanitizeNote('token=sk-abcdefghijklmn'),/senhas|tokens/);
 assert.throws(()=>sanitizeNote('Authorization: Bearer xyz'),/senhas|tokens/);
 assert.equal(normalizeText('Comunicação'),'comunicacao');
});
test('worker setup and restart preserve existing scheduled task',()=>{
 const b=fs.readFileSync(path.join(root,'scripts','bootstrap-worker.ps1'),'utf8');
 const r=fs.readFileSync(path.join(root,'scripts','restart-worker-safe.ps1'),'utf8');
 assert.doesNotMatch(b,/Unregister-ScheduledTask|Register-ScheduledTask|Stop-ScheduledTask/);
 assert.doesNotMatch(r,/Unregister-ScheduledTask|Register-ScheduledTask/);
 assert.match(r,/Start-ScheduledTask/);
});
test('overlay is desktop-only and fixed; no permanent corner bubble',()=>{
 const main=fs.readFileSync(path.join(root,'src','main.cjs'),'utf8');
 const view=fs.readFileSync(path.join(root,'ui','dashboard.html'),'utf8');
 assert.match(main,/desktopActive && inZone/);
 assert.match(main,/movable:false/);
 assert.doesNotMatch(main,/dockBounds|hover-orb/);
 assert.match(view,/data-view="settings"/);
 assert.doesNotMatch(view,/class="sidebar"/);
});
