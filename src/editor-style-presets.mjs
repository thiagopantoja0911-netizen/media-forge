/* Native editor presets and reusable style DNA; no licensed media is embedded. */
export const EDITOR_STYLE_PRESETS=Object.freeze({
  "apple-clean":Object.freeze({
    name:"Apple Clean",palette:["#e9f0ef","#b1c1c1","#e8c6a0"],background:"#101717",
    camera:"dolly",transition:"match-cut",shape:"sphere",energy:.43,depth:.72,textScale:.94,
    glow:{color:"#cce6e2",intensity:.3,speed:.27,x:.2,y:-.15},
    typography:{family:"Arial",weight:700,tracking:-.045,glow:0}
  }),
  "spotify-dark-glow":Object.freeze({
    name:"Spotify Dark Glow",palette:["#1ed760","#a770ff","#42d5f2"],background:"#080b11",
    camera:"arc",transition:"whip",shape:"torus",energy:.88,depth:1,textScale:1,
    glow:{color:"#8754f6",intensity:.86,speed:.85,x:0,y:0},
    typography:{family:"Arial",weight:800,tracking:-.065,glow:.12}
  }),
  "motivational-bw":Object.freeze({
    name:"Motivational B&W",palette:["#f5f5f2","#bebebe","#e2e2df"],background:"#080808",
    camera:"reveal",transition:"dip",shape:"rings",energy:.63,depth:.69,textScale:1.08,
    glow:{color:"#dadada",intensity:.17,speed:.24,x:0,y:.18},
    typography:{family:"Arial",weight:900,tracking:-.07,glow:0}
  })
});
export const listEditorStylePresets=()=>Object.entries(EDITOR_STYLE_PRESETS).map(([id,p])=>({
  id,name:p.name,palette:p.palette,camera:p.camera,transition:p.transition
}));
export function getEditorStylePreset(id){
  if(!id)return null;
  if(!Object.hasOwn(EDITOR_STYLE_PRESETS,id))
    throw Object.assign(new Error("Preset de estilo não suportado."),{code:"EDITOR_STYLE_PRESET_INVALID",status:422});
  return EDITOR_STYLE_PRESETS[id];
}
export function applyEditorStylePreset(project,id){
  const preset=getEditorStylePreset(id);
  return {
    ...project,stylePreset:id,
    scenes:project.scenes.map((s,i)=>({
      ...s,accent:preset.palette[i%preset.palette.length],
      camera:preset.camera,transition:i===0?"cut":preset.transition,
      shape:s.visual?s.shape:preset.shape,energy:preset.energy,depth:preset.depth,
      textScale:preset.textScale,glow:{...preset.glow}
    }))
  };
}
export function buildEditorStyleDna(project){
  const scenes=project.scenes.map(s=>({
    durationFrames:s.endFrame-s.startFrame,
    energy:s.energy,camera:s.camera,transition:s.transition,shape:s.shape,
    accent:s.accent,depth:s.depth,textScale:s.textScale,
    glow:s.glow??null,visual:s.visual?{
      type:s.visual.type,scale:s.visual.scale,
      rotation:s.visual.rotation,position:s.visual.position,
      columns:s.visual.columns,rows:s.visual.rows,scroll:s.visual.scroll
    }:null
  }));
  return {
    format:"mediaforge-editor-style-dna-v1",
    sourceProjectId:project.id,sourceRevision:project.revision,
    stylePreset:project.stylePreset??null,
    ratio:project.aspectRatio,fps:project.fps,
    palette:[...new Set(scenes.map(s=>s.accent))],
    typography:{font:"Arial",mode:"kinetic-headline",scale:scenes.map(s=>s.textScale)},
    cameraSignature:scenes.map(s=>s.camera),
    rhythmFrames:scenes.map(s=>s.durationFrames),
    sceneStyle:scenes,
    note:"Estilo e parâmetros originais; não inclui imagens, fontes, música nem ativos de terceiros."
  };
}
