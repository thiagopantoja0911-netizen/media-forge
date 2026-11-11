# MediaForge Creator Studio

O Creator Studio é a interface de planejamento de vídeos do repositório MediaForge. Ele foi migrado do antigo `video.salevo.site/studio/` para uma rota protegida no serviço MediaForge.

## Escopo desta etapa

- Briefing, tema, objetivo, público, tom e direção visual.
- Três opções de gancho com seleção explícita.
- Storyboard de cinco cenas com tempos estimados.
- Campos por cena para narração, texto na tela, ação/câmera e som.
- Prévia ilustrativa do storyboard.
- Identificação editorial de cada cena e legendas em uma faixa separada, dentro da área segura vertical.
- Quatro transições distintas entre cenas: flash editorial, rabisco, íris e whip.
- Upload opcional de locução e trilha, com prévia local antes de gerar o pacote.
- Salvamento local no navegador e importação/exportação JSON/TXT.

## Limites intencionais

Esta versão ainda não é um renderizador de entrega. O botão Gerar pacote HyperFrames envia o briefing e, se selecionados, os arquivos de locução/trilha ao endpoint autenticado do próprio MediaForge e baixa um pacote de composição editável. O endpoint não cria jobs nem coloca nada na fila. O pacote usa tipografia cinética e blocos gráficos editoriais, com quatro transições distintas. Pode incluir locução e trilha anexadas, mas fica marcado `renderReady=false` até receber imagens/vídeos específicos do assunto, SFX por cena e aprovação audiovisual no Worker Windows.

A rota `/studio`, seus assets e `POST /api/studio/compose` exigem sessão administrativa MediaForge. A CSP permite somente a chamada same-origin necessária para gerar o pacote.

## Dados legados

O formato de exportação mantém `version: 1` e os campos do antigo Studio, para permitir importar rascunhos já exportados. O armazenamento local passa a usar a chave `mediaforge_creator_studio_v1`, sem ler ou sobrescrever automaticamente o localStorage do domínio antigo.

## Próximas etapas

1. Substituir os blocos gráficos por imagens/vídeos específicos e licenciados para cada assunto.
2. Gerar/validar SFX por cena e sincronizar locução, música e efeitos no Worker.
3. Validar áudio, vídeo, resolução, FPS, margens, primeiro frame, legendas e duração no Worker.
4. Só então habilitar envio autenticado à fila.
