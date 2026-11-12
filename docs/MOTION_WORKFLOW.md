# Motion orientado por referências

O MediaForge agora tem um compositor adicional para motion design, independente do antigo modelo de cinco cenas. Ele recebe um plano explícito, produz HTML/GSAP editável e usa a mesma fila e o mesmo HyperFrames. Um prompt sozinho ainda não resolve direção, mídia ou sincronismo.

## Usar

```sh
npm run motion:compose -- examples/motion/widget-study.json .mediaforge/widget-study
```

Saídas: `index.html`, uma subcomposição por cena, `motion-plan.json`, GSAP local, verificações de movimento, `mediaforge-job.json` e `REVIEW.md`. A pasta de destino deve estar vazia; o comando não sobrescreve um projeto existente nem submete à fila.

```sh
npx hyperframes check .mediaforge/widget-study --json
npx hyperframes snapshot .mediaforge/widget-study --at 0,2.7,4.2,6,8,9.1,11.75
npx hyperframes render .mediaforge/widget-study --fps 60 --quality high -o study.mp4
```

O exemplo é um **estudo visual sem som de 12 segundos**, não uma campanha final. O objetivo é testar texto, mudança de estado de widgets, entrada lateral e revelação circular. Ele não reproduz os produtos, a tipografia ou o áudio das referências.

## Direção antes da renderização

1. Escolher uma referência principal e a função de cada cena: apresentar, demonstrar, provar ou resolver.
2. Registrar observações em `docs/references/` com ID, tempo e confiança. Os parâmetros de implementação ficam separados.
3. Escolher imagens reais do produto. Usar `product` para imagem isolada ou tela, `collage` para recortes, `widget` para uma UI demonstrativa, `kinetic` para texto e `end-card` para fechamento.
4. Escrever `startFrame`, `peakFrame`, `endFrame` dos eventos. Os eventos são relativos à cena; os intervalos das cenas e do áudio são globais. `endFrame` é exclusivo. FPS pode ser inteiro ou racional, sem somar durações arredondadas.
5. Anexar áudio real e indicar a origem. `sound-design` exige arquivos; `voice-led` exige voz; `silent-study` identifica explicitamente testes sem som.
6. Conferir o primeiro frame, estados intermediários, cada transição e último frame. Assistir ao MP4 em tamanho de celular e revisar áudio antes de aprovar.

Eventos disponíveis: `enter` (entrada), `state` (progresso, calendário e toggle do widget), `focus` (aproximação e retorno) e `exit`. `state.value` vai de 0 a 100. Entrada e acomodação usam durações diferentes. O título para quando termina de entrar. Transições `push` e `iris` mantêm a cena anterior por 0,5 s para evitar um fundo vazio entre cenas. `cut` é uma troca direta.

Um SFX deve apontar para o `eventId` da ação visível; o validador avisa se o começo estiver mais de 80 ms distante do pico visual. Esse limite é uma escolha de implementação, não uma medição universal das referências.

```json
{
  "id": "tap-progresso", "role": "sfx", "src": "assets/tap.wav",
  "startFrame": 245, "endFrame": 260, "volume": 0.5,
  "eventId": "progress-one", "provenance": "Gravação própria"
}
```

Para arquivos externos, passe uma raiz contendo `assets/`:

```sh
npm run motion:compose -- plano.json .mediaforge/projeto pasta-de-midias
```

Não há geração automática de voz, compra de mídia, loop musical ou legenda inferida da fala. O alinhamento de palavras e as decisões de mixagem continuam sendo trabalho de direção. O limite atual do pacote continua sendo 80 arquivos / 24 MB.

## API e plugin

Com sessão autenticada do Studio:

- `POST /api/studio/motion/compose`: `{ motionPlan, assetFiles: [{path,contentBase64}] }`. Retorna arquivos e prontidão sem criar job.
- `POST /api/studio/motion/render`: mesmo corpo mais `confirmControlledRender: true`. Cria um teste na fila, mantendo a revisão artística pendente. O status usa `/api/studio/jobs/:id`.

As duas rotas preservam autenticação e verificações de origem existentes. A interface antiga do Studio mantém seu compositor anterior. As novas rotas não adicionam automaticamente um seletor visual à interface.

Pelo MCP existente `create_video`, envie os arquivos gerados: texto como `{path,content,encoding:"utf8"}` e binário como `{path,content:contentBase64,encoding:"base64"}`. Copie título, duração, proporção, FPS e qualidade do job. Use a resolução correspondente ao canvas; para 4K vertical gere o plano em **2160×3840**, sem só aumentar a opção de exportação. O compositor aceita 9:16, 16:9 e 1:1; fontes 4:5 continuam catalogadas em sua proporção original e exigem uma adaptação editorial deliberada.

O arquivo `motion-plan.json` faz o worker validar novamente tempos e assets. Esse manifesto é uma declaração de intenção, não prova de que qualquer HTML arbitrário corresponde a ele. HyperFrames check e revisão dos frames seguem necessários.

## O que a qualidade verifica

- Plano: continuidade, limites de eventos, mídias presentes, origem dos sons, FPS e duração.
- HyperFrames: contrato, execução no navegador, layout, contraste, movimento e craft. O adaptador não passa mais `--no-craft`.
- Diagnóstico: stdout e stderr completos em `.mediaforge-diagnostics/`, com os erros estruturados no resumo. O worker local não repete um preflight inválido sem alteração.
- MP4: resolução dos presets e FPS racional no QA técnico. Aprovação artística permanece pendente.

Nada disso mede sozinho beleza, pertinência de um asset ou qualidade narrativa. A revisão final deve indicar responsável, hash do MP4, problemas observados e correções.

## Instalação

Esta mudança parte de `feat/forge-real-render-pipeline-20261111`, que já tem Studio, MCP e worker remoto. A `main` não representa esse conjunto. O merge deve ser feito na linha apropriada antes de publicar e atualizar o worker. Alterar a branch no GitHub não altera um processo já em execução. Use o procedimento de atualização existente; este trabalho não troca tokens nem reinicia produção.
