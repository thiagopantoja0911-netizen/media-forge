# MediaForge — conexões antes da migração

Data: 2026-11-11  
Branch: `feature/conexoes-mediaforge-primeiro`  
PR: https://github.com/thiagopantoja0911-netizen/media-forge/pull/2

## Ambiente isolado
- Novo serviço: `https://mediaforge.salevo.site` (Node.js 22 na Hostinger, HTTPS ativo).
- Endpoint MCP: `POST /mcp`; OAuth: `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource/mcp`, `/oauth/*`.
- Dados privados e fila ficam em diretório persistente **fora do public_html**, configurado por variáveis de ambiente.
- Rotas `/v1/jobs` e `/v1/worker/*` exigem credenciais quando publicadas.
- Configurações secretas são variáveis Hostinger, nunca arquivos versionados no Git.

## Windows (worker de testes)
- Instalação separada em `%LOCALAPPDATA%\MediaForge-Staging`, sem alterar o Salevo instalado.
- `desktop/run-worker.ps1` detecta `MEDIAFORGE_REMOTE_URL` e `MEDIAFORGE_WORKER_TOKEN` e inicia `worker:remote`.
- O worker faz conexões HTTPS **de saída**, sem abrir portas no Windows.
- Fluxo: heartbeat → claim com lease → download do projeto com SHA-256 → HyperFrames → status do job.
- O MP4 continua no computador local; não se supõe que foi enviado à nuvem.
- Para conectar, execute o instalador privado recebido no ChatGPT, que contém o token do worker; não compartilhe esse instalador nem publique a credencial.
- O acesso administrativo/OAuth é inicializado com senha gerada localmente e guardada em arquivo protegido no Windows durante o setup inicial.

## Plugin ChatGPT
- Plugin privado novo: `mediaforge-video`, URL MCP própria, OAuth 2.1 via DCR.
- A conexão do plugin e a aprovação OAuth requerem uma ação explícita do proprietário.
- O plugin Salevo 100 antigo permanece instalado, com rota e OAuth antigos, como plano de retorno.

## Verificações executadas
- GitHub CI: sintaxe, esquema do job e handshake HTTP autenticado API ↔ worker passaram.
- Smoke externo do CI: HTTPS, health, OAuth discovery, bloqueio das rotas REST e bloqueio de worker sem token passaram.
- Publicação Hostinger concluída, processo Node.js iniciado, certificado HTTPS ativo.
- **Windows confirmado:** o instalador corrigido foi executado; o relatório confirmou heartbeat, worker HyperFrames online e tarefa oculta em segundo plano.
- **Ainda pendente:** autorização OAuth do plugin e renderização real 4K60 High ponta a ponta.

## Regras de corte
1. Não mover arquivos do Creator Video, Salevo ou Secretssysten nesta etapa.
2. Não mudar `video.salevo.site` nem o plugin antigo enquanto a conexão e o render novo não forem comprovados.
3. Migrar código e assets somente após a aprovação do teste 4K60 High pelo novo worker.
4. Nunca executar o mesmo job de produção simultaneamente no antigo e no novo motor.
5. Antes de abrir a produção, revisar a persistência da fila, renovação de leases, política de retries, logs e tamanho de arquivos >24 MiB.
