# MediaForge Cinematic Motion Engine v2 — staging only

## Por que o vídeo parecia uma apresentação de slides
O caminho legado `create_video` aceitava HTML arbitrário, sem exigir um plano com ações,
trilha e efeitos. O compositor Forge original usa cinco layouts gráficos fixos e pode
repetir movimentos de câmera lentos sobre fotos; um MP4 com faixa AAC podia passar no
QA mesmo com mix silenciosa.

## Novo caminho de produção
O MCP `create_motion_video` é um caminho cinematográfico separado. Recebe:
- `motion_plan` conforme `mediaforge-motion-v1`, `productionMode: "cinematic"`;
- `asset_files` com caminhos relativos `assets/*` e conteúdo real base64;
- `quality` opcional; preflight não pode ser desligado nesse caminho.

A API `POST /api/studio/motion/compose` e a `/render` também usam o compositor
de motion existente; o modo `cinematic` impõe validações adicionais quando selecionado.

O motor gera subcomposições HyperFrames/GSAP editáveis e com busca determinística:
- `footage`: vídeo em tela cheia, não uma imagem simulando gravação;
- `photo`: fotografia em tela cheia com evento de câmera temporizado, restrita no tempo;
- `widget`, `product`, `collage`, `kinetic`, `end-card`: tipos já existentes;
- eventos `enter`, `state`, `focus`, `camera`, `exit` (com pico marcado em frames);
- movimentos `dolly-in`, `pull-back`, `truck-left`, `truck-right`, `arc-reveal`, `locked`;
- transições `cut`, `push`, `iris`, `whip`, `dip`, `match-cut`;
- trilha, locução e microefeitos em faixas separadas, com SFX ligados a `eventId`.

## Regras auditáveis (não são garantia estética)
- Para 45 s: 8 tomadas ou mais, ao menos 30% de cenas com footage e 52% de tempo
  com movimento efetivo. Foto estática até 40% do tempo.
- Não aceitar três quadros estáticos/tipográficos consecutivos; foto acima de 5 s
  é bloqueada. Uma mesma fonte repetida por mais de 28% do vídeo é bloqueada.
- Não aceitar transição idêntica em todos os cortes quando há cinco ou mais cenas.
- Trilha presente ao longo da timeline, ao menos dois SFX com amostras reais, e
  narração obrigatória para `audioMode:"voice-led"`. Um SFX deve corresponder
  a um pico visual com tolerância de 80 ms.
- Sem URLs remotas ou `file://`. Os arquivos devem estar realmente empacotados,
  ser base64 canônico e ter cabeçalhos de formato coerentes (não certifica decodificação completa).
- A trilha fica no máximo em 0.16 quando há voz; SFX são limitados a 0.65 e
  música recebe fades. O nivelamento depende do conteúdo de cada stem.
- O Worker usa FFmpeg para analisar o MP4 completo: LUFS integrado e dBTP;
  mix abaixo de −25 LUFS, acima de −10 LUFS ou com pico acima de −1 dBTP
  falha no perfil cinematográfico. Medição não é audição: aprovar arte depende de review.

## Exemplo esquemático de uma cena
```json
{
  "id":"orbita-03","type":"footage",
  "startFrame":300,"endFrame":450,
  "headline":"A luz volta","detail":"A estação sai da sombra",
  "media":"assets/iss-sunrise.mp4","camera":"dolly-in","transition":"whip",
  "events":[
    {"id":"orbita-03-enter","action":"enter","startFrame":0,"peakFrame":12,"endFrame":20},
    {"id":"orbita-03-move","action":"camera","startFrame":30,"peakFrame":50,"endFrame":120}
  ]
}
```

Os audios declarados em `audioCues` têm caminho local, provenance (origem/licença),
frames e volume. O `sfx` aponta `eventId:"orbita-03-move"` e inicia em
`scene.startFrame + event.peakFrame` (dentro da tolerância).

## O que não está automatizado
O motor **não** compra, baixa ou gera filmagens/locuções/música/SFX sozinho.
É necessário fornecer fontes legítimas e licenciadas, ou conectar provedor especializado
para fazê-lo. O tratamento de áudio não consegue verificar se cada palavra foi
pronunciada corretamente, se o SFX é agradável ou se a narrativa funciona;
`artisticQA` continua pendente.

## Testes e implantação segura
Rode `npm test`, `node --check` e o preflight de projeto HyperFrames. A CI da branch
executa estes testes e os smoke tests anteriores. Depois, faça smoke real em
ambiente de homologação com MP4 e áudio próprios, verifique fotos e leitura em celular,
som em alto-falantes e fones, e só então considere merge e implantação.

Branch: `feat/mediaforge-cinematic-motion-audio-v2-20261112`.
Não atualizar diretamente o processo Windows: GitHub commit não substitui worker em
execução. Fazer backup, deploy do serviço MCP, atualizar worker local com o script
de update revisado e rollback, verificar compatibilidade de HyperFrames instalado.
