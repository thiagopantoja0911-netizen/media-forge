/**
 * Real HyperFrames caption elements, synchronized on a frame-based GSAP timeline.
 * Captions are an overlay, never a replacement for the underlying narrative media.
 */
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const asFrames=(value,fps)=>Number((value/fps).toFixed(5));
export function buildCinematicCaptionTrack(plan){
  const captions=Array.isArray(plan?.captions)?plan.captions:[];
  if(!captions.length)return {html:"",css:"",timeline:"",count:0};
  const fps=Number(String(plan.fps).split("/")[0])/Number(String(plan.fps).split("/")[1]||1);
  const fontSize=Math.round(plan.width*.040);
  const html=captions.map((c,i)=>{
    const start=asFrames(c.startFrame,fps),duration=asFrames(c.endFrame-c.startFrame,fps);
    const escaped=escapeHtml(c.text);
    const safeEmphasis=String(c.emphasis??"").trim();
    const emphasized=safeEmphasis && c.text.includes(safeEmphasis)
      ? escaped.replace(escapeHtml(safeEmphasis),'<strong class="mf-caption-emphasis">'+escapeHtml(safeEmphasis)+'</strong>')
      : escaped;
    return '<div id="mf-caption-'+(i+1)+'" class="clip mf-caption" data-start="'+start+'" data-duration="'+duration+
      '" data-track-index="80" data-track-kind="captions" data-layout-allow-overlap><span class="mf-caption-text">'+emphasized+'</span></div>';
  }).join("\n");
  const css='.mf-caption{position:absolute;left:9%;right:9%;bottom:18%;height:auto;min-height:3em;display:flex;justify-content:center;align-items:center;text-align:center;z-index:80;pointer-events:none;color:#fffdf8;}'+
    '.mf-caption-text{display:inline-block;max-width:100%;font-size:'+fontSize+'px;line-height:1.25;font-weight:800;letter-spacing:-.018em;overflow-wrap:anywhere;text-shadow:0 2px 8px #000,0 5px 22px #000d;padding:.23em .36em;border-radius:.25em;background:#080b16be;box-shadow:0 8px 35px #0006}'+
    '.mf-caption-emphasis{color:#f4c18d;font-weight:900;text-shadow:0 0 12px #f3c78c88,0 4px 9px #0008}';
  const timeline=captions.map((c,i)=>{
    const selector=JSON.stringify("#mf-caption-"+(i+1)+" .mf-caption-text");
    const start=asFrames(c.startFrame,fps),duration=asFrames(c.endFrame-c.startFrame,fps);
    const enter=Math.min(.21,duration*.25),exit=Math.min(.17,duration*.25);
    return 'timeline.fromTo('+selector+',{opacity:0,y:24,filter:"blur(5px)"},{opacity:1,y:0,filter:"blur(0px)",duration:'+enter+',ease:"power3.out"},'+start+');'+
      'timeline.to('+selector+',{opacity:0,duration:'+exit+',ease:"power1.in"},'+(start+duration-exit).toFixed(5)+');';
  }).join("\n");
  return {html,css,timeline,count:captions.length};
}
