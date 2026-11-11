# Migração incremental: Salevo Video / Creator Video → MediaForge

Data do inventário: 2026-11-11. A migração deve ser reversível e NÃO deve substituir a instalação Windows.

## Fontes examinadas

- Hostinger: `video.salevo.site` (website legado, 34 entradas listadas até profundidade 4), `mediaforge.salevo.site` (aplicação Node.js ativa).
- Código público de `video.salevo.site/studio/app.js`, `README.md`, `MIGRATION.md`, `ARQUITETURA-GPT-PC-4K60.md`.
- GitHub: `thiagopantoja0911-netizen/media-forge` e repositórios de módulos `hyperframes`, `VoiceStudio`, `FilmCraft`, `LightCraft`, `ArtCraft`.
- Interface MediaForge: worker online na verificação, zero jobs ativos e job de teste anterior concluído em 4K/60 FPS.
- Relatório do reparo do usuário: tarefa agendada `MediaForge Worker - Staging` chama `wscript.exe` e utiliza `desktop/launch-worker-hidden.vbs`.

**Atenção:** o repositório local e a aplicação Node.js implantada na Hostinger NÃO foram provados idênticos. O document root do MediaForge mostra apenas `.htaccess`; não significa que o aplicativo não tenha código fora de `public_html`.

## Inventário de funcionalidades

| Origem | Funcionalidade existente | Destino / estado |
| --- | --- | --- |
| `video.salevo.site/studio/` | Briefing, três ganchos, storyboard em cinco cenas, timeline, prévia ilustrativa | Importação JSON v1 para job **de planejamento** implementada nesta branch |
| `studio/app.js` | Importar/exportar TXT/JSON e salvar em localStorage no próprio navegador | Rascunhos permanecem no navegador antigo. Exportação manual JSON é necessária; nenhum acesso indevido a localStorage |
| `video.salevo.site/api/v1/` | Código PHP de jobs, OAuth e pareamento presente no website | NÃO copiado: necessita auditoria de contratos, sessão, credenciais e clientes ainda ativos |
| `video.salevo.site/conexao/` | Interface legada de estado de pareamento | Manter até mapear a nova experiência de conexão |
| `video.salevo.site/formacao/` | Conteúdo de formação | Preservar por ser conteúdo distinto do renderizador |
| `media-forge/src/server.mjs` | Contrato de jobs e arquivos HyperFrames | Já existe e não deve receber um backend PHP paralelo sem revisão |
| `media-forge/src/worker.mjs` | Execução local e renderização HyperFrames/dry-run | Preservar |
| `mediaforge.salevo.site` | App Node, fila HTTPS, Worker remoto | A migração não modificou o serviço publicado |
| `hyperframes` | Motion e renderização | Dependência a integrar por adaptador versionado, não copiar o repositório inteiro |
| `VoiceStudio`, `FilmCraft` | Narração/edição (componentes candidatos) | Não integrados neste lote; validar API, licenças e dependências antes |
| `LightCraft`, `ArtCraft` | Ferramentas candidatas | Requer avaliação de escopo; não equivalem automaticamente a funções do Creator Video |

Os documentos antigos contêm afirmações de estados diferentes ao longo da migração (algumas interfaces ainda dizem “pendente”). Para concluir a migração, o status deve ser verificado pelo sistema em execução, não apenas pelo texto dos sites.

## Primeiro componente migrado: JSON Salevo Studio v1

- `src/legacy-studio.mjs`: normaliza os campos de briefing, gancho escolhido, cinco cenas e duração.
- `scripts/import-salevo-studio.mjs`: executa importação **offline**, sem redes, sem tokens, sem alterar o site antigo.
- `test/legacy-studio.test.mjs`: valida mapeamento e rejeita entradas inválidas.
- Os campos de cena ficam em `metadata.brief.scenes`, preservando narração, texto na tela, movimento e som.
- O resultado usa `project.renderer="dry-run"` e `outputs=["project"]`. **Isto não gera MP4**: o JSON legado é um roteiro, não um HTML HyperFrames renderizável.

### Uso local (sem enviar dados para o servidor)

1. No Studio antigo, usar **Baixar JSON** para exportar um rascunho v1.
2. Na cópia do repositório MediaForge com a branch de migração, executar:

```bash
node scripts/import-salevo-studio.mjs "meu-rascunho.json" > "job-planejamento.json"
```

3. Revisar `job-planejamento.json` antes de qualquer envio à API. O arquivo contém o roteiro e pode incluir informações sensíveis escritas pelo usuário.

## Gates para próximas etapas

1. Fazer backup verificável dos arquivos legados antes de mudar `video.salevo.site`.
2. Auditar a implementação e clientes ativos da API PHP `api/v1` e confirmar se existe pareamento em uso; nunca copiar chaves ou tokens para Git.
3. Auditar o backend Node implantado na Hostinger e compatibilidade com a branch `media-forge`.
4. Criar uma camada de autenticação e autorização apropriada para ingestão dos briefings, com controles de tamanho, origem, sessão e consentimento.
5. Converter roteiro revisado em composição HyperFrames REAL, com assets e áudio, e validar no QA antes de renderizar.
6. Testar de ponta a ponta: job, heartbeat, MP4 com resolução/FPS/áudio, falhas e recuperação do Worker oculto.
7. Só depois revisar redirects, aliases e eventual desligamento de componentes comprovadamente redundantes, com rollback.

## Regra de preservação

Não remover pastas locais `%LOCALAPPDATA%\\MediaForge-Staging`, projetos, tokens, `.env.local`, logs, VBS, tarefas do Agendador, arquivos antigos ou sites em produção. Esta branch não implementa reinstalação, limpeza, publicação ou geração de novos tokens.
