# MediaForge Editor Premium — implementação incremental (novembro de 2026)

## Estado da mudança (primeira entrega)

Este PR implementa a base **nativa e editável do Editor Visual 3D**, sem alterar a rota de produção legada ou eliminar o gate de prévia:

| Item | Entrega | Limites |
|---|---|---|
| Asset PNG/WEBP/SVG | Upload autenticado, até 2 MB/arquivo, 8 MB/projeto; formato verificado, SVG com referências ativas rejeitadas; assets privados, empacotados no render | Sem URL externa remota ou importação automática de sites; depende de asset com direitos de uso |
| Mockup UI `screen` | Tela com textura da imagem, moldura arredondada, sombra simulada, perspectiva por transformações de grupo (posição/rotação/escala) | Sem HTML interativo dentro da tela; usa screenshot real fornecido |
| Grid `card-grid` | Até 12 cards, colunas/linhas, perspectiva, deslocamento diagonal em tempo contínuo; mesma composição preview/render | DOF óptico e motion blur físico completos ainda não implementados |
| Background `glow` | Shader procedural aurora com cor, intensidade, velocidade e posição por cena; 1 plano leve, sem pós-processamento pesado | Glow orgânico aproximado; não é pipeline de bloom HDR |
| Style presets | `apple-clean`, `spotify-dark-glow`, `motivational-bw` aplicados em projeto existente ou novo | Presets são inspiração visual, não assets nem marcas de terceiros |
| Style DNA | JSON com paleta, frames, câmeras, profundidade, formas, glow e layout; botão baixar, endpoint HTTP, MCP e arquivo anexado ao pacote HyperFrames | Não importa arquivos/fontes/música; não é memória automática de avaliações |
| Audio preview | Ouvível por cena, já existente na versão anterior (HTML Audio + timeline); preservado nesta mudança | Sem scratch waveform, playback único mixado ou beat analyzer |
| Motion blur | Parâmetro opcional armazenado por cena, com intervalo 0–1 | **Não significa motion blur temporal renderizado por cena**; falta render pipeline |
| Tipografia avançada | Escala existente preservada | Palavra/letra, upload de fontes licenciadas, peso variável e bloom independente pendentes |
| Beat-by-beat | Não alterado nesta entrega | BPM detection e quantização com análise técnica ainda pendentes |

## Uso pela interface

1. Crie um projeto com preset pelo modal, ou aplique um preset no menu esquerdo a um projeto existente.
2. Importe uma imagem para a biblioteca visual. Ela é vinculada à cena selecionada como `screen` por padrão.
3. No inspetor da cena, escolha `screen` ou `card-grid`, ajuste posição XYZ, rotação Y, escala, profundidade e distribuição dos cards.
4. Ative aurora em `GLOW ORGÂNICO`, configure cor, intensidade, velocidade e posição.
5. Verifique a prévia real WebGL em pelo menos dois instantes por cena. Se o canvas não carregar, não aprove a revisão.
6. Faça a revisão pelo fluxo GPT (requer as ferramentas MCP Editor no cliente conectado). Somente com revisão aprovada o HyperFrames recebe o render.
7. Exporte DNA pelo botão ou via `GET /api/editor/projects/:id/style-dna`. O mesmo JSON é incluído em `assets/style-dna.json` no pacote de render.

## MCP

Novas ferramentas: `upload_editor_asset`, `apply_editor_style_preset`, `get_editor_style_dna`, `list_editor_style_presets`.

As alterações de cena (por exemplo `visual`, `glow`) são feitas via `edit_editor_project`. Upload não executa código externo.

A conexão do plugin/unik deve atualizar seu catálogo para exibir as novas operações. A ferramenta de navegador continua necessária para inspeção visual real.

## Próximos marcos e dependências

- **P1 — Qualidade de movimento:** DOF e motion blur temporal com prévia consistente com HyperFrames (exige estratégia seek-deterministic para render por quadro e limites de GPU); testes reais com cards e câmera.
- **P2 — Beat detection:** decodificação PCM offline de áudio licenciado/uploadado; estimativa de tempo e BPM, grade de batidas, opção de quantizar *cenas/efeitos*, preservando revisão e sincronização de áudio.
- **P2 — Tipografia:** arquivo WOFF2 licenciado validado e armazenado, modo palavra/letra por frame, pesos variáveis e bloom CSS/WebGL, com layout e qualidade em mobile.
- **P3 — Composição avançada:** cards com texturas individuais, dof real e scroll com profundidade em câmera isométrica; layouts/posicionamentos ainda mais flexíveis e trabalho com templates de referências.
- **Operacional antes de produção:** verificar Chrome Browser MCP conectado; catálogo MCP atualizado; Worker HyperFrames online; criar projeto de teste com screenshot aprovado; conferir MP4 e áudio finais.

## Segurança/compatibilidade

Sem import de URLs arbitrárias, sem scripts executáveis em assets. SVG aceita somente documentos vetoriais simples sem referências/entidades externas. Assets armazenados sob `MEDIAFORGE_DATA_DIR/editor-projects`; handlers exigem sessão autenticada. Preview e render compartilham gerador de cena. Project revision invalida review anterior. `main` não deve receber merge indireto da branch de desenvolvimento.
