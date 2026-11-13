# MediaForge — Premium Motion v1

## Referência criativa aprovada

Projeto de referência: **HOSTINGER — Filme Cinemático V2 — Windows/GSAP corrigido**.
Trabalho MediaForge: **be30b7d964614148aa86a007eeef6a17**.
Worker: **DESKTOP-7H0V74C**. Arquivo: **C:\Users\Pantoja\Downloads\MediaForge\be30b7d964614148aa86a007eeef6a17.mp4**.
Render confirmado: **16 s, 1920 × 1080, 60 FPS**, áudio presente, QA técnico FFprobe aprovado.
O usuário avaliou o rascunho anterior em 4/10 para imagem e 2/10 para áudio, depois assistiu à renderização revisada e disse **“gostei”**.

Limites da referência: a revisão artística do servidor permanece pendente e o campo audioQA era nulo. Portanto, isso é uma referência visual aprovada pelo usuário, não uma certificação técnica de qualidade musical.

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
