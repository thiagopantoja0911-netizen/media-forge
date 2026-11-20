# MediaForge — implementação cinematográfica V2

**Branch:** `feat/mediaforge-cinematic-policy-v2-20261119`  
**PR:** #73 — alvo de homologação `feature/unific-media-20261116`.  
**Objetivo:** implementar os 40 controles executáveis, validar o render final e manter a aprovação artística separada do sucesso técnico.

## Fonte única dos 40 controles

`src/cinematic-production-policy.mjs` contém os 40 requisitos e a função `reviewCinematicPolicyV2`. O relatório de cada produção retorna estado explícito por controle: `passed`, `blocked`, `warning`, `pending_render` ou `review_required`.

A política é consultável no MCP `get_cinematic_production_policy`. O modo V2 é aplicado no limite de `create_motion_video` e no caminho de render do Studio. O modo `study` continua disponível somente com finalidade explícita e nunca é uma entrega final.

## Implementação por requisito

| Nº | Controle | Mecanismo executável |
|---:|---|---|
| 1 | Arco narrativo | `storyArc` com hook, conflito, escalada, resolução e payoff |
| 2 | Storyboard ligado à voz | `voiceStartFrame/voiceEndFrame` por cena |
| 3 | Ação visual semântica | `narrativeAction` com fala, sujeito, ação, mudança e estados antes/depois |
| 4 | Variedade de planos | `shotSize` e escala aplicados ao enquadramento |
| 5 | Continuidade | `subjectId`, props e direção de tela verificados entre cenas |
| 6 | Ritmo | `pace` e variação de duração |
| 7 | Gancho visual | primeira cena marcada e iniciada nos primeiros 1,5s |
| 8 | Media-first | mínimo 70% mídia real e 50% footage em movimento |
| 9 | Diversidade de assets | quatro ou mais mídias visuais distintas |
| 10 | Repetição limitada | nenhum asset domina mais de 25% da timeline |
| 11 | Color grade | contraste e saturação aplicados aos elementos de mídia |
| 12 | Luz e sombras | overlays de profundidade e sombras aplicados às cenas |
| 13 | Profundidade de campo | três camadas com foco seletivo e blur por layer |
| 14 | Motion blur | shutter temporal do fork validado HyperFrames; não é CSS blur |
| 15 | Bloom/glow | overlay de luz controlado e compositado |
| 16 | Parallax | deslocamento independente das camadas de profundidade |
| 17 | Câmera motivada | movimentos GSAP ligados a eventos e planos |
| 18 | Transições motivadas | transição por cena e razão editorial obrigatória |
| 19 | Legendas temporizadas | segmentos por frames no compositor |
| 20 | Tipografia cinética | animação por palavra com timestamps explícitos |
| 21 | Grafismos contextuais | limite de 15% e propósito narrativo por cena gráfica |
| 22 | Reenquadramento | keyframes `reframe.from/to` aplicados no stage |
| 23 | Eventos visuais | entradas, câmera/foco e microefeitos ligados à timeline |
| 24 | Variação de pacing | ritmos `fast/medium/hold` verificados |
| 25 | Camadas compositadas | background/midground/foreground empilhados no compositor |
| 26 | Trilha narrativa | score cobre a timeline e declara opening/build/payoff |
| 27 | Sound design por cena | cue de áudio local vinculado a cada cena |
| 28 | Micro-SFX de movimento | SFX ligado a evento e pico de movimento |
| 29 | Transições sonoras | SFX ancorado no frame de transição |
| 30 | Prioridade da voz | mixagem FFmpeg com sidechain compressor da música pela voz |
| 31 | Loudness | análise real de LUFS e true peak pós-render |
| 32 | Silêncio/clipping | `silencedetect`, `astats` e `volumedetect` pós-render |
| 33 | Planos duplicados | hashes SHA-256 de assets e comparação de frames entre cenas |
| 34 | Planos estáticos | `freezedetect` e exceção somente para hold declarado |
| 35 | Sincronia palavra/imagem | palavras temporizadas dentro das âncoras de voz |
| 36 | Legibilidade | safe zone, duas linhas, limite de caracteres e fonte mínima |
| 37 | Inspeção de frames | decodificação amostrada a 10 fps, quadros pretos, freezes e repetição |
| 38 | Probe técnico | FFprobe exige resolução, FPS, duração e stream de áudio |
| 39 | Revisão artística | aprovação humana obrigatória |
| 40 | Gate de entrega | arquivo renderizado permanece prévia até revisão artística |

## Módulos principais

- `src/cinematic-production-policy.mjs`: contrato dos 40 controles e relatório de evidências.
- `src/creative-director.mjs`: storyboard, arco narrativo e prompts específicos de assets reais.
- `src/one-prompt-production.mjs`: transporta o contrato completo para o fluxo de briefing.
- `src/editing-style-presets.mjs`: preset Media First V2 como padrão.
- `src/motion/plan.mjs`: valida continuidade, layers, reenquadramento, voz e sincronismo de SFX.
- `src/motion/assets-validation.mjs`: exige assets locais válidos, PNG/WEBP para layers e detecta arquivos visuais duplicados.
- `src/motion/cinematic-depth.mjs`: composição real de layers, DOF simulado por profundidade e parallax.
- `src/motion/cinematic-effects.mjs`: bloom, sombras, color grade, microefeitos e reenquadramento.
- `src/motion/captions.mjs`: legendas seguras, palavras temporizadas e animação GSAP.
- `src/motion/composer.mjs`: une os elementos em projeto HyperFrames e inclui a política no metadata.
- `src/cinematic-audio-mix.mjs`: constrói stems e master WAV, com sidechain da música pela voz, limiter e loudnorm; remuxa o master no MP4 preservando o vídeo.
- `src/video-qa.mjs`: FFprobe, loudness, clipping, silêncio, amostragem de frames, black frames, freeze e comparação de planos.
- `src/renderers/hyperframes.mjs`: reporta se o shutter temporal foi realmente executado pelo fork validado.
- `src/remote-worker-client.mjs`: exige QA técnico, de áudio e de frames no V2 antes de concluir o job; entrega relatório de 40 controles.
- `src/videos-secrets-mcp.mjs`: força `productionMode=cinematic` e V2 na fronteira MCP.

## Regras de mídia e limites

- A geração do storyboard produz prompts e manifestos de cenas; **não gera bytes de footage por si só**. O render exige arquivos locais próprios, licenciados ou gerados e com procedência declarada.
- Não há integração de API de geração de vídeo paga nesta etapa. Não serão inventados footage, licenças, palavras sincronizadas ou aprovações.
- DOF é aplicado em layers com PNG/WEBP de transparência; cenas sem depth maps/layers não podem alegar DOF real.
- Motion blur temporal depende do fork HyperFrames validado. Sem o binário customizado `hyperframes.cmd`, o render V2 falha em vez de simular motion blur com CSS.
- A verificação automática de frames não prova que a imagem representa semanticamente a fala. Isso continua no controle artístico humano.

## Integridade da entrega

- `job.status=completed` significa que o arquivo foi renderizado; não significa que o vídeo foi aprovado artisticamente.
- `technicalQA`, `audioQA` e `frameQA` precisam passar para um job V2 ser concluído.
- `artisticQA` permanece `pending-user-review`; `finalDeliveryApproved=false` até aprovação humana.
- O Worker Windows instalado localmente precisa receber a versão atualizada do cliente remoto antes do teste V2. A publicação do servidor, sozinha, não substitui a atualização do worker.

## Testes e homologação

- `npm test`: política, compositor, áudio, efeitos, editor e regressões.
- `npm run validate`: schema e contratos.
- `scripts/check-cinematic-v2-ffmpeg.mjs`: gera fixture sintética de QA, faz sidechain mix, mede áudio e inspeciona frames com FFmpeg.
- `test/cinematic-shutter-renderer.test.mjs`: garante que o V2 use `--cinematic-motion-blur` e bloqueie renderer sem o fork validado.
- CI deve passar integralmente antes do merge.
- Após merge, o deploy automático é feito na Hostinger para `unificmedia.salevo.site`, ambiente de homologação. O domínio antigo de produção permanece intocado.

## Teste controlado depois da publicação

1. Confirmar CI completo e deploy Hostinger concluído.
2. Atualizar o Worker Windows V2 com o cliente remoto desta branch, preservando backup e um único worker.
3. Confirmar `renderer_status=online` e que o binário HyperFrames é o fork com shutter temporal.
4. Criar um vídeo narrado de **15–25 segundos**, com 5–8 cenas reais, locução, score, ambiências, SFX, captions word-timed, DOF/parallax, bloom, sombras e motion blur.
5. Renderizar primeiro em resolução moderada, inspecionar MP4, ouvir o áudio e revisar as cenas.
6. Registrar o resultado técnico e artístico; corrigir falhas antes de promover qualquer coisa a produção.

## Segurança de deploy

- A branch e o PR #73 não alteram o domínio de produção.
- A Hostinger está configurada para auto-deploy da branch `feature/unific-media-20261116` no subdomínio `unificmedia.salevo.site`.
- Não alterar domínio oficial, secrets, variáveis de ambiente, arquivos persistentes, projetos ou assets durante esta publicação.
- Manter o sistema antigo como rollback até o teste do MP4 ser aprovado.
