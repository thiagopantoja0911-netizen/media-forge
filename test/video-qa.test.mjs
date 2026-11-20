import test from "node:test";
import assert from "node:assert/strict";
import { evaluateVideoProbe } from "../src/video-qa.mjs";

const good={format:{duration:"15.03"},streams:[
{codec_type:"video",codec_name:"h264",width:2160,height:3840,avg_frame_rate:"60/1"},
{codec_type:"audio",codec_name:"aac"}
]};
test("4K60 15sec with audio passes technical gate only",()=>{
 const result=evaluateVideoProbe(good,{resolution:"portrait-4k",fps:60,durationSeconds:15},true);
 assert.equal(result.status,"passed");
 assert.equal(result.artisticReview,"pending");
 assert.equal(result.fps,60);
});
test("wrong resolution, FPS, duration and missing audio fail",()=>{
 const result=evaluateVideoProbe({format:{duration:"12"},streams:[{codec_type:"video",width:1080,height:1920,avg_frame_rate:"30/1"}]},
 {resolution:"portrait-4k",fps:60,durationSeconds:15},true);
 assert.equal(result.status,"failed");
 assert.equal(result.issues.length,4);
});

test("explicit motion-plan dimensions take precedence over generic 1080p alias",()=>{
 const result=evaluateVideoProbe({format:{duration:"15.03"},streams:[
  {codec_type:"video",codec_name:"h264",width:1080,height:1920,avg_frame_rate:"30/1"},
  {codec_type:"audio",codec_name:"aac"}
 ]},{resolution:"1080p",width:1080,height:1920,fps:30,durationSeconds:15},true);
 assert.equal(result.status,"passed");
 assert.equal(result.width,1080);
 assert.equal(result.height,1920);
});

test("explicit motion-plan dimensions still reject the wrong orientation",()=>{
 const result=evaluateVideoProbe({format:{duration:"15.03"},streams:[
  {codec_type:"video",codec_name:"h264",width:1920,height:1080,avg_frame_rate:"30/1"},
  {codec_type:"audio",codec_name:"aac"}
 ]},{resolution:"1080p",width:1080,height:1920,fps:30,durationSeconds:15},true);
 assert.equal(result.status,"failed");
 assert.ok(result.issues.includes("Resolução diferente de 1080x1920"));
});
