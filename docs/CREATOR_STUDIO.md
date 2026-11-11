# MediaForge Creator Studio

O Creator Studio é a interface de planejamento de vídeos do repositório MediaForge. Ele foi migrado do antigo `video.salevo.site/studio/` para uma rota protegida no serviço MediaForge.

## Escopo desta etapa

- Briefing, tema, objetivo, público, tom e direção visual.
- Três opções de gancho com seleção explícita.
- Storyboard de cinco cenas com tempos estimados.
- Campos por cena para narração, texto na tela, ação/câmera e som.
- Prévia ilustrativa do storyboard.
- Salvamento local no navegador e importação/exportação JSON/TXT.

## Limites intencionais

Esta versão é um planejador, não um renderizador. Não chama APIs, não cria jobs, não coloca nada na fila e não envia conteúdo do navegador ao servidor. O JSON importado/exportado não é, por si só, uma composição HyperFrames. O botão de renderização só deve ser adicionado depois que o gerador de composição, o áudio e o QA forem implementados e testados no Worker Windows.

A rota `/studio` e seus assets exigem sessão administrativa MediaForge. O conteúdo usa CSP sem conexões externas.

## Dados legados

O formato de exportação mantém `version: 1` e os campos do antigo Studio, para permitir importar rascunhos já exportados. O armazenamento local passa a usar a chave `mediaforge_creator_studio_v1`, sem ler ou sobrescrever automaticamente o localStorage do domínio antigo.

## Próximas etapas

1. Gerar uma composição HyperFrames a partir do storyboard, com transições e timeline verificáveis.
2. Integrar voz/narração e música como assets locais, com sincronismo e normalização.
3. Validar áudio, vídeo, resolução, FPS, margens, primeiro frame e duração no Worker.
4. Só então habilitar envio autenticado à fila.
