/* MediaForge Premium Motion Core v0.3.0
 * Deterministic GSAP motion primitives for graphics/UI. No timers, randomness,
 * auto-play, remote dependencies, or actual audio playback. Seek-safe timeline.
 * API is compatible with a browser <script> and Node VM-based tests.
 */
(function (root) {
  'use strict';
  const DEFAULT_FPS = 60;
  const EASE = Object.freeze({
    impact: 'expo.out', snap: 'power4.out', smooth: 'power3.inOut',
    carry: 'power2.out', anticipate: 'power2.in', settle: 'back.out(1.35)'
  });
  function numeric(value, name, fallback) {
    const v = value == null ? fallback : Number(value);
    if (!Number.isFinite(v)) throw new TypeError(`${name} must be finite`);
    return v;
  }
  function positive(value, name, fallback) {
    const v = numeric(value, name, fallback);
    if (v <= 0) throw new RangeError(`${name} must be > 0`);
    return v;
  }
  function nonnegative(value, name, fallback) {
    const v = numeric(value, name, fallback);
    if (v < 0) throw new RangeError(`${name} must be >= 0`);
    return v;
  }
  function required(target, name) {
    if (target == null || target === '') throw new TypeError(`${name} is required`);
    return target;
  }
  function array(target, name) {
    if (!Array.isArray(target) || target.length < 1) throw new TypeError(`${name} needs non-empty array`);
    return target;
  }
  function createDirector(options = {}) {
    const timeline = required(options.timeline, 'timeline');
    if (typeof timeline.fromTo !== 'function' || typeof timeline.to !== 'function') throw new TypeError('timeline must implement GSAP to/fromTo');
    const fps = positive(options.fps, 'fps', DEFAULT_FPS);
    const palette = Object.freeze({ accent: '#ff4d24', lime: '#c8ff36', ...(options.palette || {}) });
    const records = [];
    const frameTime = (frame) => nonnegative(frame, 'frame', 0) / fps;
    const align = (seconds) => Math.round(nonnegative(seconds, 'seconds', 0) * fps) / fps;
    const mark = (id, name, at, duration) => {
      const t = align(at), d = positive(duration, 'duration', 0.4);
      records.push(Object.freeze({ id, primitive: name, startFrame: Math.round(t * fps), endFrame: Math.round((t + d) * fps) }));
      return t;
    };
    const tween = (target, from, to, at, duration, ease = EASE.impact) => {
      timeline.fromTo(required(target, 'target'), { ...from, immediateRender: false }, { ...to, duration: positive(duration, 'duration', 0.4), ease, immediateRender: false }, align(at));
    };
    const api = {
      get fps() { return fps; },
      get palette() { return palette; },
      get events() { return Object.freeze(records.map((event) => ({ ...event }))); },
      frameTime, align,
      // P0-01 — fast attack and controlled deceleration.
      speedRamp(target, at, config = {}) {
        const d = positive(config.duration, 'duration', 0.35); mark(config.id || 'speed-ramp', 'speed-ramp', at, d);
        tween(target, config.from || { x: -110, scale: 0.91, opacity: 0 }, config.to || { x: 0, scale: 1, opacity: 1 }, at, d, config.ease || EASE.impact);
      },
      // P0-02 — named easing profile, never default to linear.
      easing(target, at, config = {}) {
        const d = positive(config.duration, 'duration', 0.4); mark(config.id || 'easing', 'easing', at, d);
        tween(target, config.from || { x: -60 }, config.to || { x: 0 }, at, d, EASE[config.profile] || config.ease || EASE.snap);
      },
      // P1-03 — one overshoot, smaller settle, no indefinite bounce.
      overshoot(target, at, config = {}) {
        const d = positive(config.duration, 'duration', 0.45), peak = d * 0.67;
        const n = numeric(config.distance, 'distance', 19), axis = config.axis === 'y' ? 'y' : 'x';
        mark(config.id || 'overshoot', 'overshoot', at, d);
        tween(target, { [axis]: numeric(config.from, 'from', -85), opacity: 0 }, { [axis]: n, opacity: 1 }, at, peak, EASE.impact);
        timeline.to(target, { [axis]: 0, duration: d - peak, ease: EASE.smooth }, align(at + peak));
      },
      // P1-04 — tiny counter-movement before an action.
      anticipation(target, at, config = {}) {
        const d = positive(config.duration, 'duration', 0.4), start = d * 0.19;
        const px = numeric(config.pixels, 'pixels', 13), axis = config.axis === 'y' ? 'y' : 'x';
        mark(config.id || 'anticipation', 'anticipation', at, d);
        tween(target, { [axis]: 0 }, { [axis]: -px }, at, start, EASE.anticipate);
        timeline.to(target, { [axis]: numeric(config.to, 'to', 115), duration: d - start, ease: EASE.impact }, align(at + start));
      },
      // P1-05 — secondary elements follow the lead instead of copying it.
      followThrough(lead, followers, at, config = {}) {
        const list = array(followers, 'followers'), d = positive(config.duration, 'duration', 0.56);
        mark(config.id || 'follow-through', 'follow-through', at, d + list.length * 0.06);
        tween(lead, { x: -80, opacity: 0 }, { x: 0, opacity: 1 }, at, d * 0.68, EASE.impact);
        list.forEach((target, i) => tween(target, { x: -42 - i * 13, opacity: 0 }, { x: 0, opacity: 1 }, at + .07 + i * .06, d * .65, EASE.carry));
      },
      // P0-06 — overlapped, deterministic stagger.
      stagger(targets, at, config = {}) {
        const list = array(targets, 'targets'), each = positive(config.each, 'each', 0.065), d = positive(config.duration, 'duration', 0.38);
        mark(config.id || 'stagger', 'stagger', at, d + each * (list.length - 1));
        list.forEach((target, i) => tween(target, config.from || { y: 52, opacity: 0 }, config.to || { y: 0, opacity: 1 }, at + i * each, d, config.ease || EASE.impact));
      },
      // P1-07 — a camera whip with constrained angle and zero final skew.
      cameraWhip(camera, at, config = {}) {
        const d = positive(config.duration, 'duration', 0.38), direction = config.direction === 'left' ? -1 : 1;
        mark(config.id || 'camera-whip', 'camera-whip', at, d);
        tween(camera, { x: direction * 170, skewX: direction * 7, scale: 1.035 }, { x: 0, skewX: 0, scale: 1 }, at, d, EASE.impact);
      },
      // P1-08 — three-layer parallax; no entire-frame flat panning.
      parallax(layers, at, config = {}) {
        const list = array(layers, 'layers'), d = positive(config.duration, 'duration', 0.58);
        mark(config.id || 'parallax', 'parallax', at, d);
        list.forEach((layer, i) => {
          const depth = numeric(layer.depth, 'depth', i + 1);
          tween(layer.target, { x: depth * -28, y: depth * 8, opacity: numeric(layer.opacity, 'opacity', 1) }, { x: 0, y: 0, opacity: 1 }, at + i * 0.022, d, EASE.carry);
        });
      },
      // P1-09 — simulated camera move with a controlled focus point.
      dollyZoom(camera, at, config = {}) {
        const d = positive(config.duration, 'duration', 0.52);
        mark(config.id || 'dolly-zoom', 'dolly-zoom', at, d);
        tween(camera, { scale: numeric(config.startScale, 'startScale', 1), x: numeric(config.x0, 'x0', 0), y: numeric(config.y0, 'y0', 0) }, { scale: numeric(config.endScale, 'endScale', 1.16), x: numeric(config.x1, 'x1', -40), y: numeric(config.y1, 'y1', -60) }, at, d, EASE.smooth);
      },
      // P2-10 — optional lightweight smear only on graphics, never footage;
      // no filter animation on videos, no indefinite blur.
      motionBlur(graphicTrail, at, config = {}) {
        if (config.isFootage) throw new Error('motionBlur is graphics-only; do not blur footage with CSS');
        const d = positive(config.duration, 'duration', 0.26);
        mark(config.id || 'motion-blur', 'motion-blur', at, d);
        tween(graphicTrail, { scaleX: 1.3, opacity: numeric(config.opacity, 'opacity', 0.30), x: numeric(config.x, 'x', -35) }, { scaleX: 1, opacity: 0, x: 0 }, at, d, EASE.impact);
      },
      // P1-11 — track focal object with predictable coordinates.
      cameraTracking(camera, at, config = {}) {
        const d = positive(config.duration, 'duration', .53);
        mark(config.id || 'camera-tracking', 'camera-tracking', at, d);
        tween(camera, { x: numeric(config.x0, 'x0', 0), y: numeric(config.y0, 'y0', 0) }, { x: numeric(config.x1, 'x1', -65), y: numeric(config.y1, 'y1', 35) }, at, d, EASE.smooth);
      },
      // P0-12 — keep a colored/positioned carrier visible across both shots.
      matchCut(carrier, at, config = {}) {
        const d = positive(config.duration, 'duration', .42), from = required(config.from, 'from'), to = required(config.to, 'to');
        mark(config.id || 'match-cut', 'match-cut', at, d);
        tween(carrier, { ...from, opacity: 1 }, { ...to, opacity: 1 }, at, d, EASE.smooth);
      },
      // P0-13 — actual button press then visible confirmation.
      microInteraction(button, feedback, at, config = {}) {
        const d = positive(config.duration, 'duration', .5);
        mark(config.id || 'microinteraction', 'microinteraction', at, d);
        tween(button, { scale: 1, opacity: 1 }, { scale: .93, opacity: .92 }, at, d * .22, EASE.anticipate);
        timeline.to(button, { scale: 1, opacity: 1, duration: d * .28, ease: EASE.settle }, align(at + d * .22));
        tween(feedback, { scale: .84, opacity: 0, y: 16 }, { scale: 1, opacity: 1, y: 0 }, at + d * .36, d * .64, EASE.settle);
      },
      // P2-14 — transform one graphic element, not two disconnected fades.
      morph(target, at, config = {}) {
        const d = positive(config.duration, 'duration', .62);
        mark(config.id || 'morph', 'morph', at, d);
        tween(target, { scaleX: numeric(config.fromScaleX, 'fromScaleX', 1), scaleY: numeric(config.fromScaleY, 'fromScaleY', 1), borderRadius: config.fromRadius || '16px', backgroundColor: config.fromColor || palette.accent }, { scaleX: numeric(config.toScaleX, 'toScaleX', 1.8), scaleY: numeric(config.toScaleY, 'toScaleY', 1.0), borderRadius: config.toRadius || '28px', backgroundColor: config.toColor || palette.lime }, at, d, EASE.smooth);
      },
      // P1-15 — typographic cluster with per-word offsets, not full-screen drift.
      kineticTypography(words, at, config = {}) {
        const list = array(words, 'words'), d = positive(config.duration, 'duration', .31), each = positive(config.each, 'each', .07);
        mark(config.id || 'kinetic-type', 'kinetic-type', at, d + (list.length - 1) * each);
        list.forEach((word, i) => tween(word, { y: 38, scale: .89, opacity: 0, rotation: numeric(config.rotation, 'rotation', -2) }, { y: 0, scale: 1, opacity: 1, rotation: 0 }, at + i * each, d, EASE.impact));
      },
      // P1-16 — independent depth/order, no same tween on all layers.
      animateLayers(layers, at, config = {}) {
        const list = array(layers, 'layers'), d = positive(config.duration, 'duration', .5);
        mark(config.id || 'layered-animation', 'layered-animation', at, d + list.length * .045);
        list.forEach((layer, i) => {
          const depth = numeric(layer.depth, 'depth', i + 1);
          tween(layer.target, { opacity: 0, scale: .94, y: 34 * depth }, { opacity: 1, scale: 1, y: 0 }, at + i * .045, d, EASE.carry);
        });
      },
      // P0-17 — a trigger initiates the carrying object across cut.
      motivatedTransition(trigger, carrier, at, config = {}) {
        const d = positive(config.duration, 'duration', .65);
        mark(config.id || 'motivated-transition', 'motivated-transition', at, d);
        tween(trigger, { scale: 1 }, { scale: .91 }, at, d * .17, EASE.anticipate);
        tween(carrier, required(config.from, 'from'), required(config.to, 'to'), at + d * .18, d * .82, EASE.impact);
        timeline.to(trigger, { scale: 1, duration: d * .28, ease: EASE.settle }, align(at + d * .18));
      },
      // P0-18 — generate frame-locked cue manifest for separate real audio clips.
      audioSync(cues, config = {}) {
        const list = array(cues, 'cues'); const tol = positive(config.toleranceMs, 'toleranceMs', 100);
        const result = list.map((cue, i) => {
          const name = cue.id || `audio-${i + 1}`;
          const frame = cue.frame != null ? Math.round(nonnegative(cue.frame, 'frame', 0)) : Math.round(nonnegative(cue.at, 'at', 0) * fps);
          const videoAt = frame / fps;
          const file = required(cue.src, 'audio cue source');
          if (!/^assets\/[\w.\-/]+\.(wav|mp3|ogg|m4a)$/i.test(file) || file.includes('..')) throw new Error('audio cue must use packaged local asset');
          const offsetMs = Math.abs(numeric(cue.referenceAt, 'referenceAt', videoAt) - videoAt) * 1000;
          return Object.freeze({ id: name, source: file, frame, startSeconds: videoAt, offsetMs, withinTolerance: offsetMs <= tol });
        });
        if (new Set(result.map((c) => c.id)).size !== result.length) throw new Error('duplicate audio cue id');
        if (!result.every((c) => c.withinTolerance)) throw new Error(`audio cue exceeds ${tol} ms timing tolerance`);
        result.forEach((c) => records.push(Object.freeze({ id: c.id, primitive: 'audio-sync', startFrame: c.frame, endFrame: c.frame })));
        return Object.freeze(result);
      }
    };
    return Object.freeze(api);
  }
  root.MediaForgePremiumMotion = Object.freeze({ createDirector, EASE, version: '0.3.0' });
})(typeof globalThis !== 'undefined' ? globalThis : this);
