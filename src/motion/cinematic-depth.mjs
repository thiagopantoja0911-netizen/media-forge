const html=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const order={background:0,midground:1,foreground:2};
export function buildCinematicDepthLayers(scene,plan){
 const layers=Array.isArray(scene?.depthLayers)?scene.depthLayers:[];
 if(!layers.length)return {enabled:false,html:"",css:"",timeline:"",count:0};
 const fps=Number(String(plan.fps).split("/")[0])/Number(String(plan.fps).split("/")[1]||1);
 const duration=(scene.endFrame-scene.startFrame)/fps;
 const motionBlur=layers.some(()=>Number(scene.effects?.motionBlur)>0);
 const markup=[...layers].sort((a,b)=>order[a.role]-order[b.role]).map(layer=>{
  const z=10+order[layer.role]*10;
  const blur=layer.focus?0:layer.blurPx;
  return '<img id="'+scene.id+'-depth-'+layer.id+'" class="mf-depth-layer mf-depth-'+layer.role+
   '" src="'+html(layer.src)+'" alt="" draggable="false" data-depth="'+layer.depth+
   '"'+(motionBlur?' data-motion-blur="on" data-motion-blur-shutter="180" data-motion-blur-strength="'+Number(scene.effects.motionBlur).toFixed(2)+'"':'')+
   ' style="z-index:'+z+';filter:blur('+blur+'px)">';
 }).join("");
 const css=[
  '.mf-depth-stage{position:absolute;inset:0;z-index:0;overflow:hidden;background:#030710}',
  '.mf-depth-rig{position:absolute;inset:-8%;width:116%;height:116%;transform-origin:50% 50%;will-change:transform}',
  '.mf-depth-layer{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;will-change:transform,filter;filter:blur(0px)}',
  '.mf-depth-background{z-index:10}.mf-depth-midground{z-index:20}.mf-depth-foreground{z-index:30}'
 ].join("");
 const timeline=[...layers].sort((a,b)=>order[a.role]-order[b.role]).map(layer=>{
  const parallax=Number(layer.parallax);
  const id=JSON.stringify("#"+scene.id+"-depth-"+layer.id);
  const x=Number((parallax*2.8).toFixed(3)),y=Number((parallax*1.4).toFixed(3));
  return 'tl.fromTo('+id+',{xPercent:'+(-x)+',yPercent:'+y+',scale:'+(1.02+parallax*.025).toFixed(3)+'},{xPercent:'+x+',yPercent:'+(-y)+',scale:'+(1.07+parallax*.04).toFixed(3)+',duration:'+Math.max(.5,duration*.9).toFixed(3)+',ease:"sine.inOut"},0);';
 }).join("\n");
 return {enabled:true,html:markup,css,timeline,count:layers.length};
}
