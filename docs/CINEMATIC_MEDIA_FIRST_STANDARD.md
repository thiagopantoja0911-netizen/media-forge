# MediaForge — Padrão de produção cinematográfica com mídia real (ÓRBITA 002)

## Objetivo
Impedir que um vídeo de curiosidades pedido como cinematográfico seja substituído, sem aprovação, por globo procedural, SVG, ilustrações chapadas ou card animado. A engine HyperFrames é o *renderizador e compositor*, não a fonte de todos os personagens, ambientes e cenários.

## Pré-produção obrigatória
1. Escrever o gancho, roteiro narrado, progressão visual, ação de cada plano e encerramento antes de renderizar.
2. Separar as cenas em planos reais: fotografia ou footage licenciado, CGI fotorealista com textura e iluminação físicas, ou arte técnica explicativa. Documentar a procedência de cada asset. Imagens geradas por IA devem ser identificadas como ilustrações, nunca apresentadas como captura da NASA.
3. Para Reel narrativo de 40–50 s: planejar pelo menos **8 planos visualmente distintos**; evitar plano idêntico ou globo repetido em tomadas adjacentes. Nenhum visual-base único pode dominar mais de 25% da duração.
4. Direção visual *media-first*: >=70% do tempo com vídeo/fotografia/CGI realista; <=15% com infográficos puramente vetoriais; textos, linhas e números como complemento, nunca substitutos da imagem. Exceções devem ser aprovadas deliberadamente.
5. Respeitar zona segura para Reels: título e legenda dentro de 80% da largura útil; informações essenciais acima de ~168 px e abaixo de ~1330 px em 1080×1920.

## Áudio antes da renderização
- Um vídeo que pede narração **não está pronto** com música apenas. O arquivo completo de voz deve estar no projeto como asset local e sua duração aferida.
- Sincronizar cortes, ações e textos com as palavras-chave da locução; usar a voz como relógio da edição.
- Música e efeitos autorizados e auditáveis. Música sob voz em torno de -14 a -20 dB relativos, conforme a gravação; resultado social ~-16 a -14 LUFS e true peak <= -1 dBTP.
- Evitar narração robótica substitutiva e efeitos sintéticos repetitivos; não afirmar mixagem aprovada sem escuta/revisão humana.

## Portas de qualidade
**Gate 0 — Asset readiness:** fontes reais/CGI com arquivos existentes e licenciados; origens e direitos revisados; voz/música recebidas. Se o render pretendido for narrado e a voz não existir, bloquear publicação e marcar preview como SEM_NARRACAO.

**Gate 1 — Preflight:** primeiro frame com gancho visível; contraste, texto seguro, nenhuma sobreposição não intencional, elementos determinísticos e imagens carregadas. Não considerar sucesso de ffprobe como veredito artístico.

**Gate 2 — Teste local:** primeiro render 1080×1920/30, inspecionar quadros 0s, 3s, 9s, 15s, 21s, 27s, 33s, 40s e 44s. Revisar visual, legibilidade, ritmo, clareza da causa física e alinhamento de áudio; falhas retornam à montagem.

**Gate 3 — Final:** somente após Gate 2 aprovado, render de entrega solicitado (por exemplo, 2160×3840/60) se os assets e orçamento de render justificarem. Duplicar FPS ou ampliar pixels não melhora materiais, enquadramentos ou roteiro.

**Gate 4 — Pós-render:** ffprobe para duração, dimensões, FPS, áudio; loudness; inspeção de quadros e escuta real. Marcar separadamente técnico/aprovação artística. Não chamar versão sem voz de final.

## Regras para agentes ChatGPT/MediaForge
- Nunca presumir que SVG, Three.js procedural ou texto em tela atendem a pedido por "cinematográfico". Só usar CGI quando tiver materialidade/iluminação credíveis e integração à narrativa.
- Nunca gerar "mídia" como folha de storyboard com textos gravados quando se necessita de material de cena editável. Pedir ou produzir frames *clean plates*, sem títulos e timecodes embutidos.
- Nunca enviar ao Worker um job "com narração" sem asset de áudio realmente acessível ao Worker; ter uma página de TTS externa não equivale a possuir o arquivo.
- O caminho de render controlado /studio já valida 5 slots de mídia e locução. A ferramenta MCP create_video simples não garante automaticamente esses requisitos; para pedidos media-first, avaliar assets antes do job e não descrever conclusão com base só em QA técnico.

## Estado de ÓRBITA 002 (12/11/2026)
A prévia ORBITA_002_REALISTA_TRILHA_SEM_VOZ.mp4 foi renderizada no ambiente de edição, com música e imagens geradas por IA, em 1080×1920, 30 FPS e 45 s. Não foi renderizada no Worker Windows e não contém a narração completa. O objetivo deste documento é impedir que uma prévia seja rotulada como entrega cinematográfica aprovada.
