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

O endpoint `POST /v1/jobs` aceita os dois formatos. Isso permite que a ponte seja adicionada sem alterar os projetos HyperFrames existentes.

## Fluxo de integração

1. O ChatGPT recebe a intenção e a direção criativa.
2. O adaptador normaliza o payload do Vídeos Secrets.
3. O MediaForge valida o projeto e materializa os arquivos por job.
4. O worker executa o renderer configurado.
5. O status e os artefatos são consultados por `GET /v1/jobs/:id`.

## Regra de renderização

Um job deve ter apenas um dono de renderização. O sistema não deve enviar o mesmo projeto para o Vídeos Secrets e para o MediaForge ao mesmo tempo.

A integração final precisa escolher uma destas rotas:

- Vídeos Secrets como entrada e MediaForge como orquestrador local; ou
- MediaForge como entrada e Vídeos Secrets como renderer compatível.

O contrato já suporta as duas opções. A alteração restante é conectar o backend do conector à URL local do MediaForge, com autenticação e autorização apropriadas.
