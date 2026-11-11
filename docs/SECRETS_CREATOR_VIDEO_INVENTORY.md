# Inventário: Nexora / Media Editor dentro do Secrets System

Data do inventário: 2026-11-11.

## Origem verificada

- Repositório: `thiagopantoja0911-netizen/Secretssysten`.
- Branch examinada: `release/secrettrack-20261108`.
- Snapshot vendorizado: `vendor/kryvia/source`, canonical repo `thiagopantoja0911-netizen/KRYVIA`, commit `ac4787b4d6f9b5a1e0c7d3f2a9b8c6d5e4f3a2b1`.
- O `vendor/kryvia/source-manifest.json` declara explicitamente que `source` é proveniência, não a fonte direta do build. Os arquivos de `vendor/kryvia/overrides` são as customizações efetivas do portal e precisam ser tratados como fonte de produção junto com os arquivos de `source` não sobrescritos.
- Não foi encontrada licença `LICENSE` no diretório vendorizado nem no root do snapshot KRYVIA consultado. Tratar como código proprietário do workspace; manter atribuição/proveniência e confirmar titularidade antes de redistribuição externa.

## Módulo que pertence ao fluxo de vídeo

### Nexora Workspace

Arquivo de produção: `vendor/kryvia/overrides/app/workspace/nexora-workspace.tsx`.

Vistas e funções observadas:
- overview, editor, transcribe, teleprompter e projects;
- importar vídeo local e pré-visualizar;
- escolher uma ideia/roteiro existente;
- enviar mídia ao serviço interno KRYVIA e consultar estado/arquivo;
- manter projetos de edição na biblioteca KRYVIA;
- exportar/recuperar projeto portátil de legendas e configurações.

### Media Editor

Arquivos:
- `vendor/kryvia/source/app/workspace/media-editor.tsx`;
- `vendor/kryvia/overrides/app/workspace/media-editor-engine.ts`;
- `vendor/kryvia/overrides/app/workspace/nexora-captions.ts`;
- `vendor/kryvia/source/app/workspace/media-project-portable.ts`.

Funções observadas no editor:
- corte/trim de entrada e saída;
- formatos original, 9:16, 1:1, 4:5 e 16:9;
- zoom e posicionamento;
- brilho, contraste, saturação e temperatura;
- sobreposições de texto;
- legendas e 15 presets de estilo;
- controle de volume;
- escolha de frame de capa;
- divisão de vídeos longos em partes de story (até 60 segundos por segmento);
- exportação via FFmpeg WASM no navegador, com H.264/AAC;
- importação/exportação de legendas SRT, ASS e TXT;
- transcrição automática pela rota do portal, usando Cloudflare Whisper large-v3-turbo, sujeita a limites e configuração de conta.

O projeto portátil v1 preserva metadados, captions e preset, mas **não** embute o vídeo original. O vídeo original e os jobs permanecem no armazenamento/serviço KRYVIA.

### Backend e dependências que não podem ser copiados cegamente

- `vendor/kryvia/overrides/app/api/media/route.ts` faz proxy para o serviço interno KRYVIA de mídia.
- A configuração espera `KRYVIA_MEDIA_INTERNAL_URL` e `KRYVIA_MEDIA_SERVICE_TOKEN`, com host interno permitido e porta 8788.
- Upload remoto legado permite até 350 MB e tem protocolo de status/arquivo próprio.
- `vendor/kryvia/overrides/app/api/media-editor/transcribe/route.ts` usa credenciais Cloudflare e a API de transcrição. Não copiar tokens, IDs privados, URL interna ou secrets para Git.
- Esse backend KRYVIA não é o MediaForge Worker. Os contratos, armazenamento, jobs, autenticação e recuperação são diferentes.

## Componentes próximos, mas fora do escopo automático

- `creator-hub.tsx`: calendário/planejamento e adaptação de conteúdo para redes sociais. Não é o motor de edição/renderização; manter no Secrets System por enquanto.
- `creator-brain-panel.tsx` e `creator-brain.ts`: assistência/análise de ideias e roteiros. Pode ser avaliado depois, mas não será movido automaticamente junto do editor.
- SecretTrack, ofertas, Ads Finder, automações e o restante do portal continuam no Secrets System.

## Destino

Repositório de destino: `thiagopantoja0911-netizen/media-forge`, que já contém o orquestrador, o Worker Windows/HyperFrames e o Creator Studio inicial.

A migração deve preservar a experiência de edição, mas substituir o backend KRYVIA por contratos MediaForge. Não copiar a rota PHP/Next nem reutilizar tokens de serviço.

## Plano de migração por etapas

1. **Portabilidade de projeto e legendas:** importar/exportar o formato portátil v1, parsear SRT/ASS/TXT, validar timestamps e preservar os presets como opções, com um preset editorial limpo como padrão.
2. **Mídia local:** adicionar upload/preview de imagem e vídeo, metadados, duração, resolução, áudio e limites. Definir uma transferência segura para o Worker; não aumentar o limite JSON/base64 de 24 MB para aceitar vídeos grandes.
3. **Editor de timeline:** portar trim, crop/aspect ratio, zoom/posição, filtros, overlays, captions, volume, capa e segmentação para um modelo de projeto HyperFrames.
4. **Pipeline de render:** substituir o serviço interno KRYVIA e o FFmpeg WASM de exportação por jobs MediaForge/Worker, com preview e rollback.
5. **Transcrição:** manter provider opcional. Preferir uma integração local ou configurar Cloudflare por secrets de ambiente, sem mover credenciais.
6. **Biblioteca e recuperação:** migrar projetos e arquivos necessários com checksum e mapeamento de IDs; o JSON portátil sozinho não contém o vídeo.
7. **QA audiovisual:** validar 4K/60 FPS, cortes, áudio, legendas, capa, segmentos, duração, integridade e reinício do Worker.
8. **Retirada do Nexora no Secrets:** somente depois de confirmar que os usuários/projetos necessários estão migrados, que nenhum cliente chama as rotas antigas e que rollback está testado. Retirar apenas as rotas/menu do Nexora/Media Editor; manter o domínio e o restante do Secrets System.

## Estado atual

A primeira versão do Creator Studio em MediaForge já importa briefing JSON v1, cria cinco cenas, faixa de legendas, transições e pode anexar locução/trilha. Ainda não implementa o editor de mídia do Nexora, ingestão de vídeo grande, transcrição, biblioteca de mídia ou segmentação. Nenhum código/arquivo do Nexora foi removido do Secrets System.
