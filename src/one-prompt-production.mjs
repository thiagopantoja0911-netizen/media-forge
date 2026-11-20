// Converts a two-field request into a reproducible creative-production contract.
// This does not fabricate logos, testimonials, media bytes, or conversion measurements.
import {planFromShortBrief} from "./creative-director.mjs";
import { CINEMATIC_POLICY_VERSION, CINEMATIC_PRODUCTION_POLICY } from "./cinematic-production-policy.mjs";

const GOALS={
 sales:{mechanics:["relevant pain","observable mechanism","measurable consequence only if verified","risk reduction","clear invitation"],cta:"Conheça a solução",hook:"Show the observable problem and what changes"},
 likes:{mechanics:["familiar moment","surprise","visual transformation","reward","authentic question"],cta:"Qual detalhe você percebeu?",hook:"Show a surprising result immediately"},
 shares:{mechanics:["useful insight","clarity","real demonstration","social utility","natural invitation"],cta:"Compartilhe com quem pode aproveitar",hook:"Make the useful result visible before explanation"},
 awareness:{mechanics:["recognizable object","visual identity","brand association","recall","invitation"],cta:"Descubra mais",hook:"Make the brand subject distinctive"}
};
function optionalVoice(v,goal){
 if(v===undefined||v==="auto")return goal==="sales"||goal==="shares"?"pt-BR-natural":"off";
 if(["off","pt-BR-female","pt-BR-male"].includes(v))return v;
 throw Error("VOICE_MODE_UNSUPPORTED");
}
function sourceId(input){
 const validLogo=typeof input.logo_asset_path==="string"&&/^assets\/[a-z0-9/_-]+\.(png|jpg|webp)$/i.test(input.logo_asset_path);
 const validUrl=typeof input.brand_url==="string"&&/^https:\/\/[a-z0-9.-]+(?:\/[^\s]*)?$/i.test(input.brand_url);
 return {logo:validLogo?input.logo_asset_path:null,url:validUrl?input.brand_url:null};
}
export function buildOnePromptBlueprint(input={}){
 const original=planFromShortBrief(input);
 const goal=original.brief.goal;
 const goalSpec=GOALS[goal];
 const verified=sourceId(input);
 const voice=optionalVoice(input.voice_mode,goal);
 const verifiedClaims=original.claims.filter(c=>c.eligible);
 const unverifiedClaims=original.claims.filter(c=>!c.eligible);
 const shots=original.storyboard.map((shot,index)=>{
  const cue=index===2?"impact on motivated transition":index===4?"music resolution":index===0?"music opening":"sound only if action is visible";
  return {...shot,creativeGoal:goalSpec.mechanics[index],hero:{
   id:"hero-"+String(index+1),asset:"not-generated",kind:index===4?"real brand logo or clearly labeled illustrative":"real product/screen or original shot-specific visual",
   required:true,realCompanyProofRequired:index===3||index===4
  },cameraTarget:"hero-"+String(index+1),
  soundtrack:{kind:cue,startsAtSeconds:shot.start,generated:false},
  narration:voice==="off"?null:goalSpec.mechanics[index],
  continuation:index<4?"Visible object or cause carries into next scene":"Readable end-card; CTA must not be occluded",
  checklist:{assetPresent:false,audioPresent:false,reviewed:false}};
 });
 const assets=shots.map((s)=>({id:s.hero.id,kind:"visual",purpose:s.hero.kind,path:null,generated:false,rightsVerified:false}));
 for(const shot of shots)assets.push({id:"ambience-"+shot.id,kind:"ambience",purpose:"scene sound design: "+JSON.stringify(shot.shotSound||{}),path:null,generated:false,rightsVerified:false});
 assets.push({id:"music-bed",kind:"music",purpose:"licensed or original music for entire film",path:null,generated:false,rightsVerified:false});
 if(voice!=="off")assets.push({id:"narration",kind:"voice",purpose:"word-timestamped intelligible narration",path:null,generated:false,rightsVerified:false});
 for(let i=0;i<4;i++)assets.push({id:"sfx-"+String(i+1),kind:"sfx",purpose:"caused by a visible action; validate sound via FFprobe",path:null,generated:false,rightsVerified:false});
 if(!verified.logo)assets.push({id:"brand-logo",kind:"identity",purpose:"verified brand identity; never fabricate an official logo",path:null,generated:false,rightsVerified:false});
 return {
  version:"mediaforge-chat-one-prompt-v1",status:"production-plan-ready-not-rendered",
  cinematicPolicy:{version:CINEMATIC_POLICY_VERSION,controlCount:CINEMATIC_PRODUCTION_POLICY.controls.length,
    controls:original.cinematicPolicy.controls,
    minimumRealMediaShare:CINEMATIC_PRODUCTION_POLICY.limits.minRealMediaShare,
    minimumMovingFootageShare:CINEMATIC_PRODUCTION_POLICY.limits.minMovingFootageShare,
    flatVectorsAsPrimaryScene:false,mandatoryArtisticReview:true},
  storyArc:original.storyArc,assetManifest:original.assetManifest,
  brief:original.brief,
  creative:{goal,hook:goalSpec.hook,chosenApproach:original.decision.chosen,psychology:goalSpec.mechanics,
    cta:goalSpec.cta,conversionOrEngagementIsNotGuaranteed:true},
  alternatives:original.alternatives,storyboard:shots,assets,
  claims:{allowed:verifiedClaims,withheld:unverifiedClaims.map(c=>({text:c.text,reason:"Unverified source"}))},
  identity:{brandUrl:verified.url,logoPath:verified.logo,verified:false},
  audio:{voice,wordTimestampsRequired:voice!=="off",music:true,causalSfx:true,sceneAmbience:true,voiceDucking:true,
    targets:{integratedLufs:[-16,-14],truePeakDbtp:-1,wordSyncMs:100}},
  direction:{motionProfile:"dynamic-motion-v1",cinematicProfile:"cinematic-media-first-v2",previewSeconds:3,depthLayers:3,fullFilmAfterPreview:true,
    trueMotionBlur:"validated local HyperFrames shutter renderer",renderedFrameInspection:true,
    visualConstruction:"on-screen actions enact each narration beat",
    timedCaptionAndMovementSfx:true,filmGradingAndShadows:true,bloomAndMotionBlurWhenMotivated:true,
    requirements:["camera with a clear target","three depth layers with independent movement","object-caused scene transitions",
      "no generic cards or placeholders","no long static holds without narrative reason","CTA unobstructed",
      "no invented statistics, testimonials, pricing or scarcity"]},
  readiness:{storyboard:true,mediaAssetsReady:false,soundAssetsReady:false,hyperframesProjectReady:false,
    technicalQA:false,artisticQA:false,verifiedCompanyAssets:!!verified.url&&!!verified.logo},
  delivery:{expected:["MP4","editable project","media manifest","technical QA","audio QA","human artistic approval"],performed:false,finalBlockedUntilHumanReview:true},
  nextActions:["verify brand and factual claims","source/generate real specific visual and audio files",
    "build editable HyperFrames composition","run 3-second visual preview","check motion and sound",
    "render on Windows","review complete MP4","deliver only after approval"]
 };
}
