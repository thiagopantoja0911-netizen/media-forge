# Referências fornecidas — 12/11/2026

## Evidência e limites

Os dez MP4 foram lidos localmente, sem alteração. `inventory.json` contém hashes, dimensões, FPS médio, áudio, loudness e candidatos de corte por diferença de imagem. Foram examinados atlas de 12 quadros por vídeo e sequências curtas em torno dos tempos abaixo. Isso é um levantamento de linguagem visual, **não uma reconstrução completa quadro a quadro**. Não houve transcrição nem identificação de música. `loudness.input_*` são medições do original; os campos `output_*` do FFmpeg são a simulação do filtro, não um arquivo normalizado entregue.

Não se copiam os MP4, trilhas, logos ou fontes das referências para o pacote. Os atlas e quadros permanecem como evidência local. Os tempos de corte automáticos são candidatos: por exemplo, o vídeo Spotify tem movimentos internos que o limiar de corte não encontra.

| ID / referência | Observado | Intervalo examinado de perto | Aplicação proposta |
|---|---|---|---|
| 7693603336481803542 / notebook Claude | Notebook em perspectiva e reflexo; alternância de tipografia, superfície 3D, gráfico e UI dentro da tela | 1,8–2,23 s: palavra se completa e se acomoda | Produto como palco; cenas internas variadas. A renderização 3D física não está implementada neste compositor |
| 7687130048331058445 / meaningful love | Colagem azul/branco horizontal, textos e recortes, figura humana, deformação radial e círculo com imagem | 0,925–1,36 s: colagem ocupa tela e troca por figura | Colagem com camadas e corte intencional. Warp radial complexo fica fora do preset inicial |
| 7558134029304778016 / Spotify | Filme horizontal verde/preto, capas em perspectiva, player e letra | 7,3–7,52 s: mosaico diagonal em deslocamento | Assets reais em camadas; manter composição horizontal. O áudio deste arquivo tem volume medido muito baixo |
| 7676866948541648148 / criativo Burger King | 4:5, pessoa simplificada, produto em cards, expansão de mosaico e logo | 12,8–13,23 s: logo dá lugar a mosaico sobre fundo marrom | Cards com produto real; não forçar uma referência 4:5 a vertical sem adaptar |
| 7624546375375588615 / Nubank | Lilás/roxo, dispositivo cresce, aproximação de interface, CTA e logo | 2,3–2,52 s: círculos/texto sobre branco; 6,6–7,03 s: logo grande recua para fechamento | Produto, foco de câmera, motivo circular e end card |
| 7521798862521060630 / widgets | Cartões claros/escuros com calendário, carga, relógio, mapa e chamada; mudança de estado dentro da mesma composição | 3,4–3,62 s: número e barras aumentam; 15,37–15,8 s: painel resolve para marca | Contador, progresso, seleção de calendário e toggle sincronizados; futuras cenas precisam de reflow e câmera mais elaborados |
| 7685009464457465109 / processo | Alternância de resultado, esboços, timeline filmada, pessoa e motion tipográfico | 8,13–8,57 s: motion troca para esboço no papel | Evidência de processo deve usar filmagem real; não inventar prova de produção |
| 7564569795048312084 / motion design | Branco/verde/vermelho, texto com cérebro, olho, mão e peça de xadrez como metáforas | 1,73–2,17 s: título sai e cérebro entra grande, recuando | Ação visual que explica o texto; recortes fornecidos, não texto gigante como única cena |
| 7588613309767650580 / tutorial | Texto e ícones em branco alternados com tela de editor e curvas de animação | 8,88–9,32 s: chip troca para gravação do editor | Material de tela real e pausas legíveis; não automatizado pelo compositor inicial |
| 7657700630282112277 / AlightMotion | Texto curto, branco/preto, símbolos, alternância claro/escuro, toggle e CTA | 5,13–5,57 s: fundo escurece e círculos acomodam a nova frase | Tipografia, mudança de estado e encerramento legível |

Confiança alta nas características visíveis descritas; média nos limites temporais do atlas; baixa para interpretação semântica de áudio, que não foi escutado/transcrito neste levantamento. Os strips iniciais foram amostrados a 30 FPS; os três detalhes adicionais a 60 FPS. Eles não tornam uma fonte de 24/30 FPS mais precisa. A ferramenta nova `reference:analyze` preserva a cadência de quadros do arquivo no strip.

## Consequências para o código

- Separar plano de direção do envio à fila. O renderer não deve inventar uma campanha a partir do prompt.
- Medir cada ação em quadros, com entrada/pico/acomodação; sons apontam para a ação.
- Exigir mídia para `product` e `collage`. Usar UI vetorial para uma demonstração explícita.
- Incluir estados internos no widget, além de entradas/saídas de cartões.
- Manter texto editável, GSAP local, uma cena por arquivo, registro de timeline pausada e inspeção visual.
- Avisar sobre pouca variedade, tempo de leitura e fim prematuro do áudio. Esses avisos são heurísticas, não pontuação artística objetiva.

O estudo inicial cobre apenas uma parte dessas técnicas. Não reivindica fidelidade a todos os dez filmes, geração 3D, recorte automático, sincronização automática de fala ou mixagem profissional pronta.

## Repetir a análise

```sh
npm run reference:analyze -- caminho/video.mp4 .mediaforge/evidencia 3.6
```

Requer FFmpeg/FFprobe. Produz metadata/hash, loudness da primeira faixa, atlas, candidatos de corte e 24 quadros da região escolhida. Repetir em diretórios diferentes para outras entradas, picos e saídas; revisar as imagens antes de transformar uma observação em regra.
