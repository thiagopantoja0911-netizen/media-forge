# MediaForge — validação da IA no Editor Visual (18/11/2026)

## O que foi preparado

A implementação do Editor Visual já existe na branch de publicação `feature/unific-media-20261116`.
Este PR adiciona validação explícita do catálogo combinado Browser OAuth + MediaForge,
protegendo a descoberta das ferramentas MCP do editor contra omissão, colisões e
schemas inválidos. **Não altera projetos, não envia renders e não publica produção.**

## Pré-requisitos antes do teste com ChatGPT

1. Confirmar a versão publicada em `unificmedia.salevo.site` e entrar como administrador.
2. Abrir `https://unificmedia.salevo.site/editor` e confirmar que o editor carrega.
3. No ChatGPT, atualizar/reconectar o plugin **Unific Media Browser**, para atualizar
   a lista de ferramentas MCP. O conector precisa apresentar:
   `create_editor_project`, `get_editor_project`, `edit_editor_project`,
   `review_editor_preview`, `render_editor_project`, `upload_editor_asset`,
   `list_editor_style_presets`, `apply_editor_style_preset` e `sync_editor_beats`.
4. Garantir que o Browser MCP autenticado consegue abrir a prévia WebGL real;
   `LANE_NOT_READY` indica bloqueio de controle de aba, não aprovação de prévia.
5. Verificar o worker antes de enviar novo vídeo: a conexão/heartbeat isoladamente
   **não comprova progresso nos quadros**. Confirmar que os jobs anteriores não estão
   retendo CPU/GPU/Chrome. Não requeue automaticamente trabalhos travados.

## Teste local/CI sem render (não destrutivo)

```bash
npm install --no-audit --no-fund
node --test test/editor-mcp-bridge.test.mjs
node --test test/mcp-discovery.test.mjs test/editor-studio.test.mjs test/editor-review-gate.test.mjs
```

O teste deve provar:

- As operações de edição aparecem no catálogo combinado e têm esquema MCP válido.
- Um nome de ferramenta Browser não pode ser sobrescrito por uma ferramenta MediaForge.
- O render continua exigindo `confirm_render=true` e revisão visual da versão atual.
- A criação e edição de projetos não disparam automaticamente um job de render.

## Teste manual de ponta a ponta (apenas com sessão autenticada)

1. Criar projeto descartável de 10–15 s via `create_editor_project`.
2. Ler `get_editor_project`, editar uma cena via `edit_editor_project`, reler a nova revisão.
3. Abrir `/editor?project=<id>`. Conferir preview de **cada cena** em pelo menos dois instantes por cena.
4. Registrar `review_editor_preview` apenas após inspeção real. Se houver problema,
   registrar `fail`, corrigir e repetir; nunca preencher checks de visualização fictícios.
5. Com o worker saudável, enviar um único projeto curto via `render_editor_project`
   com confirmação explícita; inspecionar progresso real, MP4, duração, áudio e frames.
6. Preservar o projeto editável e registrar eventuais falhas sem modificar a fila existente.

## Critério de aceitação

O ChatGPT descobre as ferramentas, salva uma revisão de projeto editável, vê de fato
as prévias e consegue enviar **um** teste para o worker, que devolve MP4 verificado.
Se as operações MCP continuarem ausentes após reconectar, testar `tools/list` do
Browser relay OAuth em vez de presumir que a falta está no código do Editor.
