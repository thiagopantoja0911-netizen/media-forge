#!/usr/bin/env node
/* Frame Lab Node 22 / OpenCV WebAssembly: analyze every decoded frame in native resolution.
   Dense flow, regional affine motion with fractional pixel estimates, per-frame easing curves.
   This is a measurement tool, not a guarantee of missing in-between frames or alpha recovery. */
import cvModule from "@techstark/opencv-js";
import { summarizeMotion } from "./motion-curves.mjs";
import sharp from "sharp";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "@derhuerst/ffprobe-static";
import { spawn, execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";

const execFile=promisify(execFileCb);
const ffmpeg=ffmpegStatic?.default||ffmpegStatic;
const ffprobe=ffprobeStatic?.path||ffprobeStatic?.default?.path||ffprobeStatic;
const maxFrames=Number(process.env.FRAME_LAB_MAX_FRAMES||12000);
const maxPixels=Number(process.env.FRAME_LAB_MAX_PIXELS||2073600);
const jpegQuality=Number(process.env.FRAME_LAB_WEBP_QUALITY||82);
const round=(v,d=5)=>Number.isFinite(v)?Number(v.toFixed(d)):null;
const avg=a=>a.reduce((s,v)=>s+v,0)/Math.max(1,a.length);
function median(arr){
  if(!arr.length)return 0;
  arr.sort((a,b)=>a-b);
  const m=arr.length>>1;
  return arr.length%2?arr[m]:(arr[m-1]+arr[m])*.5;
}
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function arg(name){const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];}
const ref=arg("--reference"),render=arg("--render"),dir=arg("--output");
if(!ref||!dir)throw new Error("--reference and --output required");
const root=resolve(dir);
await mkdir(root,{recursive:true});
const progressPath=join(root,"progress.json");
async function atomic(path,data){
  const temp=path+".part";
  await writeFile(temp,JSON.stringify(data));
  const {rename}=await import("node:fs/promises");
  await rename(temp,path);
}
async function progress(data){await atomic(progressPath,data);}
async function cvReady(){
  const module=await cvModule;
  if(module?.Mat)return module;
  return new Promise((ok,fail)=>{
    const timer=setTimeout(()=>fail(new Error("OpenCV WASM initialization timeout")),30000);
    module.onRuntimeInitialized=()=>{clearTimeout(timer);ok(module);};
  });
}
const cv=await cvReady();
if(typeof cv.calcOpticalFlowFarneback!=="function")
  throw new Error("OpenCV-WASM build is missing dense optical flow");
function grayFromRgb(rgb,w,h){
  const g=Buffer.allocUnsafe(w*h);
  for(let i=0,j=0;i<g.length;i++,j+=3)
    g[i]=(rgb[j]*77+rgb[j+1]*150+rgb[j+2]*29)>>8;
  return g;
}
async function probeVideo(path){
  const {stdout}=await execFile(ffprobe,[
    "-v","error","-select_streams","v:0","-show_entries",
    "stream=width,height,r_frame_rate,avg_frame_rate",
    "-of","json",path],{maxBuffer:2*1024*1024,timeout:15000});
  const stream=JSON.parse(stdout).streams?.[0];
  if(!stream)throw new Error("No video stream decoded");
  const w=Number(stream.width),h=Number(stream.height);
  if(!w||!h||w*h>maxPixels)throw new Error("Video resolution exceeds native analysis limit");
  function parseRate(r){const p=String(r||"30/1").split("/").map(Number);return p[0]/(p[1]||1)}
  const fps=parseRate(stream.avg_frame_rate||stream.r_frame_rate);
  let pts=[];
  try{
    const result=await execFile(ffprobe,[
      "-v","error","-select_streams","v:0",
      "-show_entries","frame=best_effort_timestamp_time","-of","json",path],
      {maxBuffer:12*1024*1024,timeout:40000});
    pts=JSON.parse(result.stdout).frames?.map(f=>Number(f.best_effort_timestamp_time))||[];
  }catch{}
  return {width:w,height:h,fps:Number.isFinite(fps)&&fps>0?fps:30,pts};
}
async function iterateRGB(path,meta,onFrame){
  const frameSize=meta.width*meta.height*3;
  const args=["-nostdin","-hide_banner","-loglevel","error",
    "-i",path,"-map","0:v:0","-vsync","0","-f","rawvideo","-pix_fmt","rgb24","pipe:1"];
  const proc=spawn(ffmpeg,args,{stdio:["ignore","pipe","pipe"]});
  let stderr="", count=0;
  proc.stderr.on("data",chunk=>{stderr=(stderr+String(chunk)).slice(-1000)});
  const done=new Promise((resolve,reject)=>{
    proc.on("error",reject);proc.on("close",code=>code===0?resolve():reject(new Error("FFmpeg error: "+stderr)));
  });
  let buf=Buffer.allocUnsafe(frameSize),offset=0;
  try{
    for await(const chunk of proc.stdout){
      let start=0;
      while(start<chunk.length){
        const n=Math.min(frameSize-offset,chunk.length-start);
        chunk.copy(buf,offset,start,start+n);start+=n;offset+=n;
        if(offset===frameSize){
          if(count>=maxFrames)throw new Error("Video exceeds configured frame limit");
          await onFrame(buf,count++);
          buf=Buffer.allocUnsafe(frameSize);offset=0;
        }
      }
    }
    await done;
  }catch(e){proc.kill("SIGKILL");throw e}
  if(offset)throw new Error("Partial video frame from FFmpeg");
  if(!count)throw new Error("FFmpeg decoded zero frames");
  return count;
}
function safeRect(obj,w,h){
  let x=clamp(Number(obj.x)||0,0,w-2),y=clamp(Number(obj.y)||0,0,h-2);
  return {x,y,w:clamp(Number(obj.w)||2,2,w-x),h:clamp(Number(obj.h)||2,2,h-y)};
}
function selectFlow(flow,w,h,x,y,ww,hh,desired=700){
  const pts=[],step=Math.max(1,Math.floor(Math.sqrt(ww*hh/desired)));
  const ix=Math.floor(clamp(x,0,w-1)),iy=Math.floor(clamp(y,0,h-1));
  const ex=clamp(Math.ceil(x+ww),0,w),ey=clamp(Math.ceil(y+hh),0,h);
  for(let yy=iy;yy<ey;yy+=step)for(let xx=ix;xx<ex;xx+=step){
    const pos=2*(yy*w+xx),dx=flow[pos],dy=flow[pos+1];
    if(Number.isFinite(dx)&&Number.isFinite(dy))
      pts.push({x:xx,y:yy,dx,dy});
  }
  return pts;
}
function solve3(A,b){
  const m=[[...A[0],b[0]],[...A[1],b[1]],[...A[2],b[2]]];
  for(let i=0;i<3;i++){
    let row=i;
    for(let j=i+1;j<3;j++)if(Math.abs(m[j][i])>Math.abs(m[row][i]))row=j;
    if(Math.abs(m[row][i])<1e-7)return null;
    if(row!==i){const tmp=m[row];m[row]=m[i];m[i]=tmp}
    const pivot=m[i][i];
    for(let k=i;k<4;k++)m[i][k]/=pivot;
    for(let j=0;j<3;j++)if(j!==i){
      const factor=m[j][i];
      for(let k=i;k<4;k++)m[j][k]-=factor*m[i][k];
    }
  }
  return m.map(row=>row[3]);
}
function fitAffine(points,cx,cy){
  if(points.length<6)return {dx:0,dy:0,rotation_deg:null,scale_x:null,
    scale_y:null,shear_proxy:null,deformation_residual_px:null,features:0,
    method:"no_texture"};
  let dx=median(points.map(p=>p.dx)),dy=median(points.map(p=>p.dy));
  const residuals=points.map(p=>Math.hypot(p.dx-dx,p.dy-dy));
  const threshold=Math.max(.28,2.8*median([...residuals]));
  let filtered=points.filter((p,i)=>residuals[i]<=threshold);
  if(filtered.length<6)filtered=points;
  const mat=[[0,0,0],[0,0,0],[0,0,0]],bx=[0,0,0],by=[0,0,0];
  for(const p of filtered){
    const ux=p.x-cx,uy=p.y-cy,v=[1,ux,uy];
    for(let i=0;i<3;i++){
      bx[i]+=v[i]*p.dx;by[i]+=v[i]*p.dy;
      for(let j=0;j<3;j++)mat[i][j]+=v[i]*v[j];
    }
  }
  const ax=solve3(mat,bx),ay=solve3(mat,by);
  if(!ax||!ay)return {dx:round(dx),dy:round(dy),rotation_deg:null,
    scale_x:null,scale_y:null,shear_proxy:null,deformation_residual_px:null,
    features:filtered.length,method:"flow_median_fallback"};
  dx=ax[0];dy=ay[0];
  const a=1+ax[1],b=ax[2],c=ay[1],d=1+ay[2];
  const errors=filtered.map(p=>{
    const u=p.x-cx,v=p.y-cy;
    return Math.hypot(p.dx-(ax[0]+ax[1]*u+ax[2]*v),
      p.dy-(ay[0]+ay[1]*u+ay[2]*v));
  });
  return {dx:round(dx),dy:round(dy),
    rotation_deg:round(Math.atan2(c,a)*180/Math.PI),
    scale_x:round(Math.hypot(a,b)),scale_y:round(Math.hypot(c,d)),
    shear_proxy:round(a*c+b*d),deformation_residual_px:round(median(errors)),
    features:filtered.length,
    inlier_ratio:round(filtered.length/points.length),
    method:"native_dense_subpixel_affine"};
}
function brightness(gray,w,h,rect){
  const x0=Math.floor(clamp(rect.x,0,w-1)),y0=Math.floor(clamp(rect.y,0,h-1));
  const x1=Math.ceil(clamp(rect.x+rect.w,0,w)),y1=Math.ceil(clamp(rect.y+rect.h,0,h));
  let sum=0,n=0;
  const step=Math.max(1,Math.floor(Math.sqrt((x1-x0)*(y1-y0)/700)));
  for(let y=y0;y<y1;y+=step)for(let x=x0;x<x1;x+=step){sum+=gray[y*w+x];n++;}
  return n?sum/n:0;
}
function flowProposals(flow,w,h,gx,gy){
  const tile=32,cols=Math.ceil(w/tile),rows=Math.ceil(h/tile);
  const data=new Uint8Array(cols*rows),movX=new Float32Array(cols*rows),movY=new Float32Array(cols*rows);
  for(let by=0;by<rows;by++)for(let bx=0;bx<cols;bx++){
    let dxs=[],dys=[];
    for(let y=by*tile+3;y<Math.min(h,(by+1)*tile);y+=5)
      for(let x=bx*tile+3;x<Math.min(w,(bx+1)*tile);x+=5){
        const j=2*(y*w+x);dxs.push(flow[j]);dys.push(flow[j+1]);
      }
    const dx=median(dxs),dy=median(dys),idx=by*cols+bx;
    movX[idx]=dx;movY[idx]=dy;
    if(Math.hypot(dx-gx,dy-gy)>.26)data[idx]=1;
  }
  const visited=new Uint8Array(data.length),out=[];
  for(let i=0;i<data.length;i++){
    if(!data[i]||visited[i])continue;
    const todo=[i],components=[];visited[i]=1;
    let loX=cols,loY=rows,hiX=0,hiY=0,fx=0,fy=0;
    while(todo.length){
      const p=todo.pop(),x=p%cols,y=Math.floor(p/cols);
      components.push(p);loX=Math.min(loX,x);loY=Math.min(loY,y);
      hiX=Math.max(hiX,x);hiY=Math.max(hiY,y);fx+=movX[p];fy+=movY[p];
      for(const d of [[0,-1],[0,1],[-1,0],[1,0]]){
        const nx=x+d[0],ny=y+d[1],j=ny*cols+nx;
        if(nx>=0&&nx<cols&&ny>=0&&ny<rows&&data[j]&&!visited[j]){
          visited[j]=1;todo.push(j);
        }
      }
    }
    if(components.length>=2)out.push({x:loX*tile,y:loY*tile,
      w:Math.min(w,(hiX+1)*tile)-loX*tile,
      h:Math.min(h,(hiY+1)*tile)-loY*tile,
      area:components.length*tile*tile,dx:round(fx/components.length),
      dy:round(fy/components.length),
      local_motion_px:round(Math.hypot(fx/components.length-gx,fy/components.length-gy))});
  }
  return out.sort((a,b)=>b.area-a.area).slice(0,36);
}
function motionHeatmap(flow,w,h){
  const rgb=Buffer.allocUnsafe(w*h*3);
  // Colored flow direction with logarithmic gain that exposes <1px displacement.
  for(let i=0;i<w*h;i++){
    const dx=flow[2*i],dy=flow[2*i+1],mag=Math.hypot(dx,dy);
    const hue=((Math.atan2(dy,dx)/(2*Math.PI))+1)%1;
    const v=clamp(Math.log1p(mag*12)/Math.log1p(72),0,1)*255;
    const step=Math.floor(hue*6)%6,frac=hue*6-step;
    const hi=v,lo=v*.12,up=lo+(hi-lo)*frac,down=hi-(hi-lo)*frac;
    let r,g,b;
    switch(step){
      case 0:[r,g,b]=[hi,up,lo];break;
      case 1:[r,g,b]=[down,hi,lo];break;
      case 2:[r,g,b]=[lo,hi,up];break;
      case 3:[r,g,b]=[lo,down,hi];break;
      case 4:[r,g,b]=[up,lo,hi];break;
      default:[r,g,b]=[hi,lo,down];
    }
    const j=i*3;rgb[j]=r;rgb[j+1]=g;rgb[j+2]=b;
  }
  return rgb;
}
async function webp(raw,w,h,path,quality=jpegQuality){
  await sharp(raw,{raw:{width:w,height:h,channels:3}})
    .webp({quality,effort:2}).toFile(path);
}
function motionFrom(cv,prev,next,w,h,objects,frameIndex){
  const a=new cv.Mat(h,w,cv.CV_8UC1),b=new cv.Mat(h,w,cv.CV_8UC1);
  a.data.set(prev);b.data.set(next);
  const out=new cv.Mat();
  try{
    cv.calcOpticalFlowFarneback(a,b,out,.5,4,15,4,7,1.5,0);
    const flow=out.data32F;
    const fx=[],fy=[],mags=[],resMags=[];
    const sample=Math.max(1,Math.floor(w*h/7000));
    for(let i=0;i<w*h;i+=sample){
      const x=flow[2*i],y=flow[2*i+1];
      fx.push(x);fy.push(y);mags.push(Math.hypot(x,y));
    }
    const gx=median(fx),gy=median(fy);
    let changed=0, sumLuma=0;
    const step=Math.max(1,Math.floor(w*h/10000));
    let measured=0;
    for(let i=0;i<w*h;i+=step){
      const diff=Math.abs(next[i]-prev[i]);sumLuma+=diff;
      if(diff>24)changed++;measured++;
    }
    let subpixel=0;
    for(let i=0;i<fx.length;i++){
      const mag=Math.hypot(fx[i],fy[i]);
      if(mag>.04&&mag<1)subpixel++;
      resMags.push(Math.hypot(fx[i]-gx,fy[i]-gy));
    }
    const med95=arr=>arr.length?arr.slice().sort((a,b)=>a-b)[Math.floor(.95*(arr.length-1))]:0;
    const tracks=[];
    for(const obj of objects){
      if(frameIndex<=obj.startFrame)continue;
      const rect=obj.rect,points=selectFlow(flow,w,h,rect.x,rect.y,rect.w,rect.h);
      const fit=fitAffine(points,rect.x+rect.w/2,rect.y+rect.h/2);
      const nextRect=safeRect({x:rect.x+(fit.dx||0),
        y:rect.y+(fit.dy||0),w:rect.w*(fit.scale_x||1),
        h:rect.h*(fit.scale_y||1)},w,h);
      fit.id=obj.id;fit.label=obj.label;
      fit.bbox=[round(nextRect.x),round(nextRect.y),round(nextRect.w),round(nextRect.h)];
      fit.brightness_delta=round(brightness(next,w,h,nextRect)-brightness(prev,w,h,rect));
      fit.opacity=null;obj.rect=nextRect;tracks.push(fit);
    }
    return {
      frame_mean_luma_diff:round(sumLuma/measured),
      changed_pixel_fraction:round(changed/measured),
      camera_dx_px:round(gx),camera_dy_px:round(gy),
      flow_mean_px:round(avg(mags)),flow_p95_px:round(med95(mags)),
      residual_mean_px:round(avg(resMags)),
      residual_p95_px:round(med95(resMags)),
      subpixel_motion_fraction:round(subpixel/fx.length),
      regions:flowProposals(flow,w,h,gx,gy),
      objects:tracks,heatmap:motionHeatmap(flow,w,h)
    };
  }finally{a.delete();b.delete();out.delete();}
}
function computeKinematics(rows,fps){
  const last=new Map();let cx=0,cy=0,vx=0,vy=0,ax=0,ay=0;
  for(let i=0;i<rows.length;i++){
    const row=rows[i],dt=i?Math.max(.00001,row.time_s-rows[i-1].time_s):1/fps;
    const dx=row.camera_dx_px||0,dy=row.camera_dy_px||0;
    cx+=dx;cy+=dy;
    const x=dx/dt,y=dy/dt,a=(x-vx)/dt,b=(y-vy)/dt;
    row.camera_kinematics={
      x_px:round(cx),y_px:round(cy),
      velocity_x_px_s:round(x),velocity_y_px_s:round(y),
      acceleration_x_px_s2:round(a),acceleration_y_px_s2:round(b),
      jerk_x_px_s3:round((a-ax)/dt),jerk_y_px_s3:round((b-ay)/dt)};
    vx=x;vy=y;ax=a;ay=b;
    for(const o of row.objects){
      const s=last.get(o.id)||{x:0,y:0,r:0,sx:1,sy:1,vx:0,vy:0,ax:0,ay:0};
      const odx=o.dx||0,ody=o.dy||0;
      s.x+=odx;s.y+=ody;s.r+=o.rotation_deg||0;
      s.sx*=o.scale_x||1;s.sy*=o.scale_y||1;
      const ox=odx/dt,oy=ody/dt,oa=(ox-s.vx)/dt,ob=(oy-s.vy)/dt;
      o.kinematics={
        x_px:round(s.x),y_px:round(s.y),rotation_deg:round(s.r),
        scale_x:round(s.sx),scale_y:round(s.sy),
        velocity_x_px_s:round(ox),velocity_y_px_s:round(oy),
        acceleration_x_px_s2:round(oa),acceleration_y_px_s2:round(ob),
        jerk_x_px_s3:round((oa-s.ax)/dt),jerk_y_px_s3:round((ob-s.ay)/dt)};
      s.vx=ox;s.vy=oy;s.ax=oa;s.ay=ob;last.set(o.id,s);
    }
  }
}
async function analyzeClip(path,kind,rois){
  const meta=await probeVideo(path),w=meta.width,h=meta.height;
  const folder=join(root,"frames_"+kind);
  await mkdir(folder,{recursive:true});
  const flowFolder=join(root,"frames_flow");
  if(kind==="reference")await mkdir(flowFolder,{recursive:true});
  const objects=(kind==="reference"?rois:[]).slice(0,40).map((o,i)=>({
    id:String(o.id||i).slice(0,60),label:String(o.label||"Objeto "+(i+1)).slice(0,100),
    startFrame:Math.max(0,Number(o.startFrame)||0),rect:safeRect(o,w,h)}));
  const rows=[];let prev=null;
  await iterateRGB(path,meta,async(rgb,i)=>{
    const name=String(i).padStart(6,"0")+".webp";
    await webp(rgb,w,h,join(folder,name));
    const gray=grayFromRgb(rgb,w,h);
    const t=Number.isFinite(meta.pts[i])?meta.pts[i]:i/meta.fps;
    const row={frame:i,time_s:round(t),objects:[]};
    if(prev){
      const metrics=motionFrom(cv,prev,gray,w,h,objects,i);
      const heat=metrics.heatmap;delete metrics.heatmap;
      Object.assign(row,metrics);
      if(kind==="reference")await webp(heat,w,h,join(flowFolder,name),78);
    }else{
      Object.assign(row,{frame_mean_luma_diff:0,changed_pixel_fraction:0,
        camera_dx_px:0,camera_dy_px:0,flow_mean_px:0,
        flow_p95_px:0,residual_mean_px:0,residual_p95_px:0,
        subpixel_motion_fraction:0,regions:[],objects:[]});
      if(kind==="reference")await webp(Buffer.alloc(w*h*3),w,h,join(flowFolder,name),78);
    }
    prev=gray;rows.push(row);
    if(i%10===0)await progress({status:"processing",stage:kind,processedFrames:i+1});
  });
  computeKinematics(rows,meta.fps);
  return {width:w,height:h,fps:round(meta.fps),frameCount:rows.length,
    timestampsFromFfprobe:meta.pts.length>=rows.length,
    duration_s:round(rows[rows.length-1].time_s+1/meta.fps),frames:rows};
}
async function compareFrames(source,target){
  if(!target)return [];
  const out=[];const times=target.frames.map(x=>x.time_s);
  const folder=join(root,"frames_diff");
  await mkdir(folder,{recursive:true});
  const w=source.width,h=source.height;
  for(const row of source.frames){
    let lo=0,hi=times.length-1;
    while(lo<hi){const m=(lo+hi)>>1;if(times[m]<row.time_s)lo=m+1;else hi=m}
    const ri=lo>0&&Math.abs(times[lo-1]-row.time_s)<Math.abs(times[lo]-row.time_s)?lo-1:lo;
    const name=String(row.frame).padStart(6,"0")+".webp";
    const a=await sharp(join(root,"frames_reference",name)).removeAlpha().raw().toBuffer();
    const b=await sharp(join(root,"frames_render",String(ri).padStart(6,"0")+".webp"))
      .resize(w,h,{fit:"fill"}).removeAlpha().raw().toBuffer();
    const diff=Buffer.allocUnsafe(w*h*3);
    let sum=0,metric=[];
    for(let i=0;i<w*h*3;i++){
      const d=Math.abs(a[i]-b[i]);sum+=d;
      if(i%40===0)metric.push(d);
      const outIdx=i-i%3;
      if(i%3===0){
        diff[outIdx]=Math.min(255,d*2.2);
        diff[outIdx+1]=Math.min(255,d*.8);
        diff[outIdx+2]=Math.min(255,30+d*.3);
      }
    }
    await webp(diff,w,h,join(folder,name),75);
    metric.sort((a,b)=>a-b);
    out.push({refFrame:row.frame,renderFrame:ri,
      timeDeltaMs:round((times[ri]-row.time_s)*1000),
      maeRgb:round(sum/(w*h*3)),
      p95AbsDiff:round(metric[Math.floor(metric.length*.95)]||0)});
    if(row.frame%10===0)await progress({status:"processing",stage:"comparison",
      processedFrames:row.frame+1,totalFrames:source.frames.length});
  }
  return out;
}
async function main(){
  const parent=dirname(root),rois=JSON.parse(await readFile(join(parent,"objects.json"),"utf8")).objects||[];
  const reference=await analyzeClip(ref,"reference",rois);
  const rendered=render?await analyzeClip(render,"render",[]):null;
  const comparison=await compareFrames(reference,rendered);
  const report={schemaVersion:"frame-lab-1.1",
    analysisMode:"every-decoded-frame-full-native-resolution-optical-flow",
    engine:"OpenCV-WASM on Node 22",
    limitations:[
      "No true temporal samples are available between the captured video frames.",
      "Subpixel optical flow is an estimate affected by compression, texture and blur.",
      "Exact transparency/alpha cannot be recovered from composited images.",
      "Automatic moving regions are proposals; stable object identity needs labeled ROIs.",
      "Paired renders are matched by nearest presentation timestamp, with per-frame timeDeltaMs."
    ],reference,render:rendered,comparison};
  report.reconstruction=summarizeMotion(report,{pixelTolerance:.25});
  await atomic(join(root,"report.json"),report);
  await progress({status:"completed",referenceFrames:reference.frameCount,
    renderFrames:rendered?.frameCount||0,comparedFrames:comparison.length});
  console.log(JSON.stringify({ok:true,frameCount:reference.frameCount,
    renderFrames:rendered?.frameCount||0,opencv:"WASM"}));
}
try{await main()}catch(e){
  await progress({status:"failed",error:String(e.message).slice(0,350)});
  console.error(e.stack||e.message);process.exitCode=1;
}
