import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const FFT_SIZE=1024,HOP_SIZE=256,MIN_BPM=60,MAX_BPM=180;
const failure=(code,message)=>Object.assign(new Error(message),{code,status:422});

function fft(real,imag){
  const n=real.length;
  for(let i=1,j=0;i<n;i++){
    let bit=n>>1;
    for(;j&bit;bit>>=1)j^=bit;
    j^=bit;
    if(i<j){
      [real[i],real[j]]=[real[j],real[i]];
      [imag[i],imag[j]]=[imag[j],imag[i]];
    }
  }
  for(let length=2;length<=n;length<<=1){
    const angle=-2*Math.PI/length,stepR=Math.cos(angle),stepI=Math.sin(angle);
    for(let offset=0;offset<n;offset+=length){
      let wr=1,wi=0;
      for(let j=0;j<length/2;j++){
        const even=offset+j,odd=even+length/2;
        const vr=real[odd]*wr-imag[odd]*wi,vi=real[odd]*wi+imag[odd]*wr;
        const ur=real[even],ui=imag[even];
        real[even]=ur+vr;imag[even]=ui+vi;
        real[odd]=ur-vr;imag[odd]=ui-vi;
        const next=wr*stepR-wi*stepI;
        wi=wr*stepI+wi*stepR;wr=next;
      }
    }
  }
}

export function analyzePcmForBeats(samples,sampleRate=22050){
  if(!samples||!Number.isInteger(samples.length)||!Number.isFinite(sampleRate)||sampleRate<8000)
    throw failure("BEAT_AUDIO_INVALID","Áudio decodificado inválido.");
  if(samples.length<sampleRate*4)
    throw failure("BEAT_AUDIO_TOO_SHORT","A música precisa ter pelo menos quatro segundos para detectar o BPM.");
  let square=0;
  for(let i=0;i<samples.length;i++){const v=Number(samples[i])||0;square+=v*v;}
  const rms=Math.sqrt(square/samples.length);
  if(rms<.00015)throw failure("BEAT_AUDIO_SILENT","A faixa está silenciosa ou com volume muito baixo.");

  const frameCount=Math.floor((samples.length-FFT_SIZE)/HOP_SIZE)+1;
  if(frameCount<64)throw failure("BEAT_AUDIO_TOO_SHORT","Não há áudio suficiente para analisar o ritmo.");
  const real=new Float64Array(FFT_SIZE),imag=new Float64Array(FFT_SIZE);
  const previous=new Float64Array(FFT_SIZE/2+1),flux=new Float64Array(frameCount);
  const window=Float64Array.from({length:FFT_SIZE},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/(FFT_SIZE-1)));
  for(let frame=0;frame<frameCount;frame++){
    const start=frame*HOP_SIZE;
    for(let i=0;i<FFT_SIZE;i++){real[i]=(Number(samples[start+i])||0)*window[i];imag[i]=0;}
    fft(real,imag);
    let novelty=0;
    for(let bin=2;bin<FFT_SIZE/2;bin++){
      const magnitude=Math.hypot(real[bin],imag[bin]);
      if(magnitude>previous[bin])novelty+=magnitude-previous[bin];
      previous[bin]=magnitude;
    }
    flux[frame]=novelty;
  }
  let mean=0;
  for(let i=0;i<frameCount;i++)mean+=flux[i];
  mean/=frameCount;
  const onset=new Float64Array(frameCount);
  let energy=0;
  for(let i=0;i<frameCount;i++){
    const smooth=(flux[Math.max(0,i-1)]+2*flux[i]+flux[Math.min(frameCount-1,i+1)])/4;
    const value=Math.max(0,smooth-mean*.72);
    onset[i]=value;energy+=value*value;
  }
  if(energy<1e-8)throw failure("BEAT_ANALYSIS_UNCLEAR","Não foi possível identificar ataques rítmicos claros nesta faixa.");

  const framesPerSecond=sampleRate/HOP_SIZE;
  const minLag=Math.max(2,Math.floor(framesPerSecond*60/MAX_BPM));
  const maxLag=Math.min(Math.ceil(framesPerSecond*60/MIN_BPM),Math.floor(frameCount/4));
  const correlations=new Float64Array(maxLag*3+1);
  for(let lag=1;lag<correlations.length;lag++){
    let sum=0;
    for(let i=lag;i<frameCount;i++)sum+=onset[i]*onset[i-lag];
    correlations[lag]=sum/energy;
  }
  let bestLag=0,bestScore=-1,bestCorrelation=0;
  for(let lag=minLag;lag<=maxLag;lag++){
    const correlation=correlations[lag];
    const harmonic=correlations[lag*2]*.35+correlations[lag*3]*.15;
    const bpm=60*framesPerSecond/lag;
    const score=(correlation+harmonic)*(1-Math.abs(Math.log2(bpm/120))*.001);
    if(score>bestScore+1e-10||(Math.abs(score-bestScore)<=1e-10&&Math.abs(bpm-120)<Math.abs(60*framesPerSecond/bestLag-120))){
      bestLag=lag;bestScore=score;bestCorrelation=correlation;
    }
  }
  if(!bestLag||bestCorrelation<.035)
    throw failure("BEAT_ANALYSIS_UNCLEAR","A análise não encontrou uma pulsação estável entre 60 e 180 BPM.");

  let phase=0,phaseScore=-1;
  for(let offset=0;offset<bestLag;offset++){
    let score=0,count=0;
    for(let i=offset;i<frameCount;i+=bestLag){score+=onset[i];count++;}
    score/=Math.max(1,count);
    if(score>phaseScore){phaseScore=score;phase=offset;}
  }
  const intervalSeconds=bestLag*HOP_SIZE/sampleRate;
  const beatTimes=[];
  for(let frame=phase;frame<frameCount;frame+=bestLag)
    beatTimes.push(Number((frame*HOP_SIZE/sampleRate).toFixed(4)));
  if(beatTimes.length<4)
    throw failure("BEAT_ANALYSIS_UNCLEAR","Foram encontrados poucos pulsos para sincronizar a timeline.");
  return {
    bpm:Number((60/intervalSeconds).toFixed(2)),
    confidence:Number(Math.max(0,Math.min(1,bestCorrelation)).toFixed(3)),
    beatIntervalSeconds:Number(intervalSeconds.toFixed(5)),
    firstBeatSeconds:beatTimes[0],
    beatTimes,
    durationSeconds:Number((samples.length/sampleRate).toFixed(3)),
    sampleRate
  };
}

export function synchronizeSceneCutsToBeats(project,analysis,track){
  const fps=project?.fps,total=project?.totalFrames,scenes=project?.scenes;
  if(!Number.isInteger(fps)||!Number.isInteger(total)||!Array.isArray(scenes)||scenes.length<2)
    throw failure("BEAT_SYNC_PROJECT_INVALID","Projeto sem cenas suficientes para sincronização.");
  if(!Array.isArray(analysis?.beatTimes)||!Number.isFinite(analysis.beatIntervalSeconds)||analysis.beatIntervalSeconds<=0)
    throw failure("BEAT_SYNC_GRID_INVALID","Grade de batidas inválida.");
  const startFrame=Number(track?.startFrame)||0,endFrame=Number(track?.endFrame)||total;
  const beatFrames=[...new Set(analysis.beatTimes.map(t=>Math.round(startFrame+t*fps))
    .filter(frame=>Number.isInteger(frame)&&frame>=startFrame&&frame<=endFrame&&frame>0&&frame<total))].sort((a,b)=>a-b);
  if(!beatFrames.length)throw failure("BEAT_SYNC_NO_BEATS","Nenhuma batida útil foi encontrada dentro do trecho da música.");
  const beatSet=new Set(beatFrames),minFrames=fps;
  const maxShiftFrames=Math.max(1,Math.round(Math.min(.35,analysis.beatIntervalSeconds*.48)*fps));
  const original=scenes.slice(0,-1).map(s=>s.endFrame);
  let states=[{frame:0,cost:0,path:[]}];
  for(let i=0;i<original.length;i++){
    const lower=(i+1)*minFrames;
    const upper=total-(scenes.length-i-1)*minFrames;
    const target=original[i],candidates=new Map([[target,{frame:target,cost:maxShiftFrames*maxShiftFrames*1.01,beat:false}]]);
    for(const frame of beatFrames){
      if(Math.abs(frame-target)<=maxShiftFrames&&frame>=lower&&frame<=upper)
        candidates.set(frame,{frame,cost:(frame-target)**2,beat:true});
    }
    const next=[];
    for(const candidate of candidates.values()){
      if(candidate.frame<lower||candidate.frame>upper)continue;
      let best=null;
      for(const previous of states){
        if(candidate.frame-previous.frame<minFrames)continue;
        const cost=previous.cost+candidate.cost;
        if(!best||cost<best.cost)best={frame:candidate.frame,cost,path:[...previous.path,{frame:candidate.frame,beat:candidate.beat}]};
      }
      if(best)next.push(best);
    }
    if(!next.length)throw failure("BEAT_SYNC_CONSTRAINTS","Não foi possível alinhar os cortes sem criar cenas menores que um segundo.");
    states=next;
  }
  states.sort((a,b)=>a.cost-b.cost);
  const selected=states[0].path;
  const syncedCuts=selected.filter(v=>v.beat).length;
  if(!syncedCuts)throw failure("BEAT_SYNC_NO_CUTS","Nenhum corte ficou próximo o bastante de uma batida. Confira a música e tente novamente.");
  const cuts=selected.map(v=>v.frame),nextScenes=[];
  let cursor=0;
  for(let i=0;i<scenes.length;i++){
    const end=i<cuts.length?cuts[i]:total;
    nextScenes.push({...scenes[i],startFrame:cursor,endFrame:end});
    cursor=end;
  }
  const offsets=cuts.map((frame,i)=>frame-original[i]);
  const nextProject={...project,scenes:nextScenes,beatSync:{
    audioId:track.id,audioAssetId:track.assetId,bpm:analysis.bpm,confidence:analysis.confidence,
    beatIntervalSeconds:analysis.beatIntervalSeconds,syncedCuts,totalCuts:cuts.length,
    cutFrames:cuts,offsetFrames:offsets
  }};
  return {project:nextProject,syncedCuts,totalCuts:cuts.length,cutFrames:cuts,offsetFrames:offsets,
    maxShiftSeconds:Number((maxShiftFrames/fps).toFixed(3))};
}

export async function decodeAudioToPcm(buffer,{sampleRate=22050,maxSeconds=60,timeoutMs=25000}={}){
  const binary=typeof ffmpegPath==="string"?ffmpegPath:ffmpegPath?.default;
  if(!binary)throw failure("BEAT_DECODER_UNAVAILABLE","FFmpeg não está disponível no servidor.");
  if(!Buffer.isBuffer(buffer)||buffer.length<32)
    throw failure("BEAT_AUDIO_INVALID","Arquivo de áudio inválido para análise.");
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,["-hide_banner","-loglevel","error","-nostdin","-i","pipe:0",
      "-map","0:a:0","-vn","-ac","1","-ar",String(sampleRate),"-t",String(maxSeconds),"-f","f32le","pipe:1"],
      {windowsHide:true,stdio:["pipe","pipe","pipe"]});
    const chunks=[];let bytes=0,stderr="",settled=false;
    const finish=(error,value)=>{
      if(settled)return;settled=true;clearTimeout(timer);
      if(error)reject(error);else resolve(value);
    };
    const timer=setTimeout(()=>{child.kill();finish(failure("BEAT_DECODE_TIMEOUT","A decodificação de áudio excedeu o limite de tempo."));},timeoutMs);
    child.stdout.on("data",chunk=>{
      bytes+=chunk.length;
      if(bytes>sampleRate*maxSeconds*4+4){child.kill();finish(failure("BEAT_AUDIO_TOO_LONG","O áudio decodificado ultrapassou o limite de análise."));return;}
      chunks.push(chunk);
    });
    child.stderr.on("data",chunk=>{stderr=(stderr+chunk.toString()).slice(-3000);});
    child.on("error",error=>finish(failure("BEAT_DECODER_FAILED",error.message)));
    child.on("close",code=>{
      if(settled)return;
      if(code!==0){finish(failure("BEAT_DECODE_FAILED",stderr.trim()||"FFmpeg não conseguiu decodificar a faixa."));return;}
      const raw=Buffer.concat(chunks);
      const count=Math.floor(raw.length/4);
      if(count<sampleRate*4){finish(failure("BEAT_AUDIO_TOO_SHORT","A faixa decodificada tem menos de quatro segundos."));return;}
      const samples=new Float32Array(count);
      for(let i=0;i<count;i++)samples[i]=raw.readFloatLE(i*4);
      finish(null,samples);
    });
    child.stdin.on("error",()=>{});
    child.stdin.end(buffer);
  });
}
