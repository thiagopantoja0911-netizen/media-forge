# Auditoria de atualizações upstream

Data da auditoria: 2026-11-10

## Incorporado nesta etapa

### HyperFrames

O MediaForge passou a aproveitar a linha atual do HyperFrames CLI, atualmente na versão 0.9.25:

- presets de saída 1080p, 1440p e 4K, incluindo orientação paisagem, retrato e quadrado;
- FPS inteiro de 1 a 240 e racionais FFmpeg como 30000/1001;
- níveis de qualidade draft, looks, standard, high e delivery;
- workers paralelos;
- opção de forçar ou desativar GPU do navegador;
- pré-checagem 'hyperframes check --json --no-craft' antes do render;
- versão configurável por HYPERFRAMES_VERSION, evitando que npx troque o renderer sem controle.

Fontes principais:

- [preset 1440p no HyperFrames](https://github.com/thiagopantoja0911-netizen/hyperframes/commit/5e8abd7574a78e159ac51761e62fa25179e151a5)
- [CLI HyperFrames 0.9.25](https://github.com/thiagopantoja0911-netizen/hyperframes/blob/main/packages/cli/package.json)
- [comando render](https://github.com/thiagopantoja0911-netizen/hyperframes/blob/main/packages/cli/src/commands/render.ts)
- [comando check](https://github.com/thiagopantoja0911-netizen/hyperframes/blob/main/packages/cli/src/commands/check.ts)

## Repositórios avaliados, mas não copiados

### VoiceStudio

Atualizações relevantes: streaming de ZIP/stems sem manter tudo em RAM, espera quando o engine está ocupado e snapshots fora do event loop.

Decisão: não copiar o código. O VoiceStudio é uma aplicação de áudio diferente. Essas ideias ficam como requisitos para um futuro adaptador de áudio e para limitar consumo de memória.

### Open-Higgsfield-AI

Atualizações relevantes: histórico por conta, cards de vídeo/imagem, presets de voiceover e integração com vozes clonadas/ElevenLabs.

Decisão: não copiar o código. O aproveitamento correto será via adaptadores opcionais de geração de assets e voz, isolados do núcleo do MediaForge.

### Filmcraft

Atualizações relevantes: fallback de GPU, inicialização gráfica protegida contra travamentos e recuperação após falha do dispositivo.

Decisão: não copiar a interface desktop. O padrão de fallback poderá ser aplicado depois ao worker Windows, mas não é necessário para a primeira integração HyperFrames.

### Openwhispr

Atualizações relevantes: seleção de modelos de áudio, cancelamento seguro e recuperação de inferência local ocupada.

Decisão: não copiar o aplicativo. Essas ideias podem orientar o futuro módulo de transcrição/áudio do MediaForge.

### Lightcraft

As atualizações observadas são principalmente de catálogo/fotografia e backup Lightroom.

Decisão: não relacionado ao pipeline atual de vídeo/áudio; não incorporar.

## Limite desta etapa

Nenhum repositório externo foi mesclado inteiro. O MediaForge continua sendo o núcleo de orquestração, fila, OAuth, painel, worker e entrega local. A integração agora importa somente contratos e capacidades que o HyperFrames realmente expõe.

O próximo passo é testar um job real com um projeto HyperFrames simples, validar o MP4 produzido e depois comparar qualidade, tempo e consumo de memória antes de retirar qualquer fluxo do Secrets.
