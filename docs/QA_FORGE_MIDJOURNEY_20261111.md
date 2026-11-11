# Forge Midjourney — QA técnico de 11/11/2026

## Escopo

Testes separados da produção `mediaforge.salevo.site`, da instalação Worker Windows e do Secrets/Nexora. A interface pública do Forge Midjourney ainda não recebeu aprovação de produção.

## Resultado A — render técnico HyperFrames: APROVADO (CI)

- [GitHub Actions run 43060725187](https://github.com/thiagopantoja0911-netizen/media-forge/actions/runs/43060725187): **success**.
- Arquivo: `forge-midjourney-15s-2160x3840-60fps-technical.mp4`.
- Extração independente do artifact e `ffprobe`: H.264 em **2160×3840, 60/1 FPS, 900 quadros**, duração **15.000000 s**, arquivo **4.234.942 bytes**, áudio AAC presente.
- Validação de áudio: `ffmpeg volumedetect` identificou média ~-28.3 dBFS e pico ~-24.5 dBFS — apenas sinais técnicos, **não parâmetros de mixagem para entrega**.
- Composição: 5 cenas, 4 transições. Frames amostrados em ~0,05 s, 3,5 s, 8,5 s e 14,5 s mostram quadros gráficos. A qualidade criativa **não foi aprovada**.
- **Os áudios são WAVs de ondas de diagnóstico**, não locução, música nem efeitos naturais. `readiness.renderReady=false` continua verdadeiro.
- Executado em **GitHub Actions Ubuntu**, **não no Worker Windows**. Não comprova integração ponta a ponta com a tarefa agendada Windows nem entrega do MP4 pelo MediaForge MCP.
- A primeira tentativa falhou pela ausência de ffprobe; a tentativa com apt-get ficou presa na instalação de dependências; a terceira instalou binários estáticos isolados e completou o render.

## Resultado B — hospedagem Forge Midjourney: BUILD OK / LIVE HTTP BLOQUEADO

- Site de preview `forge-preview.salevo.site` criado como **website independente**, no mesmo plano Hostinger, com Git auto-deploy na branch `staging/forge-midjourney-preview-20261111`, commit `7fc7542af0789e78f04f848293727097165e20ac`.
- CI da branch: [GitHub Actions run 43056196792](https://github.com/thiagopantoja0911-netizen/media-forge/actions/runs/43056196792) **success**, inclui testes de segurança que confirmam que `POST /api/studio/compose` exige login.
- Hostinger confirma **build completed** tanto na publicação inicial como no rebuild subsequente, SSL ativo, HTTPS redirect ativo.
- Diagnóstico externo [run 43059639666](https://github.com/thiagopantoja0911-netizen/media-forge/actions/runs/43059639666): DNS resolve, certificado HTTPS correto, mas GET `/health` no IP de origem retorna **HTTP 503**, logo o aplicativo Node não estava acessível publicamente.
- A CDN foi **desativada somente no website de preview** para isolar o problema e DNS passou a apontar para a origem; 503 persistiu.
- Reconfigurado **somente o preview**: `NODE_ENV=production`, `PORT=3000`, `MEDIAFORGE_HOST=0.0.0.0`, `MEDIAFORGE_STAGING_PREVIEW=true`, `MEDIAFORGE_REQUIRE_AUTH=true`, renderer dry-run e armazenamento próprio fora de public_html, sem copiar tokens/credenciais da produção.
- Reinício da app e novo build aceitos pela Hostinger, mas os **runtime logs continuam sem inicialização e sem mensagens** (`started_at=null`, `total_lines=0`). A validação HTTP `run 43058551580` ainda falhou no quarto attempt com resposta HTML de erro em vez de JSON do `/health`.
- Logo, **a UI web não está liberada ao usuário como funcional**. Necessária investigação da inicialização Node na Hostinger ou alternativa de prévia somente estática, sem afetar domínio de produção.

## Sistemas preservados e itens pendentes

- `mediaforge.salevo.site`: não houve alteração, autodeploy segue em `feature/conexoes-mediaforge-primeiro`.
- Windows Worker e tarefa agendada: não houve alteração ou novo job real.
- `secretssystem.online` com Nexora Workspace / Media Editor, KRYVIA e `mcpbrowser.salevo.site`: manter integralmente.
- Pendências: resolver HTTP 503 da prévia, verificar UI por navegador, gerar media temática licenciada e locução/música/SFX reais, revisão visual e auditiva, enfileirar e conferir render 4K60 no Worker Windows, checar download via MCP.

**Nenhum resultado acima autoriza marcar Forge Midjourney como entrega audiovisual profissional ou liberar limpeza adicional.**
