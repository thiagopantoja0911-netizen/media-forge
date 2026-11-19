/**
 * Tool catalog shared by the Browser OAuth adapter and its regression tests.
 * Never expose a MediaForge tool under a conflicting Browser command name.
 */
export function composeUnifiedMediaTools(browserTools, mediaTools) {
  if (!Array.isArray(browserTools) || !Array.isArray(mediaTools)) {
    throw new TypeError("INVALID_TOOL_CATALOG");
  }
  const names = new Set();
  const result = [];
  for (const tool of browserTools) {
    if (!tool || typeof tool.name !== "string" || names.has(tool.name)) {
      throw new Error("DUPLICATE_BROWSER_TOOL_NAME: " + String(tool?.name));
    }
    names.add(tool.name);
    result.push(tool);
  }
  for (const tool of mediaTools) {
    if (!tool || typeof tool.name !== "string" || names.has(tool.name)) {
      throw new Error("UNIFIED_TOOL_NAME_CONFLICT: " + String(tool?.name));
    }
    if (tool.inputSchema?.type !== "object") {
      throw new Error("INVALID_MEDIAFORGE_TOOL_SCHEMA: " + tool.name);
    }
    names.add(tool.name);
    result.push({
      ...tool,
      // The connector currently has one grant: browser:control.
      securitySchemes: [{ type: "oauth2", scopes: ["browser:control"] }]
    });
  }
  return result;
}

/**
 * Stable version for the combined Browser + Editor MCP catalog. Reconnection
 * must discover this catalog, not the older Browser-only/legacy-media snapshot.
 */
export const UNIFIED_MCP_CATALOG_VERSION = "0.9.2";
export const EDITOR_MCP_TOOL_NAMES = Object.freeze([
  "create_editor_homologation_project",
  "create_editor_project",
  "get_editor_project",
  "edit_editor_project",
  "edit_editor_timeline",
  "upload_editor_layer_asset",
  "review_editor_preview",
  "render_editor_project",
  "upload_editor_asset",
  "apply_editor_style_preset",
  "get_editor_style_dna",
  "list_editor_style_presets",
  "sync_editor_beats"
]);

export function inspectUnifiedMediaCatalog(browserTools, mediaTools) {
  const combined = composeUnifiedMediaTools(browserTools, mediaTools);
  const available = new Set(combined.map(tool => tool.name));
  const missingEditorTools = EDITOR_MCP_TOOL_NAMES.filter(name => !available.has(name));
  return {
    ready: missingEditorTools.length === 0,
    version: UNIFIED_MCP_CATALOG_VERSION,
    browserTools: browserTools.length,
    mediaTools: mediaTools.length,
    totalTools: combined.length,
    editorTools: EDITOR_MCP_TOOL_NAMES.length - missingEditorTools.length,
    missingEditorTools
  };
}
