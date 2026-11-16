// Diagnostic staging entry point: intentionally independent of MediaForge imports.
import { createServer } from "node:http";
const port = Number(process.env.PORT || 3000);
const host = "0.0.0.0";
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Invalid PORT supplied to staging probe");
}
const server = createServer((request, response) => {
  response.setHeader("cache-control", "no-store");
  if (request.url === "/health") {
    response.writeHead(200, {"content-type":"application/json"});
    response.end(JSON.stringify({
      ok:true, service:"mediaforge-staging-boot-probe",
      portSource:process.env.PORT ? "env" : "default",
      runtime:process.version, uptimeSeconds:Math.floor(process.uptime())
    }));
    return;
  }
  response.writeHead(404, {"content-type":"application/json"});
  response.end(JSON.stringify({ok:false,error:"PROBE_ONLY"}));
});
server.on("error", error => console.error("[staging-probe] listen error:",error?.stack||String(error)));
server.listen(port, host, () => console.log("[staging-probe] listening on",host,port));
