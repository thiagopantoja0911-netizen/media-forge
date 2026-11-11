# Deploy oficial do MediaForge

## Alvo

O MediaForge substitui o painel PHP do Vídeos Secrets como aplicação Node.js. O Hostinger deve receber uma aplicação Node.js separada, com uma URL própria, antes do cutover do domínio antigo.

O processo não deve sobrescrever o diretório atual de `videos.secretssystem.online` enquanto o teste de renderização não for aprovado.

## Variáveis obrigatórias

- `MEDIAFORGE_HOST`: normalmente `0.0.0.0` no Hostinger.
- `MEDIAFORGE_PORT`: porta fornecida pelo ambiente Node.js.
- `MEDIAFORGE_DATA_DIR`: diretório persistente fora do código.
- `MEDIAFORGE_PROJECTS_DIR`: diretório dos projetos materializados.
- `MEDIAFORGE_OUTPUT_DIR`: diretório dos MP4 locais.
- `MEDIAFORGE_RENDERER`: `hyperframes` no computador Windows.
- `MEDIAFORGE_OAUTH_ISSUER`: URL pública da aplicação.
- `MEDIAFORGE_SETUP_TOKEN`: código de configuração de uso único.
- `MEDIAFORGE_REQUIRE_AUTH=true`: obrigatório quando o MCP não está em localhost.

O token MCP e a senha administrativa não devem ser gravados no GitHub. O estado persistente fica em `MEDIAFORGE_DATA_DIR/state.json`, com hashes dos tokens e da senha.

## Ordem do deploy

1. Criar a aplicação Node.js no Hostinger sem apontar ainda o domínio de produção.
2. Configurar as variáveis de ambiente.
3. Executar `npm install` e iniciar pelo script `npm start`.
4. Verificar `/health` e os endpoints `/.well-known/*`.
5. Abrir o painel em `/dashboard` e concluir a configuração inicial.
6. Instalar o worker Windows usando `desktop/install-worker.ps1`.
7. Testar autenticação MCP, fila e renderização.
8. Só após a aprovação do MP4, conectar a URL oficial e manter o Vídeos Secrets antigo como rollback.
