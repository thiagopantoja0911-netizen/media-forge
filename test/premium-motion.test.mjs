import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../src/motion/premium-motion.js', import.meta.url), 'utf8');
const sandbox = Object.create(null);
runInNewContext(source, sandbox);
const { createDirector, EASE, version } = sandbox.MediaForgePremiumMotion;
const make = () => {
  const calls = [];
  const timeline = {
    fromTo: (target, from, to, at) => calls.push({ method: 'fromTo', target, from, to, at }),
    to: (target, to, at) => calls.push({ method: 'to', target, to, at })
  };
  return { d: createDirector({ timeline }), calls };
};

const cases = [
  ['speedRamp', ['#hero', 0.3], 'speed-ramp'],
  ['easing', ['#hero', 0.5], 'easing'],
  ['overshoot', ['#hero', 0.2], 'overshoot'],
  ['anticipation', ['#hero', 0.2], 'anticipation'],
  ['followThrough', ['#hero', ['#trail', '#second'], .3], 'follow-through'],
  ['stagger', [['#a', '#b', '#c'], .3], 'stagger'],
  ['cameraWhip', ['#camera', .3], 'camera-whip'],
  ['parallax', [[{ target: '#bg', depth: 0.3 }, { target: '#hero', depth: 2 }], .3], 'parallax'],
  ['dollyZoom', ['#camera', .3], 'dolly-zoom'],
  ['motionBlur', ['#smear', .3], 'motion-blur'],
  ['cameraTracking', ['#camera', .3], 'camera-tracking'],
  ['matchCut', ['#carrier', .3, { from: { x: 0, scale: 1 }, to: { x: 30, scale: 1.5 } }], 'match-cut'],
  ['microInteraction', ['#button', '#feedback', .3], 'microinteraction'],
  ['morph', ['#graphic', .3], 'morph'],
  ['kineticTypography', [['#word1', '#word2'], .3], 'kinetic-type'],
  ['animateLayers', [[{ target: '#bg', depth: 0.3 }, { target: '#ui', depth: 1 }], .3], 'layered-animation'],
  ['motivatedTransition', ['#button', '#carrier', .3, { from: { x: 0, scale: .7 }, to: { x: 50, scale: 2 } }], 'motivated-transition'],
  ['audioSync', [[{ id: 'click', frame: 30, src: 'assets/click.wav', referenceAt: .5 }]], 'audio-sync']
];
for (const [name, args, expected] of cases) {
  test(`18/18 ${name} schedules motion or cue deterministically`, () => {
    const { d, calls } = make();
    const out = d[name](...args);
    assert.equal(d.events.length, 1);
    assert.equal(d.events[0].primitive, expected);
    if (name === 'audioSync') assert.equal(out[0].startSeconds, 0.5);
    else assert.ok(calls.length >= 1, `${name} should schedule a tween`);
    for (const call of calls) {
      assert.equal(Number.isFinite(call.at), true, `${name} timeline position`);
      assert.ok(call.at >= 0, `${name} timeline position must be positive`);
      assert.ok(call.to.duration > 0, `${name} duration`);
      assert.notEqual(call.to.ease, 'none', `${name} cannot be linear`);
      assert.notEqual(call.to.ease, 'linear', `${name} cannot be linear`);
      assert.ok(call.at * d.fps - Math.round(call.at * d.fps) < 1e-7);
    }
  });
}

test('v0.3.0 interface, easing profiles, source avoids nondeterministic clock', () => {
  assert.equal(version, '0.3.0');
  assert.ok(EASE.impact.includes('expo'));
  assert.doesNotMatch(source, /\b(?:Date\.now|Math\.random|setTimeout|setInterval|requestAnimationFrame)\s*\(/);
});

test('frame accuracy at 60 fps and no cross-frame cumulative drift', () => {
  const { d, calls } = make();
  d.speedRamp('#x', .1134);
  d.stagger(['#a', '#b', '#c'], .1999);
  assert.equal(d.events[0].startFrame, 7);
  assert.equal(d.events[1].startFrame, 12);
  assert.equal(calls[0].at, 7 / 60);
});

test('rejects invalid audio cues and audio desync', () => {
  const { d } = make();
  assert.throws(() => d.audioSync([{ id: 'bad', src: 'https://example.com/audio.mp3', at: 0 }]), /packaged local/);
  assert.throws(() => d.audioSync([{ id: 'bad', src: 'assets/a.wav', frame: 24, referenceAt: .8 }]), /timing tolerance/);
  assert.throws(() => d.audioSync([{ id: 'x', src: 'assets/a.wav', at: 0 }, { id: 'x', src: 'assets/b.wav', at: 0 }]), /duplicate/);
});

test('P2 motion blur cannot be used as CSS video filter', () => {
  const { d } = make();
  assert.throws(() => d.motionBlur('video', 0, { isFootage: true }), /graphics-only/);
});

test('P0 match cut and motivated transition reject missing geometry', () => {
  const { d } = make();
  assert.throws(() => d.matchCut('#layer', 0), /from is required/);
  assert.throws(() => d.motivatedTransition('#trigger', '#carrier', 0), /from is required/);
});

test('rejects empty stagger, missing timeline, zero fps and nonfinite positions', () => {
  assert.throws(() => createDirector({ fps: 60 }), /timeline is required/);
  const { d } = make();
  assert.throws(() => d.stagger([], 0), /non-empty/);
  assert.throws(() => d.speedRamp('#x', Number.NaN), /finite/);
});
