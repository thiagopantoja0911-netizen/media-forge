# MediaForge — plano de reestruturação do editor (18/11/2026)

## Objetivo definido com o usuário
Transformar o editor Visual MediaForge de um compositor vertical e espaçado num editor de vídeo prático, com ferramentas acessíveis, layout compacto e edição por camadas, preservando a integração GPT → MediaForge → HyperFrames Windows.

## Problemas confirmados no código (branch feature/unific-media-20261116)
1. Prévia fixa em até 560 px e área central com grandes margens.
2. `timeline-panel{margin-top:auto}` empurra a timeline para o fim do documento, em vez de manter a área de edição sempre à vista.
3. Compositor Remotion aparece depois da prévia 3D como uma segunda seção, contendo iframe fixo de 700 px — duas experiências separadas, não um único monitor.
4. Biblioteca mistura preset, metadados, imagens e trilhas, tudo expandido.
5. Inspetor expõe todos os controles de câmera, tipografia, bloom, DOF, glow e grid numa única coluna longa.
6. Painéis possuem colunas fixas e rolagem de página, prejudicando uso em notebooks.
7. Timeline organiza cenas/texto/movimento/áudio, mas ainda não permite edição independente completa de clipes e camadas.
8. Painel não possui cancelamento de render/queue seguro.

## Evidência da fila e do PC
- Worker no Windows restabelecido no commit c5781c558367d07aa5a9b0e30a46e72c51f8cc31; HyperFrames online.
- Projeto 4K60 cinematográfico `d4be7f562f8c441ebf46e1834551b27d` com 900 frames, capturando ~1 frame / ~80s (RAM livre 0,81 GB, Intel UHD integrada).
- Job antigo `b7b5d703653b43968ba1e96ca9d66e59` ainda aparece processando, embora lease já expirou.
- Teste Remotion 12s `207951a7fb074f089e3de701a3dcde3d` estava na fila. Não recriar nem cancelar sem necessidade.
- `remote-worker-server.mjs` só recupera lease expirado durante `/v1/worker/claim`; heartbeat não encerra render nem sinaliza cancelamento.

## Etapas de execução

### Etapa A — workspace responsivo (PR separado)
- Um monitor principal com modos "Prévia 3D" e "Compositor Remotion"; mesmo player shell, sem seção enorme duplicada.
- Timeline visível na parte inferior do workspace, com botão de expansão de altura, sem empurrar o editor para baixo.
- Biblioteca e inspetor com rolagem própria, categorias recolhíveis; controles do inspetor agrupados por função.
- Barra superior enxuta, redução de gaps e limites de altura; fallback para mobile com rolagem natural.
- Manter IDs dos controles e eventos existentes (não modificar contratos de projetos, cenas, audio, review ou render).
- Testes DOM/CSS e CI; publicar apenas após validação.

### Etapa B — fila e cancelamento seguro
- Estado terminal `cancelled`; `cancel_requested` para jobs ativos, sem apagar JSON, projetos ou outputs.
- Endpoint autorizado de cancelamento, botão por job e confirmação visual.
- Worker deve detectar pedido durante a renderização e encerrar apenas subprocesso do job alvo, sem matar outros workers Chrome/Node.
- Reconciliação de leases expirados independente de `claim`; garantias contra dupla atribuição.
- Testes de corrida, repetição idempotente, leases, cancelamento de job na fila/ativo e autorização.
- **Não cancelar trabalhos existentes automaticamente só por publicar o código.**

### Etapa C — edição de verdade
- Inserir clipes de vídeo, imagens, texto, camadas de áudio e sobreposições com CRUD e ordem z.
- Timeline de múltiplas faixas com aparar, mover, redimensionar, zoom e cabeçote de reprodução.
- Propriedades de transformação por elemento (posição, escala, rotação, opacidade), keyframes e easing.
- Export presets (prévia 540p/24fps, Reels 1080p/30fps e 4K somente com confirmação explícita).
- Entrega end-to-end: render de teste de 12s no Windows, verificar MP4 técnico e revisão visual antes de liberar novos passos.

## Regras de segurança
- Não reiniciar o Windows, cancelar jobs ativos ou forçar `git reset` como parte das alterações visuais.
- Preservar `.env.local`, `.mediaforge`, mídia, fila e personalizações de `desktop/run-worker.ps1`.
- CI verde é condição necessária para merge/deploy; não equivale a QA visual no navegador/Windows.
