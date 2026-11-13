export const FRAME_LAB_MCP_TOOLS=[
  {name:"frame_lab_capabilities",description:"Verifica se o motor de análise de todos os frames (OpenCV/FFmpeg) está pronto no servidor MediaForge.",inputSchema:{type:"object",additionalProperties:false}},
  {name:"frame_lab_create_project",description:"Cria projeto privado Frame Lab para analisar uma referência de movimento enviada pelo chat.",inputSchema:{type:"object",additionalProperties:false}},
  {name:"frame_lab_list_projects",description:"Lista projetos Frame Lab e estados resumidos (apenas com escopo de leitura MediaForge).",inputSchema:{type:"object",additionalProperties:false,properties:{limit:{type:"integer",minimum:1,maximum:100}}}},
  {name:"frame_lab_start_upload",description:"Inicia upload binário seguro e retomável de reference MP4, render MP4 ou ZIP editável, vindo de anexos do chat. Retorna upload_id; use chunks base64 com offsets e SHA-256 final.",inputSchema:{type:"object",additionalProperties:false,properties:{
    project_id:{type:"string",pattern:"^[a-f0-9]{32}$"},
    kind:{type:"string",enum:["reference","render","project"]},
    total_bytes:{type:"integer",minimum:128,maximum:125829120},
    sha256:{type:"string",pattern:"^[0-9a-f]{64}$"}
  },required:["project_id","kind","total_bytes","sha256"]}},
  {name:"frame_lab_upload_chunk",description:"Envia parte do arquivo binário em base64 (máximo 384KiB por chamada); offset sequencial, sem saltos. Resposta informa next_offset para retomar com segurança.",inputSchema:{type:"object",additionalProperties:false,properties:{
    project_id:{type:"string",pattern:"^[a-f0-9]{32}$"},
    upload_id:{type:"string",pattern:"^[a-f0-9]{32}$"},
    offset:{type:"integer",minimum:0,maximum:125829120},
    content_base64:{type:"string",description:"Bytes base64 do arquivo local anexado a esta conversa; máximo 384 KiB decodificado."}
  },required:["project_id","upload_id","offset","content_base64"]}},
  {name:"frame_lab_upload_status",description:"Consulta progresso/offset do upload para retomar sem retransmitir dados.",inputSchema:{type:"object",additionalProperties:false,properties:{
    project_id:{type:"string",pattern:"^[a-f0-9]{32}$"},upload_id:{type:"string",pattern:"^[a-f0-9]{32}$"}
  },required:["project_id","upload_id"]}},
  {name:"frame_lab_finish_upload",description:"Confere tamanho, SHA-256 e tipo do upload antes de disponibilizar o vídeo ou ZIP ao Frame Lab.",inputSchema:{type:"object",additionalProperties:false,properties:{
    project_id:{type:"string",pattern:"^[a-f0-9]{32}$"},upload_id:{type:"string",pattern:"^[a-f0-9]{32}$"}
  },required:["project_id","upload_id"]}},
  {name:"frame_lab_analyze",description:"Inicia análise de todos os quadros nativos da referência, incluindo fluxo óptico, micro movimentos, cenas e easing.",inputSchema:{type:"object",additionalProperties:false,properties:{
    project_id:{type:"string",pattern:"^[a-f0-9]{32}$"}
  },required:["project_id"]}},
  {name:"frame_lab_status",description:"Consulta análise, número de quadros, existência de arquivos, e job de renderização do projeto Frame Lab.",inputSchema:{type:"object",additionalProperties:false,properties:{
    project_id:{type:"string",pattern:"^[a-f0-9]{32}$"}
  },required:["project_id"]}},
  {name:"frame_lab_report",description:"Obtém relatório limitado por páginas, com metadados, câmera, easing e métricas por frame (até 25 frames por consulta), sem respostas gigantes.",inputSchema:{type:"object",additionalProperties:false,properties:{
    project_id:{type:"string",pattern:"^[a-f0-9]{32}$"},
    frame_offset:{type:"integer",minimum:0},frame_limit:{type:"integer",minimum:1,maximum:25},
    include_layers:{type:"boolean"}
  },required:["project_id"]}},
  {name:"frame_lab_render",description:"Depois da análise e importação de ZIP reconstruído, submete ao worker HyperFrames com confirmação explícita; o MP4 volta ao Frame Lab para comparação.",inputSchema:{type:"object",additionalProperties:false,properties:{
    project_id:{type:"string",pattern:"^[a-f0-9]{32}$"},
    confirm_render:{type:"boolean"},
    quality:{type:"string",enum:["draft","looks","standard","high","delivery"]}
  },required:["project_id","confirm_render"]}},
  {name:"frame_lab_compare",description:"Quando o MP4 real estiver presente, reanalisa referência e render em paralelo e calcula diferença por frame; não declara equivalência visual automaticamente.",inputSchema:{type:"object",additionalProperties:false,properties:{
    project_id:{type:"string",pattern:"^[a-f0-9]{32}$"}
  },required:["project_id"]}}
];
export const FRAME_LAB_MCP_NAMES=new Set(FRAME_LAB_MCP_TOOLS.map(tool=>tool.name));
export const FRAME_LAB_READ_TOOLS=new Set(["frame_lab_capabilities","frame_lab_list_projects",
  "frame_lab_upload_status","frame_lab_status","frame_lab_report"]);
