/**
 * Seekable visual polish, rendered on real media. A CSS blur transient is
 * not optical sub-frame shutter blur; the latter needs renderer support.
 */
const asNumber=v=>typeof v==="number"&&Number.isFinite(v)?Math.max(0,Math.min(1,v)):0;
const types=new Set(["flash","light-sweep","impact","dust","light-leak"]);
export function buildCinematicSceneEffects(scene,plan) {
  if(plan?.cinematicPolicyVersion!=="v2")return {enabled:false,overlay:"",css:"",timeline:"",mediaStyle:""};
  const fx=scene.effects||{};
  const bloom=asNumber(fx.bloom),grade=asNumber(fx.colorGrade),blur=asNumber(fx.motionBlur);
  const shadow=fx.shadow===true;
  const micro=types.has(fx.microEffect)?fx.microEffect:null;
  const id=scene.id;
  const mediaStyle="filter:contrast("+(1+grade*.16).toFixed(3)+") saturate("+(1+grade*.10).toFixed(3)+");";
  const overlay=(bloom>0?'<div class="mf-fx-bloom" style="opacity:'+(bloom*.42).toFixed(3)+'"></div>':"")+
    (shadow?'<div class="mf-fx-shadow"></div>':"")+
    (micro?'<div id="'+id+'-micro" class="mf-fx-micro mf-fx-'+micro+'"></div>':"");
  const css=[
'.mf-fx-bloom{position:absolute;inset:0;z-index:2;pointer-events:none;mix-blend-mode:screen;filter:blur(20px);background:radial-gradient(ellipse at 62% 33%,#ffe5b6cf 0%,#f5bc7a55 23%,transparent 65%)}',
'.mf-fx-shadow{position:absolute;inset:0;z-index:3;pointer-events:none;background:linear-gradient(0deg,#020617a1 0%,transparent 33%,transparent 82%,#02061722);box-shadow:inset 0 0 120px #03060b90}',
'.mf-fx-micro{position:absolute;inset:0;z-index:5;opacity:0;pointer-events:none;mix-blend-mode:screen;will-change:opacity;background:radial-gradient(ellipse at 50% 50%,#fff5dbaa,transparent 70%)}',
'.mf-fx-impact{background:radial-gradient(ellipse at 50% 50%,#ffffffee,transparent 68%)}',
'.mf-fx-light-sweep{background:linear-gradient(114deg,transparent 30%,#fff9d9bd 50%,transparent 70%)}',
'.mf-fx-light-leak{background:linear-gradient(20deg,#ffb06cab,transparent 62%)}',
'.mf-fx-dust{background:radial-gradient(ellipse at 40% 40%,#ffe4be70,transparent 62%)}'
].join("");
  const fps=Number(String(plan.fps).split("/")[0])/Number(String(plan.fps).split("/")[1]||1);
  const keyEvent=Array.isArray(scene.events)?scene.events.find(e=>["camera","focus","enter"].includes(e.action)):null;
  const hit=keyEvent?keyEvent.peakFrame/fps:.25;
  const timeline=(micro?
    'tl.fromTo("#'+id+'-micro",{opacity:0},{opacity:.52,duration:.075,ease:"power2.out"},'+hit.toFixed(5)+');'+
    'tl.to("#'+id+'-micro",{opacity:0,duration:.18,ease:"power1.out"},'+(hit+.075).toFixed(5)+');':"")+
    (blur>0&&["footage","photo"].includes(scene.type)?
      'tl.fromTo("#'+id+'-camera-rig",{filter:"blur('+Math.round(3+blur*8)+'px)"},{filter:"blur(0px)",duration:.23,ease:"power3.out"},0);':"");
  return {enabled:true,overlay,css,timeline,mediaStyle,effects:{bloom,grade,blur,shadow,micro}};
}
