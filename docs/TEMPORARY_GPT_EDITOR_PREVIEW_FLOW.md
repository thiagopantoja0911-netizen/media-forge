# Fluxo temporário de produção: GPT → Editor → Prévia → Sim/Não → Render

**Objetivo:** por enquanto, toda produção solicitada pelo ChatGPT deve nascer como um projeto editável no MediaForge. Não entregar render alternativo como se tivesse passado pelo editor.

```text
GPT (ideia, roteiro e direção)
  ↓
create_editor_project / edit_editor_project
  ↓
Editor Visual 3D (mesma timeline e seus assets)
  ↓
Prévia WebGL de cada cena — inspecionar pelo navegador (não basta a página carregar)
  ↓
review_editor_preview — amostrar pelo menos dois tempos de cada cena
  ├── Não: registrar falha → editar a revisão → repetir a prévia
  └── Sim: aprovar a revisão vigente → render_editor_project → HyperFrames
```

## Contrato

1. O GPT define cenas específicas da ideia e as registra diretamente em `create_editor_project`. O editor é a fonte única de verdade para cenas, textos, câmera, tempos e trilhas. `edit_editor_project` modifica o mesmo projeto (não um roteiro paralelo).
2. Depois de salvar, o GPT **abre de fato** a prévia `/api/editor/projects/:id/preview?scene=0` e repete para todas as cenas. Deve verificar quadros em instantes distintos e observar renderização WebGL pronta, legibilidade, movimento, enquadramento e corte. Anexar ativos de áudio e ouvir quando aplicável. Se o navegador estiver desconectado, a prévia não foi verificada; não declarar sucesso.
3. Usar `review_editor_preview` com `decision=fail` e diagnóstico se alguma cena falhou. Voltar a `edit_editor_project` e refazer a revisão. A ferramenta de revisão **registra** observações humanas/da IA: não captura screenshots automaticamente, não é certificação visual automática nem substitui a inspeção real.
4. Para `decision=pass`, todas as cenas precisam apresentar pelo menos duas amostras diferentes, flags positivas e descrição do que foi observado. A aprovação pertence à `revision` atual e é invalidada por qualquer nova edição/salvamento.
5. `render_editor_project` exige `confirm_render=true` **e** revisão aprovada. A mesma regra é aplicada ao botão do editor e ao endpoint HTTP `/api/editor/projects/:id/render`. Sem aprovação, a API retorna `PREVIEW_APPROVAL_REQUIRED` (HTTP 428). O Worker HyperFrames só recebe o render quando a verificação foi aprovada.
6. Conferir MP4, trilha e frames após render. Não declarar concluído até confirmar artefato final. Se o HyperFrames falhar, informar erro e corrigir, sem substituir silenciosamente por uma renderização local.
7. A revisão pode ser consultada em `GET /api/editor/projects/:id/review` ou pela resposta de `get_editor_project`. Para registrar via HTTP autenticado, `POST /api/editor/projects/:id/review`. As observações ficam armazenadas no mesmo diretório privado, com revisão única e sem histórico de undo.

## Ativação temporária e reversão

A regra é ativada por padrão no editor. Para voltar ao modo anterior **sem apagar projetos nem avaliações**, configurar `MEDIAFORGE_EDITOR_REVIEW_FLOW=legacy` no processo do servidor e reiniciá-lo. Para reativar, remover essa variável.

A alteração não reescreve jobs existentes nem desliga ferramentas legadas de produção para outros consumidores da API. Ela garante o gate de revisão **nas rotas de render do editor**, e o agente ChatGPT deve usar exclusivamente as ferramentas do editor durante este fluxo.

## Limitações atuais

- O MCP e o cliente/browser devem expor as ferramentas `create_editor_project`, `edit_editor_project`, `get_editor_project`, `review_editor_preview` e `render_editor_project`. Recarregar a conexão/plugin após publicação se a ferramenta nova não aparecer.
- Inspeção visual real depende de navegador autenticado e acessível. O servidor valida a estrutura do relatório; não prova sozinho que os pixels foram inspecionados.
- A validação de prévia é diferente do `hyperframes check`: mesmo após aprovação visual, a renderização pode falhar por GPU, timeout ou assets. Manter QA técnico depois do render.
