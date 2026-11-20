/**
 * Procedural WebAudio Synthesizer for AAA Hangar Ambiance,
 * Tri-Propeller Piston Engine Run-Up Harmonics, and Sci-Fi Tactical UI Feedback.
 */
export function createHangarAudio() {
  let ctx = null;
  let enabled = false;
  let masterGain = null;
  let engineGain = null;
  let engineOscA = null;
  let engineOscB = null;
  let engineFilter = null;
  let propWashGain = null;
  let propWashFilter = null;

  function ensureInit() {
    if (ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    ctx = new AudioCtx();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.0;
    masterGain.connect(ctx.destination);

    // Subtle Deep Hangar Ventilation / Power-Transformer Room Tone
    const humOsc = ctx.createOscillator();
    humOsc.type = 'sine';
    humOsc.frequency.value = 52;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.045;
    humOsc.connect(humGain);
    humGain.connect(masterGain);
    humOsc.start();

    // Twin/Tri-Propeller Turbocharged Piston Engine Harmonic Synth
    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;

    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 180;
    engineFilter.Q.value = 2.0;

    engineOscA = ctx.createOscillator();
    engineOscA.type = 'sawtooth';
    engineOscA.frequency.value = 42;

    engineOscB = ctx.createOscillator();
    engineOscB.type = 'triangle';
    engineOscB.frequency.value = 63.5;

    engineOscA.connect(engineFilter);
    engineOscB.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(masterGain);

    engineOscA.start();
    engineOscB.start();

    // Filtered Pink-Noise Propeller Airflow Wash (adds realistic turboprop air bite during run-up)
    const bufLen = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    let b0 = 0;
    for (let i = 0; i < bufLen; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.96 * b0 + white * 0.04;
      ch[i] = b0 * 3.5;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;

    propWashFilter = ctx.createBiquadFilter();
    propWashFilter.type = 'bandpass';
    propWashFilter.frequency.value = 220;
    propWashFilter.Q.value = 1.4;

    propWashGain = ctx.createGain();
    propWashGain.gain.value = 0.0;

    noiseSrc.connect(propWashFilter);
    propWashFilter.connect(propWashGain);
    propWashGain.connect(masterGain);
    noiseSrc.start();
  }

  function setEnabled(nextState) {
    ensureInit();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    enabled = nextState;
    const now = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.linearRampToValueAtTime(enabled ? 0.55 : 0.0, now + 0.25);
    return enabled;
  }

  function playUiChirp(type = 'click') {
    if (!enabled || !ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g);
    g.connect(masterGain);

    if (type === 'hover') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1420, now);
      osc.frequency.exponentialRampToValueAtTime(1880, now + 0.035);
      g.gain.setValueAtTime(0.035, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.start(now);
      osc.stop(now + 0.045);
    } else if (type === 'lock') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(760, now);
      osc.frequency.setValueAtTime(1140, now + 0.055);
      g.gain.setValueAtTime(0.09, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.start(now);
      osc.stop(now + 0.17);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(980, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.07);
      g.gain.setValueAtTime(0.075, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.085);
    }
  }

  function update(propRpmFactor) {
    if (!enabled || !ctx || !engineGain) return;
    const now = ctx.currentTime;
    engineGain.gain.setTargetAtTime(propRpmFactor * 0.20, now, 0.08);
    engineOscA.frequency.setTargetAtTime(34 + propRpmFactor * 58, now, 0.08);
    engineOscB.frequency.setTargetAtTime(51 + propRpmFactor * 88.5, now, 0.08);
    engineFilter.frequency.setTargetAtTime(140 + propRpmFactor * 420, now, 0.08);
    if (propWashGain && propWashFilter) {
      propWashGain.gain.setTargetAtTime(propRpmFactor * propRpmFactor * 0.28, now, 0.09);
      propWashFilter.frequency.setTargetAtTime(180 + propRpmFactor * 540, now, 0.09);
    }
  }

  return {
    isEnabled: () => enabled,
    setEnabled,
    playUiChirp,
    update,
  };
}
