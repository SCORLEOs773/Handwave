// All sound is synthesised with the Web Audio API, so there are no audio files to host.

function makeImpulse(ctx, seconds, decay) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}

// A minor with a raised seventh: A B C D E F G#
const SCALE = [220, 246.94, 261.63, 293.66, 329.63, 349.23, 415.3];
const LOOP_LEVEL = { point: 0.05, open: 0.22, horns: 0.12, storm: 0.1 };

export function createAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  let closed = false;

  const master = ctx.createGain();
  master.gain.value = 0.9;
  const compressor = ctx.createDynamicsCompressor();
  master.connect(compressor).connect(ctx.destination);

  const music = ctx.createGain();
  music.gain.value = 0.55;
  music.connect(master);
  const sfx = ctx.createGain();
  sfx.gain.value = 0.9;
  sfx.connect(master);

  // Reverb gives everything a cavernous, haunted feel
  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx, 2.8, 3);
  const reverbOut = ctx.createGain();
  reverbOut.gain.value = 0.5;
  reverb.connect(reverbOut).connect(master);

  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++)
    noiseData[i] = Math.random() * 2 - 1;

  function loopNoise() {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    source.start();
    return source;
  }

  // A short pitched blip with a quick attack and decay
  function tone({
    type = "sine",
    from,
    to = from,
    dur,
    gain = 0.2,
    out = sfx,
    send = 0,
  }) {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out);
    if (send) {
      const s = ctx.createGain();
      s.gain.value = send;
      g.connect(s).connect(reverb);
    }
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // A short burst of filtered noise (crackles, whooshes, booms)
  function noiseBurst({
    dur,
    gain = 0.2,
    filter = "bandpass",
    freq = 1000,
    freqTo = freq,
    q = 1,
  }) {
    const t = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqTo !== freq)
      f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.01, dur / 2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    source.connect(f).connect(g).connect(sfx);
    source.start(t, Math.random() * Math.max(0, 2 - dur - 0.1), dur + 0.05);
  }

  // ---------- Background music ----------
  let bellTimer = 0;

  function startMusic() {
    // Low drone
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 280;
    lowpass.Q.value = 4;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0;
    droneGain.gain.setTargetAtTime(0.09, ctx.currentTime, 3);
    [55, 55.4, 82.4, 110.3].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? "triangle" : "sawtooth";
      o.frequency.value = f;
      o.connect(lowpass);
      o.start();
    });
    lowpass.connect(droneGain).connect(music);

    // Slow breathing in the drone
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain).connect(lowpass.frequency);
    lfo.start();

    // Wind
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 600;
    windFilter.Q.value = 0.8;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    windGain.gain.setTargetAtTime(0.07, ctx.currentTime, 4);
    loopNoise().connect(windFilter).connect(windGain).connect(music);
    const windLfo = ctx.createOscillator();
    windLfo.frequency.value = 0.11;
    const windLfoGain = ctx.createGain();
    windLfoGain.gain.value = 300;
    windLfo.connect(windLfoGain).connect(windFilter.frequency);
    windLfo.start();

    // Music-box bells at random, drenched in reverb
    const bell = () => {
      const base =
        SCALE[Math.floor(Math.random() * SCALE.length)] *
        (Math.random() < 0.5 ? 2 : 4);
      tone({ from: base, dur: 2.2, gain: 0.07, out: music, send: 0.8 });
      tone({
        type: "triangle",
        from: base * 2.01,
        dur: 1.2,
        gain: 0.025,
        out: music,
        send: 0.8,
      });
    };
    const scheduleBell = () => {
      if (closed) return;
      bell();
      bellTimer = setTimeout(scheduleBell, 900 + Math.random() * 2200);
    };
    scheduleBell();
  }

  // ---------- Spell sounds ----------
  const active = { point: false, open: false, horns: false, storm: false };

  function makeLoop(build) {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(sfx);
    build(gain);
    return gain;
  }

  const loops = {
    // Shimmering chime
    point: makeLoop((out) => {
      [880, 1318.5].forEach((f) => {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        const amp = ctx.createGain();
        amp.gain.value = 0.5;
        const trem = ctx.createOscillator();
        trem.frequency.value = 6 + Math.random() * 3;
        const tremGain = ctx.createGain();
        tremGain.gain.value = 0.4;
        trem.connect(tremGain).connect(amp.gain);
        trem.start();
        o.connect(amp).connect(out);
        o.start();
      });
    }),
    // Low fire roar (crackles are added on a timer)
    open: makeLoop((out) => {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 500;
      loopNoise().connect(f).connect(out);
    }),
    // Wing flutter
    horns: makeLoop((out) => {
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 1800;
      f.Q.value = 2;
      const amp = ctx.createGain();
      amp.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 14;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.5;
      lfo.connect(lfoGain).connect(amp.gain);
      lfo.start();
      loopNoise().connect(f).connect(amp).connect(out);
    }),
    // Electric hum
    storm: makeLoop((out) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 60;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 240;
      f.Q.value = 3;
      o.connect(f).connect(out);
      o.start();
    }),
  };

  // Fireball charge: a rising growl
  const chargeOsc = ctx.createOscillator();
  chargeOsc.type = "sawtooth";
  chargeOsc.frequency.value = 80;
  const chargeFilter = ctx.createBiquadFilter();
  chargeFilter.type = "lowpass";
  chargeFilter.frequency.value = 400;
  const chargeGain = ctx.createGain();
  chargeGain.gain.value = 0;
  chargeOsc.connect(chargeFilter).connect(chargeGain).connect(sfx);
  chargeOsc.start();

  // Random crackles, squeaks and zaps, decided 16 times a second
  const tick = setInterval(() => {
    if (closed) return;
    if (active.open && Math.random() < 0.6) {
      noiseBurst({
        dur: 0.04 + Math.random() * 0.05,
        gain: 0.25,
        filter: "highpass",
        freq: 1500 + Math.random() * 2500,
      });
    }
    if (active.horns && Math.random() < 0.35) {
      tone({
        from: 2800 + Math.random() * 1500,
        to: 4500 + Math.random() * 1500,
        dur: 0.07,
        gain: 0.05,
        send: 0.2,
      });
    }
    if (active.storm && Math.random() < 0.5) {
      noiseBurst({
        dur: 0.03 + Math.random() * 0.06,
        gain: 0.35,
        filter: "highpass",
        freq: 3000,
      });
    }
    if (active.point && Math.random() < 0.2) {
      tone({
        from: 1500 + Math.random() * 1500,
        dur: 0.25,
        gain: 0.03,
        send: 0.6,
      });
    }
  }, 60);

  // Pause everything when the tab is hidden
  const onVisibility = () => {
    if (closed) return;
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  };
  document.addEventListener("visibilitychange", onVisibility);

  return {
    start() {
      ctx.resume();
      startMusic();
    },
    setSpellActive(name, on) {
      if (closed || !loops[name]) return;
      active[name] = on;
      loops[name].gain.setTargetAtTime(
        on ? LOOP_LEVEL[name] : 0,
        ctx.currentTime,
        0.08,
      );
    },
    // level: 0..1 while charging a fireball, or null when not charging
    charge(level) {
      if (closed) return;
      const now = ctx.currentTime;
      if (level == null) {
        chargeGain.gain.setTargetAtTime(0, now, 0.05);
      } else {
        chargeOsc.frequency.setTargetAtTime(80 + level * 260, now, 0.05);
        chargeFilter.frequency.setTargetAtTime(300 + level * 1800, now, 0.05);
        chargeGain.gain.setTargetAtTime(0.05 + level * 0.14, now, 0.05);
      }
    },
    whoosh() {
      if (closed) return;
      noiseBurst({ dur: 0.7, gain: 0.5, freq: 300, freqTo: 2500, q: 1.2 });
    },
    boom() {
      if (closed) return;
      tone({ from: 110, to: 35, dur: 1, gain: 0.7, send: 0.4 });
      noiseBurst({
        dur: 0.9,
        gain: 0.5,
        filter: "lowpass",
        freq: 1200,
        freqTo: 100,
      });
    },
    setMuted(muted) {
      if (closed) return;
      master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
    },
    dispose() {
      if (closed) return;
      closed = true;
      clearInterval(tick);
      clearTimeout(bellTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      ctx.close().catch(() => {});
    },
  };
}
