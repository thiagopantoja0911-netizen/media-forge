MEDIAFORGE WORKER UPDATER — WINDOWS x64

1. Baixe e extraia este pacote.
2. Execute MediaForgeWorkerUpdater.exe com a mesma conta Windows que executa a tarefa "MediaForge Worker - Staging".
3. Aguarde a confirmação de um novo heartbeat e os IDs dos novos jobs.

O executável:
- baixa os scripts de atualização do commit publicado no GitHub;
- identifica a instalação ativa do Worker;
- atualiza somente por fast-forward, sem git reset;
- preserva .env.local, credenciais DPAPI e projetos;
- aguarda um novo heartbeat antes de reenfileirar os três renders recuperáveis.

Não execute com "Run as administrator" usando outra conta Windows: a credencial DPAPI pertence ao usuário que instalou o Worker.
Não compartilhe .env.local, tokens ou arquivos DPAPI.
