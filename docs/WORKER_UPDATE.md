ATUALIZADOR SILENCIOSO DO WORKER MEDIAFORGE

1. Extraia os arquivos para uma pasta.
2. Dê dois cliques em EXECUTAR_ATUALIZACAO_MEDIAFORGE.vbs.
3. Não abre CMD nem janela do PowerShell.
4. O script atualiza somente o worker MediaForge em:
   %LOCALAPPDATA%\MediaForge-Staging
5. Preserva .env.local e o token DPAPI, instala FFmpeg/FFprobe locais,
   reinicia somente a tarefa "MediaForge Worker - Staging" e verifica
   21 heartbeats consecutivos durante cinco minutos antes de declarar sucesso.
6. Não desinstala nem desativa o worker antigo Videos Secrets e não apaga
   projetos, logs ou MP4s antigos.

Relatório:
%LOCALAPPDATA%\MediaForge-Staging\.mediaforge\logs\ATUALIZACAO_WORKER_MEDIAFORGE.txt

Se o relatório não terminar com "RESULTADO: worker atualizado...", envie-o aqui.
