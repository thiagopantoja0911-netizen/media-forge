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
