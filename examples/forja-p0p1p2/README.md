# FORJA • teste visual P0/P1/P2

**Amostra de 10 segundos / 9:16 / 60 FPS, não é anúncio final.**

1. Copie `index.html`, `assets/premium-motion.js`, `assets/gsap.min.js`, `assets/icon.svg`, os quatro SVGs de mundo e os quatro WAV para uma pasta de projeto HyperFrames.
2. Rode `npx hyperframes check --json`, corrija os erros, e faça preview 1080×1920 antes de exportar 4K.
3. Renda pelo worker local MediaForge; use `--workers 1` como baseline, inspeção humana de entrada/cortes 2,5s/5s/7,5s, legibilidade a 360 px e mixagem.
4. `window.__motionTest.events` mostra os 18 tipos de evento programados; `window.__motionCues` registra o alinhamento de áudio em frames. Os dados de séries são *ilustrativos*. Não alegar qualidade artística só porque o comando retornou `completed`.

O teste exercita princípios das fases P0, P1 e P2, mas **não substitui avaliação visual e benchmarks do próprio PC**. Em especial, o motion blur é um rastro gráfico leve, não blur ótico real sobre footage.

No checkout deste repositório, use `node scripts/prepare-motion-demo.mjs` para gerar os WAV locais. GSAP deve ser copiado localmente de uma instalação licenciada antes do render.
