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

Esta versão ainda não é um renderizador de entrega. O botão Gerar pacote HyperFrames envia o briefing e, se selecionados, os arquivos de locução/trilha ao endpoint autenticado do próprio MediaForge e baixa um pacote de composição editável. O endpoint não cria jobs nem coloca nada na fila. O pacote usa tipografia cinética abstrata e fica marcado `renderReady=false` até receber assets específicos, narração, música, efeitos e aprovação no QA do Worker Windows.

A rota `/studio`, seus assets e `POST /api/studio/compose` exigem sessão administrativa MediaForge. A CSP permite somente a chamada same-origin necessária para gerar o pacote.

## Dados legados

O formato de exportação mantém `version: 1` e os campos do antigo Studio, para permitir importar rascunhos já exportados. O armazenamento local passa a usar a chave `mediaforge_creator_studio_v1`, sem ler ou sobrescrever automaticamente o localStorage do domínio antigo.

## Próximas etapas

1. Gerar uma composição HyperFrames a partir do storyboard, com transições e timeline verificáveis.
2. Integrar voz/narração e música como assets locais, com sincronismo e normalização.
3. Validar áudio, vídeo, resolução, FPS, margens, primeiro frame e duração no Worker.
4. Só então habilitar envio autenticado à fila.
