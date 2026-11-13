import test from "node:test";
import assert from "node:assert/strict";
import {smoothSamples,simplifyKeyframes,summarizeMotion} from "../motion-curves.mjs";
test("no video frame skipping: smoothing is separate; simplification retains boundaries",()=>{
 const values=[0,.1,.2,.3,.4,.5,.6];
 const sm=smoothSamples(values);
 assert.equal(sm.length,values.length);
 assert.equal(values[0],0);
 assert.equal(sm[3],.3);
 const frames=values.map((x,i)=>({frame:i,time_s:i/30,x_px:x,y_px:x*.2}));
 const f=simplifyKeyframes(frames,[["x_px",1],["y_px",1]],.01);
 assert.deepEqual(f,[0,6]);
});
test("layer plan contains actual frame data and proposed easing, not invented motion",()=>{
 const frames=Array.from({length:8},(_,i)=>{
   const p=Math.pow(i/7,2)*(3-2*i/7), x=p*24;
   return {
     frame:i,time_s:i/30,objects:i===0?[]:[{id:"card",label:"Micro card",
       dx:x-(Math.pow((i-1)/7,2)*(3-2*(i-1)/7))*24,dy:0,
       shear_proxy:0,brightness_delta:.03,inlier_ratio:.97,
       bbox:[30+x,10,40,24],
       kinematics:{x_px:x,y_px:0,rotation_deg:0,scale_x:1,scale_y:1}
     }],
     regions:[],
     camera_kinematics:{x_px:.2*i,y_px:0},
     frame_mean_luma_diff:i===4?45:2,
     changed_pixel_fraction:i===4?.7:.04
   };
 });
 const report={reference:{frameCount:8,width:192,height:108,frames}};
 const res=summarizeMotion(report);
 assert.equal(res.referenceFrameCount,8);
 assert.equal(res.interpolatedFrames,0);
 assert.equal(res.camera.rawSampleCount,8);
 assert.equal(res.objects[0].rawSampleCount,7);
 assert.equal(res.objects[0].rawSamples.at(-1).frame,7);
 assert.equal(res.objects[0].rawSamples.length,7);
 assert.equal(res.sceneCuts.length,1);
 assert.equal(res.sceneCuts[0].frame,4);
 assert.ok(res.objects[0].keyframes.length>=2);
 assert.ok(res.objects[0].segments.every(x=>x.estimatedEase));
});
test("relative region identity persists when a moving object drifts",()=>{
 const frames=Array.from({length:5},(_,i)=>({
   frame:i,time_s:i/30,objects:[],
   camera_kinematics:{x_px:0,y_px:0},
   regions:i?[
     {x:22+i,y:25,w:40,h:32,area:900,dx:1,dy:0,local_motion_px:1}
   ]:[],
   frame_mean_luma_diff:1,changed_pixel_fraction:.04
 }));
 const res=summarizeMotion({reference:{frameCount:5,width:120,height:80,frames}});
 assert.equal(res.automaticLayers.length,1);
 assert.equal(res.automaticLayers[0].samples.length,4);
 assert.equal(res.automaticLayers[0].firstFrame,1);
 assert.equal(res.automaticLayers[0].lastFrame,4);
});
