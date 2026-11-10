# Vídeos Secrets bridge

## Objetivo

O MediaForge aceita o mesmo conteúdo de produção usado pelo Vídeos Secrets, mas mantém a fila, o manifesto, os retries e os artefatos do projeto.

## Mapeamento

| Vídeos Secrets | MediaForge |
| --- | --- |
| prompt | prompt |
| title | project.title |
| duration_seconds | project.durationSeconds |
| aspect_ratio | project.aspectRatio |
| project_files | projectFiles |
| encoding=base64 | contentBase64 |
| output_name | project.outputName |

O endpoint `POST /v1/jobs` aceita os dois formatos. Isso permite migrar os projetos HyperFrames sem alterar o formato dos assets.

## MCP compatível

A branch de migração adiciona `POST /mcp` com as ferramentas:

- `create_video`
- `renderer_status`
- `list_videos`
- `get_video`

O MCP usa `MEDIAFORGE_MCP_TOKEN` como credencial Bearer. Em ambiente exposto, ative também `MEDIAFORGE_REQUIRE_AUTH=true`. A implementação OAuth do domínio antigo permanece ativa até a validação final do novo endpoint e não deve ser desligada durante a transição.

## Fluxo de integração

1. O ChatGPT recebe a intenção e a direção criativa.
2. O MCP normaliza o payload do Vídeos Secrets.
3. O MediaForge valida o projeto e materializa os arquivos por job.
4. O worker registra heartbeat e executa o renderer configurado.
5. O status e os artefatos são consultados por `get_video` ou `GET /v1/jobs/:id`.

## Regra de renderização

Um job deve ter apenas um dono de renderização. O sistema não deve enviar o mesmo projeto para o Vídeos Secrets e para o MediaForge ao mesmo tempo.

Durante a migração, o Vídeos Secrets continua sendo o renderer de produção. O MediaForge só assume a produção depois de um teste completo com o worker HyperFrames e a confirmação do download local.
