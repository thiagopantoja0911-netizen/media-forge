# REGRA OBRIGATÓRIA: renderização no computador do usuário

**Projeto MediaForge / Frame Lab.**

1. Toda renderização solicitada pelo usuário deve executar de fato no **worker HyperFrames do Windows conectado ao MediaForge**. É proibido substituir silenciosamente por FFmpeg/Canvas/Python no ambiente ChatGPT.
2. Fluxo oficial: referência -> Frame Lab remoto (upload de bytes reais) -> análise nativa -> ZIP do projeto editável -> `frame_lab_render(confirm_render=true)` -> worker Windows -> MP4 retornado ao Frame Lab -> `frame_lab_compare` -> revisão final.
3. Não considerar `renderer_status.online=true` como prova de renderização; é apenas conexão. A prova exige um **ID de job real**, `get_video` ou `frame_lab_status` com job completado, e arquivo de saída produzido pelo Windows.
4. Não alegar identidade sem comparação quadro a quadro e conferência da fidelidade. Se bloqueado por envio binário, informar claramente o bloqueio e **não executar renderização local como alternativa**.
5. Guardar identificadores dos jobs, metadados, relatórios, hashes, comparações e versões, para não regredir.
6. Vídeo Nubank: referência 1080x1920 30 FPS 316 quadros, ID projeto Frame Lab `0801dbdf3edfe53ea55b191bc3df5199`. V1 local é somente material de estudo, **não é render no computador** e foi reprovada na fidelidade.
