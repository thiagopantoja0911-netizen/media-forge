# MediaForge — consolidação dos domínios (2026-11-12)

## Estado de origem

- **Principal** `mediaforge.salevo.site`: aplicação Node.js com painel, OAuth/MCP, Forge Midjourney, API Studio, composição de motion, fila e Worker Windows. Branch `feature/conexoes-mediaforge-primeiro`, commit `47e720f`.
- **Prévia** `forge-preview.salevo.site`: mesma aplicação numa branch de staging, commit `7fc7542`. Diferença exclusiva: `GET /studio` público e **somente prévia** no hostname de staging (as APIs sempre exigiram autenticação).
- Comparação GitHub: a branch de staging diverge com 3 commits próprios, mas a branch principal tem 41 commits exclusivos e os recursos novos de produção.

## Destino consolidado

- `https://mediaforge.salevo.site/dashboard`: administração, autenticação, fila, Worker e integração MCP.
- `https://mediaforge.salevo.site/studio`: Forge Studio **autenticado**, incluindo pacotes, renderização controlada e recursos atuais.
- `https://mediaforge.salevo.site/studio/preview`: prévia pública sem autenticação, sem os botões de composição ou renderização, com JS/CSS estáticos isolados em `/studio/preview/`.
- `https://mediaforge.salevo.site/health`: estado da instância e do Worker.

## Segurança

Não copiar o servidor mais antigo por cima do mais recente. Preservar autenticação administrativa, OAuth, MCP, API, tokens, configurações privadas e a conexão do Worker. Prévia pública **não** recebe acesso a `/api/studio/compose`, `/api/studio/render` ou `/v1/jobs` sem sessão/escopo. `x-robots-tag` impede indexação da prévia.

## Persistência dos rascunhos

O Forge Studio salva o roteiro em `localStorage` do navegador, **por origem**. Um servidor não consegue copiar esse conteúdo de `forge-preview.salevo.site` para `mediaforge.salevo.site` remotamente. O próprio Studio oferece **Baixar JSON** e **Importar JSON**; a migração de rascunhos já criados deve usar esses dois controles, no mesmo navegador. Arquivos de mídia/voz escolhidos em um navegador não são persistidos e devem ser anexados outra vez. A prévia consolidada utiliza a chave isolada `mediaforge_creator_preview_v1`; a versão autenticada mantém `mediaforge_creator_studio_v1`.

## Corte e rollback

1. Preservar o commit principal anterior em `backup/mediaforge-before-single-domain-20261112`. Preservar a branch de staging até finalizar a importação dos rascunhos.
2. Executar testes do novo endpoint e do Studio autenticado.
3. Fazer o deploy da branch consolidada no domínio principal.
4. Verificar respostas HTTP, `/studio/preview`, proteção de `/studio`, saúde do Worker e criação de jobs sem alterar tokens.
5. Só remover/desativar a aplicação separada `forge-preview.salevo.site` **depois** de exportar eventuais rascunhos locais e confirmar o funcionamento da origem principal. Não apagar dados não acessíveis via servidor.

Rollback de código: redeploy do commit `47e720fdec3083e7b0f90679d835074e6e30bfce` na aplicação principal. Rollback de credenciais/estado requer backups próprios da Hostinger; o branch GitHub não é backup de dados.
