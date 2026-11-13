# MediaForge Frame Lab v2 — ambiente isolado de reconstrução temporal

Aplicação Node.js 22 com OpenCV WebAssembly, Sharp e FFmpeg/FFprobe empacotados. Este laboratório não modifica o MediaForge principal nem usa a fila de produção.

## Precisão

- Processa todos os frames decodificados em resolução nativa, sem subamostragem temporal.
- Fluxo óptico denso entre frames adjacentes; mapa ampliado para deslocamentos abaixo de um pixel.
- Separa movimento global aproximado (fundo/câmera) e regiões móveis relativas ao fundo.
- Marcação manual de até 40 objetos com estimativa afim por frame: deslocamento fracionário, escala X/Y, rotação, cisalhamento, deformação residual.
- Registra velocidade, aceleração, jerk e brilho aparente de cada objeto.
- Sugere camadas automáticas por continuidade de caixas e movimento; identidade é provisória.
- O campo reconstruction do JSON inclui amostras brutas por frame, curvas suavizadas sugeridas, keyframes de 0,25 px, easing heurístico, possíveis cortes e trilhas por objeto.
- Compara cada frame de referência a um frame renderizado pelo timestamp mais próximo, preservando erro de sincronização e diferença de pixels.
- UI com navegação ±1 frame, escolha de objetos, plano de camadas e exportação JSON.

A referência gravada limita a informação temporal: estados entre frames não são conhecidos exatamente. Subpixel, transparência, profundidade 3D, máscaras complexas e curvas originais podem ter múltiplas soluções; medidas são estimativas, não reconstrução garantida.

## Produção

- Runtime: Node 22; dependências @techstark/opencv-js, sharp, ffmpeg-static, @derhuerst/ffprobe-static.
- Não precisa de Python. O arquivo analyze.py é legado experimental e não é usado pelo servidor.
- NODE_ENV=production; FRAME_LAB_KEY com 24+ caracteres em variável privada Hostinger; FRAME_LAB_DATA_DIR persistente e fora de public_html.
- Upload máximo padrão 120 MiB; máximo 12.000 frames; máximo 1920x1080 pixels nativos por proteção de CPU/memória.
- Um job em execução por vez. A API exige x-frame-lab-key para qualquer acesso a vídeos, frames ou relatórios.

Deploy isolado: rootDirectory frame-lab, Node 22, entryFile server.mjs, branch feature/frame-lab-subpixel-20261113. Não modificar o deployment mediaforge.salevo.site.

## API

GET /health (liveness sem dados privados)
POST /api/auth (autenticação)
GET /api/capabilities (FFprobe/OpenCV efetivos)
POST /api/projects (criar projeto)
POST /api/projects/:id/upload/reference (subir fonte)
POST /api/projects/:id/upload/render (subir render, opcional)
POST /api/projects/:id/objects (marcar objetos e frame inicial)
POST /api/projects/:id/analyze (analisar integralmente)
GET /api/projects/:id/status (acompanhar)
GET /api/projects/:id/report (JSON de frames, objetos, easing, comparações)
GET /api/projects/:id/frames/:kind/:index (WebP reference/render/diff/flow)

## QA

Executar cd frame-lab && npm install && npm test. Workflow CI frame-lab-qa.yml instala o motor Node real, faz testes da API, da matemática e passa 13/13 frames sintéticos pelo FFmpeg/OpenCV para comparar fielmente as saídas.

Chaves nunca no repositório. A interface guarda a chave somente em memória da aba.
