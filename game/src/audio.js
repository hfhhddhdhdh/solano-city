// All sound is synthesised with WebAudio — no audio files, no network.
// Engine hum, gunshots, sirens, pickups, explosions and a low-key bass loop
// are built from oscillators and filtered noise. Everything starts on the
// first user gesture, as browsers require, and N toggles mute.

export function createSound() {
  let ctx = null;
  let master = null;
  let muted = false;
  let musicTimer = null;
  let sirenNodes = null;
  let engineNodes = null;
  let musicStep = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function blip(freq, duration, type, volume, slideTo) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function noise(duration, volume, filterFreq, type = 'lowpass') {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(duration);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
    src.stop(t + duration);
  }

  // A slow sunset bass loop: Am – F – C – G, one note a beat, 100 bpm.
  const BASSLINE = [55, 55, 43.65, 49, 55, 55, 65.41, 49];
  function startMusic() {
    if (!ensure() || musicTimer) return;
    musicTimer = window.setInterval(() => {
      if (muted || !ctx) return;
      const note = BASSLINE[musicStep % BASSLINE.length];
      musicStep += 1;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = note;
      gain.gain.setValueAtTime(0.11, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + 0.6);
      if (musicStep % 8 === 4) blip(220, 0.09, 'square', 0.03);
    }, 600);
  }

  return {
    /** Call from any user gesture; also starts the music loop. */
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); startMusic(); },
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      if (muted) this.stopSiren();
      return muted;
    },
    shoot(kind) {
      if (kind === 'shotgun') { noise(0.22, 0.5, 900); blip(90, 0.15, 'square', 0.25, 40); }
      else if (kind === 'rifle') { noise(0.14, 0.4, 1800, 'highpass'); blip(160, 0.1, 'square', 0.2, 60); }
      else if (kind === 'smg') { noise(0.08, 0.3, 2200, 'highpass'); }
      else { noise(0.12, 0.4, 1400, 'highpass'); blip(120, 0.08, 'square', 0.18, 55); }
    },
    punch() { noise(0.08, 0.3, 500); },
    pickup() { blip(660, 0.12, 'sine', 0.25); window.setTimeout(() => blip(990, 0.18, 'sine', 0.25), 90); },
    coin() { blip(880, 0.1, 'sine', 0.22); window.setTimeout(() => blip(1320, 0.16, 'sine', 0.22), 80); },
    crash() { noise(0.3, 0.5, 400); },
    explosion() { noise(0.9, 0.7, 300); blip(60, 0.7, 'sine', 0.5, 28); },
    horn() { blip(370, 0.18, 'square', 0.12); blip(466, 0.18, 'square', 0.1); },
    missionDone() { [523, 659, 784, 1047].forEach((f, i) => window.setTimeout(() => blip(f, 0.22, 'triangle', 0.25), i * 110)); },
    missionFail() { [392, 330, 262].forEach((f, i) => window.setTimeout(() => blip(f, 0.25, 'triangle', 0.22), i * 140)); },
    wantedUp() { blip(440, 0.15, 'square', 0.2); window.setTimeout(() => blip(587, 0.2, 'square', 0.2), 130); },
    startSiren() {
      if (!ensure() || muted || sirenNodes) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 700;
      gain.gain.value = 0.045;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.6;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 280;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      lfo.start();
      sirenNodes = { osc, lfo, gain };
    },
    stopSiren() {
      if (!sirenNodes) return;
      try { sirenNodes.osc.stop(); sirenNodes.lfo.stop(); } catch { /* already stopped */ }
      sirenNodes = null;
    },
    /** Engine hum follows the car's speed; call every frame while driving. */
    engine(speedRatio, on) {
      if (!ensure() || muted) { this.stopEngine(); return; }
      if (!on) { this.stopEngine(); return; }
      if (!engineNodes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = 60;
        gain.gain.value = 0.03;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        osc.start();
        engineNodes = { osc, gain, filter };
      }
      const t = ctx.currentTime;
      engineNodes.osc.frequency.setTargetAtTime(55 + speedRatio * 160, t, 0.08);
      engineNodes.filter.frequency.setTargetAtTime(400 + speedRatio * 1400, t, 0.1);
      engineNodes.gain.gain.setTargetAtTime(0.02 + speedRatio * 0.05, t, 0.1);
    },
    stopEngine() {
      if (!engineNodes) return;
      try { engineNodes.osc.stop(); } catch { /* already stopped */ }
      engineNodes = null;
    },
  };
}
