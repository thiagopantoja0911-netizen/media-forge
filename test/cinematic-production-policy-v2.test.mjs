import test from "node:test";
import assert from "node:assert/strict";
import {
 CINEMATIC_PRODUCTION_POLICY,CINEMATIC_POLICY_VERSION,
 reviewCinematicPolicyV2,validateStudyUsage
} from "../src/cinematic-production-policy.mjs";
import {validateMotionPlan} from "../src/motion/plan.mjs";
import {buildCinematicCaptionTrack} from "../src/motion/captions.mjs";
import {buildCinematicSceneEffects} from "../src/motion/cinematic-effects.mjs";

function v2Fixture(){
  const lengths=[150,150,120,210,180,210,120,210];
  const types=["footage","footage","photo","footage","product","footage","photo","footage"];
  const transitions=["cut","whip","cut","dip","match-cut","whip","cut","dip"];
  let start=0;
  const scenes=lengths.map((length,i)=>{
    const type=types[i],sceneStart=start;
    start+=length;
    return {
      id:"scene-"+(i+1),type,startFrame:sceneStart,endFrame:start,
      headline:"Cena "+(i+1),detail:"Uma ação produz consequência",
      media:"assets/shot-"+(i+1)+(type==="footage"?".mp4":".jpg"),
      camera:i%2?"truck-left":"dolly-in",transition:transitions[i],
      narrativeAction:{
        voiceCue:"Fala sobre o gesto "+(i+1),
        subject:"Pessoa "+(i+1),
        action:"Realiza um gesto específico "+(i+1),
        visibleChange:"O enquadramento se transforma após a ação "+(i+1),
        stateBefore:"Antes do gesto "+(i+1),
        stateAfter:"Depois do gesto "+(i+1),
      },
      effects:{colorGrade:.52,bloom:i%2?.4:0,shadow:true,motionBlur:i%2?.5:0,
        microEffect:i===0?"impact":i===3?"light-sweep":undefined},
      events:[
        {id:"enter-"+(i+1),action:"enter",startFrame:0,peakFrame:12,endFrame:20},
        {id:"camera-"+(i+1),action:"camera",startFrame:25,peakFrame:45,endFrame:Math.min(120,length-5)}
      ]
    };
  });
  return {format:"mediaforge-motion-v1",productionMode:"cinematic",cinematicPolicyVersion:"v2",visualMode:"media-first",
    title:"Filme sobre ações e suas consequências",width:1080,height:1920,fps:30,totalFrames:1350,audioMode:"voice-led",
    scenes,captions:Array.from({length:15},(_,i)=>({
      startFrame:i*90,endFrame:(i+1)*90,text:"Fala sincronizada "+(i+1),
      emphasis:i===0?"sincronizada":undefined
    })),
    audioCues:[
      {id:"narration",role:"voice",src:"assets/voice.mp3",startFrame:0,endFrame:1350,volume:1,provenance:"Gravação própria"},
      {id:"score",role:"music",src:"assets/music.wav",startFrame:0,endFrame:1350,volume:.16,provenance:"Trilha original"},
      {id:"caption-pop",role:"sfx",src:"assets/pop.wav",startFrame:12,endFrame:25,volume:.4,provenance:"Original",eventId:"enter-1"},
      {id:"camera-whoosh",role:"sfx",src:"assets/whoosh.wav",startFrame:465,endFrame:480,volume:.35,provenance:"Original",eventId:"camera-4"},
    ]};
}

test("catalog has 40 unique permanent policy controls in five domains",()=>{
  const p=CINEMATIC_PRODUCTION_POLICY;
  assert.equal(p.version,CINEMATIC_POLICY_VERSION);
  assert.equal(p.controls.length,40);
  assert.equal(new Set(p.controls.map(c=>c.id)).size,40);
  assert.deepEqual([...new Set(p.controls.map(c=>c.group))],["narrative","image","editing","audio","quality"]);
  assert.equal(p.assetRules.flatVectorAsPrimaryScene,false);
  assert.equal(p.review.markFinalBeforeArtisticApproval,false);
});

test("cinematic v2 accepts a diverse real-footage narrative with captions, lighting and synced SFX",()=>{
  const plan=v2Fixture();
  const review=reviewCinematicPolicyV2(plan);
  assert.equal(review.ok,true,review.errors.join("; "));
  assert.ok(review.metrics.realMediaPct>=70);
  assert.ok(review.metrics.movingFootagePct>=50);
  assert.ok(review.metrics.captionSfx>=1);
  assert.ok(review.metrics.motionSfx>=1);
  assert.equal(validateMotionPlan(plan).ok,true,validateMotionPlan(plan).errors.join("; "));
});

test("cinematic v2 rejects generic vector card narratives, unbuilt story beats and missing sound",()=>{
  const plan=v2Fixture();
  plan.scenes[0].narrativeAction=null;
  plan.scenes[1].type="kinetic";
  plan.scenes[2].effects.microEffect=undefined;
  plan.scenes[3].effects.microEffect=undefined;
  plan.captions=[];
  plan.audioCues=plan.audioCues.filter(c=>c.role!=="sfx");
  const review=reviewCinematicPolicyV2(plan);
  assert.equal(review.ok,false);
  assert.match(review.errors.join(" | "),/ação real|microefeitos|legendas sincronizadas|efeito sonoro/);
});

test("existing saved cinematic plans can still be inspected without forcing migration",()=>{
  const plan=v2Fixture();delete plan.cinematicPolicyVersion;
  assert.equal(reviewCinematicPolicyV2(plan).enabled,false);
});

test("study is only an explicitly marked technical/preview workflow",()=>{
  assert.equal(validateStudyUsage({production_profile:"premium-motion-v1"}).ok,true);
  assert.equal(validateStudyUsage({production_profile:"study"}).ok,false);
  assert.equal(validateStudyUsage({production_profile:"study",study_purpose:"visual-prototype"}).previewOnly,true);
});

test("caption overlay is frame-timed and escapes HTML",()=>{
  const plan=v2Fixture();
  plan.captions[1].text='<script>alert("x")</script>';
  const track=buildCinematicCaptionTrack(plan);
  assert.equal(track.count,15);
  assert.match(track.html,/data-track-kind="captions"/);
  assert.match(track.html,/class="clip mf-caption"/);
  assert.ok(track.html.includes("&lt;script&gt;"));
  assert.ok(!track.html.includes('<script>alert'));
  assert.match(track.timeline,/timeline\.fromTo/);
  assert.match(track.css,/caption-emphasis/);
});

test("real media receive cinema-grade effects and deterministic micro accents",()=>{
  const plan=v2Fixture();
  const fx=buildCinematicSceneEffects(plan.scenes[3],plan);
  assert.equal(fx.enabled,true);
  assert.match(fx.overlay,/mf-fx-bloom/);
  assert.match(fx.overlay,/mf-fx-shadow/);
  assert.match(fx.overlay,/mf-fx-micro/);
  assert.match(fx.timeline,/tl\.fromTo/);
  assert.match(fx.mediaStyle,/contrast/);
  const legacy={...plan,cinematicPolicyVersion:null};
  assert.equal(buildCinematicSceneEffects(plan.scenes[0],legacy).enabled,false);
});

test("word-level subtitles animate only from supplied timestamps, without invented alignment",()=>{
  const p=v2Fixture();
  p.captions[0].text="Fala sincronizada 1";
  p.captions[0].words=[
    {text:"Fala",startFrame:0,endFrame:24},
    {text:"sincronizada",startFrame:24,endFrame:70},
    {text:"1",startFrame:70,endFrame:90},
  ];
  const track=buildCinematicCaptionTrack(p);
  assert.match(track.html,/mf-caption-word-1-1/);
  assert.match(track.timeline,/mf-caption-word-1-2/);
  assert.equal(reviewCinematicPolicyV2(p).ok,true);
  p.captions[0].words[1].startFrame=10;
  assert.match(reviewCinematicPolicyV2(p).errors.join(" "),/timestamps inválidos/);
});
