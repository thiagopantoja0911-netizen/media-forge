// Defensive production bootstrap: surface a bounded health diagnostic if module setup fails.
// No tokens or filesystem paths are ever returned to HTTP clients.
import { createServer } from "node:http";
const host=process.env.FRAME_LAB_HOST||"0.0.0.0";
const port=Number(process.env.PORT||process.env.FRAME_LAB_PORT||8791);
process.on("uncaughtException",err=>console.error("Frame Lab uncaught exception",err));
process.on("unhandledRejection",err=>console.error("Frame Lab unhandled rejection",err));
try{
  await import("./server.mjs");
}catch(error){
  const code=String(error?.code||"STARTUP_ERROR").slice(0,80);
  console.error("Frame Lab bootstrap failed",error?.stack||error);
  createServer((req,res)=>{
    res.writeHead(503,{"content-type":"application/json","cache-control":"no-store"});
    res.end(JSON.stringify({ok:false,service:"frame-lab",phase:"bootstrap",code}));
  }).listen(port,host);
}
