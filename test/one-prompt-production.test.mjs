import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOnePromptBlueprint} from '../src/one-prompt-production.mjs';
import {VIDEOS_SECRETS_TOOLS} from '../src/videos-secrets-mcp.mjs';

test('one sentence produces actionable sales storyline without inventing brand proof',()=>{
 const plan=buildOnePromptBlueprint({brand:'Empresa Exemplo',idea:'Quero vender um serviço que ajuda lojas a organizar as entregas'});
 assert.equal(plan.creative.goal,'sales');
 assert.equal(plan.storyboard.length,5);
 assert.equal(plan.storyboard[0].start,0);
 assert.equal(plan.storyboard.at(-1).end,20);
 assert.equal(plan.status,'production-plan-ready-not-rendered');
 assert.equal(plan.readiness.mediaAssetsReady,false);
 assert.equal(plan.readiness.artisticQA,false);
 assert.equal(plan.creative.conversionOrEngagementIsNotGuaranteed,true);
 assert.ok(plan.assets.filter(x=>x.kind==='visual').length===5);
 assert.ok(plan.assets.some(x=>x.kind==='music'));
 assert.ok(plan.assets.some(x=>x.kind==='voice'));
 assert.ok(plan.assets.filter(x=>x.kind==='sfx').length===4);
 assert.match(plan.direction.requirements.join(';'),/CTA unobstructed/);
});
test('likes and shares use different psychology and creative plans',()=>{
 const likes=buildOnePromptBlueprint({brand:'Lojas A',idea:'Vídeo criativo para ganhar curtidas e comentários'});
 const shares=buildOnePromptBlueprint({brand:'Lojas A',idea:'Dica útil para compartilhar com amigos'});
 assert.equal(likes.creative.goal,'likes');
 assert.equal(shares.creative.goal,'shares');
 assert.notDeepEqual(likes.creative.psychology,shares.creative.psychology);
 assert.equal(likes.audio.voice,'off');
 assert.equal(shares.audio.voice,'pt-BR-natural');
});
test('does not promote unsourced claims or fake brand identity',()=>{
 const r=buildOnePromptBlueprint({brand:'Empresa Z',idea:'Campanha para vender minha loja no bairro',claims:[
  {text:'Aumenta vendas em 500%'},{text:'Tem frete gratuito',source:'https://example.org/entregas'}]});
 assert.equal(r.claims.allowed.length,1);
 assert.equal(r.claims.withheld.length,1);
 assert.equal(r.identity.verified,false);
 assert.ok(r.assets.some(x=>x.id==='brand-logo'));
});
test('valid voice choice and no assumed rendered state',()=>{
 const r=buildOnePromptBlueprint({brand:'Empresa Z',idea:'Mostrar produtos que fazem diferença',voice_mode:'pt-BR-female',aspect_ratio:'16:9',duration_seconds:30});
 assert.equal(r.audio.voice,'pt-BR-female');
 assert.equal(r.brief.aspectRatio,'16:9');
 assert.equal(r.storyboard.at(-1).end,30);
 assert.equal(r.delivery.performed,false);
 assert.throws(()=>buildOnePromptBlueprint({brand:'Empresa',idea:'Ideia de anúncio profissional',voice_mode:'invalid'}),/VOICE_MODE_UNSUPPORTED/);
});
test('original MCP tool remains compatible and exposes voice preference',()=>{
 const tool=VIDEOS_SECRETS_TOOLS.find(x=>x.name==='plan_video_from_brief');
 assert.ok(tool);
 assert.deepEqual(tool.inputSchema.required,['brand','idea']);
 assert.deepEqual(tool.inputSchema.properties.voice_mode.enum,['auto','off','pt-BR-female','pt-BR-male']);
 assert.ok(VIDEOS_SECRETS_TOOLS.some(x=>x.name==='create_motion_video'));
});
