import test from "node:test";
import assert from "node:assert/strict";
import { composeUnifiedMediaTools } from "../browser/mediaforge-tool-catalog.mjs";
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
