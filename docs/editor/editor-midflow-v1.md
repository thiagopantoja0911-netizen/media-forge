# Editor intermediário MediaForge v1 — núcleo de alterações

**Status:** MVP de edição do plano-fonte, não é editor visual pronto nem renderização incremental.

## Ponto do fluxo

`brief -> storyboard -> motion_plan mediaforge-motion-v1 -> edit_motion_plan (revisões) -> create_motion_video (nova prévia/render) -> QA -> MP4`.

A ferramenta `edit_motion_plan` aplica edições **em memória**, devolvendo um novo plano JSON com `editorRevision` e validação `validateMotionPlan`. Não regrava o MP4, não altera o job já enviado nem manipula arquivos no Windows. A pessoa pode comparar versões antes de enviar a nova ao renderizador.

### Operações incluídas

| Ação | Efeito |
|---|---|
| `set_text` | Altera título, detalhe, eyebrow, legendas de widgets |
| `set_camera` | Substitui movimento do rig para uma cena com câmera |
| `set_transition` | Altera transição entre cenas |
| `set_scene_duration` | Ajusta quadros e desloca as cenas subsequentes; valida timing |
| `set_event_timing` | Ajusta em quadros a entrada, pico e fim de uma animação |
| `set_audio_volume` | Ajusta volume de um cue de voz, música ou SFX |
| `align_sfx` | Alinha SFX ao pico do evento visual ligado |
| `set_palette_color` | Altera paleta segura de cores |

As edições são **atômicas**, limitadas a 16 por pedido; erro preserva o plano original. `expected_revision` evita sobrescrever inadvertidamente uma versão nova. A duração do projeto, o alinhamento de cues, a validade do manifesto e a integridade das cenas são validados no final.

### Exemplo

```json
{
  "motion_plan": { "...": "plano mediaforge-motion-v1 completo" },
  "expected_revision": 0,
  "edits": [
    {"action":"set_text","scene_id":"opening","field":"headline","text":"O anúncio só é o começo"},
    {"action":"set_scene_duration","scene_id":"opening","frames":180},
    {"action":"set_audio_volume","cue_id":"music","volume":0.2}
  ]
}
```

### Próximas etapas para editor visual real

1. Armazenar projeto e revisões no servidor por `project_id` (não depender do ChatGPT para transportar todo o JSON).
2. Player com timeline seekável via GSAP, arraste de clipes e visualização de formas de onda; reaproveitar Frame Lab.
3. Prévia limitada a cena ou baixa resolução. Evitar render de 30s a cada ajuste e usar cache por cena/asset.
4. Interpretar pedidos em português num conjunto **restrito** de ações, mostrando diff antes de aplicar.
5. Undo/redo, revisões persistentes, aprovação e renderização final de mídia com trilhas e áudio verificados.

**Segurança:** não modifica job em processamento, não executa shell, não gera alterações arbitrárias em HTML/JS e não aceita media path como comando. Reutiliza o validador e exige novos assets originais para a renderização.
