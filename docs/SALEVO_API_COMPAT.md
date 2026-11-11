# Compatibilidade de APIs: Salevo Video PHP → MediaForge Node

Inventário de código em 2026-11-11, sem execução de chamadas autenticadas.

## Origens verificadas

- Legado: repositório `paginadevendas`, branch `deploy/video-salevo-hub`, arquivos `api/v1/index.php` e `api/v1/oauth.php`, publicados em `video.salevo.site`.
- Novo: repositório `media-forge`, branch de produção `feature/conexoes-mediaforge-primeiro`, arquivos `src/server.mjs`, `src/videos-secrets-mcp.mjs`, `src/oauth.mjs`, `src/remote-worker-server.mjs`.
- Hostinger: os websites possuem autodeploy independente; o legado é estático/PHP e o MediaForge é Node.js 22/Express.

## Diferenças relevantes

| Recurso legado | Destino MediaForge existente | Cuidados antes do corte |
| --- | --- | --- |
| `POST /api/v1/mcp`, ferramenta `salevo_submit_project_files` | `POST /mcp`, `create_video` | Mapear `project_files`, nomes, parâmetros de saída e resposta; sem enviar o mesmo job duas vezes |
| `salevo_submit_video_briefing` | Importador offline de manifesto nesta branch | Não renderizar briefing sem composição HTML; conversão em projeto HyperFrames é etapa separada |
| `salevo_get_video_status`, `salevo_list_video_jobs` | `get_video`, `list_videos`, `GET /v1/jobs` | IDs e estado da fila legada não são automaticamente copiados; manter leitura/arquivo histórico |
| `salevo_pair_windows`, `devices/pair-password`, `devices/redeem` | Worker token e gerenciamento no painel MediaForge | Não reaproveitar tokens do PHP; novo Worker já está pareado no MediaForge |
| `devices/heartbeat`, `jobs/claim`, `jobs/{id}/progress` | `/v1/worker/*` | Protocolos de agentes diferentes; não ligar worker antigo à fila nova sem adaptador |
| `jobs/{id}/package` | Download autenticado do projeto pelo worker remoto | Conferir limites, allowlist de caminhos, checksums e lease da tarefa |
| `jobs/{id}/artifact` | Resultado local do Worker via MediaForge | O MP4 fica no Windows; não presumir que a URL de download antiga exista |
| OAuth PHP em `api/v1/oauth.php` | OAuth MediaForge em `src/oauth.mjs` | Issuer, resource URL, client ID, redirecionamento e escopos diferem; conexões antigas podem precisar de reautorização |
| `/studio/` do site legado | Manifesto `mediaforge-planning-v1` | localStorage é privado do navegador; só JSON exportado manualmente pode ser importado |

## Estado observado

O teste do MediaForge gerou MP4 H.264 3840 × 2160 a 60 FPS, 10 s e **sem áudio**. Isso aprova o caminho de renderização HyperFrames, mas não os fluxos completos de narração, edição final ou compatibilidade com a antiga API.

O sistema de produção usa a branch `feature/conexoes-mediaforge-primeiro` com autodeploy ativado. Nenhuma alteração desta migração deve chegar a essa branch sem revisão explícita e CI aprovado.

## Próximo lote recomendado

1. Criar um adaptador explícito de `mediaforge-planning-v1` para projeto HyperFrames válido com `index.html`, duração e timeline verificáveis, mantendo preview antes da renderização.
2. Testar integração de narração, normalização de volume e presença de faixa de áudio no MP4.
3. Preparar uma camada de compatibilidade de leitura dos jobs antigos, **sem migrar nem copiar credenciais**.
4. Validar conexão MCP do ChatGPT já existente no MediaForge, sem substituir o Browser MCP.
5. Fazer backup verificável e medir clientes ativos da API PHP antes de qualquer redirecionamento/retirada.

## Proibições até o corte

- Não deletar os sites antigos ou diretórios Windows.
- Não publicar alteração que mude automaticamente a branch vinculada ao autodeploy.
- Não migrar arquivos `.env`, dados OAuth, sessão, tokens ou jobs privados para GitHub.
- Não cadastrar um segundo agente para processar o mesmo job.
