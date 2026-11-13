import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const python=process.env.FRAME_LAB_BOOTSTRAP_PYTHON||"python3";
function run(command,args) {
  const r=spawnSync(command,args,{cwd:here,stdio:"inherit",timeout:300_000});
  if(r.error||r.status!==0)throw new Error(command+" failed; Python/OpenCV deployment prerequisite is missing");
}
const interpreter=process.platform==="win32"?join(here,".venv","Scripts","python.exe"):
  join(here,".venv","bin","python");
if(!existsSync(interpreter))run(python,["-m","venv",join(here,".venv")]);
run(interpreter,["-m","pip","install","--no-input","--disable-pip-version-check","--no-cache-dir","-r","requirements.txt"]);
run(interpreter,["-c","import cv2,numpy;print('Frame Lab CV engine ready',cv2.__version__,numpy.__version__)"]);
