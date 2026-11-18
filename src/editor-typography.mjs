// Deterministic text segmentation and constrained typography options.
// Strings are escaped before entering the HTML preview or render bundle.
export const EDITOR_TEXT_MODES=["whole","words","letters"];
export const EDITOR_FONT_FAMILIES=["sans","serif","mono"];
export const EDITOR_FONT_STACKS={
  sans:"Arial,Helvetica,sans-serif",
  serif:"Georgia,Times New Roman,serif",
  mono:"Consolas,Menlo,monospace"
};
export const DEFAULT_TYPOGRAPHY=Object.freeze({
  mode:"whole",family:"sans",weightFrom:400,weightTo:900,
  bloom:0,bloomColor:"#ffffff",stagger:.65
});
export function sceneTypography(scene){
  return {...DEFAULT_TYPOGRAPHY,...(scene?.typography??{})};
}
export function validateSceneTypography(value){
  return !!value&&typeof value==="object"&&!Array.isArray(value)&&
    EDITOR_TEXT_MODES.includes(value.mode)&&EDITOR_FONT_FAMILIES.includes(value.family)&&
    Number.isInteger(value.weightFrom)&&value.weightFrom>=100&&value.weightFrom<=900&&
    Number.isInteger(value.weightTo)&&value.weightTo>=100&&value.weightTo<=900&&
    typeof value.bloom==="number"&&Number.isFinite(value.bloom)&&value.bloom>=0&&value.bloom<=1&&
    /^#[a-fA-F0-9]{6}$/.test(value.bloomColor)&&
    typeof value.stagger==="number"&&Number.isFinite(value.stagger)&&value.stagger>=0&&value.stagger<=1;
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function renderKineticTitle(text,options){
  const config={...DEFAULT_TYPOGRAPHY,...(options??{})};
  if(config.mode==="whole")return esc(text);
  const units=config.mode==="words"
    ?String(text).match(/\s+|\S+/gu)??[]
    :(typeof Intl.Segmenter==="function"
        ?[...new Intl.Segmenter("pt-BR",{granularity:"grapheme"}).segment(String(text))].map(v=>v.segment)
        :Array.from(String(text)));
  let i=0;
  return units.map(t=>/^\s+$/u.test(t)?esc(t):
    '<span class="kinetic-unit" aria-hidden="true" data-motion-index="'+i+++'">'+esc(t)+'</span>').join("");
}
