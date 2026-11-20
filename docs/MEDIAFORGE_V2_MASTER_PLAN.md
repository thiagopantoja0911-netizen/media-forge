# MediaForge Cinematográfico V2 — Plano mestre de consolidação e publicação

**Data de referência:** 20/11/2026  
**Produto:** MediaForge Cinematográfico V2  
**Branch de produção atual:** `feature/unific-media-20261116`  
**Commit publicado de referência:** `daaf5d27ee7298297bf2e0995f864592735ae40d`  
**Backup criado antes desta consolidação:** `backup/mediaforge-before-master-cleanup-20261120`

## Objetivo

Consolidar o MediaForge como um sistema de produção de vídeos cinematográficos completos — com narrativa, filmagens reais, direção de fotografia, edição, narração, trilha, sound design, legendas e controle de qualidade. Um MP4 tecnicamente válido ou uma demonstração 3D isolada não representa aprovação cinematográfica.

O piloto de aceitação será um vídeo vertical de **15 a 25 segundos**, com narrativa completa e cenas visuais reais. O teste isolado do cubo de 10 segundos fica classificado apenas como smoke test técnico do renderizador 3D.

## As cinco etapas oficiais

| Etapa | Nome | Escopo | Critério de saída |
|---|---|---|---|
| 1 | Implementação dos 40 requisitos | Integrar os controles de narrativa, imagem, edição, áudio e qualidade ao fluxo real de produção. Corrigir divergências entre API, MCP, editor e Worker. | Os 40 controles são executados no mesmo fluxo, com evidências e bloqueios reais; não basta existir um catálogo ou teste unitário. |
| 2 | Homologação técnica | Validar servidor, autenticação, fila, Worker Windows, HyperFrames, Chrome/WebGL, FFmpeg/FFprobe, upload e recuperação de falhas. | Um projeto cinematográfico completo é renderizado sem perda de mídia, sem timeout e com QA técnico, de áudio e de frames aprovado. |
| 3 | Testes com vídeos reais | Produzir o piloto de 15–25s usando filmagens/fotografias específicas da narrativa, voz, trilha, SFX e legendas temporizadas. | O MP4 contém todos os elementos previstos, com procedência/licença dos assets e relatório de QA. |
| 4 | Revisão e ajustes cinematográficos | Revisar narrativa, escolha de cenas, planos, continuidade, movimento, cor, luz, tipografia, mixagem e ritmo. Corrigir e renderizar novamente quando necessário. | Revisão humana aprovada; problemas críticos corrigidos; todos os requisitos essenciais com evidência. |
| 5 | Publicação e entrega final | Integrar a versão aprovada na branch de produção, publicar na Hostinger, verificar o Worker e o domínio, registrar release e entregar MP4, projeto editável e relatórios. | Deploy confirmado, smoke test pós-deploy aprovado, rollback conhecido e pacote final entregue. |

## Os 40 requisitos — cinco domínios de controle

A numeração abaixo é estável e corresponde a `src/cinematic-production-policy.mjs`.

### 1. Direção cinematográfica — requisitos 1–7
1. Roteiro com progressão narrativa.
2. Storyboard sincronizado com a narração.
3. Seleção/direção de cenas conforme o significado de cada fala.
4. Variedade de enquadramentos e planos.
5. Continuidade visual entre cenas.
6. Ritmo de edição adequado à história.
7. Abertura com gancho audiovisual nos primeiros segundos.

### 2. Imagem e fotografia — requisitos 8–18
8. Prioridade para filmagens e imagens reais.
9. Diversidade de fontes visuais.
10. Controle de repetição de imagens.
11. Color grading cinematográfico.
12. Iluminação e sombras realistas.
13. Profundidade de campo contextual.
14. Motion Blur real.
15. Bloom e Glow controlados.
16. Parallax e profundidade 2.5D/3D.
17. Movimentos de câmera motivados.
18. Transições motivadas pela narrativa.

### 3. Edição e animação — requisitos 19–25
19. Legendas sincronizadas com a voz.
20. Animações tipográficas.
21. Elementos gráficos contextualizados.
22. Zooms e reenquadramentos dinâmicos.
23. Efeitos visuais ligados aos acontecimentos.
24. Controle de velocidade e ritmo.
25. Composição de camadas e máscaras.

### 4. Engenharia de áudio — requisitos 26–32
26. Trilha sonora adequada à história.
27. Sound design por cena.
28. Microefeitos sincronizados com movimentos.
29. Transições sonoras.
30. Mixagem profissional com prioridade para a voz.
31. Normalização e medição de loudness.
32. Verificação de silêncio, clipping e distorção.

### 5. Controle de qualidade — requisitos 33–40
33. Verificação de cenas repetidas.
34. Detecção de cenas paradas.
35. Verificação de sincronização audiovisual.
36. Análise de legibilidade das legendas.
37. Inspeção de frames do vídeo renderizado.
38. Verificação técnica do MP4.
39. Avaliação da qualidade narrativa e estética.
40. Bloqueio de entrega até aprovação dos requisitos essenciais e revisão humana.

## Estado real verificado em 20/11/2026

### Infraestrutura e publicação
- A branch `feature/unific-media-20261116` é a fonte da publicação Hostinger de `unificmedia.salevo.site`.
- Commit publicado: `daaf5d27ee7298297bf2e0995f864592735ae40d`.
- Build Hostinger: concluído; Node.js 22; build `media-tools:install`; aplicação reiniciada.
- CI do commit publicado: workflow `MediaForge CI` run `44782162104`, conclusão `success`.
- Smokes de WebGL, editor, timeline, catálogo MCP e Remotion do PR #76: concluídos com sucesso.
- Worker Windows: online; fila sem trabalhos ativos no momento da auditoria.

### O que o teste 3D comprovou — e o que não comprovou
Job `933a73ed0b7442a5997fc4863c9d5501`:
- 300/300 quadros capturados; 10 segundos; 1080×1920; 30 FPS.
- MP4 de 2.867.536 bytes enviado ao MediaForge.
- FFprobe: aprovado, sem problemas técnicos.
- Sem áudio; sem QA de áudio; sem QA de frames; Motion Blur desligado.
- `artisticQA=pending-user-review`; `finalDeliveryApproved=false`.

Conclusão: o perfil Draft/balanced conseguiu concluir o smoke test 3D. Isso não homologa a produção cinematográfica nem comprova os 40 requisitos em conjunto. Não usar o cubo como demonstração artística ou como vídeo piloto.

### Integração de filmagens reais
- O código `src/motion/stock-footage-source.mjs` contém aquisição opcional de stock via Pexels, com validação de host, limite de tamanho, arquivo MP4 local e registro de procedência/licença.
- O fluxo MCP em `src/videos-secrets-mcp.mjs` chama essa integração quando `auto_source_stock=true`.
- A chave `PEXELS_API_KEY` não apareceu na lista de variáveis Node.js da aplicação Hostinger na auditoria. Portanto, a busca automática por Pexels ainda não está operacional no ambiente publicado até a chave ser configurada.
- Alternativa temporária: anexar assets próprios/licenciados como arquivos locais. Não substituir filmagens por vetores, cartões ou formas geométricas.
- A geração do storyboard, sozinha, não cria bytes de footage. Cada arquivo precisa existir, ser empacotado e ter procedência declarada.

### Divergência de branches e PRs
- `main` e `feature/unific-media-20261116` estão divergentes (431 commits à frente e 6 atrás no comparativo consultado). Não fazer merge em massa nem trocar a branch de deploy para `main` durante esta consolidação.
- PR #37 (direção artística) está aberto, mas divergiu da branch de produção (40 commits à frente e 46 atrás). Não fazer merge direto; avaliar e portar seletivamente apenas o que continuar necessário.
- PRs #38–#41 pertencem ao trabalho separado do Unific Desktop; PR #4 é uma migração antiga. Preservar esses trabalhos e não os misturar nesta entrega.

## Plano de execução detalhado

### Etapa 1 — fechar integração dos 40 requisitos
1. Manter `src/cinematic-production-policy.mjs` como catálogo único dos 40 controles.
2. Garantir que o mesmo contrato percorra planejamento, MCP, compositor, Worker e relatório pós-render.
3. Corrigir a divergência de catálogo: o código do servidor declara `auto_source_stock`, mas a descrição da ferramenta MCP conectada ao Unik consultada nesta auditoria não exibe esse parâmetro. Atualizar/validar a descoberta do catálogo antes de depender da aquisição automática.
4. Configurar Pexels no servidor apenas quando a chave for fornecida; não substituir o conjunto inteiro de variáveis Hostinger com valores mascarados.
5. Portar seletivamente melhorias úteis do PR #37 após revisão de compatibilidade, sem mesclar sua branch divergente.
6. Garantir que o relatório diferencie `passed`, `blocked`, `warning`, `pending_render` e `review_required`; nenhum rótulo pode fingir evidência.
7. Executar a suíte integrada e os smokes relevantes.

### Etapa 2 — homologação técnica
1. Confirmar heartbeat/autenticação do Worker e fila limpa.
2. Testar pacote com footage, áudio e camadas locais no Windows.
3. Verificar Chrome/HyperFrames e progresso real de captura.
4. Validar MP4 com FFprobe: codec, dimensões, FPS, duração e streams.
5. Executar QA de áudio (LUFS, true peak, clipping e silêncios) e QA de frames (black frames, freezes e repetição).
6. Confirmar upload e checksum do artefato.

### Etapa 3 — piloto cinematográfico real
- Duração alvo: 20 segundos (dentro do pedido de 15–25s).
- Formato: 9:16, 1080×1920, 30 FPS.
- 5–8 planos distintos, cada um com ação visual coerente com a fala.
- Pelo menos 70% do tempo em footage/fotografia/CGI realista; pelo menos 50% em footage em movimento; no máximo 15% de grafismos puros; nenhum asset visual domina mais de 25% da timeline.
- Voz real anexada, com duração aferida e timestamps por palavra.
- Música licenciada/original e efeitos por cena/evento; mixagem com voz em primeiro plano.
- Legendas como apoio, com palavras-chave temporizadas e zona segura.
- Registrar fonte, licença e procedência de cada mídia. Não inventar assets, marcas, fatos ou direitos.

### Etapa 4 — revisão e ajustes
1. Inspecionar o vídeo inteiro e amostras de frames distribuídas pelo tempo.
2. Verificar se cada fala provoca ação visual, não apenas texto sobre fundo.
3. Avaliar variedade de planos, continuidade, ritmo, cor, iluminação, foco, movimento e transições.
4. Ouvir voz, música, SFX e ambiências do início ao fim.
5. Corrigir os problemas e repetir a renderização quando necessário.
6. Aprovação artística humana explícita; QA técnico verde sozinho não aprova o filme.

### Etapa 5 — publicar e entregar
1. Abrir PR para a branch de produção `feature/unific-media-20261116`.
2. Exigir CI verde e revisão dos diffs.
3. Integrar por fast-forward/squash conforme a política do repositório.
4. Confirmar deploy Hostinger no commit exato integrado.
5. Confirmar `/health`, autenticação do Worker, heartbeat e um smoke test pós-deploy.
6. Registrar release, relatório dos 40 controles, QA técnico/artístico e links do MP4/projeto editável.
7. Manter rollback e backups preservados.

## Limpeza segura do repositório e do ambiente

### Fazer
- Usar a branch de produção atual como base; trabalhar em branches curtas e PRs focados.
- Manter uma matriz única de requisitos e um plano mestre (este documento).
- Separar fixtures sintéticas de testes de aceitação com mídia real.
- Marcar explicitamente estudos 3D como smoke tests, nunca como filmes aprovados.
- Remover duplicações de código/documentação somente depois de provar que não têm consumidores.
- Fechar/arquivar PRs e branches apenas após verificar dependências e confirmar que não contêm trabalho útil.

### Não fazer
- Não executar `git reset --hard`, force-push, limpeza em massa ou merge indiscriminado de `main`.
- Não excluir `.env.local`, `.mediaforge`, projetos, assets, outputs, MP4s, tokens DPAPI, tarefa agendada ou personalizações do Worker.
- Não excluir branches de backup, PRs do Unific Desktop, VoiceStudio, Browser MCP, Secrets System, Nexora ou outros domínios.
- Não alterar ou substituir o conjunto completo de variáveis Hostinger usando valores mascarados.
- Não publicar como final um vídeo sem voz quando a produção exige narração, nem marcar revisão artística como aprovada automaticamente.

## Definição de concluído

O MediaForge V2 só será declarado concluído quando:
- os 40 controles forem executados no mesmo projeto de produção com evidências;
- o piloto real de 15–25s tiver footage, voz, música, SFX, legendas e pós-produção;
- QA técnico, áudio e frames estiverem aprovados;
- a revisão artística humana estiver aprovada;
- a publicação Hostinger e o Worker estiverem validados no commit final;
- MP4, projeto editável e relatórios forem entregues.

**Status global atual:** implementação-base publicada; smoke test 3D aprovado tecnicamente; homologação cinematográfica real, piloto narrativo e aprovação artística ainda pendentes.
