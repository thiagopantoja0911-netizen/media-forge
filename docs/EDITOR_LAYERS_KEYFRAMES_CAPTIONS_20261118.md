# MediaForge — camadas, keyframes e legendas dinâmicas

## Objetivo desta entrega

Adicionar uma timeline independente ao Editor Visual sem remover o pipeline 3D atual. O projeto passa a ter três grupos persistentes:
- `scenes`: cenas Three.js e direção de câmera.
- `layers`: camadas visuais independentes (`video`, `image`, `text`, `shape`).
- `captions`: blocos de legenda temporizados e animados.
- `audio`: trilhas independentes existentes, preservadas.

Projetos antigos sem os campos novos continuam válidos; o modelo normaliza a ausência como arrays vazios.

## Camadas e keyframes

Cada camada tem intervalo em frames, posição X/Y/Z, dimensões, rotação X/Y/Z, escala, opacidade, z-index, blend mode e keyframes. As propriedades interpoláveis são posição, profundidade, dimensão, escala, rotação e opacidade.

Easings aceitos: `linear`, `ease-in`, `ease-out`, `ease-in-out`, `spring`. O easing de um keyframe governa o trecho que termina nele. A ordem dos keyframes é validada e não aceita frames duplicados.

Vídeos MP4/WebM são assets privados do projeto (até 16 MB por arquivo). O endpoint autenticado suporta HTTP Range para scrubbing e preview do vídeo. A importação não aceita URL externa.

## Legendas

Cada legenda tem texto, start/end em frames, estilo (`karaoke`, `boxed`, `minimal`, `outline`), animação (`none`, `fade`, `rise`, `typewriter`), posição, cor e highlight. Se `wordTimings` for fornecido, deve existir um intervalo por palavra, em ordem e dentro do bloco; sem tempos explícitos, o preview distribui o destaque uniformemente.

## MCP

- `edit_editor_timeline`: operações add/update/remove/reorder em camadas; add/remove keyframe; add/update/remove legendas.
- `upload_editor_layer_asset`: importar vídeo MP4/WebM e retornar `assetId`.
- `upload_editor_asset`: continua importando PNG/WEBP/SVG.
- `edit_editor_project`: continua editando cenas 3D.

Catálogo unificado atualizado para `0.9.2`, com 13 ferramentas do editor.

## Editor limpo

Abrir `/editor` sem `?project=<id>` agora mostra workspace vazio. Não busca nem carrega automaticamente o projeto mais recente. Projetos só abrem por URL explícita ou após criar uma nova ideia. Isso impede prévias antigas/demonstrativas de aparecerem como se fossem o projeto atual.

## Paridade preview/render

A prévia e o HTML enviado ao HyperFrames são gerados pelo mesmo `buildEditorIndex` e `buildEditorSceneModule`. Ambos recebem a mesma lista de layers, captions e keyframes. O evento `hf-seek` aguarda textura e seek de vídeo antes de capturar o frame.

## Validação

Executar:
```bash
node --test test/editor-timeline.test.mjs
node --test test/editor-mcp-bridge.test.mjs
node --test test/editor-studio.test.mjs test/editor-review-gate.test.mjs
```

Teste manual após publicação:
1. Abrir `/editor` sem query e confirmar workspace vazio.
2. Criar projeto 9:16 de 15s/30fps.
3. Adicionar forma gradiente, título, vídeo de fundo e legenda karaoke.
4. Criar keyframes no início e no fim; verificar X/Y/Z, escala, rotação e opacidade.
5. Scrub em vários frames e comparar prévia com render HyperFrames.
6. Não aprovar a revisão visual sem inspecionar os frames reais de cada cena.
