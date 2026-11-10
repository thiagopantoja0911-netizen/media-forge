# MediaForge

Orquestrador local para criação de áudio e vídeo a partir de prompts enviados pelo ChatGPT.

## Visão

ChatGPT transforma o prompt em um job estruturado. O MediaForge recebe o prompt e os arquivos HyperFrames, valida o projeto, coloca na fila e entrega a execução ao worker local.

Fluxo-alvo:

ChatGPT → MediaForge Orchestrator → MediaForge Local Worker → HyperFrames / VoiceStudio / FilmCraft → arquivos locais

## Estado atual

O repositório já contém:

- API HTTP local;
- contrato de job validável;
- recebimento de projectFiles com index.html, composições e assets;
- contrato OpenAPI em openapi.yaml para a futura camada de plugin/MCP;
- fila persistente em disco;
- worker em modo dry-run;
- adapter inicial real para HyperFrames CLI;
- retries limitados para falhas do renderer;
- testes automatizados e CI.

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
    npm run worker

Para expor a API a um plugin/MCP, use o contrato openapi.yaml e mantenha o serviço protegido por uma ponte local autenticada. Não exponha a porta diretamente à internet.

## Job enviado pelo ChatGPT

O endpoint POST /v1/jobs aceita o prompt e projectFiles no mesmo payload. projectFiles deve incluir index.html e pode conter até 80 arquivos, com limite total de 24 MB.

Exemplo:

    {
      "prompt": "Crie um vídeo vertical de 15 segundos com tipografia cinética.",
      "project": {
        "title": "Teste MediaForge",
        "durationSeconds": 15,
        "aspectRatio": "9:16",
        "outputs": ["video"],
        "renderer": "hyperframes"
      },
      "projectFiles": [
        {
          "path": "index.html",
          "content": "<!doctype html>..."
        },
        {
          "path": "compositions/main.html",
          "content": "<!doctype html>..."
        }
      ]
    }

Os arquivos são materializados em MEDIAFORGE_PROJECTS_DIR/<job-id> e o worker renderiza a pasta do job. Assets binários podem ser enviados em contentBase64.

## API

POST /v1/jobs cria um job e retorna o ID.

GET /v1/jobs/:id retorna estado, progresso, erro e artefatos.

GET /health retorna o estado do orquestrador.

## Próximas etapas

1. Criar um template HyperFrames validado para o MediaForge.
2. Conectar geração de voz e narração.
3. Adicionar geração/seleção de assets visuais.
4. Adicionar montagem FilmCraft e presets profissionais.
5. Criar a ponte MCP/plugin do MediaForge para o ChatGPT.
6. Adicionar preview, cache, métricas e exportação multi-formato.

## Segurança operacional

- O serviço escuta em localhost por padrão.
- O job aceita somente paths relativos e limita arquivos/projeto.
- Tokens e chaves ficam fora do Git.
- Jobs e assets devem ser tratados como dados não confiáveis.
- Projetos de terceiros serão integrados por adaptadores versionados e revisados.
