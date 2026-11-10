# Migração do Vídeos Secrets para o MediaForge

Branch: `migration/videos-secrets-to-mediaforge`

## O que foi migrado nesta etapa

- Endpoint `POST /mcp` compatível com o contrato do Vídeos Secrets.
- Ferramentas MCP `create_video`, `renderer_status`, `list_videos` e `get_video`.
- Normalização de `project_files`, `duration_seconds`, `aspect_ratio` e `output_name`.
- IDs de jobs compatíveis com o padrão hexadecimal de 32 caracteres.
- Listagem de jobs em `GET /v1/jobs`.
- Heartbeat do worker em `.mediaforge/worker-status.json`.
- Status de fila e worker em `/health`.
- Configuração de autenticação Bearer via variáveis de ambiente.
- Documentação do contrato e do processo de cutover.

## O que permanece no Vídeos Secrets durante a transição

- OAuth do domínio `videos.secretssystem.online`.
- Painel PHP e configuração inicial.
- Instalador atual do agente Windows.
- Fila e estado de produção do Hostinger.
- Renderização de produção.

Esses componentes só devem ser desligados depois de um teste real no MediaForge.

## Arquivos que não devem ser copiados

Nunca migrar para o Git:

- `private/config.php`;
- tokens e senhas;
- `.videos-secrets-runtime/state.json`;
- arquivos de fila;
- credenciais do agente Windows;
- dados de jobs ou caminhos privados de saída.

## Critério para a próxima fase

A migração só pode avançar para o cutover quando:

1. O worker MediaForge renderizar um projeto HyperFrames real.
2. `create_video` criar o job pelo MCP.
3. `renderer_status` detectar o worker.
4. `get_video` retornar o progresso e o artefato.
5. O MP4 for confirmado no computador local.
6. OAuth ou uma ponte autenticada equivalente estiver configurada para o novo endpoint.
7. O serviço antigo continuar disponível como rollback até a confirmação final.
