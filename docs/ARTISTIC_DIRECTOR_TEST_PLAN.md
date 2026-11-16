# MediaForge — Diretor Criativo Artístico e Homologação

## Objetivo
Transformar o planejamento de vídeo em uma direção artística executável e auditável: conceito, narrativa, storyboard, linguagem visual, câmera, luz, composição, tipografia, áudio, assets e critérios de revisão. O sistema não pode confundir um plano bem escrito ou um MP4 renderizado com aprovação estética.

## Escopo desta entrega
- Três conceitos visuais distintos e três abordagens de gancho.
- Conceito escolhido por objetivo, com possibilidade de seleção explícita.
- Rascunho machine-readable dynamic-motion-v1 com 3 camadas, beats, eventos de câmera, ações, transições e holds; preflight estrutural deve passar entre 10 e 40 segundos, mas os seletores ainda precisam ser vinculados ao HTML real.
- Storyboard de cinco beats com ação, estado antes/depois, causa da transição, câmera, luz, enquadramento, texto, locução e asset exigido.
- Direção de arte: mundo visual, paleta, materiais, lente, luz, profundidade, composição, tipografia e regras de continuidade.
- Direção de áudio: voz, arco musical, efeitos causais e alvos de mixagem; arquivos locais e direitos/proveniência obrigatórios.
- Rubrica de revisão com pesos, mas sem pontuação automática de gosto.
- Frame Lab fornece sinais mensuráveis de movimento e trechos de baixa atividade; composição, originalidade, narrativa, legibilidade e som continuam sujeitos à revisão humana.
- Diagnóstico de binários FFmpeg/FFprobe sem expor caminhos ou valores de ambiente.

## Ordem de teste
1. Planejamento MCP: chamar plan_video_from_brief com marca, ideia, objetivo, público, formato e CTA. Conferir conceitos, hooks, direção de arte e storyboard.
2. Variação criativa: repetir com objetivos sales, likes, shares e awareness; verificar se os conceitos e hooks mudam de forma coerente.
3. Integridade: omitir logo e fontes; confirmar que não surgem provas sociais, preços, métricas, promessas ou identidade inventadas.
4. Assets: anexar mídia real, licenciada/original, voz, música e SFX; exigir caminhos locais e proveniência antes da composição.
5. Prévia de 3 segundos: validar primeiro frame, foco, movimento principal, leitura e assinatura sonora antes do vídeo completo.
6. Preflight HyperFrames: exigir projeto local, GSAP, fontes, assets, motion plan e transições causais.
7. Render de prova: executar um job curto em worker Windows; conferir MP4, hash, resolução, FPS, duração e upload.
8. Frame Lab: analisar todos os frames nativos; conferir motion evidence, trechos de baixa atividade, câmera e comparação quando houver referência.
9. QA de áudio: ouvir o arquivo final, validar voz, música, SFX, loudness, true peak e sincronismo.
10. Revisão artística humana: avaliar narrativa, originalidade, composição, câmera, continuidade, tipografia, som, marca e adequação à plataforma.
11. Aceite final: somente liberar master após QA técnico, QA de áudio, revisão artística e aprovação do usuário.

## Critérios de aprovação
- Nenhum asset ausente, externo não empacotado ou sem direitos/proveniência.
- Nenhuma afirmação não comprovada, logo inventado ou falsa urgência.
- Sem sequência de cartões genéricos, movimento decorativo ou transições sem causa.
- Safe areas e CTA legíveis no formato escolhido.
- QA técnico e de áudio aprovados.
- Frame Lab com relatório completo; sinais de movimento não equivalem a aprovação estética.
- Revisão humana concluída; aprovação automática permanece desativada.

## Estado operacional
- Branch de trabalho: feature/mediaforge-artistic-director-20261115.
- Base: feature/frame-lab-chat-mcp-20261113 em be4b719270907a4047691c3c0a122553523941fa.
- Sem merge e sem deploy. A branch ficará disponível para CI e teste controlado.
- O bloqueio de FFmpeg/FFprobe em runtime precisa ser diagnosticado com os novos campos de diagnóstico após publicação autorizada; nenhum valor de segredo será exposto.

## Correção preparada para o bloqueio de FFmpeg/FFprobe em runtime
- O build agora copia os executáveis já verificados para frame-lab/bin, aplica permissão de execução em Linux e testa a resolução a partir desse diretório.
- O diretório frame-lab/bin é gerado no build e ignorado pelo Git; não adiciona os binários pesados ao repositório.
- O resolver prioriza os caminhos explícitos, depois frame-lab/bin, pacote estático e PATH.
- O endpoint de capabilities informa source e códigos de falha sanitizados, sem expor caminhos ou valores de variáveis.
- O teste bundled-media-binaries exige que ambos os executáveis sejam encontrados no pacote local após media-tools:install.
- Esta correção ainda não foi aplicada ao Hostinger publicado. Só após deploy autorizado será possível confirmar se engineReady passa para true em runtime.
