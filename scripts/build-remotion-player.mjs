import {build} from "esbuild";
import {resolve} from "node:path";
await build({entryPoints:[resolve("remotion/player-entry.jsx")],bundle:true,format:"iife",platform:"browser",target:"es2020",jsx:"automatic",
  outfile:resolve("editor-studio/remotion-player.js"),minify:true,
  define:{"process.env.NODE_ENV":JSON.stringify("production")}});
console.log("MediaForge Remotion Player built for the existing /editor interface.");
