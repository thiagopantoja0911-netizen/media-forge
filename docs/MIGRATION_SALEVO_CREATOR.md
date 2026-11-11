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
| `video.salevo.site/studio/` | Briefing, três ganchos, storyboard em cinco cenas, timeline, prévia ilustrativa | Importação JSON v1 para manifesto **de planejamento** implementada nesta branch |
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
- O resultado usa `format="mediaforge-planning-v1"` e `renderReady=false`. **Não é um job submetível a `/v1/jobs` e não gera MP4**: o JSON legado contém roteiro, não uma composição HyperFrames.

### Uso local (sem enviar dados para o servidor)

1. No Studio antigo, usar **Baixar JSON** para exportar um rascunho v1.
2. Na cópia do repositório MediaForge com a branch de migração, executar:

```bash
node scripts/import-salevo-studio.mjs "meu-rascunho.json" > "job-planejamento.json"
```

3. Revisar `job-planejamento.json`. O resultado é um manifesto offline, **não deve ser enviado diretamente à API de jobs** e pode conter informações privadas do roteiro. Somente uma etapa futura que produza composições renderizáveis poderá transformá-lo em job.

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

## Branch de produção e publicação

A Hostinger confirmou que `mediaforge.salevo.site` usa `media-forge` na branch `feature/conexoes-mediaforge-primeiro`, commit `3ce1879fb94293629ebff14dd4eb71d3abc55d49` na verificação de 2026-11-11. A branch atual foi criada a partir dessa base, não de `main`. A publicação automática está habilitada para essa branch. **Não executar merge nem deploy antes de rever autenticação, testes e compatibilidade do Worker remoto.**

O Worker remoto de produção só executa `hyperframes` e rejeita renderizadores diferentes; por isso a importação entrega um manifesto não renderizável, nunca uma solicitação `dry-run` à fila remota.

## Domínios e repositórios independentes confirmados em 2026-11-11

- `mediaforge.salevo.site`: MediaForge Node.js 22, publicado pelo repositório `media-forge`.
- `video.salevo.site`: hub antigo, ligado ao repositório `paginadevendas`, branch `deploy/video-salevo-hub`.
- `mcpbrowser.salevo.site`: Browser MCP Relay v0.5.0, publicado de um arquivo próprio, sem Git auto-deploy. Deve continuar independente.
- `secretssystem.online`: portal Secrets System, Next.js, ligado ao repositório `Secretssysten`, branch `release/secrettrack-20261108`. É outro produto e não deve ser removido para migrar o Creator Video.
- `salevo.site`: domínio pai com outros subdomínios. Não remover em lote.

A lista de websites da Hostinger tinha 28 entradas na verificação. Apenas os recursos diretamente relacionados à migração estão documentados acima. Ver `docs/FINAL_CLEANUP_GATE.md` para os critérios e a lista protegida de recursos.

## Áudio no Forge Midjourney

O Forge Midjourney agora aceita arquivos opcionais de locução e trilha (WAV, MP3, M4A, AAC, OGG, OPUS ou WEBM), com metadados de duração lidos no navegador e limites de tamanho no servidor. Os binários não são salvos no localStorage. O pacote HyperFrames inclui os arquivos e cria faixas de áudio com ganho/fades básicos, mas continua `renderReady=false` até que os SFX anotados e os visuais específicos sejam adicionados e o Worker valide sincronismo, duração e mixagem.

VoiceStudio é mantido como app/repositório separado (AGPL-3.0). A integração atual é por exportação manual do áudio e upload no Forge Midjourney; não copiamos o código do VoiceStudio nem presumimos que sua API local esteja instalada.

O botão de pacote não cria job nem inicia renderização.


## Revisão editorial da composição (2026-11-11)

A revisão da versão anterior encontrou legendas muito próximas da borda inferior e repetição do mesmo wipe em todas as cenas. A implementação foi atualizada para posicionar as legendas em `bottom: 1200px` (2160 × 3840), adicionar o rótulo editável de cada cena e alternar quatro transições determinísticas: flash editorial, rabisco, íris e whip. A versão atual continua sendo um protótipo tipográfico; a revisão visual final e a renderização 4K/60 FPS no Worker ainda são gates pendentes.

## Limpeza iniciada — confirmação do proprietário (11/11/2026)

O Nexora Workspace / Media Editor **deve continuar no Secrets** e está explicitamente fora do escopo. Foram arquivadas as branches antigas do `paginadevendas` antes das exclusões. O código antigo PHP, Studio, arquivos do site e workflow foram removidos da branch `deploy/video-salevo-hub`, restando apenas README de aposentadoria. A branch `main` também teve os arquivos exclusivos `videosai` removidos via PR #33, sem modificar os outros mapeamentos de vendas.

A Hostinger teve o auto-deploy do `video.salevo.site` desativado antes da limpeza. **Atualização de 11/11/2026:** após autorização do proprietário, a exclusão definitiva da hospedagem `video.salevo.site` foi aceita pela Hostinger, e a listagem seguinte retornou zero websites com esse nome. Os arquivos versionados ficaram arquivados no Git, mas possíveis dados privados `salevo-private`, jobs e OAuth não tiveram backup comprovado e podem ter sido eliminados. Os sites MediaForge, Secrets e Browser MCP continuaram cadastrados e habilitados; o Nexora/Media Editor foi expressamente preservado.
