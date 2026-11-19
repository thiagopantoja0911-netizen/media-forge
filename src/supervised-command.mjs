import {spawn} from "node:child_process";
import {createWriteStream} from "node:fs";
import {finished} from "node:stream/promises";
import {createFrameWatchdog,renderWatchdogBudgets} from "./render-watchdog.mjs";

const OUTPUT_TAIL=2_000_000;
function keepTail(previous,chunk){const next=previous+chunk;return next.length>OUTPUT_TAIL?next.slice(-OUTPUT_TAIL):next;}
function quoteWindowsArg(value){
  const text=String(value);
  if(text.length>0&&!/[\s"&|<>^]/.test(text))return text;
  return '"' + text.replace(/(\\*)"/g,"$1$1\\\"").replace(/(\\+)$/g,"$1$1") + '"';
}

function terminateTree(child) {
  if(!child.pid)return;
  if(process.platform==="win32"){
    // Only the subprocess tree belonging to this job, not all Chrome/Node processes.
    const killer=spawn("taskkill.exe",["/PID",String(child.pid),"/T","/F"],{windowsHide:true,stdio:"ignore"});
    killer.on("error",()=>child.kill());
    killer.on("close",code=>{if(code!==0)child.kill();});
  }else child.kill("SIGTERM");
}

export function runSupervisedCommand(command,args,cwd,diagnosticBase,{
  env=process.env,phase="check",totalFrames=null,onVerifiedFrame=()=>{},summarizeCheck=()=>"",signal=null
}={}){
  return new Promise((resolve,reject)=>{
    const isCmd=process.platform==="win32"&&command.toLowerCase().endsWith(".cmd");
    const spawnCommand=isCmd?(process.env.ComSpec||"cmd.exe"):command;
    const spawnArgs=isCmd?["/d","/s","/c",[command,...args].map(quoteWindowsArg).join(" ")]:args;
    const stdoutLog=createWriteStream(diagnosticBase+".stdout.log",{flags:"w"});
    const stderrLog=createWriteStream(diagnosticBase+".stderr.log",{flags:"w"});
    const startedAt=Date.now();
    const limits=renderWatchdogBudgets(env,phase);
    const tracker=phase==="render"
      ?createFrameWatchdog({totalFrames,startedAt,budgets:limits}):null;
    let stdout="",stderr="",watchdogError=null,spawnError=null,closed=false;
    const child=spawn(spawnCommand,spawnArgs,{cwd,shell:false,windowsHide:true,env:{...env,CI:"1"}});
    let forceKill=null;
    function stopFor(reason){
      if(watchdogError||closed)return;
      const state=tracker?.state||{};
      watchdogError=Object.assign(new Error(reason.message+": "+(state.framesCompleted??0)+"/"+(state.totalFrames??"unknown")+" frames. Diagnostics: "+diagnosticBase),{
        code:reason.code,
        recoverable:!["RENDER_HARD_TIMEOUT","JOB_CANCELLED"].includes(reason.code),
        retryable:!["RENDER_HARD_TIMEOUT","JOB_CANCELLED"].includes(reason.code),
        diagnostics:{stdout:diagnosticBase+".stdout.log",stderr:diagnosticBase+".stderr.log",
          framesCompleted:state.framesCompleted??null,totalFrames:state.totalFrames??null,lastFrameAt:state.lastFrameAt??null,
          startedAt:new Date(startedAt).toISOString(),reason:reason.code}
      });
      terminateTree(child);
      forceKill=setTimeout(()=>{if(!closed)child.kill("SIGKILL");},15_000);
      forceKill.unref?.();
    }
    const onAbort=()=>stopFor({code:"JOB_CANCELLED",message:"Usuario solicitou cancelamento deste render"});
    if(signal?.aborted)onAbort();
    else signal?.addEventListener("abort",onAbort,{once:true});
    const interval=setInterval(()=>{
      if(closed)return;
      const now=Date.now();
      if(phase==="check"&&now-startedAt>=limits.hardMs)
        stopFor({code:"HYPERFRAMES_CHECK_TIMEOUT",message:"HyperFrames preflight exceeded the time limit"});
      else if(tracker){
        const reason=tracker.inspect(now);
        if(reason)stopFor(reason);
      }
    },5_000);
    interval.unref?.();
    child.stdout.pipe(stdoutLog);
    child.stderr.pipe(stderrLog);
    function consume(chunk,isStderr){
      const text=chunk.toString("utf8");
      if(isStderr)stderr=keepTail(stderr,text);else stdout=keepTail(stdout,text);
      if(tracker){
        const observation=tracker.observe(text,Date.now(),isStderr?"stderr":"stdout");
        if(observation){
          try{Promise.resolve(onVerifiedFrame(observation)).catch(error=>console.warn("Frame progress report failed:",error.message));}
          catch(error){console.warn("Frame progress report failed:",error.message);}
        }
      }
    }
    child.stdout.on("data",chunk=>consume(chunk,false));
    child.stderr.on("data",chunk=>consume(chunk,true));
    child.on("error",error=>{spawnError=error;});
    child.on("close",async(code,signal)=>{
      closed=true;clearInterval(interval);if(forceKill)clearTimeout(forceKill);
      signal?.removeEventListener("abort",onAbort);
      await Promise.allSettled([finished(stdoutLog),finished(stderrLog)]);
      if(watchdogError){reject(watchdogError);return;}
      if(spawnError){reject(spawnError);return;}
      if(code===0){resolve({stdout,stderr,framesCompleted:tracker?.state.framesCompleted??null});return;}
      const summary=summarizeCheck(stdout);
      const error=new Error("HyperFrames exited with "+(signal?"signal "+signal:"code "+code)+
        (summary?": "+summary:stderr.trim()?": "+stderr.trim().slice(-2000):"")+". Full diagnostics: "+diagnosticBase);
      error.code="HYPERFRAMES_FAILED";
      error.exitCode=code;
      error.diagnostics={stdout:diagnosticBase+".stdout.log",stderr:diagnosticBase+".stderr.log",
        framesCompleted:tracker?.state.framesCompleted??null,totalFrames:tracker?.state.totalFrames??null};
      reject(error);
    });
  });
}
