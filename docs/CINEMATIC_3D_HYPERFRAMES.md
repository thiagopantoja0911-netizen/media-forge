# MediaForge Cinematic 3D — produção 3D com HyperFrames

## Objetivo

Adicionar uma camada autoral de cenas 3D verdadeiras ao MediaForge **sem alterar o pacote upstream do HyperFrames**. O Worker Windows continua sendo o renderizador. O MCP cria os arquivos HTML/JavaScript/Three.js e os enfileira com as mesmas garantias de integridade e escopos OAuth já existentes.

## Ferramenta

`create_cinematic_3d` (OAuth `videos:write`):

- `title` (obrigatório)
- `headline`, `subtitle`
- `duration_seconds`: inteiro de 10 a 30
- `aspect_ratio`: 9:16, 16:9 ou 1:1
- `shape`: torus-knot, torus, sphere ou cube
- `model_glb_base64`: opcional, glTF 2.0 binário autocontido até 8 MiB, sem Draco/Meshopt nem texturas remotas
- `accent_color`: `#RRGGBB`
- `camera`: dolly, orbit ou reveal
- `quality`: draft, looks, standard, high ou delivery
- `browser_gpu`: opcional; hardware deve ser validado no Windows antes de depender de GPU
- `preflight`: opcional, padrão true

O projeto é empacotado com Three.js fixo em `0.180.0`, GSAP local, licenças e import map. Ele não baixa modelos, scripts ou fontes durante o render. O `window.__hf.buildReady` aguarda a compilação da cena; `hf-seek` desenha cada frame com base no timestamp exato, sem relógio real, `requestAnimationFrame` ou `Math.random`.

## Motion profissional

- Câmera em espaço tridimensional, com curva smootherstep na trajetória.
- Luz principal quente, luz de contorno fria, preenchimento, sombras suaves e materiais PBR.
- Tone mapping ACES Filmic para controlar altas luzes.
- `data-motion-blur=on` e shutter 180° na composição; texto estático opt-out.
- 4K60 como perfil final; `high` e `delivery` são presets de codificação, não garantias artísticas.

O blur de página e o motion blur sub-frame do produtor HyperFrames são mecanismos diferentes. **Não prometer sub-frame shutter integral pela CLI** sem validar suporte explícito na versão instalada.

## Limites de segurança e formatos

- Upload GLB: GLB 2.0, chunks JSON válidos e sem URIs remotas; malhas com extensões obrigatórias não suportadas são rejeitadas.
- FBX e OBJ não são importados diretamente nesta fase. Converta para GLB autocontido antes de enviar.
- Não é um motor 3D completo com rigging, simulação física, volumetria ou pós-produção do Adobe After Effects.
- O custo de render 3D em 4K60 depende de GPU, tamanho do modelo, sombras, drivers e renderizador Chrome. Teste first-frame e duração antes de 4K final.

## Qualidade e publicação

1. Unitários verificam formato, validação, dependências locais e retorno MCP.
2. Workflow `MediaForge Cinematic 3D Browser Smoke` executa o HyperFrames com WebGL em 540×960, capturando o mesmo timestamp duas vezes para verificar determinismo.
3. Job real no Worker Windows confirma captura, performance, codecs e áudio. A renderização por si só não demonstra suavidade ou direção artística.
4. Revisão humana do MP4 final valida ritmos, frames, movimentos de câmera, materialidade e legibilidade em celular antes de classificar como produção aprovada.

Mantenha o Worker existente; não instale bibliotecas ou atualize HyperFrames automaticamente no Windows sem validação e backup.
