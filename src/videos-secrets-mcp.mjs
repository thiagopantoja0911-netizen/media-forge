import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FRAME_LAB_MCP_TOOLS, FRAME_LAB_MCP_NAMES, FRAME_LAB_MCP_READ_TOOLS } from "../frame-lab/mcp-schemas.mjs";
import { buildCinematic3dProject } from "./cinematic-3d.mjs";
import { buildMotionComposition } from "./motion/composer.mjs";
import { PREMIUM_MOTION_BASELINE, validatePremiumMotionSubmission } from "./premium-motion-baseline.mjs";
import { validateWindowsRenderSubmission } from "./motion/submission-gate.mjs";
import { planFromShortBrief } from "./creative-director.mjs";
import { listEditingStyles } from "./editing-style-presets.mjs";
import { makeEditorProject, saveEditorProject, loadEditorProject, validateEditorProject, editorStoreDir } from "./editor-studio-core.mjs";
import { buildEditorRenderFiles } from "./editor-studio-engine.mjs";
import { editMotionPlan } from "./motion/editor.mjs";
import { buildOnePromptBlueprint } from "./one-prompt-production.mjs";
import {signedVideoDownload} from "./video-artifact-delivery.mjs";
import { readEditorPreviewReview, saveEditorPreviewReview, requireApprovedEditorPreview } from "./editor-review-gate.mjs";
import { storeEditorVisualAsset } from "./editor-visual-assets.mjs";
import { buildEditorStyleDna, listEditorStylePresets, applyEditorStylePreset } from "./editor-style-presets.mjs";
import { createEditorHomologationProject } from "./editor-homologation.mjs";
import { decodeAudioToPcm, analyzePcmForBeats, synchronizeSceneCutsToBeats } from "./editor-beat-sync.mjs";
import { applyEditorTimelineOperations } from "./editor-timeline.mjs";
import { auditMotionV2 } from "./editor-motion-v2.mjs";
import { storeEditorLayerAsset } from "./editor-layer-assets.mjs";

const MODERN_PROTOCOL = "2026-07-28";
const LEGACY_PROTOCOLS = ["2025-03-26", "2025-06-18", "2025-11-25"];
const SUPPORTED_PROTOCOLS = new Set([...LEGACY_PROTOCOLS, MODERN_PROTOCOL]);
const DEFAULT_PROTOCOL = "2025-06-18";
const NO_CACHE = { ttlMs: 0, cacheScope: "private" };

export const VIDEOS_SECRETS_TOOLS = [
  {
    name:"create_editor_homologation_project",
    description:"Cria um projeto COMPLETO para homologação do editor: MP4 previsto de 24s, cinco cenas 3D, trilha WAV original 120 BPM, grid 2x2 de cards, motion blur, DOF 0–100%, tipografia letra por letra. Não renderiza. A sincronização de BPM e a revisão de todas as prévias devem ocorrer antes do render.",
    inputSchema:{type:"object",additionalProperties:false,properties:{}}
  },
  {
    name:"create_editor_project",
    description:"Transforma uma ideia em um storyboard cinematográfico 3D realmente editável e abre a timeline visual no MediaForge. Padrão: Three.js real, câmera, luz e objetos 3D, não slides. Opcionalmente envie cenas autoradas especificamente para a ideia. Não dispara renderização.",
    inputSchema:{type:"object",additionalProperties:false,properties:{
      idea:{type:"string",minLength:8,maxLength:400},
      brand:{type:"string",maxLength:80},title:{type:"string",maxLength:100},
      timeline_mode:{type:"string",enum:["free","cinematic"]},
      duration_seconds:{type:"integer",minimum:1,maximum:600},fps:{type:"integer",enum:[30,60]},
      aspect_ratio:{type:"string",enum:["9:16","16:9","1:1"]},
      style_preset:{type:"string",enum:["apple-clean","spotify-dark-glow","motivational-bw"]},
      scenes:{type:"array",minItems:3,maxItems:12,items:{type:"object",additionalProperties:false,properties:{
        headline:{type:"string",maxLength:96},kicker:{type:"string",maxLength:45},
        detail:{type:"string",maxLength:150},shape:{type:"string",enum:["torus-knot","icosahedron","sphere","torus","cube","cone","rings"]},
        camera:{type:"string",enum:["orbit","dolly","reveal","truck-left","truck-right","arc"]},
        transition:{type:"string",enum:["cut","match-cut","push","iris","whip","dip"]},
        accent:{type:"string",pattern:"^#[A-Fa-f0-9]{6}$"},
        energy:{type:"number",minimum:0,maximum:1},
        depth:{type:"number",minimum:0,maximum:1},
        depthOfField:{type:"number",minimum:0,maximum:1,description:"Intensidade de desfoque óptico por profundidade da câmera, 0–100%."},
        typography:{type:["object","null"],additionalProperties:false,properties:{
            mode:{type:"string",enum:["whole","words","letters"]},
            family:{type:"string",enum:["sans","serif","mono"]},
            weightFrom:{type:"integer",minimum:100,maximum:900},
            weightTo:{type:"integer",minimum:100,maximum:900},
            bloom:{type:"number",minimum:0,maximum:1},
            bloomColor:{type:"string",pattern:"^#[a-fA-F0-9]{6}$"},
            stagger:{type:"number",minimum:0,maximum:1}
          },required:["mode","family","weightFrom","weightTo","bloom","bloomColor","stagger"]},
        duration_seconds:{type:"number",minimum:1,maximum:30}
      }}}
    },required:["idea"]}
  },
  {
    name:"render_editor_project",
    description:"Envia o projeto editável ao HyperFrames somente após revisão visual APROVADA de todas as prévias na revisão atual (review_editor_preview) e confirmação explícita. Se a revisão for reprovada, edite e revise novamente. Pode renderizar uma cena ou o filme inteiro.",
    inputSchema:{type:"object",additionalProperties:false,properties:{
      project_id:{type:"string",pattern:"^[a-f0-9]{32}$"},
      scene_index:{type:"integer",minimum:0,maximum:11},
      confirm_render:{type:"boolean",const:true},allow_silent:{type:"boolean"}
    },required:["project_id","confirm_render"]}
  },

  {
    name:"upload_editor_asset",
    description:"Importa uma imagem PNG, WEBP ou SVG segura (max 2 MB) como asset privado de um projeto editável. A imagem fica disponível para mockups screen e card-grid na prévia e renderização. Requer anexação à cena via edit_editor_project. Sem download arbitrário de URLs externas.",
    inputSchema:{type:"object",additionalProperties:false,properties:{
      project_id:{type:"string",pattern:"^[a-f0-9]{32}$"},
      filename:{type:"string",maxLength:90},
      base64:{type:"string",maxLength:3000000}
    },required:["project_id","filename","base64"]}
  },
  {
    name:"apply_editor_style_preset",
    description:"Aplica preset nomeado às cenas do Editor Visual sem apagar textos e assets. Cria nova revisão e invalida aprovação de prévia anterior.",
    inputSchema:{type:"object",additionalProperties:false,properties:{
      project_id:{type:"string",pattern:"^[a-f0-9]{32}$"},
      expected_revision:{type:"integer",minimum:0},
      style_preset:{type:"string",enum:["apple-clean","spotify-dark-glow","motivational-bw"]}
    },required:["project_id","expected_revision","style_preset"]}
  },
  {
    name:"get_editor_style_dna",
    description:"Exporta o DNA reutilizável de um projeto Editor 3D: paleta, energia, ritmo em frames, câmeras, transições, formas, glow e layout. Não inclui assets com direitos de terceiros.",
    inputSchema:{type:"object",additionalProperties:false,properties:{
      project_id:{type:"string",pattern:"^[a-f0-9]{32}$"}
    },required:["project_id"]}
  },
  {
    name:"list_editor_style_presets",
    description:"Lista presets nativos do Editor Visual: apple-clean, spotify-dark-glow e motivational-bw.",
    inputSchema:{type:"object",additionalProperties:false}
  },
  {
    name:"sync_editor_beats",
    description:"Analisa automaticamente uma faixa Música anexada ao projeto, estima o BPM por fluxo espectral e reposiciona os cortes da timeline nos pulsos detectados. Preserva duração total, ordem e cenas com pelo menos um segundo. Invalida a aprovação visual anterior.",
    inputSchema:{type:"object",additionalProperties:false,properties:{
      project_id:{type:"string",pattern:"^[a-f0-9]{32}$"},
      audio_id:{type:"string",pattern:"^[a-f0-9]{32}$"}
    },required:["project_id"]}
  },
  {
    name:"get_editor_project",
    description:"Consulta o projeto atualmente editável e suas cenas no Editor Visual MediaForge (somente leitura).",
    inputSchema:{type:"object",additionalProperties:false,properties:{
      project_id:{type:"string",pattern:"^[a-f0-9]{32}$"}
    },required:["project_id"]}
  },

  {
    name:"review_editor_preview",
    description:"Registra a decisão do GPT após VER visualmente no editor as prévias reais de cada cena, em pelo menos dois instantes distintos. Se aprovada, libera a renderização da revisão atual. Se reprovada, volte ao editor, corrija e revise novamente. Esta ferramenta não captura nem inventa imagens; inspecione as prévias antes de declarar aprovação.",
    inputSchema:{type:"object",additionalProperties:false,properties:{
      project_id:{type:"string",pattern:"^[a-f0-9]{32}$"},
      expected_revision:{type:"integer",minimum:0},
      decision:{type:"string",enum:["pass","fail"]},
      summary:{type:"string",maxLength:700},
      checks:{type:"array",minItems:1,maxItems:12,items:{type:"object",additionalProperties:false,properties:{
        scene_id:{type:"string"},
        samples_seconds:{type:"array",minItems:2,maxItems:5,items:{type:"number",minimum:0}},
        preview_ready:{type:"boolean"},text_legible:{type:"boolean"},
        motion_ok:{type:"boolean"},visual_ok:{type:"boolean"},
        notes:{type:"string",minLength:12,maxLength:600}
      },required:["scene_id","samples_seconds","preview_ready","text_legible","motion_ok","visual_ok","notes"]}}
    },required:["project_id","expected_revision","decision","checks"]}
  },
  {
    name:"edit_editor_project",
    description:"Edita cenas de um projeto ativo no editor visual com validação não destrutiva. Não cria histórico e não reinicia renderizações.",
    inputSchema:{type:"object",additionalProperties:false,properties:{
      project_id:{type:"string",pattern:"^[a-f0-9]{32}$"},
      expected_revision:{type:"integer",minimum:0},
      edits:{type:"array",minItems:1,maxItems:12,items:{type:"object",additionalProperties:false,properties:{
        scene_id:{type:"string"},
        changes:{type:"object",additionalProperties:false,properties:{
          headline:{type:"string",maxLength:96},kicker:{type:"string",maxLength:45},
          detail:{type:"string",maxLength:150},shape:{type:"string"},camera:{type:"string"},
          transition:{type:"string"},accent:{type:"string"},energy:{type:"number"},depth:{type:"number"},
          textScale:{type:"number",minimum:0.5,maximum:1.5},
          typography:{type:["object","null"],additionalProperties:false,properties:{
            mode:{type:"string",enum:["whole","words","letters"]},
            family:{type:"string",enum:["sans","serif","mono"]},
            weightFrom:{type:"integer",minimum:100,maximum:900},
            weightTo:{type:"integer",minimum:100,maximum:900},
            bloom:{type:"number",minimum:0,maximum:1},
            bloomColor:{type:"string",pattern:"^#[a-fA-F0-9]{6}$"},
            stagger:{type:"number",minimum:0,maximum:1}
          },required:["mode","family","weightFrom","weightTo","bloom","bloomColor","stagger"]},
          motionBlur:{type:"number",minimum:0,maximum:1,description:"Desfoque temporal real via subframes acumulados no WebGL para objetos e movimentos de câmera; aumenta custo de GPU."},
          depthOfField:{type:"number",minimum:0,maximum:1,description:"Desfoque óptico cinematográfico com amostragem do depth buffer; intensidade 0–100% por cena."},
          glow:{type:["object","null"],additionalProperties:false,properties:{
            color:{type:"string",pattern:"^#[a-fA-F0-9]{6}$"},intensity:{type:"number",minimum:0,maximum:1},
            speed:{type:"number",minimum:0,maximum:3},x:{type:"number",minimum:-1,maximum:1},
            y:{type:"number",minimum:-1,maximum:1}
          },required:["color","intensity","speed","x","y"]},
          visual:{type:["object","null"],additionalProperties:false,properties:{
            type:{type:"string",enum:["screen","card-grid"]},
            assetId:{type:"string",pattern:"^[a-f0-9]{32}$"},
            assetIds:{type:"array",minItems:1,maxItems:12,items:{type:"string",pattern:"^[a-f0-9]{32}$"}},
            position:{type:"array",minItems:3,maxItems:3,items:{type:"number",minimum:-8,maximum:8}},
            rotation:{type:"array",minItems:3,maxItems:3,items:{type:"number",minimum:-180,maximum:180}},
            scale:{type:"number",minimum:0.2,maximum:4},
            depth:{type:"number",minimum:0,maximum:1},
            columns:{type:"integer",minimum:1,maximum:4},
            rows:{type:"integer",minimum:1,maximum:4},
            scroll:{type:"number",minimum:-2,maximum:2}
          },required:["type","assetId","position","rotation","scale","depth"]},
          duration_seconds:{type:"number",minimum:1,maximum:60}
        }}
      },required:["scene_id","changes"]}}
    },required:["project_id","edits"]}
  },
  {
    name:"edit_editor_timeline",
    description:"Edita a timeline multicamada e o Motion Engine V2. Além de texto, vídeo, imagem, legendas e keyframes, aceita motion_v2 declarativo para trajetórias Bézier, entradas laterais, saídas, fundos animados e referência Frame Lab. A prévia e o MP4 HyperFrames usam o MESMO projeto. Não renderiza.",
    inputSchema:{type:"object",additionalProperties:false,properties:{
      project_id:{type:"string",pattern:"^[a-f0-9]{32}$"},
      expected_revision:{type:"integer",minimum:0},
      duration_seconds:{type:"integer",minimum:1,maximum:600},canvas_color:{type:"string",pattern:"^#[a-fA-F0-9]{6}$"},

      motion_v2:{type:"object",description:"Objeto completo motionV2; omitir preserva o atual. Validado pelo motor nativo.",additionalProperties:false,properties:{
        version:{type:"integer",enum:[1]},enabled:{type:"boolean"},hideSceneTitles:{type:"boolean"},
        frameLabProjectId:{type:"string",pattern:"^[a-f0-9]{32}$"},
        background:{type:"object",additionalProperties:false,properties:{
          keyframes:{type:"array",minItems:1,maxItems:120,items:{type:"object",additionalProperties:false,properties:{
            frame:{type:"integer",minimum:0},color:{type:"string",pattern:"^#[a-fA-F0-9]{6}$"},
            accent:{type:"string",pattern:"^#[a-fA-F0-9]{6}$"},
            pattern:{type:"string",enum:["solid","gradient","grid","rings"]},
            panX:{type:"number",minimum:-30,maximum:30},panY:{type:"number",minimum:-30,maximum:30},
            zoom:{type:"number",minimum:1,maximum:1.6},ease:{}
          },required:["frame","color","accent","pattern"]}}
        }},
        moves:{type:"object",additionalProperties:{type:"object",additionalProperties:false,properties:{
          enter:{type:"object",additionalProperties:false,properties:{
            from:{type:"string",enum:["none","left","right","top","bottom"]},
            frames:{type:"integer",minimum:1,maximum:180},ease:{},mask:{type:"string",enum:["none","wipe"]}
          },required:["from","frames"]},
          exit:{type:"object",additionalProperties:false,properties:{
            to:{type:"string",enum:["none","left","right","top","bottom"]},
            frames:{type:"integer",minimum:1,maximum:180},ease:{},mask:{type:"string",enum:["none","wipe"]}
          },required:["to","frames"]},
          path:{type:"array",minItems:2,maxItems:120,items:{type:"object",additionalProperties:false,properties:{
            frame:{type:"integer",minimum:0},x:{type:"number",minimum:-4320,maximum:4320},
            y:{type:"number",minimum:-4320,maximum:4320},
            in:{type:"array",minItems:2,maxItems:2,items:{type:"number"}},
            out:{type:"array",minItems:2,maxItems:2,items:{type:"number"}},
            ease:{}
          },required:["frame","x","y"]}}
        }}}
      },required:["version","enabled"]},

      layer_operations:{type:"array",maxItems:80,items:{type:"object",additionalProperties:false,properties:{
        action:{type:"string",enum:["add","update","remove","reorder","add_keyframe","remove_keyframe"]},
        layer_id:{type:"string",pattern:"^[a-f0-9]{32}$"},
        zIndex:{type:"integer",minimum:-100,maximum:200},
        frame:{type:"integer",minimum:0},
        layer:{type:"object",additionalProperties:false,properties:{
          id:{type:"string",pattern:"^[a-f0-9]{32}$"},name:{type:"string",maxLength:90},
          type:{type:"string",enum:["video","image","text","shape"]},assetId:{type:"string",pattern:"^[a-f0-9]{32}$"},
          text:{type:"string",maxLength:1200},color:{type:"string",pattern:"^#[A-Fa-f0-9]{6}$"},
          background:{type:"string",maxLength:240},fontFamily:{type:"string",enum:["sans","serif","mono","impact","verdana","trebuchet","tahoma","times"]},
          fontSize:{type:"number",minimum:8,maximum:360},fontWeight:{type:"integer",minimum:100,maximum:900},
          textAlign:{type:"string",enum:["left","center","right"]},
          x:{type:"number",minimum:-4320,maximum:4320},y:{type:"number",minimum:-4320,maximum:4320},
          z:{type:"number",minimum:-10000,maximum:10000},width:{type:"number",minimum:1,maximum:4320},
          height:{type:"number",minimum:1,maximum:4320},rotationX:{type:"number",minimum:-3600,maximum:3600},
          rotationY:{type:"number",minimum:-3600,maximum:3600},rotationZ:{type:"number",minimum:-3600,maximum:3600},
          scale:{type:"number",minimum:0.01,maximum:20},opacity:{type:"number",minimum:0,maximum:1},
          zIndex:{type:"integer",minimum:-100,maximum:200},startFrame:{type:"integer",minimum:0},
          endFrame:{type:"integer",minimum:1},blendMode:{type:"string",enum:["normal","screen","multiply","overlay","lighten","darken"]},
          trimStartSeconds:{type:"number",minimum:0},speed:{type:"number",minimum:0.1,maximum:4},loop:{type:"boolean"},
          transitionIn:{type:"object",additionalProperties:false,properties:{type:{type:"string",enum:["fade","slide-left","slide-right","wipe"]},frames:{type:"integer",minimum:1,maximum:180}},required:["type","frames"]},
          transitionOut:{type:"object",additionalProperties:false,properties:{type:{type:"string",enum:["fade","slide-left","slide-right","wipe"]},frames:{type:"integer",minimum:1,maximum:180}},required:["type","frames"]},
          keyframes:{type:"array",maxItems:120,items:{type:"object",additionalProperties:false,properties:{
            frame:{type:"integer",minimum:0},easing:{type:"string",enum:["linear","ease-in","ease-out","ease-in-out","spring"]},
            x:{type:"number"},y:{type:"number"},z:{type:"number"},width:{type:"number"},height:{type:"number"},
            scale:{type:"number"},rotationX:{type:"number"},rotationY:{type:"number"},rotationZ:{type:"number"},opacity:{type:"number"}
          },required:["frame"]}}
        }},
        changes:{type:"object",additionalProperties:false,properties:{
          name:{type:"string",maxLength:90},type:{type:"string",enum:["video","image","text","shape"]},
          assetId:{type:"string",pattern:"^[a-f0-9]{32}$"},text:{type:"string",maxLength:1200},
          color:{type:"string",pattern:"^#[A-Fa-f0-9]{6}$"},background:{type:"string",maxLength:240},
          fontFamily:{type:"string",enum:["sans","serif","mono","impact","verdana","trebuchet","tahoma","times"]},fontSize:{type:"number",minimum:8,maximum:360},
          fontWeight:{type:"integer",minimum:100,maximum:900},textAlign:{type:"string",enum:["left","center","right"]},
          x:{type:"number"},y:{type:"number"},z:{type:"number"},width:{type:"number"},height:{type:"number"},
          rotationX:{type:"number"},rotationY:{type:"number"},rotationZ:{type:"number"},scale:{type:"number"},
          opacity:{type:"number",minimum:0,maximum:1},zIndex:{type:"integer",minimum:-100,maximum:200},
          startFrame:{type:"integer",minimum:0},endFrame:{type:"integer",minimum:1},
          blendMode:{type:"string",enum:["normal","screen","multiply","overlay","lighten","darken"]},
          trimStartSeconds:{type:"number",minimum:0},speed:{type:"number",minimum:0.1,maximum:4},loop:{type:"boolean"},
          transitionIn:{type:"object",additionalProperties:false,properties:{type:{type:"string",enum:["fade","slide-left","slide-right","wipe"]},frames:{type:"integer",minimum:1,maximum:180}},required:["type","frames"]},
          transitionOut:{type:"object",additionalProperties:false,properties:{type:{type:"string",enum:["fade","slide-left","slide-right","wipe"]},frames:{type:"integer",minimum:1,maximum:180}},required:["type","frames"]},
          keyframes:{type:"array",maxItems:120,items:{type:"object",additionalProperties:false,properties:{
            frame:{type:"integer",minimum:0},easing:{type:"string",enum:["linear","ease-in","ease-out","ease-in-out","spring"]},
            x:{type:"number"},y:{type:"number"},z:{type:"number"},width:{type:"number"},height:{type:"number"},
            scale:{type:"number"},rotationX:{type:"number"},rotationY:{type:"number"},rotationZ:{type:"number"},opacity:{type:"number"}
          },required:["frame"]}}
        }},
        keyframe:{type:"object",additionalProperties:false,properties:{
          frame:{type:"integer",minimum:0},easing:{type:"string",enum:["linear","ease-in","ease-out","ease-in-out","spring"]},
          x:{type:"number"},y:{type:"number"},z:{type:"number"},width:{type:"number"},height:{type:"number"},
          scale:{type:"number"},rotationX:{type:"number"},rotationY:{type:"number"},rotationZ:{type:"number"},opacity:{type:"number"}
        },required:["frame"]}
      },required:["action"]}},
      caption_operations:{type:"array",maxItems:120,items:{type:"object",additionalProperties:false,properties:{
        action:{type:"string",enum:["add","update","remove"]},caption_id:{type:"string",pattern:"^[a-f0-9]{32}$"},
        caption:{type:"object",additionalProperties:false,properties:{
          id:{type:"string",pattern:"^[a-f0-9]{32}$"},text:{type:"string",maxLength:500},
          startFrame:{type:"integer",minimum:0},endFrame:{type:"integer",minimum:1},
          style:{type:"string",enum:["karaoke","boxed","minimal","outline"]},
          animation:{type:"string",enum:["none","fade","rise","typewriter"]},
          x:{type:"number",minimum:0,maximum:1080},y:{type:"number",minimum:0,maximum:1920},
          width:{type:"number",minimum:100,maximum:1080},fontSize:{type:"number",minimum:18,maximum:120},
          color:{type:"string",pattern:"^#[A-Fa-f0-9]{6}$"},highlightColor:{type:"string",pattern:"^#[A-Fa-f0-9]{6}$"},
          backgroundColor:{type:"string",pattern:"^#[A-Fa-f0-9]{6}$"},backgroundOpacity:{type:"number",minimum:0,maximum:1},
          zIndex:{type:"integer",minimum:0,maximum:200},align:{type:"string",enum:["left","center","right"]},
          wordTimings:{type:"array",items:{type:"object",additionalProperties:false,properties:{
            startFrame:{type:"integer",minimum:0},endFrame:{type:"integer",minimum:1}
          },required:["startFrame","endFrame"]}}
        }},
        changes:{type:"object",additionalProperties:false,properties:{
          text:{type:"string",maxLength:500},startFrame:{type:"integer",minimum:0},endFrame:{type:"integer",minimum:1},
          style:{type:"string",enum:["karaoke","boxed","minimal","outline"]},animation:{type:"string",enum:["none","fade","rise","typewriter"]},
          x:{type:"number",minimum:0,maximum:1080},y:{type:"number",minimum:0,maximum:1920},
          width:{type:"number",minimum:100,maximum:1080},fontSize:{type:"number",minimum:18,maximum:120},
          color:{type:"string",pattern:"^#[A-Fa-f0-9]{6}$"},highlightColor:{type:"string",pattern:"^#[A-Fa-f0-9]{6}$"},
          backgroundColor:{type:"string",pattern:"^#[A-Fa-f0-9]{6}$"},backgroundOpacity:{type:"number",minimum:0,maximum:1},
          zIndex:{type:"integer",minimum:0,maximum:200},align:{type:"string",enum:["left","center","right"]},
          wordTimings:{type:"array",items:{type:"object",additionalProperties:false,properties:{
            startFrame:{type:"integer",minimum:0},endFrame:{type:"integer",minimum:1}
          },required:["startFrame","endFrame"]}}
        }}
      },required:["action"]}}
    },required:["project_id"]}
  },
  {
    name:"upload_editor_layer_asset",
    description:"Importa vídeo MP4 ou WebM de até 16 MB como asset privado do projeto. Depois use edit_editor_timeline para criar uma camada type=video com assetId retornado. Não usa URLs externas e não renderiza.",
    inputSchema:{type:"object",additionalProperties:false,properties:{
      project_id:{type:"string",pattern:"^[a-f0-9]{32}$"},filename:{type:"string",maxLength:90},
      base64:{type:"string",maxLength:22400000}
    },required:["project_id","filename","base64"]}
  },
  {
    name:"list_editing_styles",
    description:"Lista os estilos de edição reutilizáveis gravados no MediaForge, incluindo identificadores para plan_video_from_brief. Não inicia renderização.",
    inputSchema:{type:"object",additionalProperties:false}
  },
  {
    name:"edit_motion_plan",
    description:"Editor intermediário não destrutivo de timeline MediaForge. Ajuste textos, duração de cenas, câmera, transições, posições de eventos, volume de áudio, alinhamento de efeitos e cores, sem alterar ou reiniciar trabalhos existentes. Retorna uma nova revisão do motion_plan validada; só gera MP4 quando enviada depois ao create_motion_video.",
    inputSchema:{
      type:"object",additionalProperties:false,
      properties:{
        motion_plan:{type:"object",description:"Plano mediaforge-motion-v1 original ou última revisão editada"},
        expected_revision:{type:"integer",minimum:0,description:"Controle otimista: evita sobrescrever revisão mais nova"},
        edits:{type:"array",minItems:1,maxItems:16,items:{
          type:"object",additionalProperties:false,
          properties:{
            action:{type:"string",enum:["set_text","set_camera","set_transition","set_scene_duration","set_audio_volume","align_sfx","set_event_timing","set_palette_color"]},
            scene_id:{type:"string"},cue_id:{type:"string"},event_id:{type:"string"},
            field:{type:"string",enum:["headline","eyebrow","detail","metricLabel","controlLabel"]},
            text:{type:"string"},camera:{type:"string"},transition:{type:"string"},frames:{type:"integer",minimum:1},
            volume:{type:"number",minimum:0,maximum:1},
            color_key:{type:"string",enum:["ground","ink","accent","paper"]},
            color:{type:"string",pattern:"^#[a-fA-F0-9]{6}$"},
            timing:{type:"object",additionalProperties:false,properties:{
              startFrame:{type:"integer",minimum:0},peakFrame:{type:"integer",minimum:1},endFrame:{type:"integer",minimum:1}
            },required:["startFrame","peakFrame","endFrame"]}
          },required:["action"]
        }}
      },required:["motion_plan","edits"]
    }
  },
  {
    name:"plan_video_from_brief",
    description:"Direção completa via chat: diga apenas empresa e ideia. Entrega estratégia de compra/curtidas/compartilhamento, cinco cenas, roteiro, mapa de assets e sons, câmera, transições e critérios de QA. Planejamento não cria MP4 nem inventa marca, produtos ou métricas.",
    inputSchema:{
      type:"object",additionalProperties:false,
      properties:{
        brand:{type:"string",minLength:2,maxLength:90},
        idea:{type:"string",minLength:8,maxLength:400},
        goal:{type:"string",enum:["sales","likes","shares","awareness"]},
        editing_style:{type:"string",enum:["minimal-outline-explainer-v1"],description:"Preset reutilizável de direção de arte e animação: Motion Minimalista P&B, inspirado na referência enviada em 17/11/2026."},
        voice_mode:{type:"string",enum:["auto","off","pt-BR-female","pt-BR-male"]},
        audience:{type:"string",maxLength:140},
        brand_url:{type:"string",maxLength:350},
        logo_asset_path:{type:"string",maxLength:240},
        duration_seconds:{type:"integer",minimum:10,maximum:40},
        fps:{type:"integer",enum:[24,25,30,50,60]},
        aspect_ratio:{type:"string",enum:["9:16","16:9","1:1"]},
        claims:{type:"array",maxItems:12,items:{type:"object",additionalProperties:false,properties:{text:{type:"string",maxLength:160},source:{type:"string",maxLength:300}},required:["text"]}}
      },required:["brand","idea"]
    }
  },
  {
    name: "create_video",
    description: "Produção de vídeo com Premium Motion como padrão: 60 FPS, high/delivery, preflight, movimento GSAP, trilha e micro-SFX. Para estudo silencioso use production_profile=study; para mídia cinematográfica especializada use create_motion_video.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 160 },
        prompt: { type: "string", minLength: 8, maxLength: 5000 },
        duration_seconds: { type: "integer", minimum: 10, maximum: 3600 },
        aspect_ratio: { type: "string", enum: ["16:9", "9:16", "1:1"] },
        resolution: { type: "string", description: "HyperFrames preset, e.g. portrait-4k" },
        fps: { type: "integer", minimum: 1, maximum: 240 },
        quality: { type: "string", enum: ["draft", "looks", "standard", "high", "delivery"] },
        workers: { type: "integer", minimum: 1, maximum: 64 },
        preflight: { type: "boolean" },
        production_profile: { type: "string", enum: ["premium-motion-v1", "study"], description: "Padrão para anúncios: Premium Motion. study permite testes visuais ou vídeos intencionalmente silenciosos." },
        project_files: {
          type: "array",
          minItems: 1,
          maxItems: 80,
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              content: { type: "string" },
              encoding: { type: "string", enum: ["utf8", "base64"] }
            },
            required: ["path", "content"]
          }
        }
      },
      required: ["title", "prompt", "duration_seconds", "aspect_ratio", "project_files"]
    }
  },
  {
    name: "create_motion_video",
    description: "Cria vídeo cinematográfico no Worker Windows usando compositor validado MediaForge: planos reais em movimento, câmera GSAP, trilha e micro-SFX com eventos sincronizados. Bloqueia mídia ausente, fotos repetidas e entregas sem áudio. Requer plano mediaforge-motion-v1 com productionMode=cinematic e assets locais em base64.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        motion_plan: { type: "object", description: "Frame-based plan: format=mediaforge-motion-v1, productionMode=cinematic, audioMode=voice-led or sound-design, scenes, events and audioCues" },
        asset_files: { type: "array", minItems: 1, maxItems: 72, items: { type: "object", additionalProperties: false, properties: { path: {type:"string"}, content: {type:"string"}, encoding: {type:"string",enum:["base64","utf8"]} }, required:["path","content","encoding"] } },
        quality: {type:"string",enum:["draft","looks","standard","high","delivery"]}
      },
      required: ["motion_plan","asset_files"]
    }
  },
  {
    name: "create_cinematic_3d",
    description: "Cria um vídeo 3D cinematográfico real com Three.js local, luz física, câmera suave, motion blur e opção de importar GLB 2.0. Envia projeto completo ao Worker HyperFrames.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string", maxLength: 160 },
        headline: { type: "string", maxLength: 120 },
        subtitle: { type: "string", maxLength: 180 },
        duration_seconds: { type: "integer", minimum: 10, maximum: 30 },
        aspect_ratio: { type: "string", enum: ["16:9", "9:16", "1:1"] },
        shape: { type: "string", enum: ["torus-knot", "torus", "sphere", "cube"] },
        accent_color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
        camera: { type: "string", enum: ["dolly", "orbit", "reveal"] },
        model_glb_base64: { type: "string", description: "Optional complete GLB 2.0 model embedded as base64 (max 8MB; no external dependencies)" },
        quality: { type: "string", enum: ["draft", "looks", "standard", "high", "delivery"] },
        browser_gpu: { type: "boolean" },
        preflight: { type: "boolean" }
      },
      required: ["title"]
    }
  },
  {
    name: "renderer_status",
    description: "Verifica o worker local e a fila do MediaForge.",
    inputSchema: { type: "object", additionalProperties: false }
  },
  {
    name: "list_videos",
    description: "Lista os jobs recentes de vídeo.",
    inputSchema: { type: "object", additionalProperties: false }
  },
  {
    name: "get_video",
    description: "Consulta o estado e o artefato de um job.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", pattern: "^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$" } },
      required: ["id"]
    }
  },
  ...FRAME_LAB_MCP_TOOLS
];

function requestToken(request) {
  const header = String(request.headers.authorization ?? "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function tokenMatches(actual, expected) {
  if (!actual || !expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function requireBearer(request, authenticateBearer) {
  const token = requestToken(request);
  if (authenticateBearer) {
    const authenticated = await authenticateBearer(token);
    if (authenticated) return authenticated;
  }

  const expected = process.env.MEDIAFORGE_MCP_TOKEN ?? "";
  const host = process.env.MEDIAFORGE_HOST ?? "127.0.0.1";
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(host);
  const required = process.env.MEDIAFORGE_REQUIRE_AUTH === "true" || !loopback;

  if (!required) return { scopes: ["videos:read", "videos:write", "offline_access"], legacy: true };
  // OAuth bearer tokens are validated by authenticateBearer above. The
  // static legacy token is optional; if it is absent, an unauthenticated or
  // invalid request is still an authentication challenge (401), not a server
  // configuration failure (500).
  if (!tokenMatches(token, expected)) {
    const error = new Error("MCP authentication required");
    error.code = "MCP_AUTH_REQUIRED";
    error.status = 401;
    throw error;
  }
  return { scopes: ["videos:read", "videos:write", "offline_access"], legacy: true };
}

function protocolVersion(request, params) {
  // MCP 2026-07-28 is stateless: clients advertise their version in
  // request params._meta; legacy clients still use the HTTP header.
  const requested = String(
    params?._meta?.["io.modelcontextprotocol/protocolVersion"]
      ?? request.headers["mcp-protocol-version"]
      ?? params?.protocolVersion
      ?? DEFAULT_PROTOCOL
  );
  return SUPPORTED_PROTOCOLS.has(requested) ? requested : DEFAULT_PROTOCOL;
}

function writeJson(response, status, body, version) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "mcp-protocol-version": version
  });
  response.end(JSON.stringify(body));
}

function writeResult(response, id, result, version) {
  writeJson(response, 200, { jsonrpc: "2.0", id, result }, version);
}

function writeError(response, id, code, message, status, version) {
  writeJson(response, status, {
    jsonrpc: "2.0",
    id,
    error: { code, message }
  }, version);
}

function textResult(value, isError = false, version = DEFAULT_PROTOCOL) {
  return {
    ...(version === MODERN_PROTOCOL ? { resultType: "complete" } : {}),
    content: [{ type: "text", text: JSON.stringify(value) }],
    isError
  };
}

function toolByName(name) {
  return VIDEOS_SECRETS_TOOLS.find((tool) => tool.name === name) ?? null;
}

export async function handleVideosSecretsMcp({
  request,
  response,
  parseBody,
  createJob,
  listJobs,
  getJob,
  rendererStatus,
  authenticateBearer
}) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "Content-Type, Authorization, MCP-Protocol-Version",
      "access-control-allow-methods": "POST, OPTIONS"
    });
    response.end();
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, { allow: "POST, OPTIONS" });
    response.end();
    return;
  }

  let body;
  let auth;
  try {
    body = await parseBody(request);
    auth = await requireBearer(request, authenticateBearer);
  } catch (error) {
    const status = error.status ?? 400;
    const version = DEFAULT_PROTOCOL;
    if (status === 401) {
      response.setHeader("www-authenticate", 'Bearer resource_metadata="' + (process.env.MEDIAFORGE_OAUTH_ISSUER ?? "https://mediaforge.salevo.site").replace(/[/]$/, "") + '/.well-known/oauth-protected-resource/mcp", scope="videos:read videos:write"');
    }
    return writeError(response, body?.id ?? null, -32000, error.message, status, version);
  }

  const id = body?.id ?? null;
  const method = String(body?.method ?? "");
  const params = body?.params && typeof body.params === "object" ? body.params : {};
  const version = protocolVersion(request, params);

  try {
    if (method === "initialize") {
      return writeResult(response, id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "mediaforge", version: "0.3.0" }
      }, version);
    }

    if (method === "notifications/initialized") {
      response.writeHead(202);
      response.end();
      return;
    }

    if (method === "server/discover") {
      // ChatGPT now probes the MCP 2026-07-28 stateless protocol first.
      // A tools/list payload here is invalid and breaks action discovery
      // even after OAuth succeeds. Keep initialize for legacy clients.
      return writeResult(response, id, {
        resultType: "complete",
        supportedVersions: [MODERN_PROTOCOL, ...LEGACY_PROTOCOLS],
        capabilities: { tools: { listChanged: false } },
        _meta: {
          "io.modelcontextprotocol/serverInfo": {
            name: "mediaforge", version: "0.3.0"
          }
        },
        ...NO_CACHE
      }, MODERN_PROTOCOL);
    }

    if (method === "tools/list") {
      return writeResult(response, id, {
        ...(version === MODERN_PROTOCOL ? { resultType: "complete", ...NO_CACHE } : {}),
        tools: VIDEOS_SECRETS_TOOLS
      }, version);
    }

    if (method !== "tools/call") {
      return writeError(response, id, -32601, "Method not found", 404, version);
    }

    const name = String(params.name ?? "");
    const args = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
    if (!toolByName(name)) {
      return writeError(response, id, -32602, "Unknown tool", 400, version);
    }

    if (FRAME_LAB_MCP_NAMES.has(name)) {
      const scope = FRAME_LAB_MCP_READ_TOOLS.has(name) ? "videos:read" : "videos:write";
      if (!auth.scopes.includes(scope))
        return writeError(response, id, -32003, "Insufficient Frame Lab scope: "+scope, 403, version);
      // Import the analyzer only for Frame Lab operations, leaving video MCP resilient.
      const { executeFrameLabMcp } = await import("../frame-lab/mcp-actions.mjs");
      const result = await executeFrameLabMcp(name, args, { createJob, getJob });
      return writeResult(response, id, textResult(result, false, version), version);
    }

    if(name==="create_editor_homologation_project"){
      if(!auth.scopes.includes("videos:write"))return writeError(response,id,-32003,"Insufficient scope",403,version);
      const result=await createEditorHomologationProject();
      return writeResult(response,id,textResult({ok:true,projectId:result.project.id,
        revision:result.project.revision,editorUrl:result.editorUrl,audio:result.audio,
        assets:result.visualAssets,scenes:result.project.scenes,
        nextSteps:result.nextSteps},false,version),version);
    }
    if(name==="create_editor_project"){
      if(!auth.scopes.includes("videos:write"))return writeError(response,id,-32003,"Insufficient scope",403,version);
      if(args.timeline_mode!=="free"&&args.duration_seconds!==undefined&&(args.duration_seconds<10||args.duration_seconds>60))return writeError(response,id,-32602,"Storyboard 3D suporta 10–60 s; use timeline_mode=free para 1–600 s.",422,version);
      const project=await saveEditorProject(makeEditorProject(args));
      return writeResult(response,id,textResult({
        ok:true,projectId:project.id,revision:project.revision,
        editorUrl:"https://unificmedia.salevo.site/editor?project="+project.id,
        timelineMode:project.mode,durationSeconds:project.totalFrames/project.fps,
        scenes:project.scenes.map(s=>({id:s.id,headline:s.headline,durationSeconds:(s.endFrame-s.startFrame)/project.fps,
          shape:s.shape,camera:s.camera})),
        message:project.mode==="timeline-free"?"Timeline livre criada sem cenas: adicione clipes, keyframes e áudio.":"Storyboard 3D editável criado."
      },false,version),version);
    }
    if(name==="render_editor_project"){
      if(!auth.scopes.includes("videos:write"))return writeError(response,id,-32003,"Insufficient scope",403,version);
      if(args.confirm_render!==true)return writeError(response,id,-32602,"RENDER_CONFIRMATION_REQUIRED",428,version);
      const project=await loadEditorProject(args.project_id);
      const sceneIndex=args.scene_index===undefined?undefined:Number(args.scene_index);
      if(sceneIndex!==undefined&&(!Number.isInteger(sceneIndex)||sceneIndex<0||sceneIndex>=project.scenes.length))
        return writeError(response,id,-32602,"SCENE_NOT_FOUND",422,version);
      if(project.mode==="timeline-free"&&!project.audio.length&&args.allow_silent!==true)
        return writeError(response,id,-32602,"Timeline sem áudio: importe música/voz/SFX ou confirme allow_silent=true.",422,version);
      const previewReview=await requireApprovedEditorPreview(project);
      const files=await buildEditorRenderFiles(project,{sceneIndex});
      if(sceneIndex===undefined)for(const track of project.audio){
        const data=await readFile(join(editorStoreDir(),project.id+"-audio-"+track.assetId+"."+track.extension));
        files.push({path:"assets/audio/"+track.assetId+"."+track.extension,contentBase64:data.toString("base64")});
      }
      const duration=sceneIndex===undefined?project.totalFrames/project.fps:
        (project.scenes[sceneIndex].endFrame-project.scenes[sceneIndex].startFrame)/project.fps;
      const job=await createJob({prompt:project.idea,
        project:{title:project.title+(sceneIndex===undefined?"":" / Cena "+(sceneIndex+1)),
          durationSeconds:duration,aspectRatio:project.aspectRatio,outputs:["video"],renderer:"hyperframes",
          fps:project.fps,preflight:true,quality:sceneIndex===undefined?"high":"draft",
          resolution:project.aspectRatio==="9:16"?"portrait":project.aspectRatio==="16:9"?"landscape":"square"},
        projectFiles:files,
        metadata:{source:"mediaforge-visual-editor",mode:"controlled-test",editorProjectId:project.id,
          editorSceneIndex:sceneIndex??null,productionMode:project.mode,
          expectsAudio:sceneIndex===undefined&&project.audio.length>0,artisticQA:"pending-user-review",
          previewReviewRevision:previewReview.revision,previewReviewStatus:previewReview.status}
      });
      return writeResult(response,id,textResult({ok:true,jobId:job.id,status:job.status,
        editorUrl:"https://unificmedia.salevo.site/editor?project="+project.id,
        message:"Render HyperFrames iniciado a partir do projeto editável; o projeto original foi preservado."},false,version),version);
    }

    if(name==="list_editor_style_presets"){
      if(!auth.scopes.includes("videos:read"))return writeError(response,id,-32003,"Insufficient scope",403,version);
      return writeResult(response,id,textResult({styles:listEditorStylePresets()},false,version),version);
    }
    if(name==="get_editor_style_dna"){
      if(!auth.scopes.includes("videos:read"))return writeError(response,id,-32003,"Insufficient scope",403,version);
      const project=await loadEditorProject(args.project_id);
      return writeResult(response,id,textResult({ok:true,dna:buildEditorStyleDna(project)},false,version),version);
    }
    if(name==="apply_editor_style_preset"){
      if(!auth.scopes.includes("videos:write"))return writeError(response,id,-32003,"Insufficient scope",403,version);
      const old=await loadEditorProject(args.project_id);
      if(args.expected_revision!==old.revision)return writeError(response,id,-32602,"EDITOR_REVISION_CONFLICT",409,version);
      const updated=applyEditorStylePreset(old,args.style_preset);
      validateEditorProject(updated);
      const project=await saveEditorProject(updated,{expectedRevision:old.revision});
      return writeResult(response,id,textResult({ok:true,project,previewReview:await readEditorPreviewReview(project)},false,version),version);
    }
    if(name==="upload_editor_asset"){
      if(!auth.scopes.includes("videos:write"))return writeError(response,id,-32003,"Insufficient scope",403,version);
      const old=await loadEditorProject(args.project_id);
      const {project,asset}=await storeEditorVisualAsset(old,args);
      return writeResult(response,id,textResult({ok:true,asset,revision:project.revision,
        nextStep:"Use edit_editor_project com visual.assetId para posicionar a imagem numa cena.",
        editorUrl:"https://unificmedia.salevo.site/editor?project="+project.id},false,version),version);
    }
    if(name==="get_editor_project"){
      if(!auth.scopes.includes("videos:read"))return writeError(response,id,-32003,"Insufficient scope",403,version);
      const project=await loadEditorProject(args.project_id);
      return writeResult(response,id,textResult({ok:true,project,previewReview:await readEditorPreviewReview(project),
        editorUrl:"https://unificmedia.salevo.site/editor?project="+project.id},false,version),version);
    }

    if(name==="sync_editor_beats"){
      if(!auth.scopes.includes("videos:write"))return writeError(response,id,-32003,"Insufficient scope",403,version);
      const old=await loadEditorProject(args.project_id);
      const track=old.audio.find(a=>a.role==="music"&&(!args.audio_id||a.id===args.audio_id||a.assetId===args.audio_id));
      if(!track)return writeError(response,id,-32602,"MUSIC_TRACK_REQUIRED: adicione uma faixa com o papel Música.",422,version);
      const bytes=await readFile(join(editorStoreDir(),old.id+"-audio-"+track.assetId+"."+track.extension));
      const samples=await decodeAudioToPcm(bytes,{maxSeconds:Math.min(60,(track.endFrame-track.startFrame)/old.fps)});
      const analysis=analyzePcmForBeats(samples);
      const synced=synchronizeSceneCutsToBeats(old,analysis,track);
      const project=await saveEditorProject(synced.project,{expectedRevision:old.revision});
      return writeResult(response,id,textResult({ok:true,project,
        analysis:{bpm:analysis.bpm,confidence:analysis.confidence,beatCount:analysis.beatTimes.length,
          beatIntervalSeconds:analysis.beatIntervalSeconds},
        sync:{syncedCuts:synced.syncedCuts,totalCuts:synced.totalCuts,cutFrames:synced.cutFrames,
          offsetFrames:synced.offsetFrames,maxShiftSeconds:synced.maxShiftSeconds},
        nextStep:"Revise novamente as prévias de todas as cenas antes de renderizar."},false,version),version);
    }
    if(name==="review_editor_preview"){
      if(!auth.scopes.includes("videos:write"))return writeError(response,id,-32003,"Insufficient scope",403,version);
      const project=await loadEditorProject(args.project_id);
      const review=await saveEditorPreviewReview(project,args);
      return writeResult(response,id,textResult({ok:true,...review,
        editorUrl:"https://unificmedia.salevo.site/editor?project="+project.id,
        nextStep:review.approved?"render_editor_project":"edit_editor_project",
        message:review.approved
          ?"Prévia verificada e aprovada. Renderização da revisão atual liberada."
          :"Prévia reprovada. Volte ao editor, corrija e verifique novamente."
      },false,version),version);
    }
    if(name==="upload_editor_layer_asset"){
      if(!auth.scopes.includes("videos:write"))return writeError(response,id,-32003,"Insufficient scope",403,version);
      const old=await loadEditorProject(args.project_id);
      const result=await storeEditorLayerAsset(old,args);
      return writeResult(response,id,textResult({ok:true,asset:result.asset,revision:result.project.revision,
        nextStep:"Use edit_editor_timeline com layer_operations action=add, type=video e assetId retornado.",
        editorUrl:"https://unificmedia.salevo.site/editor?project="+result.project.id},false,version),version);
    }
    if(name==="edit_editor_timeline"){
      if(!auth.scopes.includes("videos:write"))return writeError(response,id,-32003,"Insufficient scope",403,version);
      const old=await loadEditorProject(args.project_id);
      if(args.expected_revision!==undefined&&args.expected_revision!==old.revision)
        return writeError(response,id,-32602,"EDITOR_REVISION_CONFLICT",409,version);
      const layers=args.layer_operations??[],captions=args.caption_operations??[];
      if((!layers.length&&!captions.length&&args.motion_v2===undefined&&args.duration_seconds===undefined&&args.canvas_color===undefined)||layers.length>80||captions.length>120)
        return writeError(response,id,-32602,"Informe operações de camadas, legendas ou motion_v2.",422,version);
      const next=applyEditorTimelineOperations(old,{layer_operations:layers,caption_operations:captions});
      if(args.duration_seconds!==undefined||args.canvas_color!==undefined){
        if(old.mode!=="timeline-free")return writeError(response,id,-32602,"Use timeline_mode=free para duração e tela livres.",422,version);
        if(args.duration_seconds!==undefined){
          const end=Math.round(args.duration_seconds*old.fps);
          if([...next.layers,...next.captions,...next.audio].some(item=>item.endFrame>end))
            return writeError(response,id,-32602,"Há clipes além da nova duração; mova ou corte antes de encurtar.",422,version);
          next.totalFrames=end;
        }
        if(args.canvas_color!==undefined)next.canvasColor=args.canvas_color;
      }
      if(args.motion_v2!==undefined){
        if(old.mode==="timeline-free")return writeError(response,id,-32602,"Use keyframes das camadas no modo livre; motion_v2 é do editor 3D.",422,version);
        next.motionV2=args.motion_v2;
      }
      validateEditorProject(next);
      const project=await saveEditorProject(next,{expectedRevision:old.revision});
      return writeResult(response,id,textResult({ok:true,revision:project.revision,
        timelineMode:project.mode,durationSeconds:project.totalFrames/project.fps,canvasColor:project.canvasColor??null,
        layers:project.layers,captions:project.captions,
        motionV2:project.motionV2??null,motionQA:auditMotionV2(project),
        previewReview:await readEditorPreviewReview(project),
        editorUrl:"https://unificmedia.salevo.site/editor?project="+project.id,
        nextStep:"Atualize a prévia do editor e verifique os keyframes e as legendas em vários frames antes de renderizar."},false,version),version);
    }
    if(name==="edit_editor_project"){
      if(!auth.scopes.includes("videos:write"))return writeError(response,id,-32003,"Insufficient scope",403,version);
      const old=await loadEditorProject(args.project_id);
      if(args.expected_revision!==undefined&&args.expected_revision!==old.revision)
        return writeError(response,id,-32602,"EDITOR_REVISION_CONFLICT",409,version);
      if(!Array.isArray(args.edits)||!args.edits.length||args.edits.length>12)
        return writeError(response,id,-32602,"Invalid edits",422,version);
      const copy=JSON.parse(JSON.stringify(old));
      for(const edit of args.edits){
        const index=copy.scenes.findIndex(s=>s.id===edit.scene_id);
        if(index<0)return writeError(response,id,-32602,"Scene not found",422,version);
        const patch=edit.changes||{},scene=copy.scenes[index];
        const allowed=["headline","kicker","detail","shape","camera","transition","accent","energy","depth","textScale","visual","glow","motionBlur","typography","depthOfField"];
        if(Object.keys(patch).some(k=>![...allowed,"duration_seconds"].includes(k)))
          return writeError(response,id,-32602,"Unsupported property",422,version);
        if(patch.duration_seconds!==undefined){
          const next=copy.scenes[index+1];
          if(!next)return writeError(response,id,-32602,"Last scene duration fixed by total timeline",422,version);
          const frames=Math.round(Number(patch.duration_seconds)*copy.fps);
          const available=next.endFrame-scene.startFrame;
          if(!Number.isInteger(frames)||frames<copy.fps||frames>available-copy.fps)
            return writeError(response,id,-32602,"Duration would overlap neighboring scene",422,version);
          scene.endFrame=scene.startFrame+frames;next.startFrame=scene.endFrame;
        }
        for(const k of allowed)if(Object.hasOwn(patch,k)){
          if((k==="visual"||k==="glow"||k==="typography")&&patch[k]===null)delete scene[k];
          else scene[k]=patch[k];
        }
      }
      validateEditorProject(copy);
      const project=await saveEditorProject(copy,{expectedRevision:old.revision});
      return writeResult(response,id,textResult({ok:true,revision:project.revision,project,
        previewReview:await readEditorPreviewReview(project),
        editorUrl:"https://unificmedia.salevo.site/editor?project="+project.id,
        nextStep:"Verificar prévia de todas as cenas antes de renderizar."},false,version),version);
    }
    if (name === "list_editing_styles") {
      if (!auth.scopes.includes("videos:read")) return writeError(response, id, -32003, "Insufficient scope", 403, version);
      return writeResult(response, id, textResult({ styles:listEditingStyles() }, false, version), version);
    }

    if (name === "edit_motion_plan") {
      if (!auth.scopes.includes("videos:write"))
        return writeError(response, id, -32003, "Insufficient scope", 403, version);
      const edited=editMotionPlan(args);
      return writeResult(response,id,textResult(edited,false,version),version);
    }

    if (name === "plan_video_from_brief") {
      if (!auth.scopes.includes("videos:read")) return writeError(response, id, -32003, "Insufficient scope", 403, version);
      const plan = planFromShortBrief(args);
      const blueprint = buildOnePromptBlueprint(args);
      return writeResult(response, id, textResult({ ...plan, productionBlueprint:blueprint }, false, version), version);
    }

    if (name === "create_video") {
      if (!auth.scopes.includes("videos:write")) return writeError(response, id, -32003, "Insufficient scope", 403, version);
      const productionProfile = args.production_profile ?? PREMIUM_MOTION_BASELINE;
      if (!["premium-motion-v1", "study"].includes(productionProfile)) {
        return writeError(response, id, -32602, "Unsupported production profile", 422, version);
      }
      const premium = productionProfile === PREMIUM_MOTION_BASELINE;
      if (premium) {
        const review = validatePremiumMotionSubmission(args);
        if (!review.ok) return writeError(response, id, -32602, review.errors.join("; "), 422, version);
        const prequeue = validateWindowsRenderSubmission(args);
        if (!prequeue.ok) return writeError(response, id, -32602, prequeue.errors.join("; "), 422, version);
      }
      const job = await createJob({
        title: args.title,
        prompt: args.prompt,
        duration_seconds: args.duration_seconds,
        aspect_ratio: args.aspect_ratio,
        resolution: args.resolution ?? (premium
          ? (args.aspect_ratio === "16:9" ? "landscape" : args.aspect_ratio === "1:1" ? "square" : "portrait")
          : (args.aspect_ratio === "16:9" ? "landscape-4k" : args.aspect_ratio === "1:1" ? "square-4k" : "portrait-4k")),
        fps: args.fps ?? 60,
        quality: args.quality ?? "high",
        workers: args.workers,
        preflight: premium ? true : (args.preflight ?? true),
        project_files: args.project_files,
        metadata: premium
          ? { productionMode: "cinematic", qualityBaseline: PREMIUM_MOTION_BASELINE, expectsAudio: true, artisticQA: "pending-user-review" }
          : { productionMode: "study" }
      });
      return writeResult(response, id, textResult({
        id: job.id,
        status: job.status,
        message: "Vídeo adicionado à fila do MediaForge."
      }, false, version), version);
    }

    if (name === "create_motion_video") {
      if (!auth.scopes.includes("videos:write")) return writeError(response, id, -32003, "Insufficient scope", 403, version);
      if (args.motion_plan?.productionMode !== "cinematic") {
        return writeError(response, id, -32602, "create_motion_video requires productionMode=cinematic", 422, version);
      }
      if (!Array.isArray(args.asset_files)) return writeError(response, id, -32602, "asset_files must be an array", 422, version);
      const assets = args.asset_files.map(file => file.encoding === "base64"
        ? {path:file.path,contentBase64:file.content}
        : {path:file.path,content:file.content});
      const composition = await buildMotionComposition(args.motion_plan, assets);
      // The cinematic gate is mandatory; the tool never bypasses preflight or creative asset checks.
      if (!composition.readiness.testRenderReady) {
        return writeError(response, id, -32602, "Motion assets or cinematic quality gate not ready", 422, version);
      }
      const project = {
        ...composition.project,
        resolution: args.motion_plan.width === 2160 && args.motion_plan.height === 3840 ? "portrait-4k"
          : args.motion_plan.width === 1080 && args.motion_plan.height === 1920 ? "portrait"
          : args.motion_plan.width === 3840 && args.motion_plan.height === 2160 ? "landscape-4k"
          : args.motion_plan.width === 1920 && args.motion_plan.height === 1080 ? "landscape" : undefined,
        quality: args.quality ?? "high",
        preflight: true
      };
      if (!project.resolution) return writeError(response, id, -32602, "Unsupported canvas for Windows delivery; use 1080x1920, 2160x3840, 1920x1080 or 3840x2160", 422, version);
      const job = await createJob({
        prompt: "Cinematic motion from validated timed plan: " + project.title,
        project,
        projectFiles: composition.projectFiles,
        metadata: { ...composition.metadata, source:"cinematic-motion-v2", qaStatus:"pending-technical-and-artistic-review" }
      });
      return writeResult(response, id, textResult({
        id:job.id,status:job.status,worker:"windows-local",renderer:"hyperframes",
        cinematicCraft:composition.readiness.cinematicCraft,
        audio: { voice:args.motion_plan.audioCues.some(c=>c.role==="voice"),music:args.motion_plan.audioCues.some(c=>c.role==="music"),sfx:args.motion_plan.audioCues.filter(c=>c.role==="sfx").length },
        message:"Composição cinematográfica validada e enfileirada no Worker Windows; revisão artística ainda pendente."
      }, false, version), version);
    }

    if (name === "create_cinematic_3d") {
      if (!auth.scopes.includes("videos:write")) return writeError(response, id, -32003, "Insufficient scope", 403, version);
      const project = await buildCinematic3dProject(args);
      const job = await createJob({
        title: project.title,
        prompt: "Cena 3D cinematográfica determinística com câmera " + (args.camera || "dolly")
          + ", iluminação de estúdio e movimento suave; rever qualidade artística após render.",
        duration_seconds: project.durationSeconds,
        aspect_ratio: project.aspectRatio,
        resolution: project.resolution,
        fps: project.fps,
        quality: args.quality ?? "high",
        browser_gpu: args.browser_gpu,
        preflight: args.preflight ?? true,
        project_files: project.projectFiles,
        metadata: project.productionMetadata
      });
      return writeResult(response, id, textResult({
        id: job.id,
        status: job.status,
        renderer: "hyperframes",
        effect: "cinematic-3d",
        profile: { resolution: project.resolution, fps: project.fps, quality: args.quality ?? "high" },
        message: "Projeto 3D entregue à fila do Worker; aprovação artística continua pendente."
      }, false, version), version);
    }

    if (name === "renderer_status") {
      if (!auth.scopes.includes("videos:read")) return writeError(response, id, -32003, "Insufficient scope", 403, version);
      return writeResult(response, id, textResult(await rendererStatus(), false, version), version);
    }

    if (name === "list_videos") {
      if (!auth.scopes.includes("videos:read")) return writeError(response, id, -32003, "Insufficient scope", 403, version);
      return writeResult(response, id, textResult({ jobs: await listJobs(30) }, false, version), version);
    }

    if (name === "get_video") {
      if (!auth.scopes.includes("videos:read")) return writeError(response, id, -32003, "Insufficient scope", 403, version);
      const job = await getJob(String(args.id ?? ""));
      if (!job) return writeResult(response, id, textResult("Trabalho não encontrado.", true, version), version);
      return writeResult(response, id, textResult({ job, artifact:await signedVideoDownload(job) }, false, version), version);
    }

    return writeError(response, id, -32602, "Unsupported tool", 400, version);
  } catch (error) {
    const status = error.status ?? 400;
    if (status === 401) response.setHeader("www-authenticate", 'Bearer resource_metadata="' + (process.env.MEDIAFORGE_OAUTH_ISSUER ?? "https://mediaforge.salevo.site").replace(/[/]$/, "") + '/.well-known/oauth-protected-resource/mcp", scope="videos:read videos:write"');
    return writeError(response, id, -32603, error.message, status, version);
  }
}
