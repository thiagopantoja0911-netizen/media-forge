const base=process.env.MEDIAFORGE_PUBLIC_URL||"https://mediaforge.salevo.site";
async function check(path,init,expected){
  const response=await fetch(base+path,{signal:AbortSignal.timeout(12000),redirect:"manual",...init});
  console.log(path,"HTTP",response.status);
  if(response.status!==expected)throw new Error(path+" expected "+expected+" got "+response.status);
  return response;
}
let last;
for(let i=0;i<8;i++){
  try{
    const health=await check("/health",undefined,200);
    const data=await health.json();
    if(data.service!=="mediaforge-orchestrator")throw new Error("Wrong target service");
    if(process.env.MEDIAFORGE_EXPECT_WORKER==="true") console.log("Live Windows worker:",JSON.stringify(data.worker));
    if(process.env.MEDIAFORGE_EXPECT_WORKER==="true" && data.worker?.online!==true)
      throw new Error("Windows HyperFrames worker is not online in the live staging health endpoint");
    if(process.env.MEDIAFORGE_EXPECT_WORKER==="true" && data.worker?.renderer!=="hyperframes")
      throw new Error("Live staging worker renderer is not HyperFrames");
    const auth=await check("/.well-known/oauth-authorization-server",undefined,200);
    const cfg=await auth.json();
    if(cfg.issuer!==base)throw new Error("OAuth issuer mismatch: "+cfg.issuer);
    const resource=await check("/.well-known/oauth-protected-resource/mcp",undefined,200);
    const resourceMeta=await resource.json();
    if(resourceMeta.resource!==base+"/mcp")throw new Error("MCP protected resource mismatch");
    const denied=await fetch(base+"/mcp",{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-06-18"}}),
      signal:AbortSignal.timeout(12000)});
    if(denied.status!==401)throw new Error("MCP authentication absent: "+denied.status);
    if(!String(denied.headers.get("www-authenticate")).includes("resource_metadata="))
      throw new Error("MCP OAuth challenge missing resource_metadata");
    await check("/v1/jobs",undefined,401);
    await check("/v1/worker/claim",{method:"POST",headers:{"content-type":"application/json"},body:"{}"},401);
    console.log("PASS: host, TLS, OAuth, REST auth and worker auth");
    process.exit(0);
  }catch(error){
    last=error;console.error("Probe",i+1,error.message);
    await new Promise(r=>setTimeout(r,10000));
  }
}
throw last;
