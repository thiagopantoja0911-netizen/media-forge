# MediaForge — Padrão obrigatório de produção cinematográfica

**Status:** padrão de direção e pós-produção para os vídeos produzidos neste projeto.  
**Origem:** feedback do usuário após a revisão do Reel "Amar não é evoluir sozinho", em 19/11/2026.  
**Objetivo:** eliminar a aparência de apresentação de slides/ilustrações vetoriais e produzir vídeos com impacto, linguagem cinematográfica, narrativa visual sincronizada e desenho de som profissional.

## 1. Regra principal: não usar vetores como cenas

- **Não usar ilustrações vetoriais planas, ícones, formas geométricas ou bonecos vetoriais como imagem principal das cenas.**
- Não montar o vídeo como uma sequência de ícones/figuras vetoriais com frases por cima.
- Não usar elementos vetoriais decorativos para preencher o quadro.
- Priorizar filmagens reais, imagens cinematográficas, composições fotográficas, objetos 3D realistas, cenários, texturas e composição com profundidade.
- Elementos gráficos só podem aparecer como apoio pontual e funcional (por exemplo, uma palavra, marcador ou detalhe de interface), nunca como substituto da cena.
- **Não remover recursos do software ou alterar o editor para apagar a capacidade vetorial sem solicitação explícita.** A restrição é de direção visual: vetores não são o padrão de geração.

## 2. Dinamização narrativa: a cena deve construir o que a fala diz

- O vídeo não pode ser apenas legenda animada sobre fundo parado.
- Cada frase ou bloco da narração deve provocar uma ação visual que represente e desenvolva o significado da fala.
- Planejar um storyboard por batidas da narração: o que aparece, o que muda, qual ação acontece, qual movimento de câmera acompanha e como a cena transita para a próxima.
- Os elementos visuais devem surgir, interagir, transformar-se ou evoluir **ao vivo**, em sincronia com as palavras e a intenção da voz.
- A cena precisa acrescentar informação e emoção; não basta repetir a frase em letras grandes.
- Criar progressão narrativa, escalada de tensão e conclusão visual. Evitar repetir a mesma composição em todas as cenas.

### Exemplo de tradução da fala em ação visual
- **Mentira:** uma mensagem chega ao telefone; a reação muda; a confiança se rompe visualmente.
- **Orgulho:** duas pessoas evitam olhar uma para a outra; a distância cresce; uma barreira se forma no espaço.
- **Atitudes:** mostrar ações concretas e pequenos gestos, não apenas a palavra "atitudes".
- **Objetivos em comum/adaptação:** dois caminhos inicialmente separados passam a convergir por uma decisão/ação.
- **Ir embora:** a pessoa toma uma decisão, pega seus pertences e atravessa o espaço; a câmera acompanha a saída.
  
Esses exemplos orientam a lógica narrativa, não são cenas obrigatórias para todos os vídeos.

## 3. Impacto visual e linguagem de câmera

- A abertura deve ter um gancho visual e sonoro forte, além do gancho verbal.
- Aumentar contraste, profundidade, escala, ritmo e progressão dramática sem sacrificar legibilidade.
- Usar movimentos de câmera motivados pela história: push-in/pull-out, tracking, pan, tilt, orbit, parallax, rack focus, whip pan, match cut e speed ramp quando fizerem sentido.
- Alternar planos e enquadramentos; não deixar o vídeo preso a um único plano ou composição.
- Usar pausas e acelerações intencionais para valorizar as frases-chave.
- Evitar movimento aleatório: todo movimento precisa reforçar a ação, a emoção ou a transição.

## 4. Efeitos visuais obrigatórios quando adequados à cena

- **Motion blur:** desfoque de movimento real, sincronizado com movimento de câmera/objeto; preferir implementação temporal/GPU do renderizador quando disponível.
- **Glow/Bloom:** brilho e difusão de luz em highlights, objetos luminosos e palavras de destaque. Usar com controle, sem estourar a imagem.
- **Sombras:** sombras de contato e projetadas para profundidade, volume e integração dos elementos.
- **Microefeitos rápidos:** pequenos acentos de poucos frames, como flash de luz, impacto visual, micro shake, pulso de brilho, distorção curta, partículas, blur trail e transições de luz.
- **Acabamento cinematográfico:** grão sutil, vinheta, parallax, luz volumétrica, reflexos, light leaks ou flare quando coerentes com a cena.
- Não aplicar todos os efeitos indiscriminadamente. Cada efeito deve ter função narrativa e intensidade controlada.

## 5. Sound design: efeitos sincronizados com imagem, fala e movimento

A trilha musical sozinha não é suficiente.

- **Efeitos nas legendas/tipografia:** pop, click, type, tick, chime, pluck ou impacto leve sincronizado com entrada, destaque ou transformação de palavras.
- **Efeitos de movimento:** whoosh, swish, riser, pass-by e transições de ar sincronizados com câmera, objetos e mudanças de cena.
- **Impactos narrativos:** hits, sub-bass, thumps, stingers ou silêncios pontuais nas frases de maior peso.
- Sons diegéticos quando a cena mostrar ações concretas (notificação, passos, porta, objeto apoiado etc.).
- A voz permanece em primeiro plano; música e efeitos devem ser mixados abaixo dela, com ducking automático/manual nos trechos falados.
- Não usar SFX aleatórios ou repetitivos. Cada som precisa corresponder a um evento visual ou emocional.
- Fazer QA de áudio: presença e sincronização de voz, música e SFX; clipping; equilíbrio de volumes; cortes e silêncios indesejados. Referência de loudness para conteúdo social: aproximadamente **-16 LUFS integrado**, ajustando conforme plataforma e material.

## 6. Tipografia e legendas

- Legendas são apoio à compreensão, não o elemento principal que carrega o vídeo.
- Usar tipografia cinética por palavra ou trecho, com entradas e saídas variadas e sincronizadas com a fala.
- Destacar somente palavras-chave; não repetir em texto gigante tudo o que a narração já diz.
- Usar hierarquia tipográfica, contraste e tamanho adequados para celular.
- Aplicar glow/bloom independente e discreto em palavras de impacto quando apropriado.
- Sincronizar animação tipográfica e efeitos sonoros com a pronúncia e o ritmo da voz.

## 7. Ritmo e movimento real

- O vídeo não pode parecer slideshow.
- Buscar pelo menos **52% de cobertura temporal com movimento visual efetivo** (movimento de câmera, personagem, objeto, composição ou transformação significativa), sem contar apenas texto piscando como movimento suficiente.
- Evitar longos períodos com uma imagem congelada e apenas legenda trocando.
- Cada cena deve ter começo, desenvolvimento e saída visual, mesmo em vídeos curtos.

## 8. Checklist de aprovação antes de entregar

### Narrativa e imagem
- [ ] A cena ilustra e desenvolve a fala, em vez de apenas repetir o texto?
- [ ] Não há ilustrações vetoriais planas como cenas principais?
- [ ] Há variedade de planos, ações, enquadramentos e transições?
- [ ] Os elementos constroem a cena em sincronia com a narração?
- [ ] O gancho inicial tem impacto visual e sonoro?
- [ ] As palavras-chave têm hierarquia e legibilidade?
- [ ] Motion blur, bloom/glow, sombras e microefeitos estão aplicados onde fazem sentido?
- [ ] O vídeo tem movimento real suficiente e não parece slideshow?

### Áudio
- [ ] A voz está clara e sempre à frente?
- [ ] A trilha combina com a história e não é genérica ou excessivamente alta?
- [ ] Há efeitos sonoros de tipografia/legenda sincronizados?
- [ ] Há efeitos sonoros de movimento e transição sincronizados?
- [ ] Impactos e pausas reforçam os momentos narrativos?
- [ ] O mix foi conferido do início ao fim?

### Técnica e revisão humana
- [ ] Resolução, proporção, FPS e duração correspondem ao pedido?
- [ ] O MP4 contém áudio e foi inspecionado visualmente?
- [ ] Não há quadros pretos, cortes acidentais, textos ilegíveis ou elementos fora da área segura?
- [ ] A revisão artística foi concluída separadamente da validação técnica?
- [ ] O vídeo só foi declarado concluído depois da revisão visual e sonora?

## 9. Regra final

**Não entregar novamente um vídeo que seja basicamente formas vetoriais abstratas + frases grandes + trilha de fundo.**  
A meta é uma peça audiovisual cinematográfica: a narração conduz a história, a imagem encena a história, a câmera dá movimento, os efeitos dão acabamento e o sound design faz cada ação ter peso.

A proporção (vertical/horizontal), duração, resolução e FPS continuam obedecendo ao pedido específico de cada vídeo. Este padrão define a linguagem visual e sonora, não substitui os requisitos de formato.
