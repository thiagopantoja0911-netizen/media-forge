import test from "node:test";
import assert from "node:assert/strict";
import { validateProbeData } from "../src/renderers/verify-video.mjs";

const project={aspectRatio:"9:16",resolution:"portrait-4k",fps:60,durationSeconds:20};
const good={streams:[
  {codec_type:"video",codec_name:"h264",width:2160,height:3840,avg_frame_rate:"60/1",r_frame_rate:"60/1"},
  {codec_type:"audio",codec_name:"aac",sample_rate:"48000",channels:2}
],format:{duration:"20.02",format_name:"mov,mp4,m4a,3gp,3g2,mj2"}};

test("FFprobe audit accepts 4K60 output and records audio",()=>{
  const report=validateProbeData(good,project);
  assert.equal(report.width,2160);assert.equal(report.height,3840);
  assert.equal(report.fps,60);assert.equal(report.audioPresent,true);
  assert.equal(report.videoCodec,"h264");
});
test("FFprobe audit rejects a silent resolution downgrade",()=>{
  assert.throws(()=>validateProbeData({...good,streams:good.streams.map(s=>s.codec_type==="video"?{...s,width:1080,height:1920}:s)},project),/Resolução final divergente/);
});
test("FFprobe audit rejects wrong FPS",()=>{
  assert.throws(()=>validateProbeData({...good,streams:good.streams.map(s=>s.codec_type==="video"?{...s,avg_frame_rate:"30/1",r_frame_rate:"30/1"}:s)},project),/FPS final divergente/);
});
test("FFprobe audit rejects missing video and invalid duration",()=>{
  assert.throws(()=>validateProbeData({streams:[{codec_type:"audio"}],format:{duration:"20"}},project),/não contém stream de vídeo/);
  assert.throws(()=>validateProbeData({...good,format:{duration:"0"}},project),/Duração do MP4/);
});
