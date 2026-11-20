import test from "node:test";
import assert from "node:assert/strict";
import {inferGoal,planFromShortBrief} from "../src/creative-director.mjs";
import {VIDEOS_SECRETS_TOOLS} from "../src/videos-secrets-mcp.mjs";

test("sales intent in one sentence selects before/after story without fabricated proof",()=>{
 const plan=planFromShortBrief({brand:"Empresa Horizonte",idea:"Criar anúncio para vender uma solução que organiza equipes de lojas"});
 assert.equal(plan.brief.goal,"sales");
 assert.equal(plan.decision.chosen,"before-after");
 assert.equal(plan.storyboard.length,5);
 assert.equal(plan.storyboard[0].start,0);
 assert.equal(plan.storyboard[4].end,20);
 assert.deepEqual(plan.storyboard.map(s=>s.role),[undefined,undefined,undefined,undefined,undefined]);
 assert.equal(plan.status,"storyboard-only-not-rendered");
 assert.equal(plan.production.threeSecondPrototype,true);
 assert.equal(plan.production.motionProfile,"dynamic-motion-v1");
 assert.equal(plan.cinematicPolicy.controlCount,40);
 assert.equal(plan.assetManifest.length,5);
 assert.equal(plan.storyArc.payoff.length>0,true);
 assert.ok(plan.assetManifest.every(x=>x.localAssetRequired&&x.prompt.includes("Sem cartões vetoriais")));
 assert.equal(plan.claims.length,0);
 assert.ok(plan.blockers.length>=2);
});
test("likes and shares choose meaningfully different films",()=>{
 const likes=planFromShortBrief({brand:"Empresa A",idea:"Faça um motion para aumentar curtidas e comentários"});
 const shares=planFromShortBrief({brand:"Empresa A",idea:"Faça um vídeo com uma dica para compartilhar"});
 assert.equal(likes.brief.goal,"likes");assert.equal(likes.decision.chosen,"result-first");
 assert.equal(shares.brief.goal,"shares");assert.equal(shares.decision.chosen,"object-journey");
 assert.notDeepEqual(likes.storyboard.map(s=>s.movement),shares.storyboard.map(s=>s.movement));
});
test("format, duration, fps and audience are explicit and timecoded",()=>{
 const p=planFromShortBrief({brand:"Cooperativa Verde",idea:"Mostrar os bastidores do nosso atendimento",goal:"awareness",audience:"Produtores locais",aspect_ratio:"16:9",fps:30,duration_seconds:30});
 assert.equal(p.brief.aspectRatio,"16:9");assert.equal(p.brief.fps,30);
 assert.equal(p.brief.audience,"Produtores locais");
 assert.equal(p.storyboard[4].end,30);
 const pieces=p.storyboard.reduce((sum,s)=>sum+(s.end-s.start),0);
 assert.ok(Math.abs(pieces-30)<.001);
});
test("claims require a source before being usable on-screen",()=>{
 const p=planFromShortBrief({brand:"Empresa X",idea:"Mostrar um software que acelera a produção",claims:[{text:"Reduz 90% dos custos"},{text:"Ferramenta disponível",source:"https://example.com/docs"}]});
 assert.equal(p.claims[0].eligible,false);
 assert.equal(p.claims[1].eligible,true);
 assert.ok(p.persuasion.integrity.includes("não inventar prova social"));
});
test("reject empty requests, unsupported goals and malformed claim objects",()=>{
 assert.throws(()=>planFromShortBrief({brand:"A",idea:"uma ideia curta"}),/BRAND_REQUIRED/);
 assert.throws(()=>planFromShortBrief({brand:"Empresa",idea:"curto"}),/IDEA_REQUIRED/);
 assert.throws(()=>planFromShortBrief({brand:"Empresa",idea:"Ideia para uma empresa",goal:"scams"}),/GOAL_UNSUPPORTED/);
 assert.throws(()=>planFromShortBrief({brand:"Empresa",idea:"Ideia para uma empresa",claims:[{x:"x"}]}),/CLAIM_INVALID/);
 assert.throws(()=>inferGoal("ideia","invalid"),/GOAL_UNSUPPORTED/);
});
test("MCP tool offers concise contract with existing video tools preserved",()=>{
 const names=VIDEOS_SECRETS_TOOLS.map(x=>x.name);
 assert.ok(names.includes("plan_video_from_brief"));
 assert.ok(names.includes("create_video"));
 assert.ok(names.includes("create_motion_video"));
 assert.ok(names.includes("renderer_status"));
 assert.equal(VIDEOS_SECRETS_TOOLS.find(x=>x.name==="plan_video_from_brief").inputSchema.required.length,2);
});
