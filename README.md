# MediaForge

Orquestrador local para criação de áudio e vídeo a partir de prompts enviados pelo ChatGPT.

## Visão

ChatGPT transforma o prompt em um job estruturado. O MediaForge recebe esse job, valida o projeto, coloca na fila e entrega a execução ao worker local. O worker combina geração de assets, voz, composição, edição e renderização para salvar os arquivos no computador.

Fluxo-alvo:

ChatGPT → MediaForge Orchestrator → MediaForge Local Worker → HyperFrames / VoiceStudio / FilmCraft → arquivos locais

## Estado atual

O repositório já contém:

- API HTTP local;
- contrato de job validável;
- fila persistente em disco;
- worker em modo dry-run;
- adapter inicial real para HyperFrames CLI;
- exemplo de job e documentação da arquitetura.

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

O worker espera que o job indique project.sourceDir, relativo a MEDIAFORGE_PROJECTS_DIR. O diretório do projeto precisa conter index.html e assets locais permitidos.

Exemplo de job:

    {
      "prompt": "Crie um vídeo vertical de 15 segundos com tipografia cinética.",
      "project": {
        "title": "Teste MediaForge",
        "sourceDir": "demo-project",
        "durationSeconds": 15,
        "aspectRatio": "9:16",
        "outputs": ["video"],
        "renderer": "hyperframes"
      }
    }

## API

POST /v1/jobs cria um job e retorna o ID.

GET /v1/jobs/:id retorna estado, progresso, erro e artefatos.

GET /health retorna o estado do orquestrador.

## Próximas etapas

1. Criar um template HyperFrames validado para o MediaForge.
2. Conectar geração de voz e narração.
3. Adicionar geração/seleção de assets visuais.
4. Adicionar montagem FilmCraft e presets profissionais.
5. Criar um MCP/plugin do MediaForge para o ChatGPT.
6. Adicionar preview, cache, retry, métricas e exportação multi-formato.

## Segurança operacional

- O serviço escuta em localhost por padrão.
- O job só aceita diretórios relativos para impedir escape do workspace.
- Tokens e chaves ficam fora do Git.
- Jobs e assets devem ser tratados como dados não confiáveis.
- Projetos de terceiros serão integrados por adaptadores versionados e revisados.
