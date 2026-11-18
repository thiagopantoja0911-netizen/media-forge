# Conexão única — Browser MCP + MediaForge Editor

**Conectar apenas:** `https://unificmedia.salevo.site/browser/mcp`

Este é o MCP Browser que já controla Chrome/Windows. Ele também publica as ações
do Editor Visual MediaForge no **mesmo catálogo e na mesma autorização OAuth**
(`browser:control`). Não instale uma segunda conexão para `/mcp`.

## Diagnóstico de publicação

Abra `https://unificmedia.salevo.site/browser/catalog-health`.

Para a versão `0.9.1`, o JSON deve indicar:

- `ready: true`
- `connector: "/browser/mcp"`
- `editorTools: 11`
- `missingEditorTools: []`
- `totalTools = browserTools + mediaTools`

O diagnóstico é somente leitura e não inclui tokens, dados de projetos ou
mensagens do navegador.

## Reconexão pelo ChatGPT

1. Após publicação aprovada, reconecte a integração **Unific Media Browser**
   apontando ao endpoint acima.
2. Em um novo chat, confirme a descoberta de `create_editor_project`,
   `edit_editor_project`, `get_editor_project`,
   `review_editor_preview` e `render_editor_project`.
3. Teste primeiro um projeto pequeno e a prévia WebGL real. **Não registre
   aprovação** sem ver pelo menos dois instantes de cada cena.
4. Só envie um render com autorização e worker saudável, sem interferir nos
   jobs já existentes.

### Se aparecer somente o catálogo antigo

- Compare `catalog-health` com a lista de ferramentas que o ChatGPT apresenta.
- Se o servidor reportar 11 ferramentas e o cliente não, o bloqueio está no
  cache/registro da conexão ChatGPT, **não** na definição das ferramentas.
- Se o servidor não reportar 11, investigar a branch/publicação em produção.
- Não use `https://unificmedia.salevo.site/mcp`: essa rota é o MCP MediaForge
  separado, não o catálogo combinado do Browser.
