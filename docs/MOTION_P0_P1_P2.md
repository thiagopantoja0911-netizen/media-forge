# Roadmap de 18 melhorias de motion — implementação v0.3.0

Status desta versão: **biblioteca de primitivas publicada**; integração com o worker do MediaForge e QA visual precisam de execução real. Prioridades conforme plano no Notion/Drive.

| Nº | Prioridade | Método | Implementação | Aceite visual esperado |
|---:|:---:|---|---|---|
| 01 | P0 | speedRamp | ataque expo.out | entrada rápida com settle |
| 02 | P0 | easing | 6 curvas nomeadas | sem linear por padrão |
| 03 | P1 | overshoot | avanço + retorno controlado | sensação de peso |
| 04 | P1 | anticipation | deslocamento contrário inicial | ação motivada |
| 05 | P1 | followThrough | seguidores com defasagem | cauda física |
| 06 | P0 | stagger | intervalo e duração independentes | entrada sobreposta |
| 07 | P1 | cameraWhip | eixo + skew com settle | corte enérgico |
| 08 | P1 | parallax | deslocamento conforme profundidade | cena multicamada |
| 09 | P1 | dollyZoom | escala/câmera com foco definido | destaque da ação |
| 10 | P2 | motionBlur | rastro gráfico de baixo custo | blur aparente sem filtrar footage |
| 11 | P1 | cameraTracking | deslocamento dirigido | câmera acompanha componente |
| 12 | P0 | matchCut | mesmo carrier com geometria | continuidade no corte |
| 13 | P0 | microInteraction | press/feedback | ação e consequência |
| 14 | P2 | morph | escala + borda + cor | transformação do mesmo elemento |
| 15 | P1 | kineticTypography | palavras em sequência | mensagem enfatizada |
| 16 | P1 | animateLayers | profundidade + offsets | hierarquia espacial |
| 17 | P0 | motivatedTransition | trigger/transformação | corte causado pela interação |
| 18 | P0 | audioSync | 60 FPS + validação de timing | trilha/SFX sincronizados ao frame |

## Limitações

- Os testes de unidade verificam agendamento determinístico, APIs, validação de inputs e metadados; **não** garantem que o navegador renderize fluido em 4K.
- Os exemplos usam UI ilustrativa baseada em funcionalidades reais de `forjapr`, não screenshots autenticados. Não exibir dados como progresso real.
- Motion blur P2 nesta primeira versão é `trail` animado. Blur ótico de footage depende do pipeline do renderizador e benchmarks GPU que ainda não foram feitos.
- `matchCut` usa um carrier único ao longo de duas cenas, mas o editor precisa posicionar corretamente cenas/objeto e inspecionar o frame do corte.
- `audioSync` gera manifesto; os arquivos WAV devem existir e o MP4 ser analisado após render. Nunca tratar metadados da timeline como prova de sincronismo perceptual.

## Teste de aceitação

1. Node 22: `node --test skills/ig-motion-engine/tests/premium-motion.test.mjs` (esperado 24 testes).
2. HyperFrames: validar 4 cenas cronometradas, 10s, 60 FPS, sem tela preta, UI legível em 360px.
3. Eventos: comparar t=0, 2.5, 5, 5.8167, 7.5, 9.5s e 1 quadro antes/depois dos cortes.
4. Audio: medir LUFS, true peak e offset click/ação. Selecionar 4k/60 somente para master aprovado.
5. Publicação: registrar PR/release, job ID, caminho de MP4 e estado real; não dar nota artística automática.

## Regra de PC

Render e benchmark são executados preferencialmente no Windows conectado ao MediaForge. Esta biblioteca de motion é usada dentro da composição HTML, não altera o binário do worker sem uma atualização/deploy explícitos.
