# Contrato permanente — Dynamic Motion v1 (2026-11-14)

## Para qual produção vale

**Padrão** para Reels, anúncios, showcases de aplicativos, vídeos motion graphics e comerciais criados via Aulas Instagram Motion Studio + MediaForge/HyperFrames. Na ausência de instrução contrária, escolher `dynamic-motion-v1` antes de redigir HTML e áudio. A qualidade do resultado depende da intenção e da leitura do conteúdo; não confundir movimento incessante com motion de qualidade.

**Exceções explícitas**: usuário pediu vídeo minimalista, estudo estático, pausa contemplativa, visualização acessível ou tutorial de leitura lenta. Para estes pedidos, selecionar `study` com justificativa no plano. Nunca aplicar automaticamente um estilo frenético a material educativo, sensível ou acessível.

## Direção que deve estar na fonte, não apenas no chat

1. O motion dirige **a composição inteira**: elementos de fundo, área principal e primeiro plano respondem à mesma ação em velocidades diferentes. Criar três camadas com profundidades independentes e alvo de câmera (camera rig) dentro do projeto editável.
2. Não começar com cartão estático explicando técnicas. Iniciar com resultado, conflito ou interação no quadro zero. Cada beat precisa mostrar um **antes, evento físico, depois**.
3. A cada 0,4–0,8 s deve ocorrer uma ação visual **significativa**, não um efeito de decoração: tracking, zoom, movimento de objeto, alteração de estado, reenquadramento, crop, entrada em profundidade ou câmera acompanhando uma interação. O limite de ociosidade no manifesto é 0,8 s, com exceções intencionais e documentadas para leitura/CTA.
4. Usar `expo.out`/`power4.out` nas chegadas, `power2.inOut` nos movimentos de câmera e `power3.in` nas saídas. Sobrepor ações, evitando turnos sequenciais e `linear` em traduções que exigem aceleração. Easing isolado não basta; o destino da câmera e o novo estado precisam ser claros.
5. Planejar **dois ou mais movimentos de câmera por 10 segundos**, **três ações de interface/cena** e **duas transições causais** por 10 segundos. São *mínimos estruturais* do perfil dinâmico, não receita para todas as narrativas.
6. Cada transição traz `cause`, `carrier`, `fromState`, `toState`. O objeto tem de atravessar a mudança de cena ou causar o novo estado: clique → zoom pelo botão → timer, registro → número → gráfico, câmera passa por um objeto real. Proibido substituir isso por apenas dois painéis e um fade.
7. Evitar a mesma moldura visual durante a maior parte do filme. A ação pode permanecer no mesmo aplicativo, desde que os estados de UI e o enquadramento realmente evoluam. Blur proporcional à velocidade; efeito gráfico de rastro não equivale a motion blur cinematográfico.
8. O fundo preto/laranja é uma direção de marca do FORJA quando solicitada, **não um default universal**. Glow e partículas podem enriquecer mas **não contam** como ação significativa no quality gate.
9. Respeitar leitura e áreas seguras: não cobrir copy, valores, logo ou CTA com transições. CTA final pode estabilizar por ~1–1,2 s; movimento de fundo secundário não justifica bloquear o texto.
10. Som segue a ação e a edição: whooshes pontuais e microcliques coerentes com o frame; medir loudness, picos e silêncio final. Não usar música/SFX para ocultar cenas paradas.

## Contrato máquina-legível antes do render

Gerar `motion-plan.json` com `profile`, `intent`, `durationSeconds`, `fps`, `layers`, `beats`, `events`, `transitions` e `holds` para os projetos `dynamic-motion-v1`; cada evento declara timing, escopo e alvo real. O verificador `validate-motion-plan.mjs` bloqueia vídeo com plano estrutural fraco.

`events` de `scope=background` não contam como movimento significativo. A soma de ações significativas deve cobrir >=60% do tempo fora de `holds`. Nenhum intervalo não motivado deve passar de 0,8s. Pausas explicitamente justificadas não podem somar mais de 20% da duração. Em qualquer projeto de 8s ou mais, pelo menos 3 beats, 3 níveis de profundidade, 2 eventos de câmera, 3 ações de UI/cena e 2 transições com causa. Os valores são defaults ajustáveis mediante nova direção aprovada.

O manifesto é **uma declaração de intenção**, não uma prova do resultado. Depois de exportar, o QA exige análise de quadros reais, continuidade nos cortes, legibilidade, fluidez da câmera, áudio e aprovação do usuário. Um plano inventado sem implementação correspondente não deve ser declarado aprovado.

## Procedimento sem produzir dezenas de vídeos

1. Validar o storyboard e `motion-plan.json` por código **antes** de criar/renderizar;
2. Assegurar que os IDs/seletores dos eventos existem e que GSAP altera de fato a câmera e a UI (não apenas opacidade);
3. Renderizar **um** teste curto no PC conectado somente quando o usuário pedir criação/edição de vídeo ou autorizar um teste; um pedido de melhoria do motor **não** autoriza gerar vídeo;
4. Inspecionar os frames do MP4 e corrigir o motor na causa-raiz, não multiplicar variações do mesmo storyboard;
5. Não marcar QA artístico aprovado a partir de FFprobe, LUFS ou testes unitários.

## Estado de implantação

O plugin privado pode atualizar regras de autoria imediatamente depois de publicado. O servidor MediaForge e o worker Windows usam código de execução separado: alterações no GitHub exigem deploy/sincronização antes de valer no processo em execução. Registrar separadamente `plugin publicado`, `código fonte incorporado`, `worker atualizado`, `quality gate ativo em runtime` e `QA artístico comprovado`. Nunca afirmar que o worker ativo recebeu uma atualização só porque o repositório foi alterado.
