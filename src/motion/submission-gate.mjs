// Pre-queue preflight: prevents invalid HTML/GSAP, plan, fonts and missing assets
// from consuming Windows rendering time. This is a structural gate, not artistic approval.
import { validateMotionPlan, fpsValue } from "./plan.mjs";
import { validateDynamicMotionPlan } from "./dynamic-motion-gate.mjs";

const text = (files, name) => {
  const f=files.find(f=>f?.path===name);
  if(!f||typeof f.content!=="string")return null;
  if(f.encoding==="base64"){
    if(!/^[a-z0-9+/]*={0,2}$/i.test(f.content)||f.content.length%4)return null;
    return Buffer.from(f.content,"base64").toString("utf8");
  }
  return f.encoding==null||f.encoding==="utf8"?f.content:null;
};
const unique=a=>[...new Set(a)];
const requiredFiles=(files)=>files.length>0 && files.length<=80 && files.every(f=>typeof f?.path==="string"&&f.path.length>0&&typeof f.content==="string" && (f.encoding===undefined||["utf8","base64"].includes(f.encoding)));

export function validateWindowsRenderSubmission(args) {
 const errors=[],files=args?.project_files??[];
 if(!Array.isArray(files)||!requiredFiles(files))return {ok:false,errors:["Forneça 1..80 arquivos com path/content/encoding válidos."],warnings:[]};
 const names=new Set(files.map(x=>x.path));
 if(names.size!==files.length)errors.push("Há caminhos de arquivos duplicados.");
 const html=text(files,"index.html");
 if(!html)errors.push("Falta index.html editável e não vazio.");
 const raw=text(files,"motion-plan.json");
 if(!raw)errors.push("Falta motion-plan.json. Crie o plano no compositor MediaForge antes de enviar ao Windows.");
 let plan=null;
 if(raw)try {
   if(Buffer.byteLength(raw,"utf8")>256*1024)throw Error("manifesto muito grande");
   plan=JSON.parse(raw);
 }catch {errors.push("motion-plan.json não é JSON válido.");}
 if(plan){
  if(plan.format!=="mediaforge-motion-v1")errors.push("motion-plan.json: esperado format=mediaforge-motion-v1.");
  const review=validateMotionPlan(plan);
  if(!review.ok)errors.push(...review.errors.slice(0,10).map(e=>"Plano de movimento: "+e));
  if(plan.profile!=="dynamic-motion-v1")errors.push("Vídeo premium exige profile=dynamic-motion-v1 ou use create_motion_video para um plano cinematográfico validado.");
  if(plan.profile==="dynamic-motion-v1"){
    const dynamic=validateDynamicMotionPlan(plan);
    if(!dynamic.ok)errors.push(...dynamic.issues.slice(0,10).map(e=>"Movimento dinâmico: "+e));
  }
  const nominal=Number(args.duration_seconds),fps=Number(args.fps??60);
  if(!Number.isFinite(nominal)||!Number.isFinite(plan.totalFrames)||Math.abs(plan.totalFrames/fpsValue(plan.fps)-nominal)>1/Math.max(1,fps))
    errors.push("Duração declarada não corresponde aos quadros do motion-plan.json.");
  if(Math.abs(fpsValue(plan.fps)-fps)>.001)errors.push("FPS do manifesto difere do FPS de renderização.");
  const ratio=plan.width>plan.height?"16:9":plan.width<plan.height?"9:16":"1:1";
  if(ratio!==args.aspect_ratio)errors.push("Proporção do manifesto difere da proporção solicitada.");
  const sources=[...(plan.scenes||[]).map(x=>x?.media),...(plan.audioCues||[]).map(x=>x?.src)].filter(Boolean);
  for(const source of unique(sources))if(typeof source!=="string"||!source.startsWith("assets/")||!names.has(source))
    errors.push("Asset declarado no plano não foi enviado: "+String(source).slice(0,100));
 }
 if(html){
  const markup=files.filter(f=>/\.html$/i.test(f.path)).map(f=>text(files,f.path)||"").join("\n");
  // Prevent a false "silent-study" motion report for premium compositions
  // that actually contain music or effects. Catch it before Windows render.
  if(plan?.audioMode==="silent-study" && /<audio\b/i.test(markup))
    errors.push("Audio incompatível: HTML inclui trilha/efeitos, mas motion-plan.json declara audioMode=silent-study. Declare sound-design/voice-led e audioCues correspondentes.");
  // Missing GSAP is a fatal page_error rather than an artistic issue.
  const timelineCall=/\b(?:gsap|window\.gsap)\.timeline\s*\(/.test(markup);
  if(timelineCall&&(!/<script\b[^>]*src=["']assets\/gsap(?:\.min)?\.js["']/i.test(html)|| !names.has("assets/gsap.min.js")))
    errors.push("GSAP timeline sem script assets/gsap.min.js carregado no index.html.");
  if(timelineCall&&!/window\.__timelines/.test(markup))
    errors.push("Timeline GSAP sem registro em window.__timelines.");
  if(/font-family\s*:\s*['"]?Impact\b/i.test(markup)&&!/@font-face[\s\S]*font-family\s*:\s*['"]?Impact\b/i.test(markup))
    errors.push("Fonte Impact sem @font-face local; substitua por fonte suportada ou inclua arquivo em assets/fonts/.");
  const srcs=[...markup.matchAll(/<(?:video|audio|img)\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(x=>x[1]);
  for(const source of unique(srcs))if(!source.startsWith("assets/") || !names.has(source))
    errors.push("Mídia HTML ausente ou externa: "+source.slice(0,100));
 }
 return {ok:errors.length===0,errors:unique(errors).slice(0,25),warnings:["Pré-validação estrutural; revise o vídeo real, áudio, legibilidade e ritmo antes de publicar."]};
}
