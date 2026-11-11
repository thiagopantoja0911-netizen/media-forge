# Atualização do worker Windows MediaForge

1. Extraia os arquivos do pacote de atualização.
2. Dê dois cliques em `EXECUTAR_ATUALIZACAO_MEDIAFORGE.vbs`.
3. O atualizador roda oculto, sem abrir CMD ou janela de PowerShell.
4. Ele consulta a branch pública `migration/creator-video-to-mediaforge` no GitHub, baixa o ZIP do commit atual e extrai o código. **Não exige Git nem a pasta `.git` na instalação Windows.**
5. Copia os arquivos atualizados para `%LOCALAPPDATA%\MediaForge-Staging`, sem substituir `.env.local`, `.worker-token.dpapi`, `.mediaforge` (projetos, logs e estado) ou diretórios `node_modules`.
6. Cria backup protegido das configurações e credenciais locais, instala FFmpeg/FFprobe, reinicia somente a tarefa `MediaForge Worker - Staging` e exige 21 heartbeats consecutivos ao longo de cinco minutos.

O atualizador não remove o worker antigo Videos Secrets nem apaga projetos ou MP4s.

Relatório:
`%LOCALAPPDATA%\MediaForge-Staging\.mediaforge\logs\ATUALIZACAO_WORKER_MEDIAFORGE.txt`

O sucesso só é declarado quando o worker HyperFrames fica online com heartbeat recente por pelo menos cinco minutos.
