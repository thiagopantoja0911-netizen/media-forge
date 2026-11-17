# Preset MediaForge: Motion Minimalista P&B — Explicador 10K

**ID selecionável:** `minimal-outline-explainer-v1`
**Status no código:** versão 1, validada por testes locais e pronta para integrar ao MCP `list_editing_styles` / `plan_video_from_brief`.
**Referência:** MP4 enviado em 17/11/2026, “os primeiros 10.000 são muito mais difíceis que os primeiros 100.000...”.

## Evidência observada (não suposição)

- Arquivo: 64,90 segundos, 1920×1080, 30 FPS, HEVC; áudio AAC.
- SHA-256: `4d2c2392fab2ce4e364af3837ba077d60668f3c87f480bf151fac2e537e95541`.
- Foram analisados 26 quadros espaçados ~2,5 segundos para identificar a gramática visual. Isso **não** representa uma análise frame a frame do vídeo inteiro.
- Fundo quase preto com padrão discreto quadriculado/pontilhado; traços e números brancos; pouquíssimas cores.
- Abertura econômica em texto/números: `R$ 10.000`, depois comparação `R$ 10 MIL` versus `R$ 100 MIL`, com ícones de relógios.
- Metáforas de negócios e processos usando bonecos simplificados, smartphone, moedas, cartões, caixas e checklist.
- Elementos entram isoladamente e constroem o raciocínio, com uso grande de espaço negativo, linhas horizontais e títulos curtos em pequenos rótulos.
- Medição de loudness da faixa de áudio: **−21,39 LUFS integrados**, pico real **−4,52 dBTP**, LRA 2,70 LU. Não se identificaram/atribuíram efeitos específicos sem escuta analítica isolada.

## Regras do preset

1. **Comece por uma afirmação verificável ou contraste**, com texto muito legível no primeiro quadro.
2. **Uma ideia de cada vez**: tipografia, traço vetorial e ícones simples demonstram o conceito, sem depender de banco de imagens.
3. **Criar movimento significativo**: desenhar contornos, mover comparadores, construir gráficos e trocar estados; não usar slides estáticos.
4. **Ritmo narrativo**: batidas preferenciais em ~2,4 s (adaptar à fala); até três novos elementos por batida; microacomodação ao concluir.
5. **Som com causa visual**: pop leve na entrada do rótulo, tick na mudança numérica, whoosh breve na transferência e chime discreto no resultado; voz sempre priorizada.
6. **QA**: conferir contraste/legibilidade em celular, cortes por ritmo, coerência de estados, sons sincronizados, áudio audível e áreas seguras.
7. **Uso correto**: estilo abstrato reproduzível, **não** cópia do vídeo, áudio, fonte, marcas ou conteúdo da referência.

## Como usar depois do deploy

1. Chame `list_editing_styles` e localize `minimal-outline-explainer-v1`.
2. Em `plan_video_from_brief`, envie `brand`, `idea` e `editing_style:"minimal-outline-explainer-v1"`.
3. O resultado traz `editingStyle` e `storyboard` com `visualTreatment`, `motionDirection`, `sound` e `graphicRules` por cena. Use isso para autorar os assets e as timelines GSAP do render, junto ao QA do MediaForge.
4. Se o campo não for passado, o planejador segue exatamente como antes; o preset **não substitui** anúncios com filmagens reais por padrão.

## Validação e limite

`node --test test/editing-style-presets.test.mjs test/creative-director.test.mjs`

Essa integração não gera o vídeo sozinha e não fica automaticamente acessível no Hostinger até a versão de servidor que contém as mudanças ser publicada. Evitar afirmar “aplicado na produção” sem verificar novo MCP/commit hospedado.
