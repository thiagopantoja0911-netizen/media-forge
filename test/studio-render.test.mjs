import test from "node:test";
import assert from "node:assert/strict";
import { handleStudioApi } from "../src/studio-api.mjs";

const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082", "hex");
const sceneMedia={filename:"scene.png",mimeType:"image/png",sizeBytes:png.length,contentBase64:png.toString("base64")};
const voice={filename:"narration.wav",mimeType:"audio/wav",sizeBytes:4,contentBase64:Buffer.from("RIFF").toString("base64"),durationSeconds:15};
const data={
  version:1,title:"Forge controlled render",topic:"A dramatic product demonstration",
  duration:"15",intent:"demonstracao",tone:"direto",hookA:"Veja isso",hookB:"O que mudou?",hookC:"Antes e depois",
  selectedHook:"hookA",
  scenes:Array.from({length:5},(_,i)=>({spoken:"Fala "+i,onscreen:"Cena "+i,action:"Objeto movendo no espaço",sound:""})),
  mediaAssets:{scenes:Array.from({length:5},()=>sceneMedia),sfx:Array(5).fill(null),voiceover:voice,music:null}
};
function response(){return {
  status:null,body:null,headers:{},
  writeHead(status,headers={}){this.status=status;this.headers=headers;},
  end(body){this.body=body;}
};}
async function send(raw,options={}){
 const res=response();
 let queued=0;
 const created=[];
 await handleStudioApi({
   request:{method:"POST",url:"/api/studio/render",
     headers:{host:"mediaforge.salevo.site",origin:"https://mediaforge.salevo.site",
       "sec-fetch-site":"same-origin","content-type":"application/json"}},
   response:res,
   isAdminSession:async()=>options.authorized!==false,
   parseBody:async()=>raw,
   createJob:async(input)=>{queued++;created.push(input);return{id:"a".repeat(32),status:"queued"};}
 });
 return {res,body:JSON.parse(res.body),queued,created};
}
test("controlled render rejects missing confirmation and does not queue",async()=>{
 const result=await send(data);
 assert.equal(result.res.status,428);
 assert.equal(result.queued,0);
});
test("controlled render rejects unfinished scenes and does not queue",async()=>{
 const result=await send({...data,confirmControlledRender:true,mediaAssets:{...data.mediaAssets,scenes:[sceneMedia,null,null,null,null]}});
 assert.equal(result.res.status,422);
 assert.equal(result.body.error,"CREATIVE_ASSETS_REQUIRED");
 assert.equal(result.queued,0);
});
test("controlled render requires an authenticated same-origin request",async()=>{
 const result=await send({...data,confirmControlledRender:true},{authorized:false});
 assert.equal(result.res.status,401);
 assert.equal(result.queued,0);
});
test("five licensed visuals and narration authorize a test job but not final approval",async()=>{
 const result=await send({...data,confirmControlledRender:true});
 assert.equal(result.res.status,202);
 assert.equal(result.body.jobId,"a".repeat(32));
 assert.equal(result.body.readiness.renderReady,false);
 assert.equal(result.queued,1);
 assert.equal(result.created[0].metadata.mode,"controlled-test");
 assert.equal(result.created[0].metadata.expectsAudio,true);
 assert.equal(result.created[0].projectFiles.filter(f=>f.path.startsWith("assets/scenes/")).length,5);
});
test("studio job status endpoint requires ownership and admin login",async()=>{
 const jobId="a".repeat(32);const res=response();
 await handleStudioApi({
   request:{method:"GET",url:"/api/studio/jobs/"+jobId,headers:{}},
   response:res,isAdminSession:async()=>true,getJob:async()=>({
     id:jobId,metadata:{source:"forge-midjourney-studio",mode:"controlled-test"},
     status:"completed",progress:100,result:{outputPath:"C:\\Videos\\movie.mp4",report:{technicalQA:{status:"passed"}}}
   })
 });
 assert.equal(res.status,200);
 assert.equal(JSON.parse(res.body).job.result.report.technicalQA.status,"passed");
 const blocked=response();
 await handleStudioApi({
   request:{method:"GET",url:"/api/studio/jobs/"+jobId,headers:{}},
   response:blocked,isAdminSession:async()=>true,getJob:async()=>({id:jobId,metadata:{source:"other"}})
 });
 assert.equal(blocked.status,404);
});
