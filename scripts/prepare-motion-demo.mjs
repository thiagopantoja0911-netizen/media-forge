import { mkdir, writeFile, copyFile, access } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
const root=resolve('examples/forja-p0p1p2/assets');await mkdir(root,{recursive:true});
function saveWav(name,seconds,kind){
 const sr=22050, len=Math.round(sr*seconds), out=Buffer.alloc(44+len*2);
 out.write('RIFF',0);out.writeUInt32LE(36+len*2,4);out.write('WAVEfmt ',8);
 out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);
 out.writeUInt32LE(sr,24);out.writeUInt32LE(sr*2,28);
 out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(len*2,40);
 let seed=12;const rng=()=>{seed=(1664525*seed+1013904223)>>>0;return 2*(seed/4294967296)-1};
 for(let i=0;i<len;i++){const t=i/sr;let v=0;
  if(kind==='music'){const note=t<5?82.4:110;const phase=t%.5;
   v=.14*Math.sin(2*Math.PI*note*t)+.05*Math.sin(2*Math.PI*note*2*t)
   +.55*Math.sin(2*Math.PI*(56*t+60*(1-Math.exp(-24*phase))/24))*Math.exp(-20*phase)
   +.07*rng()*Math.exp(-90*(t%.25));v*=Math.min(1,t/.1,(seconds-t)/.18);
  }else if(kind==='click')v=.38*Math.sin(2*Math.PI*(430*t+900*t*t))*Math.exp(-25*t);
  else if(kind==='whoosh')v=.3*rng()*Math.sin(Math.PI*t/seconds)**2;
  else v=.5*Math.sin(2*Math.PI*93*t)*Math.exp(-12*t);
  out.writeInt16LE(Math.round(Math.max(-.85,Math.min(.85,v))*32767),44+i*2);
 }return writeFile(join(root,name+'.wav'),out);
}
await Promise.all([saveWav('music',10,'music'),saveWav('click',.2,'click'),saveWav('whoosh',.35,'whoosh'),saveWav('hit',.45,'hit')]);
const modulePath=resolve('node_modules/gsap/dist/gsap.min.js');
try{await access(modulePath);await copyFile(modulePath,join(root,'gsap.min.js'));console.log('GSAP bundled from installed, licensed module');}
catch{console.warn('GSAP not installed. For live demo, install a licensed copy: npm install gsap --no-save');}
console.log('Demo audio generated in',root);