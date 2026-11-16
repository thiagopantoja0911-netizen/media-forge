/* Unific Media — MediaForge + Browser MCP, one public HTTP listener. */
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {mkdirSync} from 'node:fs';

const BASE='https://unificmedia.salevo.site';
const PORT=Number(process.env.PORT||3000);
const DATA_ROOT=process.env.UNIFIC_MEDIA_DATA_DIR||path.join(process.env.HOME||os.homedir(),'.unific-media-data');
mkdirSync(DATA_ROOT,{recursive:true,mode:0o700});
process.env.UNIFIC_EMBEDDED='1';
process.env.BROWSER_MCP_BRIDGE_URL=BASE+'/browser';
process.env.BROWSER_MCP_BRIDGE_DATA_DIR ||=path.join(DATA_ROOT,'browser');
process.env.MEDIAFORGE_OAUTH_ISSUER=BASE;
process.env.MEDIAFORGE_DATA_DIR ||=path.join(DATA_ROOT,'mediaforge');
process.env.MEDIAFORGE_PROJECTS_DIR ||=path.join(DATA_ROOT,'mediaforge','projects');
process.env.MEDIAFORGE_OUTPUT_DIR ||=path.join(DATA_ROOT,'mediaforge','output');
process.env.MEDIAFORGE_REQUIRE_AUTH='true';
// Server modules create handlers without binding extra ports; Hostinger allows one public listener.
await import('./browser/server-agent.mjs');
const {app:browser}=await import('./browser/server.mjs');
const {server:media}=await import('./src/server.mjs');
const browserHandler=browser.listeners('request')[0];
const mediaHandler=media.listeners('request')[0];
if(typeof browserHandler!=='function'||typeof mediaHandler!=='function')throw Error('UNIFIC_HANDLER_MISSING');
const app=http.createServer((req,res)=>{
 const u=new URL(req.url||'/','http://localhost');
 if(req.method==='GET'&&u.pathname==='/unific-health'){
  res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  return res.end(JSON.stringify({ok:true,service:'unific-media',routes:{browser:'/browser/health',media:'/health'},version:'0.1.1'}));
 }
 if(u.pathname==='/browser'||u.pathname.startsWith('/browser/')){
  req.url=(u.pathname.slice('/browser'.length)||'/')+u.search;
  return browserHandler(req,res);
 }
 return mediaHandler(req,res);
});
app.listen(PORT,'0.0.0.0',()=>console.log('Unific Media ready on port '+PORT));
