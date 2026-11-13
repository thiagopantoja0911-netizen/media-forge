# MediaForge — Premium Motion v1

## Referência criativa aprovada

Projeto de referência: **HOSTINGER — Filme Cinemático V2 — Windows/GSAP corrigido**.
Trabalho MediaForge: **be30b7d964614148aa86a007eeef6a17**.
Worker: **DESKTOP-7H0V74C**. Arquivo: **C:\Users\Pantoja\Downloads\MediaForge\be30b7d964614148aa86a007eeef6a17.mp4**.
Render confirmado: **16 s, 1920 × 1080, 60 FPS**, áudio presente, QA técnico FFprobe aprovado.
O usuário avaliou o rascunho anterior em 4/10 para imagem e 2/10 para áudio, depois assistiu à renderização revisada e disse **“gostei”**.

Limites da referência: a revisão artística do servidor permanece pendente e o campo audioQA era nulo. Portanto, isso é uma referência visual aprovada pelo usuário, não uma certificação técnica de qualidade musical.

## Segunda referência evolutiva — YouTube (13/11/2026)

- **Nome:** YOUTUBE — Um clique, mil possibilidades | Premium Motion Test Windows.
- **Job:** `22c71e2b6b154f66b8cf939403106ecd`.
- **Arquivo do Windows:** `C:\Users\Pantoja\Downloads\MediaForge\22c71e2b6b154f66b8cf939403106ecd.mp4`.
- **Worker:** `DESKTOP-7H0V74C`; localização do render: `windows-local`.
- **QA de vídeo:** concluído, 16 segundos, 1920 × 1080, 60 FPS; stream de áudio presente; nenhum problema técnico reportado.
- **QA de áudio:** aprovado pelo FFmpeg, `integratedLufs=-16.68`, `truePeakDb=-2.81`; nenhum aviso ou problema de nível/pico.
- **Direção criativa:** anúncio conceitual não oficial YouTube; grafismos editoriais próprios, contraste vermelho/preto/branco, tipografia cinética, sequência de cards, movimentos com zoom, clique visível no botão play e encerramento com marca.
- **Projeto sonoro planejado:** música eletrônica House Vibez (Lily J / Mixkit), transições com SFX distintos, clique e impacto reservados para a ação de play. Fontes de áudio e créditos foram incluídos na pasta de projeto como `AUDIO_CREDITS.md`; a composição usa endereços HTTPS para os sons.
- **Feedback humano:** o usuário assistiu e disse **“tá ficando bom, salva como referência. vamos melhorando”**. Classificar como **referência positiva em evolução**, **não como aprovação definitiva da mixagem ou do visual**.
- **Limites do teste:** a análise FFmpeg mede loudness e pico, não garante beleza musical, bom sound design, sincronia quadro a quadro nem licença de cada efeito. `motionReview=null` e `artisticQA=pending-user-review` no relatório. Não confundir o QA técnico com inspeção sensorial.

### Lições para os próximos trabalhos

1. **Preservar:** a linguagem de motion premium da Hostinger V2, agora validada também na identidade visual distinta do YouTube, com render real no Windows em 1080p60.
2. **Melhorar:** escolher música por intenção narrativa e não apenas gênero; organizar cortes sobre acentos reais da trilha e evitar whooshes automáticos sem causa visível.
3. **Verificar:** ouvir o MP4 no início, nas mudanças de cena e no final; avaliar em alto-falante de celular; comparar a versão seguinte ao YouTube e à Hostinger antes de considerar uma evolução.
4. **Não regredir:** nenhum anúncio final sem preflight, áudio real, QA técnico e sonoro; avaliar legibilidade, continuidade e transições antes da entrega.
5. **Iterar com base no feedback:** a frase “tá ficando bom” significa progresso, não nota 10/10. Registrar novos comentários e conservar os exemplos anteriores.

## Padrão criativo

1. **Direção:** abertura forte, progressão, revelação, resultado e encerramento; usar a mesma intenção e não copiar as cores ou cenas Hostinger para qualquer outra marca.
2. **Animação:** vários momentos visuais reais, tipografia cinética, transições motivadas, movimentos legíveis, equilíbrio de velocidade e hold; não regressar a slides repetidos.
3. **Áudio:** cama musical licenciada e pelo menos dois efeitos diferentes vinculados às ações visuais. Preferir áudio empacotado com o projeto; endereços HTTPS são permitidos no caminho legado, mas podem falhar se não estiverem disponíveis. Confirmar licença e escutar a mixagem.
4. **Produção:** padrão 1080p60, qualidade high ou delivery, preflight HyperFrames obrigatório e renderização no Worker Windows. 4K apenas quando pedido ou apropriado.
5. **Auditoria:** corrigir erros do check, validar arquivo, duração, quadros, resolução e presença de som; aplicar análise FFmpeg de loudness e pico verdadeiro nos jobs Premium Motion.
6. **Aprovação:** inspeção de continuidade, ritmo, legibilidade e som por uma pessoa. Nenhum gate automático garante uma direção artística boa.

## Regras implementadas no MCP

A ferramenta **create_video** passa a usar **production_profile=premium-motion-v1** por padrão:

- pelo menos quatro elementos visuais temporizados;
- GSAP ou vídeo em movimento como componente do filme;
- biblioteca GSAP incluída nos arquivos do projeto quando usada;
- pelo menos três fontes de áudio distintas; uma faixa inicia no quadro zero e cobre a duração;
- pelo menos 60 FPS, qualidade high ou delivery, preflight habilitado;
- job marcado com **qualityBaseline=premium-motion-v1**, **productionMode=cinematic**, **expectsAudio=true**. Este último aciona FFprobe com exigência de áudio; cinematic aciona a análise FFmpeg de áudio já presente no Worker.

A verificação é **estrutural**. A qualidade real da música, o licenciamento e a disponibilidade de mídia remota ainda exigem revisão.

Para provas de conceito simples ou vídeos **intencionalmente silenciosos**, escolher explicitamente **production_profile=study**. Não usar study por conveniência em anúncios finais.

A ferramenta **create_motion_video** mantém as regras próprias de mídia cinematográfica e áudio empacotado.

## Aprovação de entrega

- O projeto passou no preflight HyperFrames, sem ignorar falhas de GSAP, fontes, vídeos ou sobreposições.
- MP4 registrado como concluído no Windows, com dimensões, FPS e duração esperados.
- Áudio presente; para Premium Motion, audioQA deve estar aprovado (loudness analisado e pico ≤ −1 dBTP).
- Revisão visual no primeiro quadro, na troca de cenas e no encerramento; audição da trilha e dos efeitos no MP4 real.
- Anotar quais decisões criativas foram preservadas e quais diferenças em relação ao trabalho de referência são intencionais.

## Estado de implantação

O padrão de servidor só fica ativo após a publicação da alteração do MCP. O Worker V2 existente já suporta os campos productionMode=cinematic e expectsAudio=true; portanto não é necessário reiniciá-lo para acionar essas verificações pela API. Não aplicar automaticamente essas restrições a outros tipos de tarefa sem distinguir seu objetivo.
