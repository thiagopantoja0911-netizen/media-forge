# Validação da implementação

Ambiente local: Windows, Node 24.20.0, HyperFrames 0.9.30, FFmpeg/FFprobe. Referências e ZIPs lidos sem executar os projetos anexados.

- 59 testes Node aprovados: regressão de autenticação/Studio/worker, planos em quadros, assets obrigatórios, áudio ligado a eventos, rotas autenticadas, FPS racional e preservação do relatório de falha.
- O primeiro teste dentro do sandbox teve três falhas de acesso a servidores locais. Reexecutada com acesso ao loopback e concorrência 1, a suíte completa passou. As falhas não foram ocultadas nem convertidas em skips.
- `npm run validate` e `git diff --check` aprovados.
- O estudo de widgets passou em `hyperframes check --json`, com lint/runtime/layout/motion/contrast/craft sem erros. O aviso informativo de ausência de áudio corresponde ao modo explícito `silent-study`.
- Quadros revisados em 0, 1, 2,49, 2,6, 2,7, 3,2, 4,2, 6, 8, 8,99, 9,1, 9,3, 9,5 e 11,75 segundos ao longo das revisões. Corrigidos: barra cheia antes da contagem, padding do CTA ultrapassando o limite e ausência da cena anterior durante a íris.
- MP4 real gerado localmente: 12 segundos, vertical 1080×1920, 60 FPS, sem áudio deliberadamente. É evidência técnica e visual de um estudo original, não uma reprodução das dez referências ou uma campanha aprovada.
- A ferramenta `reference:analyze` foi executada sobre a referência Nubank, produzindo atlas, strip, metadados, candidatos de corte e medição de loudness.

O compositor inicial contém cinco tipos de cena, mas a revisão visual completa desta entrega se concentra no estudo de widgets/tipografia/fechamento. Produto e colagem também exigem revisão com os assets reais de cada trabalho. Transcrição, alinhamento automático de palavras, 3D físico, warp radial avançado e mixagem final não foram implementados.

O serviço em produção e os tokens do worker não foram alterados. A publicação desta branch não comprova uma instalação em produção.
