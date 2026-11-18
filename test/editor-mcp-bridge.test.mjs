import test from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { composeUnifiedMediaTools, inspectUnifiedMediaCatalog, UNIFIED_MCP_CATALOG_VERSION, EDITOR_MCP_TOOL_NAMES } from "../browser/mediaforge-tool-catalog.mjs";
import { VIDEOS_SECRETS_TOOLS } from "../src/videos-secrets-mcp.mjs";

const editorCommands = [
  "create_editor_homologation_project",
  "create_editor_project",
  "get_editor_project",
  "edit_editor_project",
  "review_editor_preview",
  "render_editor_project",
  "upload_editor_asset",
  "apply_editor_style_preset",
  "get_editor_style_dna",
  "list_editor_style_presets",
  "sync_editor_beats"
];

test("Browser OAuth catalog exposes the complete AI editor workflow", () => {
  const browser = [{name: "tab_list", inputSchema: {type:"object"}}, {
    name: "browser_run_workflow", inputSchema: {type:"object"}
  }];
  const merged = composeUnifiedMediaTools(browser, VIDEOS_SECRETS_TOOLS);
  const names = merged.map(x=>x.name);
  assert.equal(new Set(names).size,names.length);
  for (const command of editorCommands) {
    const tool = merged.find(t=>t.name===command);
    assert.ok(tool, "Missing editor tool: "+command);
    assert.equal(tool.inputSchema.type,"object");
    assert.deepEqual(tool.securitySchemes,[{type:"oauth2",scopes:["browser:control"]}]);
  }
  assert.deepEqual(merged.slice(0,browser.length),browser);
  assert.equal(merged.length,browser.length+VIDEOS_SECRETS_TOOLS.length);
});

test("Editor project render still requires an explicit confirmation and preview review", () => {
  const render=VIDEOS_SECRETS_TOOLS.find(t=>t.name==="render_editor_project");
  const review=VIDEOS_SECRETS_TOOLS.find(t=>t.name==="review_editor_preview");
  assert.ok(render.inputSchema.required.includes("confirm_render"));
  assert.equal(render.inputSchema.properties.confirm_render.const,true);
  assert.ok(review.inputSchema.required.includes("checks"));
  assert.equal(review.inputSchema.properties.checks.minItems,1);
  assert.equal(review.inputSchema.properties.checks.items.properties.samples_seconds.minItems,2);
});

test("Browser commands cannot be shadowed by MediaForge or duplicate themselves", () => {
  const sample={name:"tab_list",inputSchema:{type:"object"}};
  assert.throws(
    ()=>composeUnifiedMediaTools([sample],[sample]),
    /UNIFIED_TOOL_NAME_CONFLICT/
  );
  assert.throws(
    ()=>composeUnifiedMediaTools([sample,sample],[]),
    /DUPLICATE_BROWSER_TOOL_NAME/
  );
  assert.throws(
    ()=>composeUnifiedMediaTools([], [{name:"broken",inputSchema:{type:"string"}}]),
    /INVALID_MEDIAFORGE_TOOL_SCHEMA/
  );
});

test("catalog readiness confirms 11 editor operations with one Browser OAuth grant", () => {
  const browser=[{name:"tab_list",inputSchema:{type:"object"}}];
  const status=inspectUnifiedMediaCatalog(browser,VIDEOS_SECRETS_TOOLS);
  assert.equal(status.ready,true);
  assert.equal(status.version,UNIFIED_MCP_CATALOG_VERSION);
  assert.equal(status.editorTools,EDITOR_MCP_TOOL_NAMES.length);
  assert.deepEqual(status.missingEditorTools,[]);
  assert.equal(status.totalTools,browser.length+VIDEOS_SECRETS_TOOLS.length);
  const reduced=VIDEOS_SECRETS_TOOLS.filter(t=>t.name!=="edit_editor_project");
  const regression=inspectUnifiedMediaCatalog(browser,reduced);
  assert.equal(regression.ready,false);
  assert.deepEqual(regression.missingEditorTools,["edit_editor_project"]);
});

test("deployed entry serves unified catalog health without exposing OAuth credentials", async () => {
  const socket=createServer();
  await new Promise(resolve=>socket.listen(0,"127.0.0.1",resolve));
  const port=socket.address().port;
  await new Promise(resolve=>socket.close(resolve));
  const root=await mkdtemp(join(tmpdir(),"unific-editor-mcp-"));
  const child=spawn(process.execPath,["unific-media-entry.mjs"],{
    cwd:process.cwd(),
    env:{...process.env,PORT:String(port),UNIFIC_MEDIA_DATA_DIR:root,MEDIAFORGE_RENDERER:"dry-run"},
    stdio:["ignore","pipe","pipe"]
  });
  let logs="";
  for(const stream of [child.stdout,child.stderr])stream.on("data",b=>logs+=b.toString());
  try {
    let health;
    for(let attempt=0;attempt<80;attempt++){
      if(child.exitCode!==null)throw Error("Unific exited: "+logs);
      try {
        health=await fetch("http://127.0.0.1:"+port+"/browser/catalog-health");
        if(health.status===200)break;
      }catch{}
      await new Promise(resolve=>setTimeout(resolve,125));
    }
    assert.equal(health?.status,200,"Unified catalog did not start: "+logs);
    const data=await health.json();
    assert.equal(data.ready,true);
    assert.equal(data.connector,"/browser/mcp");
    assert.equal(data.version,UNIFIED_MCP_CATALOG_VERSION);
    assert.equal(data.editorTools,11);
    assert.ok(data.totalTools>data.mediaTools);
    const denied=await fetch("http://127.0.0.1:"+port+"/browser/mcp",{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/list"})
    });
    assert.equal(denied.status,401,"MCP must remain OAuth-protected");
  } finally {
    child.kill("SIGTERM");
    await new Promise(resolve=>child.once("exit",resolve)).catch(()=>{});
    await rm(root,{recursive:true,force:true});
  }
});
