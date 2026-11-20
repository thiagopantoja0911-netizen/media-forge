# MediaForge — Implantação da política cinematográfica V2

Data: 2026-11-19. Branch isolada: `feat/mediaforge-cinematic-policy-v2-20261119`.

## Objetivo do projeto

Não aceitar como vídeo cinematográfico final uma composição apenas com slides, vetores, texto animado e música de fundo. O plano e o vídeo precisam ser construídos com mídia narrativa, ação visual, desenho de som e revisão separada da validação técnica.

A lista formal de **40 requisitos** fica em `src/cinematic-production-policy.mjs`, disponível no MCP `get_cinematic_production_policy`. Ela reúne os requisitos de narrativa, imagem, edição, áudio e controle de qualidade.

## Terreno preparado e limpeza segura

- A implementação foi isolada em uma branch com PR, evitando qualquer modificação imediata no MediaForge de produção.
- Não foi excluído nenhum MP4, trabalho de cliente, projeto, asset, segredo, token, tarefa do Windows, pasta V2 ou componente legado.
- Os requisitos duplicados da documentação foram consolidados em uma política única, consumida pelos caminhos de criação e validação.
- O caminho `study` permanece disponível para testes ou protótipos **somente mediante `study_purpose` explícito**; não concede aprovação final.
- Ferramentas de edição manual (vetores/3D/efeitos) não são apagadas: o bloqueio é específico à geração de vídeo narrativo vendido como cinematográfico.
- Projetos anteriores continuam legíveis; a exigência de novos metadados se aplica às novas solicitações cinematográficas submetidas à produção.

## Implementações de código

| Área | Arquivo | O que é realizado |
| --- | --- | --- |
| Fonte central de verdade | `src/cinematic-production-policy.mjs` | 40 controles, limites, regras de mídia, avaliação de planos V2, autorização do modo study |
| Storyboard | `src/creative-director.mjs` | Default Media First; ação e transformação a partir da fala |
| Presets | `src/editing-style-presets.mjs` | Estilo Cinematográfico V2 como padrão do planejador |
| Planejamento por briefing | `src/one-prompt-production.mjs` | Propaga regras de mídia real, legendas/SFX, final bloqueado sem revisão artística |
| Premium Motion | `src/premium-motion-baseline.mjs` | Não aprova sequências apenas com ícones/vetores; exige clips reais temporizados |
| Porta cinematográfica | `src/motion/cinematic-quality.mjs` | Executa regras adicionais V2 em planos novos, preservando leitura dos planos legados |
| Compositor | `src/motion/composer.mjs` | Integra legendas, efeitos de luz, sombra, cor e microeventos |
| Legendas | `src/motion/captions.mjs` | Trilhas no tempo, animação GSAP determinística, ênfase e área segura |
| Acabamento | `src/motion/cinematic-effects.mjs` | Bloom controlado, sombras, color grading e microefeitos |
| API MCP | `src/videos-secrets-mcp.mjs` | Política legível; V2 obrigatória para `create_motion_video`; estudo explícito |
| API Studio | `src/studio-api.mjs` | V2 no render cinematográfico; envia `productionMode` para ativar QA sonoro no Worker |
| Editor | `src/editor-studio-core.mjs` | Novos projetos marcados como prévia com política V2, sem aprovação fictícia |
| Audio QA | `src/video-qa.mjs` | Loudness + pico verdadeiro + sinalização de pausas silenciosas longas |

## Requisitos quantitativos de produção

- Mínimo de 70% de cobertura temporal por mídia real ou CGI rasterizado.
- Mínimo de 50% de vídeos com movimento real na timeline.
- Máximo de 15% de tomadas apenas gráficas/tipográficas.
- Máximo de 25% da duração sustentada por uma única mídia-base.
- Narração por trechos e ações visuais específicas para cada plano.
- Legendas temporizadas obrigatórias quando `audioMode=voice-led`.
- Efeitos sonoros reais e empacotados: pelo menos um na entrada de tipografia e um em movimento de câmera/objeto, associados a eventos.
- O compositor não baixa imagens/vídeos por conta própria: assets precisam estar disponíveis e ser inspecionados antes do envio.
- Revisão artística permanece humana e **não é substituída pelo FFprobe ou por um teste de presença de AAC**.

## Natureza dos efeitos

**Implementado na composição:** glow/bloom em overlay de luz, sombra de contato, contraste/saturação, microflash/light sweep/impacto visual e transição por CSS/GSAP, sem dependência de rede durante o render.

**Limitação técnica declarada:** a transição com CSS blur não equivale ao motion blur óptico por amostragem subframe. DOF, reflexos fisicamente corretos, flare, máscara 3D e outros tratamentos dependem do editor/cenário/renderer e não podem ser marcados automaticamente como presentes em todos os vídeos.

**Limitação semântica:** metadados de cena permitem validar que há uma intenção concreta de ação e uma mudança de estado; o software ainda não consegue provar que a filmagem realmente mostra o significado exato da narração. Esta verificação permanece no storyboard e na revisão de frames por pessoa.

## Proibição de falsos positivos

- `job.status=completed` significa arquivo renderizado e entregue, **não** uma produção artística aprovada.
- `technicalQA.status=passed` não prova sincronização fina, boa interpretação, trilha agradável, licenciamento de assets ou edição cinematográfica.
- `artisticQA` deve permanecer `pending-user-review` até a análise do vídeo completo por pessoa.
- `study` e `controlled-test` são prévias técnicas, não entregas comerciais.

## Testes do código

- `npm test` e CI de GitHub Actions antes do merge.
- Novos testes de política, fontes reais, cenas que mudam de estado, legendas e efeitos, regressões do modo study e do QA sonoro.
- `test/cinematic-motion.test.mjs`: o compositor realmente recebe os metadados de legenda e acabamento na saída HyperFrames.
- Não declarar a etapa de homologação concluída sem teste com assets reais/legítimos e vídeo gerado pelo Worker V2.

## Próxima fase: homologação controlada

1. Inspecionar CI e resolver regressões.
2. Reproduzir um plano narrativo V2 com vídeos reais de pelo menos oito tomadas, captions e stems distintos, usando mídia própria/licenciada.
3. Renderizar primeiro uma prévia curta no Windows, com somente um worker e resolução moderada.
4. Comparar a saída com o Reel vetorial anterior; avaliar ação por fala, sombras, iluminação, movimento, áudio e fluidez.
5. Revisar a compatibilidade com projetos do Editor e Studio, em particular o download dos MP4s.
6. Somente depois de homologar e aprovar a branch, mesclar e publicar o backend MCP/Studio e atualizar a V2 se necessário.
7. Guardar SHA de deployment e plano de rollback antes do rollout.

## Limites de responsabilidade

A implementação da política **não inclui** uma assinatura de provedor de geração de filmagens, serviço automático de transcrição de voz nem a autorização para comprar footage. Sem os arquivos de fonte, a renderização cinematográfica deve ser bloqueada ou classificada como estudo — não substituída por vetores.
