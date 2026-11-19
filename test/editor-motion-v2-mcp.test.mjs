import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VIDEOS_SECRETS_TOOLS } from "../src/videos-secrets-mcp.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("existing edit_editor_timeline tool accepts Motion V2 without altering MCP catalog size",()=>{
 const tool=VIDEOS_SECRETS_TOOLS.find(x=>x.name==="edit_editor_timeline");
 assert.ok(tool,"Existing tool must stay discoverable.");
 const schema=tool.inputSchema.properties.motion_v2;
 assert.ok(schema,"Motion V2 schema is present.");
 assert.ok(schema.properties.background.properties.keyframes);
 assert.ok(schema.properties.moves.additionalProperties.properties.path);
 assert.ok(schema.properties.frameLabProjectId);
 assert.ok(tool.inputSchema.properties.layer_operations);
 assert.ok(tool.inputSchema.properties.caption_operations);
});
test("MCP and native editor use identical project validation, revisions and no auto render",()=>{
 const source=read("src/videos-secrets-mcp.mjs");
 const chunk=source.slice(source.indexOf('if(name==="edit_editor_timeline")'),source.indexOf('if(name==="edit_editor_project")'));
 assert.match(chunk,/args\.motion_v2!==undefined/);
 assert.match(chunk,/validateEditorProject\(next\)/);
 assert.match(chunk,/saveEditorProject\(next,\{expectedRevision:old\.revision\}\)/);
 assert.match(chunk,/motionQA:auditMotionV2\(project\)/);
 assert.doesNotMatch(chunk,/createJob\(|render_editor_project/);
});
