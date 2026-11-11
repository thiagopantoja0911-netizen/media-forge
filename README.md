# MediaForge

Orquestrador local para criação de áudio e vídeo a partir de prompts enviados pelo ChatGPT.

## Visão

ChatGPT transforma o prompt em um job estruturado. O MediaForge recebe o prompt e os arquivos HyperFrames, valida o projeto, coloca na fila e entrega a execução ao worker local.

Fluxo:

ChatGPT → MediaForge MCP/API → MediaForge Local Worker → HyperFrames / VoiceStudio / FilmCraft → arquivos locais

## Estado atual

O repositório contém:

- servidor OAuth 2.1 com PKCE e registro dinâmico;
- painel web de configuração e administração;
- estado persistente protegido com hashes;
- scripts de instalação e execução do worker Windows;

- API HTTP local;
- endpoint MCP compatível com Vídeos Secrets;
- contrato de job validável;
- recebimento de `projectFiles` e `project_files`;
- fila persistente em disco;
- worker em modo dry-run ou HyperFrames real;
- heartbeat do worker;
- retries limitados para falhas do renderer;
- contrato OpenAPI;
- bridge documentada para a migração do Vídeos Secrets.

O modo dry-run continua sendo o padrão. Ele valida o fluxo e gera um plano sem consumir tempo de renderização.

## Uso

Requisitos: Node.js 22 ou superior para o CLI HyperFrames.

    npm run validate
    npm start

Em outro terminal:

    npm run worker:once

Por padrão, a API escuta em http://127.0.0.1:8787.

Para ativar o renderer real:

    set MEDIAFORGE_RENDERER=hyperframes
    set HYPERFRAMES_VERSION=0.9.25
    npm run worker

O job pode definir `resolution` (`1080p`, `1440p`, `4k` ou presets por orientação), `fps` (1–240 ou racional como `30000/1001`), `quality` (`draft`, `looks`, `standard`, `high` ou `delivery`), `workers`, `browserGpu` e `preflight`. O worker executa `hyperframes check --json --no-craft` antes do render por padrão.

Para habilitar o MCP em uma máquina exposta, configure:

    MEDIAFORGE_REQUIRE_AUTH=true
    MEDIAFORGE_MCP_TOKEN=<token-longo-e-aleatorio>

O serviço local não deve ser exposto diretamente à internet sem uma ponte autenticada.

## Job enviado pelo ChatGPT

O endpoint `POST /v1/jobs` aceita o prompt e `projectFiles` no mesmo payload. O endpoint `POST /mcp` oferece as ferramentas `create_video`, `renderer_status`, `list_videos` e `get_video`.

`projectFiles` deve incluir `index.html` e pode conter até 80 arquivos, com limite total de 24 MB. Assets binários podem ser enviados em `contentBase64`.

## API

- `POST /v1/jobs` cria um job.
- `GET /v1/jobs` lista jobs.
- `GET /v1/jobs/:id` retorna estado, progresso, erro e artefatos.
- `POST /mcp` expõe o contrato MCP compatível com Vídeos Secrets.
- `GET /health` retorna o estado do orquestrador e do worker.

## Migração do Vídeos Secrets

A branch `migration/videos-secrets-to-mediaforge` contém a primeira etapa da migração. O serviço antigo continua sendo o renderer de produção até que um teste real confirme o worker MediaForge, o MCP, o MP4 local e o rollback.

Veja:

- `docs/VIDEOS_SECRETS_BRIDGE.md`
- `docs/VIDEOS_SECRETS_MIGRATION.md`
- `docs/MEDIAFORGE_DEPLOYMENT.md`
- `docs/UPSTREAM_UPDATES.md`

## Segurança operacional

- O serviço escuta em localhost por padrão.
- O job aceita somente paths relativos e limita arquivos/projeto.
- Tokens e chaves ficam fora do Git.
- Jobs e assets devem ser tratados como dados não confiáveis.
- O `private/config.php` e o estado do Hostinger não são migrados para o repositório.

## Creator Studio

O Creator Studio está disponível em `/studio` após autenticação no painel. Ele permite criar briefings, três ganchos, storyboard de cinco cenas, prévia ilustrativa e exportação JSON/TXT. O botão Gerar pacote HyperFrames envia o briefing e os arquivos de áudio opcionais (locução e trilha) ao endpoint autenticado `POST /api/studio/compose` e baixa um pacote editável, sem criar jobs. A locução pode ser exportada do VoiceStudio; o VoiceStudio continua independente.

A importação do JSON v1 legado é compatível com os rascunhos exportados manualmente de `video.salevo.site/studio/`. O armazenamento local novo usa uma chave separada para não sobrescrever dados do domínio antigo.

**Limite atual:** gera uma composição editorial tipográfica HyperFrames de protótipo, com cinco cenas, uma faixa de legendas e quatro transições; pode empacotar locução/trilha fornecidas pelo usuário, mas ainda não inclui mídia específica do assunto nem efeitos sonoros por cena. O pacote é marcado `renderReady=false` e não pode ser enviado diretamente à fila. A geração de mídia só será ativada depois da validação de áudio e QA no Worker Windows. Consulte `docs/CREATOR_STUDIO.md` e `docs/MIGRATION_SALEVO_CREATOR.md`.

## Limpeza final da migração

A remoção do hub antigo e de integrações do Secrets só poderá acontecer depois dos testes e backups definidos em `docs/FINAL_CLEANUP_GATE.md`. O Browser MCP, o domínio pai `salevo.site` e o portal `secretssystem.online` são recursos independentes e ficam fora da limpeza do Creator Video.
