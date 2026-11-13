import { createServer } from "node:http";
const port=Number(process.env.PORT||3000);
const host="0.0.0.0";
createServer((req,res)=>{
 res.writeHead(200,{"content-type":"application/json","cache-control":"no-store"});
 res.end(JSON.stringify({ok:true,service:"frame-lab-hostinger-probe",portConfigured:Boolean(process.env.PORT),node:process.version}));
}).listen(port,host,()=>console.log("Frame Lab minimal Hostinger probe listening"));
