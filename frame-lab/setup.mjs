import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const bootstrap=process.env.FRAME_LAB_BOOTSTRAP_PYTHON||"python3";
const venv=join(here,".venv");
const interpreter=process.platform==="win32"?join(venv,"Scripts","python.exe"):join(venv,"bin","python");
function tryRun(command,args,timeout=240000){
  const r=spawnSync(command,args,{cwd:here,encoding:"utf8",timeout});
  if(r.stdout)process.stdout.write(r.stdout.slice(-7000));
  if(r.stderr)process.stderr.write(r.stderr.slice(-3500));
  return r.status===0&&!r.error;
}
if(tryRun(bootstrap,["-c","import cv2,numpy; print('Frame Lab: system OpenCV ready',cv2.__version__)"])){
  console.log("Frame Lab: using system Python/OpenCV");
  process.exit(0);
}
console.log("Frame Lab: checking isolated Python environment (without ensurepip).");
if(!existsSync(interpreter)){
  if(!tryRun(bootstrap,["-m","venv","--copies","--without-pip",venv]))
    throw new Error("Host does not permit Python isolated environment");
}
if(!tryRun(interpreter,["-m","pip","--version"])){
  const url="https://bootstrap.pypa.io/get-pip.py";
  console.log("Frame Lab: installing pip into isolated virtual environment");
  const r=await fetch(url,{signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw new Error("pip bootstrap HTTP "+r.status);
  const script=join(here,".bootstrap-pip-"+process.pid+".py");
  try{
    writeFileSync(script,Buffer.from(await r.arrayBuffer()));
    if(!tryRun(interpreter,[script,"--no-warn-script-location"],240000))
      throw new Error("pip bootstrap failed in isolated Python environment");
  }finally{try{unlinkSync(script)}catch{}}
}
if(!tryRun(interpreter,["-m","pip","install","--no-input","--disable-pip-version-check","--no-cache-dir","-r","requirements.txt"],300000))
  throw new Error("OpenCV requirements failed to install");
if(!tryRun(interpreter,["-c","import cv2,numpy; print('Frame Lab CV engine ready',cv2.__version__,numpy.__version__)"]))
  throw new Error("OpenCV unavailable after installation");
