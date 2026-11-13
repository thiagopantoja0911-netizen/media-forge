# ANOTA AI — Advanced Motion V5.3 / SOUND DESIGN

## Correção solicitada
O usuário avaliou a V5.2 como boa visualmente, mas disse: "faltou mais sons de tecnologia." Preservar os movimentos, a marca e as 8 cenas da V5.2. Não repetir o erro da V3 (39 ruídos sintéticos em 16s, áudio 1/10) nem trocar whooshes de ar por bipes.

## Direção
- Música de fundo: Mixkit Close Up / Michael Ramir C., volume .96, duração 17s.
- Quem se move rápido: manter os quatro whooshes de ar existentes, sem adicionar ruído sintético.
- Quem aparece: usar pequenas amostras reais de interface, com variedade. Novos sons em 12 pontos selecionados, não em todos os ícones.
- Confirmação do pedido: substituir o clique seco anterior por um som de confirmação tecnológica real de apenas uma ocorrência.
- 5 antigos cues (= música + 4 whooshes + 1 confirmação que substitui o antigo) + 12 novos = 18 faixas de áudio, das quais 17 são eventos. Todos os efeitos têm causa visual. A tecnologia deve ser perceptível, sem dominar a trilha.

## Eventos novos
| Tempo | Evento | Mixkit SFX | Volume |
|---|---|---|---|
| 0.58s | Primeira mensagem surge | 2354 | 0.25 |
| 1.20s | Terceira mensagem surge | 2356 | 0.21 |
| 2.63s | Mensagem do cliente no chat | 2573 | 0.26 |
| 3.18s | Resposta automática da IA | 3124 | 0.29 |
| 4.63s | Forma de onda ativa | 2574 | 0.16 |
| 5.14s | Texto do áudio reconhecido | 2568 | 0.23 |
| 6.87s | Item do pedido surge | 1109 | 0.21 |
| 7.52s | Observação do pedido encaixa | 2573 | 0.23 |
| 9.25s | Ticket entra no painel de cozinha | 2356 | 0.24 |
| 9.74s | Itens confirmados | 3124 | 0.24 |
| 11.25s | Widget de atendimento encaixa | 2573 | 0.23 |
| 11.73s | Widget de delivery encaixa | 3124 | 0.23 |

## Fontes e licença
Mixkit interface e tecnologia: https://mixkit.co/free-sound-effects/interface/ e https://mixkit.co/free-sound-effects/technology/ . Os previews MP3 têm nomes verificados via catálogos públicos e ligações documentadas. Licença: Mixkit Sound Effects Free License. Audio endpoints em https://assets.mixkit.co/active_storage/sfx/<id>/<id>-preview.mp3. É necessário garantir que os assets sejam resolvidos no Windows Worker.

## QA
Não declarar a qualidade artística do som como aprovada sem audição. QA técnico: vídeo 1080×1920/60fps/17s, áudio presente, loudness social, true peak <= -1 dBTP e sem warning. Se o QA avisar de nível alto, baixar músicas ou SFX e renderizar de novo. Validar os efeitos de tecnologia em alto-falante de celular e fones, com atenção a sons agudos irritantes.
