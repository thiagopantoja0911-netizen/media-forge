# Frame Lab — Fluxo de teste no Windows (13/11/2026)

## Escopo obrigatório
A reconstrução deve ser renderizada **exclusivamente** no worker HyperFrames Windows do usuário. Análise local ou renderização no ChatGPT não satisfaz a exigência.

## Problemas confirmados e correções
- O deploy real estava na branch `feature/frame-lab-chat-mcp-20261113`; os checkpoints anteriores estavam em outra branch.
- Upload binário de anexos pelo MCP do chat continua limitado a blocos base64, sem acesso direto aos bytes pelo conector. O navegador autenticado utiliza upload binário direto de arquivos escolhidos pelo usuário, sem encaminhar o vídeo pela janela do chat.
- O UI anterior exigia uma sequência manual (upload, análise, upload do projeto ZIP, fila de render, polling, comparar).
- Novo `frame-lab/public/quick-flow.js` acrescenta **Teste completo no seu Windows**: dois arquivos, uma confirmação e pipeline automático.
- LocalStorage guarda o ID e a etapa do teste; após atualização de página, há retomada para análise/render/comparação (se a transferência de arquivos foi interrompida, o browser exige seleção manual novamente, por segurança).
- O novo endpoint autenticado `GET /frame-lab/api/worker-status` valida `renderer=hyperframes` e heartbeat efetivo.
- Quando o worker Windows entrega seu MP4 por rota autenticada, o servidor agora tenta disparar a comparação integral automaticamente. Se o motor estiver ocupado, a interface pode retentar a comparação, sem declarar conclusão prematuramente.
- Após completar, a interface mostra comparação quadro a quadro; não declara equivalência visual automaticamente.
- ZIP de reprodução Nubank V1 foi saneado para obedecer allowlist do importador (antes continha arquivos `.py` rejeitados pelo Frame Lab).
- ZIP preparado: `Nubank_FrameLab_Projeto_Windows_V1.zip`, 346.997 bytes, SHA256 `186fb3452943a6891f3a36bf99e43db0b507ee7be12724c4aad6ba1a8e792d78`. Disponível como artefato desta conversa, não no GitHub.
- Vídeo original: Nubank 1080×1920, 30 fps, 316 quadros. O original não está no repositório GitHub.

## Versão publicada
- Branch: `feature/frame-lab-chat-mcp-20261113`
- Código implantado em Hostinger: `124f796fd31858449fc6eb86ecbb3d196af054b7`, build concluído em 13/11/2026.
- Worker conectado e motor OpenCV+FFprobe operacional no momento da verificação.
- Verificação de sintaxe do novo JS: OK; simulação local de fluxo em sequência com 3 frames: OK.
- Teste real fim a fim no Windows para Nubank: **AINDA PENDENTE**; requer seleção do MP4 original e ZIP limpo no `https://mediaforge.salevo.site/frame-lab`.
- Não atribuir ao render local V1 a procedência do Windows.

## Critérios para próxima execução
1. Upload dos bytes originais via navegador autenticado no Windows, manter projeto.
2. Upload ZIP limpo, análise integral de 316 frames.
3. Worker Windows deve apresentar Job ID real; obter status queued → processing → completed, `artifactUploaded=true`.
4. Comparar 316 pares de frames; relatório final com diferenças. Ser transparente sobre fidelidade (V1 local ainda reprovada).
5. Preservar ID, etapa, arquivo renderizado e relatório; não sobrescrever a referência ou alterar escopo para render local.
