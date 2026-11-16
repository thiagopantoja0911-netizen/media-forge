/**
 * Unific Media — one public Node.js process hosting MediaForge and Browser MCP.
 * Public:
 *   /                  MediaForge (panel, /health, /mcp, OAuth, jobs)
 *   /browser/*         Browser MCP relay (OAuth, /health, /mcp, device)
 *   /unific-health     combined readiness, no credentials
 * Both legacy services bind only to loopback on distinct private ports.
 */
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {mkdirSync} from 'node:fs';

const PUBLIC_PORT=Number(process.env.PORT||3000);
const BROWSER_PORT=4101,MEDIA_PORT=4102;
const BASE='https://unificmedia.salevo.site';
const DATA_ROOT=process.env.UNIFIC_MEDIA_DATA_DIR || path.join(process.env.HOME || os.homedir(),'.unific-media-data');
mkdirSync(DATA_ROOT,{recursive:true,mode:0o700});

process.env.BROWSER_MCP_BRIDGE_URL=BASE+'/browser';
process.env.BROWSER_MCP_BRIDGE_DATA_DIR ||=path.join(DATA_ROOT,'browser');
process.env.BROWSER_MCP_INTERNAL_ONLY='1';
process.env.PORT=String(BROWSER_PORT);
await import('./browser/server-agent.mjs');

process.env.MEDIAFORGE_OAUTH_ISSUER=BASE;
process.env.MEDIAFORGE_DATA_DIR ||=path.join(DATA_ROOT,'mediaforge');
process.env.MEDIAFORGE_PROJECTS_DIR ||=path.join(DATA_ROOT,'mediaforge','projects');
process.env.MEDIAFORGE_OUTPUT_DIR ||=path.join(DATA_ROOT,'mediaforge','output');
process.env.MEDIAFORGE_HOST='127.0.0.1';
process.env.MEDIAFORGE_REQUIRE_AUTH='true';
process.env.MEDIAFORGE_PORT=String(MEDIA_PORT);
process.env.PORT=String(PUBLIC_PORT);
await import('./src/server.mjs');

const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
async function health(url){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),2500);
 try{
  const res=await fetch(url,{signal:controller.signal,cache:'no-store'});
  const data=await res.json().catch(()=>({}));
  return {ok:res.ok&&data.ok===true,status:res.status};
 }catch(error){return {ok:false,error:error?.name==='AbortError'?'TIMEOUT':'UNREACHABLE'};}
 finally{clearTimeout(timer);}
}
const app=http.createServer(async(req,res)=>{
 const parsed=new URL(req.url||'/','http://localhost');
 if(req.method==='GET'&&parsed.pathname==='/unific-health'){
  const [browser,media]=await Promise.all([
   health('http://127.0.0.1:'+BROWSER_PORT+'/health'),
   health('http://127.0.0.1:'+MEDIA_PORT+'/health')
  ]);
  return json(res,browser.ok&&media.ok?200:503,{ok:browser.ok&&media.ok,service:'unific-media',browser,media});
 }
 const isBrowser=parsed.pathname==='/browser'||parsed.pathname.startsWith('/browser/');
 const port=isBrowser?BROWSER_PORT:MEDIA_PORT;
 const localPath=isBrowser?(parsed.pathname.slice('/browser'.length)||'/')+parsed.search:parsed.pathname+parsed.search;
 const headers={...req.headers,host:'127.0.0.1:'+port,'x-forwarded-host':String(req.headers.host||''),'x-forwarded-proto':'https'};
 const upstream=http.request({hostname:'127.0.0.1',port,path:localPath,method:req.method,headers,timeout:60000},response=>{
  // The Browser OAuth form is an absolute path in the original relay;
  // scope it to /browser in the new unified origin to avoid route conflicts.
  const rewriteForm=isBrowser&&parsed.pathname==='/browser/authorize'
   &&req.method==='GET'&&String(response.headers['content-type']||'').includes('text/html');
  if(!rewriteForm){res.writeHead(response.statusCode||502,response.headers);response.pipe(res);return;}
  const chunks=[];
  response.on('data',chunk=>chunks.push(chunk));
  response.on('end',()=>{
   const body=Buffer.concat(chunks).toString('utf8').replaceAll('action="/authorize"','action="/browser/authorize"');
   const out={...response.headers};delete out['content-length'];delete out['transfer-encoding'];
   res.writeHead(response.statusCode||200,out);res.end(body);
  });
 });
 upstream.on('timeout',()=>upstream.destroy(new Error('TIMEOUT')));
 upstream.on('error',error=>{if(!res.headersSent)json(res,502,{ok:false,error:'SERVICE_UNAVAILABLE',service:isBrowser?'browser':'media'});else res.destroy();});
 req.pipe(upstream);
});
app.listen(PUBLIC_PORT,'0.0.0.0',()=>console.log('Unific Media listening on '+PUBLIC_PORT));
