# MediaForge

Orquestrador local para criação de áudio e vídeo a partir de prompts enviados pelo ChatGPT.

## Visão

ChatGPT transforma o prompt em um job estruturado. O MediaForge recebe esse job, valida o projeto, coloca na fila e entrega a execução ao worker local. O worker combina geração de assets, voz, composição, edição e renderização para salvar os arquivos no computador.

Fluxo-alvo:

ChatGPT → MediaForge Orchestrator → MediaForge Local Worker → HyperFrames / VoiceStudio / FilmCraft → arquivos locais

## Componentes

- Orchestrator: API local para jobs, status e histórico.
- Job contract: formato único para prompt, roteiro, áudio, vídeo e saídas.
- Worker: executor local com fila persistente e retries.
- Render adapters: integrações isoladas para HyperFrames, VoiceStudio, FilmCraft e geradores de assets.
- Quality gate: validação de duração, proporção, áudio, resolução, área segura e arquivos finais.

## Estado inicial

Esta primeira versão contém:

- API HTTP local;
- contrato de job validável;
- fila persistente em disco;
- endpoint de saúde;
- worker em modo dry-run para validar o pipeline sem destruir tempo de renderização;
- exemplo de job;
- documentação da arquitetura.

O dry-run gera um plano de execução. Os adaptadores reais serão conectados depois que o contrato estiver estável.

## Uso

Requisitos: Node.js 20 ou superior.

    npm run validate
    npm start

Por padrão, a API escuta em http://127.0.0.1:8787.

Criar um job:

    curl -X POST http://127.0.0.1:8787/v1/jobs ^
      -H "content-type: application/json" ^
      --data-binary "@examples/job.json"

Executar o worker uma vez:

    npm run worker:once

Executar o worker continuamente:

    npm run worker

## Segurança operacional

- O serviço escuta em localhost por padrão.
- O job não aceita caminhos absolutos nem referências externas durante a renderização.
- Tokens e chaves ficam fora do Git.
- Jobs e assets devem ser tratados como dados não confiáveis.
- Projetos de terceiros serão integrados por adaptadores versionados e revisados.

## Próximas etapas

1. Conectar o adapter HyperFrames ao renderer local.
2. Conectar geração de voz e narração.
3. Adicionar geração/seleção de assets visuais.
4. Adicionar montagem FilmCraft e presets profissionais.
5. Criar um MCP/plugin do MediaForge para o ChatGPT.
6. Adicionar preview, cache, retry, métricas e exportação multi-formato.
