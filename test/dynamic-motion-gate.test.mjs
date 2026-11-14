import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDynamicMotionPlan,enforceDynamicMotionPlan} from '../src/motion/dynamic-motion-gate.mjs';
const valid=()=>({
 profile:'dynamic-motion-v1',durationSeconds:10,fps:60,intent:'FORJA motion ad',
 layers:[{id:'orbs',role:'background',depth:.2,movement:'tracking reactive glow'},{id:'phone',role:'midground',depth:1,movement:'camera rig'},{id:'cursor',role:'foreground',depth:1.7,movement:'UI interaction'}],
 beats:[{start:0,end:2.5,action:'exercise selected',stateBefore:'menu',stateAfter:'exercise'},
 {start:2.5,end:5,action:'record series',stateBefore:'exercise',stateAfter:'record'},
 {start:5,end:7.6,action:'start timer',stateBefore:'record',stateAfter:'timer'},
 {start:7.6,end:10,action:'CTA',stateBefore:'timer',stateAfter:'CTA'}],
 events:[{id:'a',start:0,duration:2,scope:'camera',kind:'push-in',target:'#stage'},
 {id:'b',start:.1,duration:1.8,scope:'ui',kind:'item-stagger',target:'#exercise'},
 {id:'c',start:1.9,duration:2,scope:'camera',kind:'tracking',target:'#stage'},
 {id:'d',start:2.1,duration:1.8,scope:'ui',kind:'click-update',target:'#button'},
 {id:'e',start:3.8,duration:2.1,scope:'scene',kind:'morph',target:'#carrier'},
 {id:'f',start:5.8,duration:2,scope:'ui',kind:'timer-progress',target:'#timer'},
 {id:'g',start:7.7,duration:1.1,scope:'foreground',kind:'logo-form',target:'#brand'}],
 transitions:[{at:2.3,duration:.3,kind:'match-cut',carrier:'#button',cause:'click',fromState:'exercise',toState:'record'},
 {at:5.8,duration:.3,kind:'morph',carrier:'#button',cause:'register',fromState:'record',toState:'timer'}],
 holds:[{start:8.8,end:10,reason:'CTA readability'}]
});
test('strong dynamic plan accepted with distinct depth, story, continuity',()=>{const x=validateDynamicMotionPlan(valid());assert.equal(x.ok,true,x.issues.join(' | '));assert.ok(x.metrics.cameraEvents>=2);});
test('rejects static slide show with bg pulse only',()=>{const x=valid();x.events=[{id:'fade',start:0,duration:10,scope:'background',kind:'decorative-pulse',target:'#glow'}];assert.equal(validateDynamicMotionPlan(x).ok,false)});
test('rejects near-static motion despite 60fps',()=>{const x=valid();x.events=x.events.map(e=>({...e,duration:.1}));const r=validateDynamicMotionPlan(x);assert.equal(r.ok,false);assert.ok(r.issues.some(i=>i.includes('gap')||i.includes('covers')))});
test('rejects transitions with no physical carrier',()=>{const x=valid();x.transitions[0].carrier='';assert.ok(validateDynamicMotionPlan(x).issues.some(i=>i.includes('carrier')))});
test('rejects generic crossfades',()=>{const x=valid();x.transitions[1].kind='fade-only';assert.ok(validateDynamicMotionPlan(x).issues.some(i=>i.includes('crossfade')))});
test('rejects single-layered scenes',()=>{const x=valid();x.layers=x.layers.slice(1);assert.ok(validateDynamicMotionPlan(x).issues.some(i=>i.includes('depth layers')))});
test('rejects too many artificial reading holds',()=>{const x=valid();x.holds=[{start:2,end:5,reason:'long logo hold'}];assert.ok(validateDynamicMotionPlan(x).issues.some(i=>i.includes('holds')))});
test('allows intentional CTA hold and does not force constant camera breathing',()=>{const r=validateDynamicMotionPlan(valid());assert.equal(r.ok,true);assert.equal(r.metrics.holdSeconds,1.2)});
test('rejects invalid JSON, non-sequential beats and duplicate event IDs',()=>{assert.equal(validateDynamicMotionPlan(null).ok,false);const x=valid();x.beats[1].start=3; x.events[1].id='a';const y=validateDynamicMotionPlan(x);assert.ok(y.issues.some(s=>s.includes('gap')));assert.ok(y.issues.some(s=>s.includes('unique id')))});
test('enforce emits code for renderer',()=>{const x=valid();x.transitions=[];assert.throws(()=>enforceDynamicMotionPlan(x),e=>e.code==='DYNAMIC_MOTION_GATE_FAILED')});
